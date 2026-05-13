package xyz.fernlink.sdk.ble

import android.app.Service
import android.content.Intent
import android.os.Binder
import android.os.IBinder
import kotlinx.coroutines.*
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.SharedFlow
import xyz.fernlink.sdk.transport.FernlinkTransport
import xyz.fernlink.sdk.transport.TransportType

/**
 * Foreground Android Service that hosts the Fernlink BLE mesh layer.
 *
 * Bind to this service from your Activity, then attach it to a FernlinkClient:
 *
 * ```kotlin
 * val connection = object : ServiceConnection {
 *     override fun onServiceConnected(name: ComponentName, binder: IBinder) {
 *         val service = (binder as FernlinkBleService.LocalBinder).service
 *         client.attachBleService(service)
 *     }
 *     override fun onServiceDisconnected(name: ComponentName) = Unit
 * }
 * bindService(Intent(this, FernlinkBleService::class.java), connection, BIND_AUTO_CREATE)
 * startForegroundService(Intent(this, FernlinkBleService::class.java))
 * ```
 */
class FernlinkBleService : Service(), FernlinkTransport {

    override val transportType: TransportType get() = TransportType.BLE

    inner class LocalBinder : Binder() {
        val service: FernlinkBleService get() = this@FernlinkBleService
    }

    private val binder = LocalBinder()
    private val scope  = CoroutineScope(Dispatchers.IO + SupervisorJob())

    internal lateinit var server: GattServerManager
    internal lateinit var client: GattClientManager
    internal lateinit var router: BleMessageRouter
    internal lateinit var store:  ProofStore

    private var keypairSeed: ByteArray = ByteArray(32)
    private var initialised = false

    // Held until startMesh() is called, in case FernlinkClient wires forwarders before init.
    private var pendingRequestSender: ((ByteArray) -> Unit)? = null
    private var pendingProofSender: ((ByteArray) -> Unit)? = null

    override fun onCreate() {
        super.onCreate()
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        startForeground(
            ForegroundServiceNotification.notificationId(),
            ForegroundServiceNotification.build(applicationContext, 0),
        )
        return START_STICKY
    }

    override fun onBind(intent: Intent): IBinder = binder

    override fun onDestroy() {
        stopMesh()
        scope.cancel()
        super.onDestroy()
    }

    // ── Public API (called by FernlinkClient after binding) ───────────────────

    override fun startMesh(keypairSeed: ByteArray, pubKey: ByteArray, rpcEndpoint: String) {
        if (initialised) return
        this.keypairSeed = keypairSeed.copyOf()
        store  = ProofStore()
        server = GattServerManager(applicationContext, pubKey)
        client = GattClientManager(applicationContext, store)
        router = BleMessageRouter(server, client, store, this.keypairSeed, rpcEndpoint, scope)
        server.start()
        client.startScanning()
        router.start()
        // Apply any forwarders that were set before startMesh() was called.
        val rs = pendingRequestSender
        val ps = pendingProofSender
        if (rs != null && ps != null) router.setExternalForwarders(rs, ps)
        pendingRequestSender = null
        pendingProofSender = null
        initialised = true
        updateNotification()
    }

    override fun stopMesh() {
        if (!initialised) return
        client.stop()
        server.stop()
        initialised = false
    }

    override val connectedPeerCount: Int
        get() = if (initialised) client.connectedPeerCount else 0

    override fun connectedPeerFingerprints(): Set<String> =
        if (initialised) client.connectedPeerFingerprints else emptySet()

    override val pendingRequestCount: Int
        get() = if (initialised) store.size else 0

    override fun broadcastRequest(txSignature: String, commitment: String, ttl: Int) {
        if (!initialised) return
        router.broadcastRequest(txSignature, commitment, ttl)
    }

    override fun collectConsensusJson(minProofs: Int): String? =
        if (initialised) router.collectConsensusJson(minProofs) else null

    override fun clearProofs() { if (initialised) router.clearProofs() }

    // ── Gap 3: cross-transport bridge ─────────────────────────────────────────

    override fun setExternalForwarders(requestSender: (ByteArray) -> Unit, proofSender: (ByteArray) -> Unit) {
        if (initialised) {
            router.setExternalForwarders(requestSender, proofSender)
        } else {
            pendingRequestSender = requestSender
            pendingProofSender = proofSender
        }
    }

    override fun injectRequest(payload: ByteArray) {
        if (initialised) router.injectRequest(payload)
    }

    override fun injectProof(payload: ByteArray) {
        if (initialised) router.injectProof(payload)
    }

    // ── Gap 4: multi-transport aggregation ────────────────────────────────────

    override fun collectedProofs(): List<String> =
        if (initialised) router.collectedProofs else emptyList()

    // ── Mesh event stream ─────────────────────────────────────────────────────

    val meshEvents: SharedFlow<String>
        get() = if (initialised) router.meshEvents else MutableSharedFlow()

    private fun updateNotification() {
        scope.launch {
            while (initialised) {
                val nm = getSystemService(NOTIFICATION_SERVICE)
                    as android.app.NotificationManager
                nm.notify(
                    ForegroundServiceNotification.notificationId(),
                    ForegroundServiceNotification.build(applicationContext, connectedPeerCount),
                )
                delay(5_000)
            }
        }
    }
}
