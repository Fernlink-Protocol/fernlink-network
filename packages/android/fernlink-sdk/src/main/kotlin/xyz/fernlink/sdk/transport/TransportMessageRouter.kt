package xyz.fernlink.sdk.transport

import android.content.Context
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.flow.SharedFlow
import kotlinx.coroutines.flow.launchIn
import kotlinx.coroutines.flow.onEach
import kotlinx.coroutines.launch
import org.json.JSONObject
import xyz.fernlink.sdk.FernlinkJni
import xyz.fernlink.sdk.SolanaRpc
import xyz.fernlink.sdk.TxStatus
import xyz.fernlink.sdk.ble.ProofStore
import java.util.Collections
import java.util.UUID
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.ConcurrentLinkedQueue

internal class TransportMessageRouter(
    private val incomingRequests: SharedFlow<ByteArray>,
    private val incomingProofs: SharedFlow<ByteArray>,
    private val sendProof: (ByteArray) -> Unit,
    private val sendRequest: (ByteArray) -> Unit,
    private val connectedPeerCount: () -> Int,
    private val proofStore: ProofStore,
    private val keypairSeed: ByteArray,
    private val rpcEndpoint: String,
    private val scope: CoroutineScope,
    context: Context? = null,
) {
    private val rpc = SolanaRpc(rpcEndpoint, context)
    private val collectedProofsList = ConcurrentLinkedQueue<String>()
    val collectedProofs: List<String> get() = collectedProofsList.toList()

    private val originatedRequestIds: MutableSet<String> =
        Collections.newSetFromMap(ConcurrentHashMap())

    private val seenVerifierKeys: MutableSet<String> =
        Collections.newSetFromMap(ConcurrentHashMap())

    @Volatile private var currentTxSig: String = ""

    private var externalRequestSender: ((ByteArray) -> Unit)? = null
    private var externalProofSender: ((ByteArray) -> Unit)? = null

    fun setExternalForwarders(requestSender: (ByteArray) -> Unit, proofSender: (ByteArray) -> Unit) {
        externalRequestSender = requestSender
        externalProofSender = proofSender
    }

    fun injectRequest(payload: ByteArray) {
        sendRequest(payload)
    }

    fun injectProof(payload: ByteArray) {
        scope.launch {
            val json = String(payload, Charsets.UTF_8)
            if (FernlinkJni.verifyProof(json) && proofMatchesCurrentRound(json)) {
                val pubKeyHex = extractPubKeyHex(json)
                if (seenVerifierKeys.add(pubKeyHex)) {
                    collectedProofsList.add(json)
                    sendProof(payload)
                    externalProofSender?.invoke(payload)
                }
            }
        }
    }

    fun clearProofs() {
        collectedProofsList.clear()
        originatedRequestIds.clear()
        seenVerifierKeys.clear()
        currentTxSig = ""
    }

    fun start() {
        incomingRequests
            .onEach { payload -> scope.launch { handleIncomingRequest(payload) } }
            .launchIn(scope)

        incomingProofs
            .onEach { payload ->
                val json = String(payload, Charsets.UTF_8)
                if (FernlinkJni.verifyProof(json)) {
                    if (!proofMatchesCurrentRound(json)) return@onEach
                    val pubKeyHex = extractPubKeyHex(json)
                    if (seenVerifierKeys.add(pubKeyHex)) {
                        collectedProofsList.add(json)
                        sendProof(payload)
                        externalProofSender?.invoke(payload)
                    }
                }
            }
            .launchIn(scope)
    }

    private fun extractPubKeyHex(json: String): String = runCatching {
        val arr = JSONObject(json).getJSONArray("verifier_pubkey")
        buildString {
            for (i in 0 until minOf(arr.length(), 32))
                append("%02x".format(arr.getInt(i) and 0xFF))
        }
    }.getOrDefault("")

    private fun proofMatchesCurrentRound(json: String): Boolean {
        if (currentTxSig.isEmpty()) return false
        val proofTxSig = runCatching {
            val arr = JSONObject(json).getJSONArray("tx_signature")
            val bytes = ByteArray(minOf(arr.length(), 64)) { arr.getInt(it).and(0xFF).toByte() }
            String(bytes, Charsets.UTF_8).trimEnd('\u0000')
        }.getOrDefault("")
        return proofTxSig == currentTxSig.take(64)
    }

    private suspend fun handleIncomingRequest(payload: ByteArray) {
        runCatching {
            val json       = JSONObject(String(payload, Charsets.UTF_8))
            val txSig      = json.getString("txSignature")
            val commitment = json.optString("commitment", "confirmed")
            val ttl        = json.optInt("ttl", 0).coerceIn(0, 8)
            val requestId  = json.optString("requestId", "")

            if (requestId.isNotEmpty() && originatedRequestIds.contains(requestId)) return

            try {
                val status = rpc.getSignatureStatus(txSig)
                val statusByte: Byte = when (status.status) {
                    TxStatus.CONFIRMED -> 0
                    TxStatus.FAILED    -> 1
                    TxStatus.UNKNOWN   -> 2
                }
                val proofJson = FernlinkJni.signProof(
                    keypairSeed = keypairSeed,
                    txSignature = txSig,
                    statusByte  = statusByte,
                    slot        = status.slot,
                    blockTime   = status.blockTime,
                    errorCode   = 0,
                ) ?: return
                sendProof(proofJson.toByteArray(Charsets.UTF_8))
            } catch (_: Exception) {
                if (ttl > 0) {
                    val forwarded = JSONObject().apply {
                        put("txSignature", txSig)
                        put("commitment",  commitment)
                        put("ttl",         ttl - 1)
                        if (requestId.isNotEmpty()) put("requestId", requestId)
                    }.toString().toByteArray(Charsets.UTF_8)
                    sendRequest(forwarded)
                    externalRequestSender?.invoke(forwarded)
                }
            }
        }
    }

    fun broadcastRequest(txSignature: String, commitment: String = "confirmed", ttl: Int = 8) {
        currentTxSig = txSignature
        val requestId = UUID.randomUUID().toString()
        originatedRequestIds.add(requestId)
        if (connectedPeerCount() == 0) {
            proofStore.enqueue(ProofStore.PendingRequest(txSignature, commitment, ttl))
            return
        }
        val payload = JSONObject().apply {
            put("txSignature", txSignature)
            put("commitment",  commitment)
            put("ttl",         ttl)
            put("requestId",   requestId)
        }.toString().toByteArray(Charsets.UTF_8)
        sendRequest(payload)
    }

    fun collectConsensusJson(minProofs: Int): String? {
        val proofs = collectedProofs
        if (proofs.isEmpty()) return null

        val first = runCatching { JSONObject(proofs.first()) }.getOrNull()
        val statusStr = when (first?.optString("status", "Unknown")?.lowercase()) {
            "confirmed" -> "confirmed"
            "failed"    -> "failed"
            else        -> "unknown"
        }
        return JSONObject().apply {
            put("settled",    proofs.size >= minProofs)
            put("status",     statusStr)
            put("slot",       first?.optLong("slot", 0) ?: 0L)
            put("blockTime",  first?.optLong("block_time", 0) ?: 0L)
            put("proofCount", proofs.size)
        }.toString()
    }
}
