import Foundation
import FernlinkSDK

@MainActor
final class DemoViewModel: ObservableObject {
    @Published var peerCount = 0
    @Published var verifierLog = ""
    @Published var requesterLog = ""
    @Published var isVerifying = false

    private let manager: TransportManager
    private var peerTimer: Timer?

    init() {
        manager = TransportManager(config: FernlinkClientConfig(
            rpcEndpoint: "https://api.devnet.solana.com",
            minProofs: 2
        ))
        manager.client.onMeshEvent = { [weak self] event in
            Task { @MainActor [weak self] in self?.handleMeshEvent(event) }
        }
    }

    func start() {
        verifierLog = "Device key: \(manager.client.publicKey.prefix(16))…\n"
        manager.start()
        peerTimer = Timer.scheduledTimer(withTimeInterval: 2.0, repeats: true) { [weak self] _ in
            Task { @MainActor [weak self] in
                self?.peerCount = self?.manager.connectedPeerCount ?? 0
            }
        }
    }

    func stop() {
        peerTimer?.invalidate()
        manager.stop()
    }

    func verify(customSig: String) async {
        guard !isVerifying else { return }
        isVerifying = true
        requesterLog = "─── Fernlink Verification ───\n"

        let sig: String
        if customSig.isEmpty {
            appendRequester("Fetching devnet sample…")
            guard let fetched = await fetchDevnetSample() else {
                appendRequester("[ERROR] Could not fetch a devnet transaction.")
                isVerifying = false
                return
            }
            sig = fetched
        } else {
            sig = customSig
        }

        appendRequester("[\(ts())] tx: \(sig.prefix(20))…\n")

        let peers = peerCount
        if peers > 0 {
            appendRequester("[\(ts())] Broadcasting to \(peers) peer\(peers == 1 ? "" : "s")…")
        } else {
            appendRequester("[\(ts())] No peers — direct RPC\n")
        }

        do {
            let result = try await manager.verifyTransaction(sig, timeoutMs: 10_000)
            appendRequester("")
            let count = result.proofCount
            if result.settled {
                appendRequester("✅ VERIFIED (\(count)/2 devices agree)")
            } else if count > 0 {
                appendRequester("⚠  PARTIAL — \(count)/2 devices agree")
            } else {
                appendRequester("⚠  NOT SETTLED")
            }
            let statusStr: String
            switch result.status {
            case .confirmed:    statusStr = "Confirmed"
            case .failed:       statusStr = "Failed"
            case .unknown, nil: statusStr = "Unknown"
            }
            appendRequester("   status     = \(statusStr)")
            if let slot = result.slot { appendRequester("   slot       = \(slot)") }
            if let bt = result.blockTime, bt > 0 { appendRequester("   block time = \(bt)") }
            appendRequester("   proofs     = \(count)")
        } catch {
            appendRequester("\n[ERROR] \(error.localizedDescription)")
        }

        appendRequester("\n────────────────────────────")
        isVerifying = false
    }

    private func handleMeshEvent(_ event: String) {
        let t = ts()
        if event.hasPrefix("REQUEST_IN:") {
            let sig = event.dropFirst("REQUEST_IN:".count)
            appendVerifier("[\(t)] ← Request from peer")
            appendVerifier("     tx: \(sig.prefix(20))…")
        } else if event == "RPC_QUERYING" {
            appendVerifier("[\(t)]   Querying Solana RPC…")
        } else if event.hasPrefix("PROOF_SENT:") {
            let rest  = event.dropFirst("PROOF_SENT:".count)
            let parts = rest.split(separator: ":", maxSplits: 1)
            let status = parts.first.map(String.init) ?? "?"
            let slot   = parts.dropFirst().first.map(String.init) ?? "?"
            appendVerifier("[\(t)] → Proof signed & sent")
            appendVerifier("     status=\(status)  slot=\(slot)")
        } else if event == "RPC_FAIL" {
            appendVerifier("[\(t)]   No internet — cannot verify")
        } else if event.hasPrefix("FORWARDING:") {
            let ttl = event.dropFirst("FORWARDING:".count)
            appendVerifier("[\(t)]   Forwarding into mesh (ttl=\(ttl))")
        } else if event.hasPrefix("PROOF_RECV:") {
            let rest   = event.dropFirst("PROOF_RECV:".count)
            let parts  = rest.split(separator: ":", maxSplits: 1)
            let count  = parts.first.map(String.init) ?? "?"
            let pubKey = parts.dropFirst().first.map(String.init) ?? ""
            let abbr   = pubKey.count >= 16
                ? "\(pubKey.prefix(8))…\(pubKey.suffix(8))"
                : pubKey
            appendRequester("[\(t)] ← Proof #\(count) from \(abbr)")
        }
    }

    private func appendVerifier(_ line: String)  { verifierLog  += line + "\n" }
    private func appendRequester(_ line: String) { requesterLog += line + "\n" }

    private func ts() -> String {
        let f = DateFormatter()
        f.dateFormat = "HH:mm:ss"
        return f.string(from: Date())
    }

    private func fetchDevnetSample() async -> String? {
        let body = #"{"jsonrpc":"2.0","id":1,"method":"getSignaturesForAddress","params":["Vote111111111111111111111111111111111111111p",{"limit":1}]}"#
        guard let url = URL(string: "https://api.devnet.solana.com") else { return nil }
        var req = URLRequest(url: url)
        req.httpMethod = "POST"
        req.setValue("application/json", forHTTPHeaderField: "Content-Type")
        req.httpBody = body.data(using: .utf8)
        guard let (data, _) = try? await URLSession.shared.data(for: req),
              let json      = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
              let result    = json["result"] as? [String: Any],
              let arr       = result["value"] as? [[String: Any]],
              let first     = arr.first,
              let sig       = first["signature"] as? String
        else { return nil }
        return sig
    }
}
