package xyz.fernlink.demo

import android.Manifest
import android.content.pm.PackageManager
import android.graphics.Color
import android.os.Build
import android.os.Bundle
import android.view.View
import android.widget.Button
import android.widget.EditText
import android.widget.ScrollView
import android.widget.TextView
import androidx.appcompat.app.AppCompatActivity
import androidx.core.app.ActivityCompat
import androidx.core.content.ContextCompat
import androidx.core.view.ViewCompat
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat
import kotlinx.coroutines.*
import kotlinx.coroutines.flow.launchIn
import kotlinx.coroutines.flow.onEach
import xyz.fernlink.sdk.Commitment
import xyz.fernlink.sdk.FernlinkClient
import xyz.fernlink.sdk.FernlinkClientConfig
import xyz.fernlink.sdk.TransportManager
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

class MainActivity : AppCompatActivity() {

    private val client = FernlinkClient(
        FernlinkClientConfig(rpcEndpoint = "https://api.devnet.solana.com", minProofs = 2)
    )
    private val scope = CoroutineScope(Dispatchers.Main + SupervisorJob())
    private lateinit var transportManager: TransportManager

    // UI refs
    private lateinit var tvPeers: TextView
    private lateinit var vStatusDot: View
    private lateinit var tvVerifierLog: TextView
    private lateinit var tvVerifierStatus: TextView
    private lateinit var svVerifier: ScrollView
    private lateinit var tvLog: TextView
    private lateinit var svRequester: ScrollView
    private lateinit var etSignature: EditText
    private lateinit var btnVerify: Button

    private val timeFmt = SimpleDateFormat("HH:mm:ss", Locale.getDefault())

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        // Let the app draw behind system bars; we handle the insets ourselves
        WindowCompat.setDecorFitsSystemWindows(window, false)
        setContentView(R.layout.activity_main)

        // Pad the root view so content never hides under system bars or soft keyboard
        val root = findViewById<View>(android.R.id.content)
        ViewCompat.setOnApplyWindowInsetsListener(root) { v, insets ->
            val bars = insets.getInsets(WindowInsetsCompat.Type.systemBars())
            val ime  = insets.getInsets(WindowInsetsCompat.Type.ime())
            v.setPadding(bars.left, bars.top, bars.right, maxOf(bars.bottom, ime.bottom))
            insets
        }

        client.start()
        transportManager = TransportManager(this, client)

        tvPeers        = findViewById(R.id.tvPeers)
        vStatusDot     = findViewById(R.id.vStatusDot)
        tvVerifierLog  = findViewById(R.id.tvVerifierLog)
        tvVerifierStatus = findViewById(R.id.tvVerifierStatus)
        svVerifier     = findViewById(R.id.svVerifier)
        tvLog          = findViewById(R.id.tvLog)
        svRequester    = findViewById(R.id.svRequester)
        etSignature    = findViewById(R.id.etSignature)
        btnVerify      = findViewById(R.id.btnVerify)

        verifierLog("Device key: ${client.publicKey.take(16)}…")

        requestPermissionsAndStartServices()

        btnVerify.setOnClickListener {
            val sig = etSignature.text.toString().trim()
            btnVerify.isEnabled = false
            tvLog.text = ""
            scope.launch { runRequester(sig.ifEmpty { null }) }
        }
    }

    // ── Permission + service startup ─────────────────────────────────────────

    private fun requestPermissionsAndStartServices() {
        val needed = mutableListOf<String>()
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            listOf(
                Manifest.permission.BLUETOOTH_SCAN,
                Manifest.permission.BLUETOOTH_ADVERTISE,
                Manifest.permission.BLUETOOTH_CONNECT,
            ).forEach {
                if (ContextCompat.checkSelfPermission(this, it) != PackageManager.PERMISSION_GRANTED)
                    needed += it
            }
        } else {
            if (ContextCompat.checkSelfPermission(this, Manifest.permission.ACCESS_FINE_LOCATION)
                != PackageManager.PERMISSION_GRANTED) needed += Manifest.permission.ACCESS_FINE_LOCATION
        }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            if (ContextCompat.checkSelfPermission(this, Manifest.permission.NEARBY_WIFI_DEVICES)
                != PackageManager.PERMISSION_GRANTED) needed += Manifest.permission.NEARBY_WIFI_DEVICES
        }
        if (needed.isNotEmpty()) ActivityCompat.requestPermissions(this, needed.toTypedArray(), RC_PERMS)
        else startServicesAndObserve()
    }

    override fun onRequestPermissionsResult(rc: Int, perms: Array<out String>, grants: IntArray) {
        super.onRequestPermissionsResult(rc, perms, grants)
        if (rc == RC_PERMS) startServicesAndObserve()
    }

    private fun startServicesAndObserve() {
        transportManager.startAll()
        observePeerCount()
        observeMeshEvents()
    }

    // ── Peer count ticker ────────────────────────────────────────────────────

    private fun observePeerCount() {
        scope.launch {
            while (true) {
                val count = transportManager.connectedPeerCount
                val dot = vStatusDot
                if (count > 0) {
                    tvPeers.text = "$count peer${if (count == 1) "" else "s"} connected"
                    tvPeers.setTextColor(Color.parseColor("#22C55E"))
                    dot.setBackgroundColor(Color.parseColor("#22C55E"))
                } else {
                    tvPeers.text = "Scanning for peers…"
                    tvPeers.setTextColor(Color.parseColor("#9CA3AF"))
                    dot.setBackgroundColor(Color.parseColor("#374151"))
                }
                delay(2_000)
            }
        }
    }

    // ── Mesh event observer (verifier panel) ─────────────────────────────────

    private fun observeMeshEvents() {
        transportManager.meshEvents
            .onEach { event -> handleMeshEvent(event) }
            .launchIn(scope)
    }

    private fun handleMeshEvent(event: String) {
        val ts = timeFmt.format(Date())
        when {
            event.startsWith("REQUEST_IN:") -> {
                val sig = event.removePrefix("REQUEST_IN:")
                tvVerifierStatus.text = "active"
                tvVerifierStatus.setTextColor(Color.parseColor("#F59E0B"))
                verifierLog("[$ts] ← Request from peer")
                verifierLog("     tx: $sig…")
            }
            event == "RPC_QUERYING" -> {
                verifierLog("[$ts]   Querying Solana RPC…")
            }
            event.startsWith("PROOF_SENT:") -> {
                val parts = event.removePrefix("PROOF_SENT:").split(":")
                val status = parts.getOrNull(0) ?: "?"
                val slot   = parts.getOrNull(1) ?: "?"
                verifierLog("[$ts] → Proof signed & sent")
                verifierLog("     status=$status  slot=$slot")
                tvVerifierStatus.text = "sent proof"
                tvVerifierStatus.setTextColor(Color.parseColor("#22C55E"))
            }
            event == "RPC_FAIL" -> {
                verifierLog("[$ts]   No internet — cannot verify")
                tvVerifierStatus.text = "no RPC"
                tvVerifierStatus.setTextColor(Color.parseColor("#EF4444"))
            }
            event.startsWith("FORWARDING:") -> {
                val ttl = event.removePrefix("FORWARDING:")
                verifierLog("[$ts]   Forwarding into mesh (ttl=$ttl)")
            }
            event.startsWith("PROOF_RECV:") -> {
                // requester side — also reflected in requester panel via runRequester
            }
        }
        svVerifier.post { svVerifier.fullScroll(ScrollView.FOCUS_DOWN) }
    }

    // ── Requester flow ───────────────────────────────────────────────────────

    private suspend fun runRequester(customSig: String?) {
        val ts = { timeFmt.format(Date()) }

        requesterLog("─── Fernlink Verification ───\n")

        val signature = customSig ?: withContext(Dispatchers.IO) { fetchDevnetSample() }
        if (signature == null) {
            requesterLog("[ERROR] Could not fetch a devnet transaction. Check network.")
            btnVerify.isEnabled = true
            return
        }

        requesterLog("[${ts()}] tx: ${signature.take(20)}…\n")

        val peers = transportManager.connectedPeerCount
        if (peers > 0) {
            requesterLog("[${ts()}] Broadcasting to $peers peer${if (peers == 1) "" else "s"}…")
        } else {
            requesterLog("[${ts()}] No peers — direct RPC\n")
        }

        // observe incoming proofs while we wait
        val proofJob = transportManager.meshEvents
            .onEach { event ->
                if (event.startsWith("PROOF_RECV:")) {
                    val parts  = event.removePrefix("PROOF_RECV:").split(":")
                    val count  = parts.getOrNull(0)?.toIntOrNull() ?: 1
                    val pubKey = parts.getOrNull(1)?.takeIf { it.length >= 16 }
                        ?.let { "${it.take(8)}…${it.takeLast(8)}" } ?: "unknown"
                    requesterLog("[${ts()}] ← Proof #$count from $pubKey")
                }
            }
            .launchIn(scope)

        val result = runCatching {
            withContext(Dispatchers.IO) {
                client.verifyTransaction(
                    txSignature = signature,
                    commitment  = Commitment.CONFIRMED,
                    timeoutMs   = 10_000,
                )
            }
        }

        proofJob.cancel()

        result.onSuccess { consensus ->
            requesterLog("")
            val count = consensus.proofCount ?: 0
            if (consensus.settled) {
                requesterLog("✅ VERIFIED ($count/2 devices agree)")
            } else if (count > 0) {
                requesterLog("⚠  PARTIAL — $count/2 devices agree")
            } else {
                requesterLog("⚠  NOT SETTLED")
            }
            requesterLog("   status     = ${consensus.status ?: "—"}")
            consensus.slot?.let      { requesterLog("   slot       = $it") }
            consensus.blockTime?.let { requesterLog("   block time = $it") }
            requesterLog("   proofs     = $count")
        }

        result.onFailure { e ->
            requesterLog("\n[ERROR] ${e.message}")
        }

        requesterLog("\n────────────────────────────")
        btnVerify.isEnabled = true
    }

    // ── Logging helpers ──────────────────────────────────────────────────────

    private fun verifierLog(line: String) {
        tvVerifierLog.append("$line\n")
        svVerifier.post { svVerifier.fullScroll(ScrollView.FOCUS_DOWN) }
    }

    private fun requesterLog(line: String) {
        tvLog.append("$line\n")
        svRequester.post { svRequester.fullScroll(ScrollView.FOCUS_DOWN) }
    }

    // ── Devnet sample fetch ──────────────────────────────────────────────────

    private fun fetchDevnetSample(): String? = runCatching {
        val body = """{"jsonrpc":"2.0","id":1,"method":"getSignaturesForAddress",
            "params":["Vote111111111111111111111111111111111111111p",{"limit":1}]}"""
            .trimIndent()
        val conn = java.net.URL("https://api.devnet.solana.com").openConnection()
            as java.net.HttpURLConnection
        conn.requestMethod = "POST"
        conn.setRequestProperty("Content-Type", "application/json")
        conn.doOutput = true
        conn.outputStream.write(body.toByteArray())
        val text = conn.inputStream.bufferedReader().readText()
        val arr = org.json.JSONObject(text).getJSONObject("result").getJSONArray("value")
        if (arr.length() == 0) null else arr.getJSONObject(0).getString("signature")
    }.getOrNull()

    override fun onDestroy() {
        transportManager.stopAll()
        client.stop()
        scope.cancel()
        super.onDestroy()
    }

    companion object {
        private const val RC_PERMS = 100
    }
}
