package xyz.fernlink.sdk.wifi

import android.app.Service
import android.content.Intent
import android.os.Binder
import android.os.IBinder
import kotlinx.coroutines.*
import xyz.fernlink.sdk.ble.ProofStore
import xyz.fernlink.sdk.transport.FernlinkTransport
import xyz.fernlink.sdk.transport.TransportMessageRouter
import xyz.fernlink.sdk.transport.TransportType

/**
 * Foreground Android Service that hosts the Fernlink WiFi Direct mesh layer.
 *
 * Bind from your Activity exactly as you bind FernlinkBleService, then
 * attach to FernlinkClient via attachTransport():
 *
 * ```kotlin
 * val connection = object : ServiceConnection {
 *     override fun onServiceConnected(name: ComponentName, binder: IBinder) {
 *         val service = (binder as FernlinkWifiService.LocalBinder).service
 *         client.attachTransport(service)
 *     }
 *     override fun onServiceDisconnected(name: ComponentName) = Unit
 * }
 * bindService(Intent(this, FernlinkWifiService::class.java), connection, BIND_AUTO_CREATE)
 * startForegroundService(Intent(this, FernlinkWifiService::class.java))
 * ```
 */
class FernlinkWifiService : Service(), FernlinkTransport {

    inner class LocalBinder : Binder() {
        val service: FernlinkWifiService get() = this@FernlinkWifiService
    }

    private val binder = LocalBinder()
    private val scope  = CoroutineScope(Dispatchers.IO + SupervisorJob())

    private lateinit var wifiTransport: WifiDirectTransport
    private lateinit var router:        TransportMessageRouter
    private lateinit var store:         ProofStore

    private var localPubKey = ""
    private var initialised = false

    // Held until startMesh() is called, in case FernlinkClient wires forwarders before init.
    private var pendingRequestSender: ((ByteArray) -> Unit)? = null
    private var pendingProofSender: ((ByteArray) -> Unit)? = null

    override val transportType: TransportType = TransportType.WIFI_DIRECT

    override val connectedPeerCount: Int
        get() = if (initialised) wifiTransport.connectedPeerCount else 0

    override fun connectedPeerFingerprints(): Set<String> =
        if (initialised) wifiTransport.connectedPeerFingerprints() else emptySet()

    override val pendingRequestCount: Int
        get() = if (initialised) store.size else 0

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        startForeground(
            WifiServiceNotification.NOTIFICATION_ID,
            WifiServiceNotification.build(applicationContext, 0),
        )
        return START_STICKY
    }

    override fun onBind(intent: Intent): IBinder = binder

    override fun onDestroy() {
        stopMesh()
        scope.cancel()
        super.onDestroy()
    }

    override fun startMesh(keypairSeed: ByteArray, pubKey: ByteArray, rpcEndpoint: String) {
        if (initialised) return
        localPubKey = pubKey.joinToString("") { "%02x".format(it) }
        store         = ProofStore()
        wifiTransport = WifiDirectTransport(applicationContext, localPubKey, scope)
        router        = TransportMessageRouter(
            incomingRequests  = wifiTransport.incomingRequests,
            incomingProofs    = wifiTransport.incomingProofs,
            sendProof         = wifiTransport::sendProof,
            sendRequest       = wifiTransport::sendRequest,
            connectedPeerCount = wifiTransport::connectedPeerCount,
            proofStore        = store,
            keypairSeed       = keypairSeed,
            rpcEndpoint       = rpcEndpoint,
            scope             = scope,
            context           = applicationContext,
        )
        wifiTransport.startMesh(keypairSeed, pubKey, rpcEndpoint)
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
        wifiTransport.stopMesh()
        initialised = false
    }

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

    private fun updateNotification() {
        scope.launch {
            while (initialised) {
                val nm = getSystemService(NOTIFICATION_SERVICE)
                    as android.app.NotificationManager
                nm.notify(
                    WifiServiceNotification.NOTIFICATION_ID,
                    WifiServiceNotification.build(applicationContext, connectedPeerCount),
                )
                delay(5_000)
            }
        }
    }
}
