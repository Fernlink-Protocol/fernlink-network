package xyz.fernlink.sdk.ble

import android.bluetooth.*
import android.bluetooth.le.AdvertiseCallback
import android.bluetooth.le.AdvertiseData
import android.bluetooth.le.AdvertiseSettings
import android.content.Context
import android.os.Build
import android.os.ParcelUuid
import android.util.Log
import kotlinx.coroutines.*
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.SharedFlow
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import xyz.fernlink.sdk.WirePayload

private const val TAG = "FernlinkGATT"

/**
 * Hosts the Fernlink GATT server and BLE advertisement.
 *
 * Peers write to CHAR_REQUEST; this server reassembles fragments and emits
 * the complete payload on [incomingRequests]. Call [sendProof] to notify all
 * subscribed centrals with a proof payload.
 *
 * Notification fragments are serialized: each fragment waits for the
 * onNotificationSent callback before the next is sent, matching the same
 * guarantee we provide on the client write path.
 */
internal class GattServerManager(
    private val context: Context,
    private val pubKey: ByteArray,
) {

    private val _incomingRequests = MutableSharedFlow<ByteArray>(extraBufferCapacity = 32)
    val incomingRequests: SharedFlow<ByteArray> = _incomingRequests

    private val scope        = CoroutineScope(Dispatchers.IO + SupervisorJob())
    private val notifyMutex  = Mutex()
    @Volatile private var notifyAck: CompletableDeferred<Unit>? = null

    private var gattServer: BluetoothGattServer? = null
    private val subscribedDevices  = mutableMapOf<String, BluetoothDevice>()
    private val subscriberRefCount = mutableMapOf<String, Int>()
    private val reassemblers       = mutableMapOf<String, BleFragmentation.Reassembler>()
    // Tracks the negotiated ATT MTU per connected client (fired by onMtuChanged on server).
    private val deviceMtu          = mutableMapOf<String, Int>()

    private val manager get() =
        context.getSystemService(Context.BLUETOOTH_SERVICE) as BluetoothManager

    private val advertiser get() =
        manager.adapter.bluetoothLeAdvertiser

    fun start() {
        gattServer = manager.openGattServer(context, gattCallback).apply {
            addService(buildService())
        }
        startAdvertising()
    }

    fun stop() {
        stopAdvertising()
        scope.cancel()
        gattServer?.close()
        gattServer = null
        subscribedDevices.clear()
        subscriberRefCount.clear()
        reassemblers.clear()
        deviceMtu.clear()
    }

    suspend fun sendProof(payload: ByteArray) {
        val server    = gattServer ?: return
        val proofChar = server.getService(BleUuids.FERNLINK_SERVICE)
            ?.getCharacteristic(BleUuids.CHAR_PROOF) ?: return

        val encoded = WirePayload.encode(payload)
        Log.d(TAG, "sendProof: ${subscribedDevices.size} subscriber(s)")

        notifyMutex.withLock {
            subscribedDevices.values.toList().forEach { device ->
                // Fragment size: cap at MTU_REQUEST even if the system negotiated a larger MTU.
                // The system-level BLE MTU auto-negotiates to 517 on Pixel 14+, but large
                // back-to-back notifications are silently dropped by some BLE stacks. Capping
                // at our conservative 185 keeps fragments small and reliable.
                val mtu = minOf(deviceMtu[device.address] ?: BleUuids.MTU_REQUEST, BleUuids.MTU_REQUEST)
                val attPayload = mtu - 3
                val fragments = BleFragmentation.fragment(encoded, attPayload)
                Log.d(TAG, "sendProof: ${fragments.size} fragment(s) → ${device.address} (mtu=$mtu attPayload=$attPayload)")
                for (frag in fragments) {
                    val ack = CompletableDeferred<Unit>()
                    notifyAck = ack
                    notifyCompat(server, device, proofChar, frag)
                    // Wait for onNotificationSent before sending the next fragment.
                    // 2-second timeout guards against a stack that never fires the callback.
                    withTimeoutOrNull(2_000) { ack.await() }
                }
            }
        }
    }

    // ── GATT service definition ───────────────────────────────────────────────

    private fun buildService(): BluetoothGattService {
        val service = BluetoothGattService(
            BleUuids.FERNLINK_SERVICE,
            BluetoothGattService.SERVICE_TYPE_PRIMARY,
        )

        // REQUEST — writable by central (verification requests come in here)
        val request = BluetoothGattCharacteristic(
            BleUuids.CHAR_REQUEST,
            BluetoothGattCharacteristic.PROPERTY_WRITE or
                    BluetoothGattCharacteristic.PROPERTY_WRITE_NO_RESPONSE,
            BluetoothGattCharacteristic.PERMISSION_WRITE,
        )

        // PROOF — indicatable (signed proofs go out here).
        // INDICATE is used instead of NOTIFY so the ATT layer sends one confirmation
        // per fragment, preventing silent drops when fragments are sent back-to-back.
        val proof = BluetoothGattCharacteristic(
            BleUuids.CHAR_PROOF,
            BluetoothGattCharacteristic.PROPERTY_INDICATE,
            BluetoothGattCharacteristic.PERMISSION_READ,
        ).apply {
            addDescriptor(BluetoothGattDescriptor(
                BleUuids.DESCRIPTOR_CCC,
                BluetoothGattDescriptor.PERMISSION_READ or
                        BluetoothGattDescriptor.PERMISSION_WRITE,
            ))
        }

        // STATUS — readable (service version / health byte)
        val status = BluetoothGattCharacteristic(
            BleUuids.CHAR_STATUS,
            BluetoothGattCharacteristic.PROPERTY_READ,
            BluetoothGattCharacteristic.PERMISSION_READ,
        ).apply {
            value = """{"version":2,"commitment":["confirmed","finalized"],"compression":["lz4","zstd"]}"""
                .toByteArray(Charsets.UTF_8)
        }

        service.addCharacteristic(request)
        service.addCharacteristic(proof)
        service.addCharacteristic(status)
        return service
    }

    // ── GATT server callbacks ─────────────────────────────────────────────────

    private val gattCallback = object : BluetoothGattServerCallback() {

        override fun onNotificationSent(device: BluetoothDevice, status: Int) {
            notifyAck?.complete(Unit)
            notifyAck = null
        }

        override fun onCharacteristicWriteRequest(
            device: BluetoothDevice, requestId: Int,
            characteristic: BluetoothGattCharacteristic,
            preparedWrite: Boolean, responseNeeded: Boolean,
            offset: Int, value: ByteArray,
        ) {
            if (characteristic.uuid != BleUuids.CHAR_REQUEST) return
            if (responseNeeded) {
                gattServer?.sendResponse(device, requestId, BluetoothGatt.GATT_SUCCESS, 0, null)
            }
            val reassembler = reassemblers.getOrPut(device.address) {
                BleFragmentation.Reassembler()
            }
            val complete = reassembler.feed(value) ?: return
            _incomingRequests.tryEmit(WirePayload.decode(complete))
        }

        override fun onDescriptorWriteRequest(
            device: BluetoothDevice, requestId: Int,
            descriptor: BluetoothGattDescriptor,
            preparedWrite: Boolean, responseNeeded: Boolean,
            offset: Int, value: ByteArray,
        ) {
            if (descriptor.uuid != BleUuids.DESCRIPTOR_CCC) return
            if (value.contentEquals(BluetoothGattDescriptor.ENABLE_NOTIFICATION_VALUE) ||
                value.contentEquals(BluetoothGattDescriptor.ENABLE_INDICATION_VALUE)) {
                subscribedDevices[device.address] = device
                subscriberRefCount[device.address] = (subscriberRefCount[device.address] ?: 0) + 1
                Log.d(TAG, "CCC subscribed by ${device.address}, refCount=${subscriberRefCount[device.address]}, uniqueSubscribers=${subscribedDevices.size}")
            } else {
                val newCount = (subscriberRefCount[device.address] ?: 1) - 1
                if (newCount <= 0) {
                    subscribedDevices.remove(device.address)
                    subscriberRefCount.remove(device.address)
                } else {
                    subscriberRefCount[device.address] = newCount
                }
                Log.d(TAG, "CCC unsubscribed by ${device.address}")
            }
            if (responseNeeded) {
                gattServer?.sendResponse(device, requestId, BluetoothGatt.GATT_SUCCESS, 0, null)
            }
        }

        override fun onMtuChanged(device: BluetoothDevice, mtu: Int) {
            deviceMtu[device.address] = mtu
            Log.d(TAG, "Server MTU for ${device.address}: $mtu (attPayload=${mtu - 3})")
        }

        override fun onConnectionStateChange(device: BluetoothDevice, status: Int, newState: Int) {
            if (newState == BluetoothProfile.STATE_DISCONNECTED) {
                val newCount = (subscriberRefCount[device.address] ?: 0) - 1
                if (newCount <= 0) {
                    subscribedDevices.remove(device.address)
                    subscriberRefCount.remove(device.address)
                    Log.d(TAG, "Device disconnected and fully removed: ${device.address}")
                } else {
                    subscriberRefCount[device.address] = newCount
                    Log.d(TAG, "Device disconnected but still has $newCount live connection(s): ${device.address}")
                }
                reassemblers.remove(device.address)
                deviceMtu.remove(device.address)
            }
        }
    }

    // ── Advertising ───────────────────────────────────────────────────────────

    @Volatile private var advertisingFallbackAttempted = false

    private val advertiseCallback = object : AdvertiseCallback() {
        override fun onStartSuccess(settingsInEffect: AdvertiseSettings) {
            Log.d(TAG, "Advertising started OK: mode=${settingsInEffect.mode} txPower=${settingsInEffect.txPowerLevel}")
        }
        override fun onStartFailure(errorCode: Int) {
            val reason = when (errorCode) {
                ADVERTISE_FAILED_DATA_TOO_LARGE        -> "DATA_TOO_LARGE"
                ADVERTISE_FAILED_TOO_MANY_ADVERTISERS  -> "TOO_MANY_ADVERTISERS"
                ADVERTISE_FAILED_ALREADY_STARTED       -> "ALREADY_STARTED"
                ADVERTISE_FAILED_INTERNAL_ERROR        -> "INTERNAL_ERROR"
                ADVERTISE_FAILED_FEATURE_UNSUPPORTED   -> "FEATURE_UNSUPPORTED"
                else                                   -> "UNKNOWN($errorCode)"
            }
            if (!advertisingFallbackAttempted) {
                advertisingFallbackAttempted = true
                Log.e(TAG, "Advertising FAILED: $reason — retrying without scan response")
                // Fall back to advertising without scan response (no fingerprint).
                // Peers will still connect; fingerprint-based dedup just won't work.
                startAdvertisingNoScanResponse()
            } else {
                Log.e(TAG, "Advertising FAILED (fallback also failed): $reason — BLE advertising unavailable")
            }
        }
    }

    private fun startAdvertising() {
        val settings = AdvertiseSettings.Builder()
            .setAdvertiseMode(AdvertiseSettings.ADVERTISE_MODE_LOW_LATENCY)
            .setConnectable(true)
            .setTimeout(0)
            .build()

        val data = AdvertiseData.Builder()
            .addServiceUuid(ParcelUuid(BleUuids.FERNLINK_SERVICE))
            .setIncludeDeviceName(false)
            .build()

        // Put the 8-byte pubkey fingerprint in the scan response so the primary
        // advertisement payload stays within the 31-byte BLE limit.
        // Active scanners (SCAN_MODE_LOW_LATENCY) receive both packets.
        val fingerprint = pubKey.sliceArray(0 until minOf(8, pubKey.size))
        val scanResponse = AdvertiseData.Builder()
            .addManufacturerData(BleUuids.MANUFACTURER_ID, fingerprint)
            .setIncludeDeviceName(false)
            .build()

        advertiser?.startAdvertising(settings, data, scanResponse, advertiseCallback)
    }

    private fun startAdvertisingNoScanResponse() {
        val settings = AdvertiseSettings.Builder()
            .setAdvertiseMode(AdvertiseSettings.ADVERTISE_MODE_LOW_LATENCY)
            .setConnectable(true)
            .setTimeout(0)
            .build()
        val data = AdvertiseData.Builder()
            .addServiceUuid(ParcelUuid(BleUuids.FERNLINK_SERVICE))
            .setIncludeDeviceName(false)
            .build()
        advertiser?.startAdvertising(settings, data, advertiseCallback)
    }

    private fun stopAdvertising() {
        advertiser?.stopAdvertising(advertiseCallback)
    }

    @Suppress("DEPRECATION")
    private fun notifyCompat(
        server: BluetoothGattServer,
        device: BluetoothDevice,
        characteristic: BluetoothGattCharacteristic,
        value: ByteArray,
    ) {
        // confirm=true → ATT INDICATE; the remote sends ATT_HANDLE_VALUE_CONFIRM before
        // onNotificationSent fires, guaranteeing the fragment was received before the next
        // one is queued. This prevents silent drops on back-to-back notifications.
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            server.notifyCharacteristicChanged(device, characteristic, true, value)
        } else {
            characteristic.value = value
            server.notifyCharacteristicChanged(device, characteristic, true)
        }
    }
}
