package xyz.fernlink.sdk.wifi

import android.content.Context
import android.content.IntentFilter
import android.net.wifi.p2p.WifiP2pConfig
import android.net.wifi.p2p.WifiP2pDevice
import android.net.wifi.p2p.WifiP2pDeviceList
import android.net.wifi.p2p.WifiP2pInfo
import android.net.wifi.p2p.WifiP2pManager
import android.net.wifi.p2p.nsd.WifiP2pDnsSdServiceInfo
import android.net.wifi.p2p.nsd.WifiP2pDnsSdServiceRequest
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.SharedFlow
import kotlinx.coroutines.launch
import xyz.fernlink.sdk.WirePayload
import xyz.fernlink.sdk.transport.FernlinkTransport
import xyz.fernlink.sdk.transport.TransportType
import java.net.ServerSocket
import java.net.Socket
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.CopyOnWriteArrayList

/**
 * Fernlink transport over Android WiFi Direct (WifiP2pManager).
 *
 * Peer discovery uses DNS-SD service records so each device's public key
 * is known before connection. The device with the lexicographically lower
 * public key becomes the client (calls connect()); the higher becomes the
 * Group Owner and runs the TCP ServerSocket. This makes GO election
 * deterministic regardless of which device calls discoverPeers() first.
 *
 * All TCP messages use TcpFraming (1-byte type tag + 4-byte length prefix).
 */
internal class WifiDirectTransport(
    private val context:    Context,
    private val localPubKey: String,
    private val scope:      CoroutineScope,
) : FernlinkTransport, WifiDirectBroadcastReceiver.Callbacks {

    override val transportType: TransportType = TransportType.WIFI_DIRECT

    private val _incomingRequests = MutableSharedFlow<ByteArray>(extraBufferCapacity = 32)
    val incomingRequests: SharedFlow<ByteArray> = _incomingRequests

    private val _incomingProofs = MutableSharedFlow<ByteArray>(extraBufferCapacity = 32)
    val incomingProofs: SharedFlow<ByteArray> = _incomingProofs

    private val sockets         = CopyOnWriteArrayList<Socket>()
    private val socketLock      = Any()
    private val connectingAddrs = CopyOnWriteArrayList<String>()
    // Maps each open socket to the peer's pubkey fingerprint received via TYPE_HELLO.
    private val socketToFp      = ConcurrentHashMap<Socket, String>()

    private lateinit var wifiP2pManager: WifiP2pManager
    private lateinit var p2pChannel:     WifiP2pManager.Channel
    private lateinit var receiver:       WifiDirectBroadcastReceiver

    private var serverSocket: ServerSocket? = null
    private var started = false

    companion object {
        private const val TCP_PORT = 8765
        private const val SERVICE_TYPE = "_fernlink._tcp"
    }

    // ── FernlinkTransport ─────────────────────────────────────────────────────

    override val connectedPeerCount: Int get() = sockets.size
    override val pendingRequestCount: Int get() = 0

    override fun connectedPeerFingerprints(): Set<String> = socketToFp.values.toSet()

    override fun startMesh(keypairSeed: ByteArray, pubKey: ByteArray, rpcEndpoint: String) {
        if (started) return
        wifiP2pManager = context.getSystemService(Context.WIFI_P2P_SERVICE) as WifiP2pManager
        p2pChannel = wifiP2pManager.initialize(context, context.mainLooper, null)
        receiver = WifiDirectBroadcastReceiver(wifiP2pManager, p2pChannel, this)

        val filter = IntentFilter().apply {
            addAction(WifiP2pManager.WIFI_P2P_STATE_CHANGED_ACTION)
            addAction(WifiP2pManager.WIFI_P2P_PEERS_CHANGED_ACTION)
            addAction(WifiP2pManager.WIFI_P2P_CONNECTION_CHANGED_ACTION)
        }
        context.registerReceiver(receiver, filter)

        removeStaleGroupThenDiscover()
        registerLocalService()
        discoverServices()
        started = true
    }

    override fun stopMesh() {
        if (!started) return
        sockets.forEach { runCatching { it.close() } }
        sockets.clear()
        socketToFp.clear()
        serverSocket?.close()
        serverSocket = null
        runCatching { context.unregisterReceiver(receiver) }
        wifiP2pManager.removeGroup(p2pChannel, null)
        started = false
    }

    override fun broadcastRequest(txSignature: String, commitment: String, ttl: Int) {
        val payload = """{"txSignature":"$txSignature","commitment":"$commitment","ttl":$ttl}"""
            .toByteArray(Charsets.UTF_8)
        sendToAll(TcpFraming.TYPE_REQUEST, WirePayload.encode(payload))
    }

    override fun collectConsensusJson(minProofs: Int): String? = null

    override fun clearProofs() {}

    // ── Internal send helpers ─────────────────────────────────────────────────

    fun sendProof(payload: ByteArray) = sendToAll(TcpFraming.TYPE_PROOF, WirePayload.encode(payload))
    fun sendRequest(payload: ByteArray) = sendToAll(TcpFraming.TYPE_REQUEST, WirePayload.encode(payload))

    /** Relay a request from another transport to WiFi Direct peers — no local RPC. */
    override fun injectRequest(payload: ByteArray) = sendToAll(TcpFraming.TYPE_REQUEST, WirePayload.encode(payload))

    /** Relay a proof from another transport to WiFi Direct peers. */
    override fun injectProof(payload: ByteArray) = sendToAll(TcpFraming.TYPE_PROOF, WirePayload.encode(payload))

    private fun sendHello(socket: Socket) {
        runCatching {
            synchronized(socketLock) {
                TcpFraming.write(socket.getOutputStream(), TcpFraming.TYPE_HELLO,
                    localPubKey.take(16).toByteArray(Charsets.UTF_8))
            }
        }
    }

    private fun sendToAll(typeTag: Byte, payload: ByteArray) {
        val dead = mutableListOf<Socket>()
        sockets.forEach { socket ->
            runCatching {
                synchronized(socketLock) {
                    TcpFraming.write(socket.getOutputStream(), typeTag, payload)
                }
            }.onFailure { dead.add(socket) }
        }
        sockets.removeAll(dead)
    }

    // ── DNS-SD service registration + discovery ───────────────────────────────

    private fun registerLocalService() {
        val record = mapOf("pk" to localPubKey, "v" to "1")
        val serviceInfo = WifiP2pDnsSdServiceInfo.newInstance("fernlink", SERVICE_TYPE, record)
        wifiP2pManager.addLocalService(p2pChannel, serviceInfo, null)
    }

    private fun discoverServices() {
        wifiP2pManager.setDnsSdResponseListeners(p2pChannel,
            { instanceName, registrationType, device ->
                if (registrationType.contains("_fernlink")) {
                    // Store service instance for later use
                }
            },
            { fullDomainName, record, device ->
                val peerPubKey = record["pk"] ?: return@setDnsSdResponseListeners
                onServiceDiscovered(device, peerPubKey)
            }
        )
        val request = WifiP2pDnsSdServiceRequest.newInstance()
        wifiP2pManager.addServiceRequest(p2pChannel, request, null)
        wifiP2pManager.discoverServices(p2pChannel, null)
    }

    private fun onServiceDiscovered(device: WifiP2pDevice, peerPubKey: String) {
        // Deterministic GO election: lower pubkey = client (connects),
        // higher pubkey = preferred GO (waits to be connected to).
        if (localPubKey < peerPubKey) {
            val addr = device.deviceAddress
            if (connectingAddrs.contains(addr)) return  // already connecting, skip duplicate
            connectingAddrs.add(addr)
            val config = WifiP2pConfig().apply {
                deviceAddress = addr
                groupOwnerIntent = 0   // prefer to be client
            }
            wifiP2pManager.connect(p2pChannel, config, null)
        }
        // else: wait — the other device will connect to us
    }

    // ── Stale group cleanup ───────────────────────────────────────────────────

    private fun removeStaleGroupThenDiscover() {
        wifiP2pManager.requestGroupInfo(p2pChannel) { group ->
            if (group != null) {
                wifiP2pManager.removeGroup(p2pChannel, object : WifiP2pManager.ActionListener {
                    override fun onSuccess() { /* discovery starts via connection changed broadcast */ }
                    override fun onFailure(reason: Int) { /* group already gone */ }
                })
            }
        }
    }

    // ── WifiDirectBroadcastReceiver.Callbacks ─────────────────────────────────

    override fun onP2pEnabled(enabled: Boolean) {}

    override fun onPeersChanged(peers: WifiP2pDeviceList) {}

    override fun onConnectionChanged(connected: Boolean, info: WifiP2pInfo?) {
        if (!connected || info == null) {
            sockets.forEach { runCatching { it.close() } }
            sockets.clear()
            serverSocket?.close()
            serverSocket = null
            return
        }

        if (info.isGroupOwner) {
            startTcpServer()
        } else {
            val goAddress = info.groupOwnerAddress.hostAddress ?: return
            connectTcpClient(goAddress)
        }
    }

    // ── TCP server (Group Owner) ──────────────────────────────────────────────

    private fun startTcpServer() {
        scope.launch(Dispatchers.IO) {
            val ss = ServerSocket(TCP_PORT).also { serverSocket = it }
            while (!ss.isClosed) {
                runCatching {
                    val socket = ss.accept()
                    sockets.add(socket)
                    sendHello(socket)
                    launch { readLoop(socket) }
                }
            }
        }
    }

    // ── TCP client ────────────────────────────────────────────────────────────

    private fun connectTcpClient(goAddress: String) {
        scope.launch(Dispatchers.IO) {
            runCatching {
                val socket = Socket(goAddress, TCP_PORT)
                sockets.add(socket)
                sendHello(socket)
                readLoop(socket)
            }
        }
    }

    // ── Shared read loop ──────────────────────────────────────────────────────

    private suspend fun readLoop(socket: Socket) {
        runCatching {
            val input = socket.getInputStream()
            while (!socket.isClosed) {
                val (typeTag, payload) = TcpFraming.read(input) ?: break
                when (typeTag) {
                    TcpFraming.TYPE_HELLO   -> socketToFp[socket] = String(payload, Charsets.UTF_8)
                    TcpFraming.TYPE_REQUEST -> _incomingRequests.emit(WirePayload.decode(payload))
                    TcpFraming.TYPE_PROOF   -> _incomingProofs.emit(WirePayload.decode(payload))
                }
            }
        }
        sockets.remove(socket)
        socketToFp.remove(socket)
        runCatching { socket.close() }
    }
}
