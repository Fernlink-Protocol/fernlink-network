package xyz.fernlink.sdk

import android.app.Activity
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.content.ServiceConnection
import android.os.IBinder
import androidx.core.content.ContextCompat
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.SharedFlow
import kotlinx.coroutines.flow.launchIn
import kotlinx.coroutines.flow.onEach
import xyz.fernlink.sdk.ble.FernlinkBleService
import xyz.fernlink.sdk.wifi.FernlinkWifiService

/**
 * Convenience class that binds both [FernlinkBleService] and [FernlinkWifiService],
 * attaches them to [FernlinkClient], and handles the Service lifecycle.
 *
 * ```kotlin
 * class MyActivity : Activity() {
 *     private val client  = FernlinkClient(FernlinkClientConfig(...))
 *     private val manager = TransportManager(this, client)
 *
 *     override fun onCreate(...) {
 *         client.start()
 *         manager.startAll()   // binds BLE + WiFi Direct services
 *     }
 *
 *     override fun onDestroy() {
 *         manager.stopAll()
 *         client.stop()
 *         super.onDestroy()
 *     }
 * }
 * ```
 *
 * Permission handling (BLUETOOTH_*, NEARBY_WIFI_DEVICES / ACCESS_FINE_LOCATION)
 * must be done by the Activity before calling [startAll].
 */
class TransportManager(
    private val activity: Activity,
    private val client:   FernlinkClient,
) {

    private var bleService:  FernlinkBleService?  = null
    private var wifiService: FernlinkWifiService? = null

    private var bleUnbound  = false
    private var wifiUnbound = false

    private val scope = CoroutineScope(Dispatchers.IO + SupervisorJob())
    private val _meshEvents = MutableSharedFlow<String>(extraBufferCapacity = 128)
    val meshEvents: SharedFlow<String> = _meshEvents
    private var bleEventJob: Job? = null

    private val bleConnection = object : ServiceConnection {
        override fun onServiceConnected(name: ComponentName, binder: IBinder) {
            bleService = (binder as FernlinkBleService.LocalBinder).service
            client.attachTransport(bleService!!)
            bleEventJob?.cancel()
            bleEventJob = bleService!!.meshEvents
                .onEach { _meshEvents.emit(it) }
                .launchIn(scope)
        }
        override fun onServiceDisconnected(name: ComponentName) {
            bleEventJob?.cancel()
            bleEventJob = null
            bleService = null
        }
    }

    private val wifiConnection = object : ServiceConnection {
        override fun onServiceConnected(name: ComponentName, binder: IBinder) {
            wifiService = (binder as FernlinkWifiService.LocalBinder).service
            client.attachTransport(wifiService!!)
        }
        override fun onServiceDisconnected(name: ComponentName) {
            wifiService = null
        }
    }

    /** Bind and start both BLE and WiFi Direct foreground services. */
    fun startAll() {
        bindService(FernlinkBleService::class.java,  bleConnection)
        bindService(FernlinkWifiService::class.java, wifiConnection)
    }

    /** Detach from client, unbind, and stop both services. Call from onDestroy(). */
    fun stopAll() {
        bleEventJob?.cancel()
        bleService?.let {
            client.detachTransport(it)
            if (!bleUnbound) { activity.unbindService(bleConnection); bleUnbound = true }
        }
        wifiService?.let {
            client.detachTransport(it)
            if (!wifiUnbound) { activity.unbindService(wifiConnection); wifiUnbound = true }
        }
        scope.cancel()
    }

    /** Total connected peers across BLE and WiFi Direct transports. */
    val connectedPeerCount: Int
        get() = client.connectedPeerCount

    // ── Helpers ───────────────────────────────────────────────────────────────

    private fun bindService(cls: Class<*>, connection: ServiceConnection) {
        val intent = Intent(activity, cls)
        ContextCompat.startForegroundService(activity, intent)
        activity.bindService(intent, connection, Context.BIND_AUTO_CREATE)
    }
}
