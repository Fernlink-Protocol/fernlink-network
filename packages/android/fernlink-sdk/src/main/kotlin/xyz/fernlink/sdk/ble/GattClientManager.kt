package xyz.fernlink.sdk.ble

import android.bluetooth.*
import android.bluetooth.le.*
import android.content.Context
import android.os.Build
import android.os.ParcelUuid
import android.util.Log
import kotlinx.coroutines.*
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.SharedFlow
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import org.json.JSONObject
import xyz.fernlink.sdk.WirePayload

private const val TAG = "FernlinkGATT"
private const val MAX_CCC_RETRIES = 3

/**
 * Scans for Fernlink peripherals, connects, and subscribes to PROOF notifications.
 *
 * Incoming proof fragments are reassembled and emitted on [incomingProofs].
 * Call [sendRequest] to write a fragmented verification request to all confirmed peers.
 * When a new peer's CCC subscription is confirmed, any requests buffered in [proofStore]
 * are drained and sent.
 *
 * Fragment writes are fully serialized: each fragment waits for the GATT
 * onCharacteristicWrite ACK before the next is sent, preventing silent drops
 * caused by concurrent in-flight operations on the Android BLE stack.
 */
internal class GattClientManager(
    private val context: Context,
    private val proofStore: ProofStore,
) {

    private val _incomingProofs = MutableSharedFlow<ByteArray>(extraBufferCapacity = 32)
    val incomingProofs: SharedFlow<ByteArray> = _incomingProofs

    private val scope        = CoroutineScope(Dispatchers.IO + SupervisorJob())
    // Serializes all fragment writes — only one in-flight write at a time across all peers.
    private val writeMutex   = Mutex()
    // Set by the send loop before each write; completed by onCharacteristicWrite.
    @Volatile private var writeAck: CompletableDeferred<Boolean>? = null

    private val connections     = mutableMapOf<String, BluetoothGatt>()
    private val reassemblers    = mutableMapOf<String, BleFragmentation.Reassembler>()
    // Peers whose CCC descriptor write was confirmed — the only ones that receive requests.
    private val subscribedPeers = mutableSetOf<String>()
    // Actual negotiated MTU per peer; used to size fragments correctly.
    private val negotiatedMtu   = mutableMapOf<String, Int>()
    // Tracks how many times we've retried the CCC write per peer.
    private val cccRetryCount   = mutableMapOf<String, Int>()
    // Pubkey fingerprint (hex) of peers we currently have an active connection to.
    // Prevents reconnecting to the same physical device when its MAC address rotates.
    private val connectedFingerprints = mutableSetOf<String>()
    // MAC address → fingerprint hex, for cleanup on disconnect.
    private val addressToFingerprint  = mutableMapOf<String, String>()

    private val manager get() =
        context.getSystemService(Context.BLUETOOTH_SERVICE) as BluetoothManager

    private val scanner get() = manager.adapter.bluetoothLeScanner

    fun startScanning() {
        val filter = ScanFilter.Builder()
            .setServiceUuid(ParcelUuid(BleUuids.FERNLINK_SERVICE))
            .build()
        val settings = ScanSettings.Builder()
            .setScanMode(ScanSettings.SCAN_MODE_LOW_LATENCY)
            .build()
        scanner?.startScan(listOf(filter), settings, scanCallback)
    }

    fun stopScanning() {
        scanner?.stopScan(scanCallback)
    }

    fun stop() {
        stopScanning()
        scope.cancel()
        connections.values.forEach { it.close() }
        connections.clear()
        reassemblers.clear()
        subscribedPeers.clear()
        negotiatedMtu.clear()
        cccRetryCount.clear()
        connectedFingerprints.clear()
        addressToFingerprint.clear()
    }

    /** Fire-and-forget: queues the payload for serialized delivery to all confirmed peers. */
    fun sendRequest(payload: ByteArray) {
        scope.launch { sendFragmented(payload) }
    }

    /** Only peers whose CCC subscription is confirmed count as connected. */
    val connectedPeerCount: Int get() = subscribedPeers.size

    /** Fingerprints of fully subscribed peers (16 hex chars = first 8 bytes of pubkey). */
    val connectedPeerFingerprints: Set<String>
        get() = subscribedPeers.mapNotNull { addressToFingerprint[it] }.toSet()

    companion object {
        private const val MAX_PEERS    = 4
        private const val WRITE_TIMEOUT = 2_000L  // ms to wait for each onCharacteristicWrite ACK
    }

    /**
     * Skip BLE scanning and connect directly to a known device (e.g. from NFC bootstrap).
     * No-op if already connected to this device.
     */
    fun connectDirect(device: android.bluetooth.BluetoothDevice) {
        if (connections.containsKey(device.address)) return
        device.connectGatt(context, false, gattCallback, android.bluetooth.BluetoothDevice.TRANSPORT_LE)
    }

    // ── Serialized fragment sender ─────────────────────────────────────────────

    private suspend fun sendFragmented(payload: ByteArray) {
        writeMutex.withLock {
            subscribedPeers.mapNotNull { connections[it] }.forEach { gatt ->
                val char = gatt.getService(BleUuids.FERNLINK_SERVICE)
                    ?.getCharacteristic(BleUuids.CHAR_REQUEST) ?: run {
                    Log.w(TAG, "sendFragmented: CHAR_REQUEST not found on ${gatt.device.address}")
                    return@forEach
                }
                // Fragment size must not exceed the ATT payload for this connection.
                // ATT overhead is 3 bytes (opcode + handle), leaving mtu-3 for data.
                val attPayload = (negotiatedMtu[gatt.device.address] ?: BleUuids.MTU_REQUEST) - 3
                val fragments = BleFragmentation.fragment(WirePayload.encode(payload), attPayload)
                Log.d(TAG, "sendFragmented: ${fragments.size} fragment(s) → ${gatt.device.address} (attPayload=$attPayload)")

                for (frag in fragments) {
                    val ack = CompletableDeferred<Boolean>()
                    writeAck = ack
                    val queued = writeCharacteristicCompat(gatt, char, frag)
                    if (!queued) {
                        writeAck = null
                        Log.w(TAG, "writeCharacteristic rejected on ${gatt.device.address}, aborting")
                        break
                    }
                    val success = withTimeoutOrNull(WRITE_TIMEOUT) { ack.await() } ?: false
                    if (!success) {
                        Log.w(TAG, "write ACK timeout/failure on ${gatt.device.address}, aborting")
                        break
                    }
                }
            }
        }
    }

    // ── Scan callback ─────────────────────────────────────────────────────────

    private val scanCallback = object : ScanCallback() {
        override fun onScanResult(callbackType: Int, result: ScanResult) {
            val device = result.device

            // Extract the 8-byte pubkey fingerprint from the scan response manufacturer data.
            // If the peer advertises a fingerprint and we're already connected to that
            // crypto identity (even under a different MAC), skip it.
            val fp = result.scanRecord
                ?.getManufacturerSpecificData(BleUuids.MANUFACTURER_ID)
                ?.let { if (it.size >= 8) it.sliceArray(0 until 8).joinToString("") { b -> "%02x".format(b) } else null }

            if (fp != null && connectedFingerprints.contains(fp)) return
            if (connections.containsKey(device.address)) return
            if (subscribedPeers.size >= MAX_PEERS) return

            Log.d(TAG, "Scan found ${device.address} fp=${fp?.take(16) ?: "none"}, connecting (${subscribedPeers.size}/$MAX_PEERS)")
            if (fp != null) {
                // Reserve the fingerprint slot immediately so any scan results for
                // this same device with a new rotated MAC are skipped before the
                // full connect→MTU→services→CCC sequence completes (can take 2-4s).
                connectedFingerprints.add(fp)
                addressToFingerprint[device.address] = fp
            }
            device.connectGatt(context, false, gattCallback, BluetoothDevice.TRANSPORT_LE)
        }
    }

    // ── GATT client callbacks ─────────────────────────────────────────────────

    private val gattCallback = object : BluetoothGattCallback() {

        override fun onConnectionStateChange(gatt: BluetoothGatt, status: Int, newState: Int) {
            when (newState) {
                BluetoothProfile.STATE_CONNECTED -> {
                    connections[gatt.device.address] = gatt
                    // Start with a conservative MTU; onMtuChanged stores the agreed value.
                    gatt.requestMtu(BleUuids.MTU_REQUEST)
                }
                BluetoothProfile.STATE_DISCONNECTED -> {
                    val addr = gatt.device.address
                    connections.remove(addr)
                    reassemblers.remove(addr)
                    subscribedPeers.remove(addr)
                    negotiatedMtu.remove(addr)
                    cccRetryCount.remove(addr)
                    gatt.close()
                    // Hold the fingerprint reservation for 10 s before allowing a
                    // reconnect.  Without this, each failed connection attempt removes
                    // the fingerprint immediately, letting the scan callback fire
                    // connectGatt again within milliseconds and rapidly exhausting
                    // the Android BLE stack's GATT interface pool.
                    val fp = addressToFingerprint.remove(addr)
                    if (fp != null) {
                        scope.launch {
                            delay(10_000)
                            connectedFingerprints.remove(fp)
                            Log.d(TAG, "Reconnect allowed for fp=${fp.take(16)}… after cooldown")
                        }
                    }
                }
            }
        }

        override fun onMtuChanged(gatt: BluetoothGatt, mtu: Int, status: Int) {
            val addr = gatt.device.address
            negotiatedMtu[addr] = if (status == BluetoothGatt.GATT_SUCCESS) {
                Log.d(TAG, "MTU negotiated: $mtu for $addr")
                mtu
            } else {
                Log.w(TAG, "MTU negotiation failed on $addr, falling back to ${BleUuids.MTU_REQUEST}")
                BleUuids.MTU_REQUEST
            }
            gatt.discoverServices()
        }

        override fun onServicesDiscovered(gatt: BluetoothGatt, status: Int) {
            if (status != BluetoothGatt.GATT_SUCCESS) {
                Log.w(TAG, "onServicesDiscovered FAILED status=$status on ${gatt.device.address}")
                return
            }
            val proofChar = gatt.getService(BleUuids.FERNLINK_SERVICE)
                ?.getCharacteristic(BleUuids.CHAR_PROOF) ?: run {
                Log.w(TAG, "CHAR_PROOF not found on ${gatt.device.address}")
                return
            }
            Log.d(TAG, "Subscribing to PROOF indications on ${gatt.device.address}")
            gatt.setCharacteristicNotification(proofChar, true)
            val ccc = proofChar.getDescriptor(BleUuids.DESCRIPTOR_CCC) ?: run {
                Log.w(TAG, "CCC descriptor not found on ${gatt.device.address}")
                return
            }
            writeDescriptorCompat(gatt, ccc, BluetoothGattDescriptor.ENABLE_INDICATION_VALUE)
        }

        override fun onDescriptorWrite(
            gatt: BluetoothGatt,
            descriptor: BluetoothGattDescriptor,
            status: Int,
        ) {
            if (descriptor.uuid != BleUuids.DESCRIPTOR_CCC) return
            val addr = gatt.device.address
            if (status == BluetoothGatt.GATT_SUCCESS) {
                cccRetryCount.remove(addr)
                subscribedPeers.add(addr)
                addressToFingerprint[addr]?.let { connectedFingerprints.add(it) }
                Log.d(TAG, "CCC confirmed for $addr fp=${addressToFingerprint[addr]?.take(16) ?: "none"} — subscribedPeers=${subscribedPeers.size}")
                if (subscribedPeers.size >= MAX_PEERS) {
                    Log.d(TAG, "MAX_PEERS reached — stopping scan")
                    stopScanning()
                }
                scope.launch { drainStoreTo() }
            } else {
                val retries = cccRetryCount.getOrDefault(addr, 0)
                if (retries < MAX_CCC_RETRIES) {
                    cccRetryCount[addr] = retries + 1
                    Log.w(TAG, "CCC write failed (status=$status) on $addr — retry ${retries + 1}/$MAX_CCC_RETRIES")
                    val proofChar = gatt.getService(BleUuids.FERNLINK_SERVICE)
                        ?.getCharacteristic(BleUuids.CHAR_PROOF)
                    val ccc = proofChar?.getDescriptor(BleUuids.DESCRIPTOR_CCC)
                    if (ccc != null) {
                        writeDescriptorCompat(gatt, ccc, BluetoothGattDescriptor.ENABLE_INDICATION_VALUE)
                    } else {
                        gatt.disconnect()
                    }
                } else {
                    cccRetryCount.remove(addr)
                    Log.w(TAG, "CCC write failed after $MAX_CCC_RETRIES retries on $addr — disconnecting")
                    gatt.disconnect()
                }
            }
        }

        override fun onCharacteristicWrite(
            gatt: BluetoothGatt,
            characteristic: BluetoothGattCharacteristic,
            status: Int,
        ) {
            writeAck?.complete(status == BluetoothGatt.GATT_SUCCESS)
            writeAck = null
        }

        // Android < 13: value is read from characteristic.value
        override fun onCharacteristicChanged(
            gatt: BluetoothGatt,
            characteristic: BluetoothGattCharacteristic,
        ) {
            handleProofFragment(gatt, characteristic.uuid, characteristic.value ?: return)
        }

        // Android 13+: value is passed directly (characteristic.value is stale/null)
        override fun onCharacteristicChanged(
            gatt: BluetoothGatt,
            characteristic: BluetoothGattCharacteristic,
            value: ByteArray,
        ) {
            handleProofFragment(gatt, characteristic.uuid, value)
        }

        private fun handleProofFragment(
            gatt: BluetoothGatt,
            uuid: java.util.UUID,
            value: ByteArray,
        ) {
            if (uuid != BleUuids.CHAR_PROOF) return
            Log.d(TAG, "PROOF fragment received from ${gatt.device.address} (${value.size} bytes)")
            val reassembler = reassemblers.getOrPut(gatt.device.address) {
                BleFragmentation.Reassembler()
            }
            val complete = reassembler.feed(value) ?: return
            Log.d(TAG, "PROOF reassembled: ${complete.size} bytes, emitting…")
            _incomingProofs.tryEmit(WirePayload.decode(complete))
        }
    }

    // ── Store-and-forward drain ───────────────────────────────────────────────

    private suspend fun drainStoreTo() {
        val pending = proofStore.drain()
        if (pending.isEmpty()) return
        Log.d(TAG, "drainStoreTo: sending ${pending.size} queued request(s)")
        pending.forEach { req ->
            val payload = JSONObject().apply {
                put("txSignature", req.txSignature)
                put("commitment",  req.commitment)
                put("ttl",         req.ttl)
            }.toString().toByteArray(Charsets.UTF_8)
            sendFragmented(payload)
        }
    }

    // ── API-level compat helpers ──────────────────────────────────────────────

    @Suppress("DEPRECATION")
    private fun writeDescriptorCompat(
        gatt: BluetoothGatt,
        descriptor: BluetoothGattDescriptor,
        value: ByteArray,
    ) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            gatt.writeDescriptor(descriptor, value)
        } else {
            descriptor.value = value
            gatt.writeDescriptor(descriptor)
        }
    }

    @Suppress("DEPRECATION")
    private fun writeCharacteristicCompat(
        gatt: BluetoothGatt,
        characteristic: BluetoothGattCharacteristic,
        value: ByteArray,
    ): Boolean {
        return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            gatt.writeCharacteristic(
                characteristic,
                value,
                BluetoothGattCharacteristic.WRITE_TYPE_DEFAULT,
            ) == BluetoothStatusCodes.SUCCESS
        } else {
            characteristic.value = value
            gatt.writeCharacteristic(characteristic)
        }
    }
}
