package xyz.fernlink.sdk.transport

enum class TransportType(val priority: Int) {
    BLE(20),
    WIFI_DIRECT(10),
    NFC_BOOTSTRAP(0),
}

/**
 * Common interface implemented by every Fernlink transport service
 * (BLE, WiFi Direct, etc.).
 *
 * FernlinkClient holds a list of FernlinkTransport instances and delegates
 * mesh operations to all transports with active peers.
 */
interface FernlinkTransport {
    val transportType: TransportType
    val connectedPeerCount: Int
    val pendingRequestCount: Int

    /**
     * Returns the pubkey fingerprints (first 8 bytes of each peer's Ed25519 pubkey,
     * as a 16-char hex string) for all fully-connected peers on this transport.
     * FernlinkClient takes the union across transports so one physical device
     * with both BLE and WiFi Direct active counts as a single peer, not two.
     */
    fun connectedPeerFingerprints(): Set<String>

    fun startMesh(keypairSeed: ByteArray, pubKey: ByteArray, rpcEndpoint: String)
    fun stopMesh()

    fun broadcastRequest(txSignature: String, commitment: String = "confirmed", ttl: Int = 8)
    fun collectConsensusJson(minProofs: Int): String?
    fun clearProofs()

    /**
     * Gap 3 — cross-transport bridge.
     *
     * Wire callbacks so requests/proofs flow across transport boundaries when a
     * multi-hop relay is needed (e.g. BLE-only device → WiFi Direct peer with internet).
     * externalRequestSender is called in the RPC-failure forwarding path.
     * externalProofSender is called whenever a new valid proof is collected.
     * Default no-ops so existing implementations don't need changes.
     */
    fun setExternalForwarders(requestSender: (ByteArray) -> Unit, proofSender: (ByteArray) -> Unit) {}

    /** Relay a request from another transport to this transport's peers (no local RPC). */
    fun injectRequest(payload: ByteArray) {}

    /** Inject a proof from another transport: verify, deduplicate, collect, and forward. */
    fun injectProof(payload: ByteArray) {}

    /**
     * Gap 4 — multi-transport aggregation.
     *
     * Raw list of collected proof JSON strings for this round.
     * FernlinkClient unions these across all transports before running consensus.
     */
    fun collectedProofs(): List<String> = emptyList()
}
