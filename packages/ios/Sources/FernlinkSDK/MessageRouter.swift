import Foundation

/// Wires PeripheralManager + CentralManager + crypto + RPC.
/// Mirrors BleMessageRouter.kt on Android.
///
/// When a REQUEST arrives from a peer:
///   1. Call Solana RPC to verify independently.
///   2. Sign and send a PROOF back if RPC succeeds.
///   3. Forward the request further (TTL-1) if no internet.
///
/// When a PROOF arrives from a downstream peer:
///   - Collect it locally for consensus.
///   - Forward it back upstream (multi-hop return: C → B → A).
final class MessageRouter {

    private let peripheral:  FernlinkPeripheralManager
    private let central:     FernlinkCentralManager
    private let keypair:     FernlinkKeypair
    private let rpc:         SolanaRpc
    private let proofStore:  ProofStore

    // Thread-safe proof collection for consensus.
    private let proofsLock = NSLock()
    private var collectedProofs: [VerificationProof] = []

    init(
        peripheral: FernlinkPeripheralManager,
        central:    FernlinkCentralManager,
        keypair:    FernlinkKeypair,
        rpcEndpoint: String,
        proofStore: ProofStore
    ) {
        self.peripheral = peripheral
        self.central    = central
        self.keypair    = keypair
        self.rpc        = SolanaRpc(rpcEndpoint)
        self.proofStore = proofStore
    }

    func start() {
        peripheral.onRequest = { [weak self] data in
            self?.handleIncomingRequest(data)
        }
        central.onProof = { [weak self] data in
            self?.handleIncomingProof(data)
        }
    }

    func clearProofs() { proofsLock.withLock { collectedProofs = [] } }

    func collectedProofsList() -> [VerificationProof] {
        proofsLock.withLock { collectedProofs }
    }

    func broadcastRequest(txSignature: String, commitment: String, ttl: Int) {
        if central.connectedPeerCount == 0 {
            proofStore.enqueue(.init(txSignature: txSignature, commitment: commitment, ttl: ttl))
            return
        }
        sendRequest(txSignature: txSignature, commitment: commitment, ttl: ttl)
    }

    // MARK: - Private

    private func handleIncomingRequest(_ data: Data) {
        Task {
            guard let json = try? JSONDecoder().decode(VerificationRequest.self, from: data) else { return }
            do {
                let status = try await rpc.getSignatureStatus(json.txSignature)
                let proof  = try keypair.signProof(
                    txSignature: json.txSignature,
                    status:      status.status,
                    slot:        status.slot,
                    blockTime:   status.blockTime,
                    errorCode:   0
                )
                if let proofData = try? JSONEncoder().encode(proof) {
                    peripheral.sendProof(proofData)
                }
            } catch {
                // No internet — forward if TTL allows
                if json.ttl > 0 {
                    sendRequest(txSignature: json.txSignature, commitment: json.commitment, ttl: json.ttl - 1)
                }
            }
        }
    }

    private func handleIncomingProof(_ data: Data) {
        guard let proof = try? JSONDecoder().decode(VerificationProof.self, from: data),
              verifyProof(proof)
        else { return }

        proofsLock.withLock { collectedProofs.append(proof) }
        // Forward back upstream for multi-hop return path (C → B → A)
        peripheral.sendProof(data)
    }

    private func sendRequest(txSignature: String, commitment: String, ttl: Int) {
        let req = VerificationRequest(txSignature: txSignature, commitment: commitment, ttl: ttl, requestId: nil)
        guard let data = try? JSONEncoder().encode(req) else { return }
        central.sendRequest(data)
    }
}
