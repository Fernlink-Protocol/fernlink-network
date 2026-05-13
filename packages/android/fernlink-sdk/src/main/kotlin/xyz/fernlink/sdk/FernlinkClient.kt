package xyz.fernlink.sdk

import kotlinx.coroutines.*
import kotlinx.serialization.json.Json
import org.json.JSONArray
import org.json.JSONObject
import android.app.Activity
import android.bluetooth.BluetoothAdapter
import xyz.fernlink.sdk.ble.FernlinkBleService
import xyz.fernlink.sdk.nfc.NfcBootstrapHelper
import xyz.fernlink.sdk.transport.FernlinkTransport
import xyz.fernlink.sdk.transport.TransportType

/**
 * FernlinkClient is the main entry point for the Fernlink Android SDK.
 *
 * Single-device (RPC-only) usage:
 * ```kotlin
 * val client = FernlinkClient(FernlinkClientConfig(rpcEndpoint = "https://api.mainnet-beta.solana.com"))
 * client.start()
 * val result = client.verifyTransaction(txSignature)
 * ```
 *
 * With BLE mesh (bind FernlinkBleService first, then attach):
 * ```kotlin
 * client.attachTransport(bleService)   // call from onServiceConnected
 * val result = client.verifyTransaction(txSignature)
 * ```
 *
 * Multiple transports can be attached simultaneously. verifyTransaction() broadcasts
 * to all active transports and aggregates proofs across them for consensus.
 */
class FernlinkClient(private val config: FernlinkClientConfig) {

    private val scope = CoroutineScope(Dispatchers.IO + SupervisorJob())
    private val rpc   = SolanaRpc(config.rpcEndpoint)
    private val json  = Json { ignoreUnknownKeys = true }

    private val keypairBytes: ByteArray = config.keypairSeed
        ?.let { seed -> FernlinkJni.keypairFromSeed(seed.sliceArray(0..31)) }
        ?: FernlinkJni.generateKeypair()

    val publicKey: String
        get() = keypairBytes.drop(32).joinToString("") { "%02x".format(it) }

    private var started    = false
    private val transports = mutableListOf<FernlinkTransport>()

    fun start() { started = true }
    fun stop()  {
        started = false
        transports.forEach { it.stopMesh() }
        scope.cancel()
    }

    // ── Transport management ──────────────────────────────────────────────────

    /** Attach any FernlinkTransport (BLE, WiFi Direct, etc.) to the mesh. */
    fun attachTransport(transport: FernlinkTransport) {
        transports.add(transport)
        if (started) {
            transport.startMesh(
                keypairSeed = keypairBytes.sliceArray(0..31),
                pubKey      = keypairBytes.sliceArray(32..63),
                rpcEndpoint = config.rpcEndpoint,
            )
        }
        rewireCrossTransportForwarding()
    }

    /** Convenience overload — kept for backwards compatibility. */
    fun attachBleService(service: FernlinkBleService) = attachTransport(service)

    fun detachTransport(transport: FernlinkTransport) {
        transport.stopMesh()
        transports.remove(transport)
        rewireCrossTransportForwarding()
    }

    fun detachBleService() {
        transports.filterIsInstance<FernlinkBleService>().forEach { detachTransport(it) }
    }

    /**
     * Number of unique connected peers across all active transports.
     * A device reachable over both BLE and WiFi Direct counts as one peer,
     * not two, because fingerprints from all transports are unioned before counting.
     */
    val connectedPeerCount: Int
        get() = transports.flatMap { it.connectedPeerFingerprints() }.toSet().size

    // ── Cross-transport bridge (Gap 3) ────────────────────────────────────────

    /**
     * Wire every transport's external forwarders to point at all other transports.
     * Called on every attach/detach so the mesh is always fully bridged.
     *
     * When transport A's RPC fails and it needs to relay a request, it calls
     * externalRequestSender which injects the request into every other transport.
     * When transport B receives a new proof it calls externalProofSender to
     * propagate that proof back through transport A's peers.
     */
    private fun rewireCrossTransportForwarding() {
        transports.forEach { t ->
            val others = transports.filter { it !== t }
            t.setExternalForwarders(
                requestSender = { payload -> others.forEach { it.injectRequest(payload) } },
                proofSender   = { payload -> others.forEach { it.injectProof(payload) } },
            )
        }
    }

    // ── Multi-transport aggregation (Gap 4) ───────────────────────────────────

    /**
     * Collect proof JSON strings from ALL attached transports, deduplicate by
     * verifier pubkey, then build a consensus JSON string in the same format as
     * each router's collectConsensusJson().
     */
    private fun evaluateCombinedProofs(minProofs: Int): String? {
        val seen      = mutableSetOf<String>()
        val allProofs = mutableListOf<String>()
        for (t in transports) {
            for (proofJson in t.collectedProofs()) {
                val pubKeyHex = runCatching {
                    val arr = JSONObject(proofJson).getJSONArray("verifier_pubkey")
                    buildString {
                        for (i in 0 until minOf(arr.length(), 32))
                            append("%02x".format(arr.getInt(i) and 0xFF))
                    }
                }.getOrDefault("")
                if (seen.add(pubKeyHex)) allProofs.add(proofJson)
            }
        }
        if (allProofs.isEmpty()) return null
        val first = runCatching { JSONObject(allProofs.first()) }.getOrNull()
        val statusStr = when (first?.optString("status", "Unknown")?.lowercase()) {
            "confirmed" -> "confirmed"
            "failed"    -> "failed"
            else        -> "unknown"
        }
        return JSONObject().apply {
            put("settled",    allProofs.size >= minProofs)
            put("status",     statusStr)
            put("slot",       first?.optLong("slot", 0) ?: 0L)
            put("blockTime",  first?.optLong("block_time", 0) ?: 0L)
            put("proofCount", allProofs.size)
        }.toString()
    }

    // ── NFC bootstrapping ─────────────────────────────────────────────────────

    /**
     * Create an NFC bootstrap helper that speeds up BLE pairing from ~5s to ~200ms.
     * The helper must be driven from your Activity's onResume/onPause/onNewIntent.
     *
     * On receiving a tap, the helper calls GattClientManager.connectDirect() if a
     * FernlinkBleService is attached; otherwise it calls [onBootstrapReceived].
     */
    fun createNfcBootstrapHelper(
        activity: Activity,
        onBootstrapReceived: ((peerPublicKey: String, bleAddress: String?) -> Unit)? = null,
    ): NfcBootstrapHelper {
        val bleMac = runCatching {
            BluetoothAdapter.getDefaultAdapter()?.address
        }.getOrNull()

        return NfcBootstrapHelper(
            activity            = activity,
            localPublicKey      = publicKey,
            localBleMacAddress  = bleMac,
            onBootstrapReceived = { peerPubKey, bleAddress ->
                bleAddress?.let { addr ->
                    val bleService = transports.filterIsInstance<FernlinkBleService>().firstOrNull()
                    bleService?.let { svc ->
                        val device = BluetoothAdapter.getDefaultAdapter()
                            ?.getRemoteDevice(addr)
                        device?.let { svc.client.connectDirect(it) }
                    }
                }
                onBootstrapReceived?.invoke(peerPubKey, bleAddress)
            },
        )
    }

    // ── Verification ─────────────────────────────────────────────────────────

    /**
     * Verify a Solana transaction.
     *
     * Broadcasts to ALL active transports simultaneously and aggregates proofs
     * across them (deduplicated by verifier pubkey) before running consensus.
     * Falls back to direct RPC if no transport has peers or none respond
     * within [timeoutMs].
     */
    suspend fun verifyTransaction(
        txSignature: String,
        commitment: Commitment = Commitment.CONFIRMED,
        timeoutMs: Long = 15_000,
    ): ConsensusResult = withContext(Dispatchers.IO) {
        check(started) { "Call client.start() before verifyTransaction()" }

        val activeTransports = transports.filter { it.connectedPeerCount > 0 }

        if (activeTransports.isNotEmpty()) {
            // Clear proof state on all transports, then broadcast to all simultaneously.
            activeTransports.forEach { it.clearProofs() }
            activeTransports.forEach { t ->
                t.broadcastRequest(
                    txSignature = txSignature,
                    commitment  = commitment.name.lowercase(),
                    ttl         = 8,
                )
            }

            // Poll until a settled result arrives or the timeout expires.
            val meshResult: ConsensusResult? = withTimeoutOrNull(timeoutMs) {
                while (true) {
                    val consensusJson = evaluateCombinedProofs(config.minProofs)
                    if (consensusJson != null) {
                        val r = runCatching {
                            json.decodeFromString<ConsensusResult>(consensusJson)
                        }.getOrNull()
                        if (r?.settled == true) return@withTimeoutOrNull r
                    }
                    delay(300)
                }
                @Suppress("UNREACHABLE_CODE") null
            }

            if (meshResult != null) return@withContext meshResult

            // Timeout expired — return partial result if any proofs arrived
            val partialJson = evaluateCombinedProofs(config.minProofs)
            if (partialJson != null) {
                val partial = runCatching {
                    json.decodeFromString<ConsensusResult>(partialJson)
                }.getOrNull()
                if (partial != null) return@withContext partial
            }
        }

        // Direct RPC fallback
        val sigStatus = rpc.getSignatureStatus(txSignature)
        val statusByte: Byte = when (sigStatus.status) {
            TxStatus.CONFIRMED -> 0
            TxStatus.FAILED    -> 1
            TxStatus.UNKNOWN   -> 2
        }
        val proofJson = FernlinkJni.signProof(
            keypairSeed = keypairBytes.sliceArray(0..31),
            txSignature  = txSignature,
            statusByte   = statusByte,
            slot         = sigStatus.slot,
            blockTime    = sigStatus.blockTime,
            errorCode    = 0,
        ) ?: throw RuntimeException("Failed to sign proof")

        val proofsArray   = JSONArray().apply { put(JSONObject(proofJson)) }
        val consensusJson = FernlinkJni.evaluateProofs(proofsArray.toString(), 1)
            ?: throw RuntimeException("Consensus evaluation failed")
        json.decodeFromString<ConsensusResult>(consensusJson)
    }
}
