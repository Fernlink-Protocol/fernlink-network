import Foundation

public final class FernlinkClient {

    public let publicKey: String

    private let keypair:   FernlinkKeypair
    private let rpc:       SolanaRpc
    private let config:    FernlinkClientConfig
    private var started    = false

    private var transports: [(transport: FernlinkTransport, router: TransportMessageRouter)] = []
    private let proofStore = ProofStore()

    public init(config: FernlinkClientConfig = FernlinkClientConfig()) {
        self.config  = config
        self.keypair = (try? config.keypairSeed.map { try FernlinkKeypair(seed: $0) }) ?? FernlinkKeypair()
        self.rpc     = SolanaRpc(config.rpcEndpoint)
        self.publicKey = keypair.publicKeyBytes.map { String(format: "%02x", $0) }.joined()
    }

    public func start() { started = true }

    public func stop() {
        started = false
        transports.forEach { $0.transport.stop() }
        transports.removeAll()
    }

    // MARK: - Transport management

    public func startMesh() {
        let ble = BleTransport(proofStore: proofStore)
        attachTransport(ble)
    }

    public func attachMultipeerTransport() {
        let mpc = MultipeerTransport(localPubKey: publicKey)
        attachTransport(mpc)
    }

    public func attachTransport(_ transport: FernlinkTransport) {
        let router = TransportMessageRouter(
            transport:   transport,
            keypair:     keypair,
            rpcEndpoint: config.rpcEndpoint,
            proofStore:  proofStore
        )
        transport.start()
        router.start()
        transports.append((transport: transport, router: router))
        rewireCrossTransportForwarding()
    }

    public func stopMesh() {
        transports.forEach { $0.transport.stop() }
        transports.removeAll()
    }

    public var connectedPeerCount: Int {
        transports.reduce(0) { $0 + $1.transport.connectedPeerCount }
    }

    // MARK: - NFC bootstrapping

#if canImport(CoreNFC)
    @available(iOS 13.0, *)
    public func createNfcBootstrapReader(
        onBootstrapReceived: ((String, String?) -> Void)? = nil
    ) -> NfcBootstrapReader {
        return NfcBootstrapReader { [weak self] peerPubKey, bleAddress in
            if let bleTransport = self?.transports.first(where: {
                $0.transport is BleTransport
            })?.transport as? BleTransport {
                bleTransport.startDirectScan()
            }
            onBootstrapReceived?(peerPubKey, bleAddress)
        }
    }
#endif

    // MARK: - Verification

    public func verifyTransaction(
        _ txSignature: String,
        commitment:    Commitment = .confirmed,
        timeoutMs:     Int        = 15_000
    ) async throws -> ConsensusResult {
        guard started else { throw FernlinkError.notStarted }

        let active = transports.filter { $0.transport.connectedPeerCount > 0 }

        if !active.isEmpty {
            // Clear all routers before a new round — prevents stale proofs from any transport.
            transports.forEach { $0.router.clearProofs() }
            // Broadcast to every transport that has peers simultaneously.
            active.forEach {
                $0.router.broadcastRequest(
                    txSignature: txSignature,
                    commitment:  commitment.rawValue,
                    ttl:         8
                )
            }
            try await Task.sleep(nanoseconds: UInt64(timeoutMs) * 1_000_000)

            if let result = evaluateCombinedProofs(minProofs: config.minProofs) {
                return result
            }
        }

        // Direct RPC fallback
        let status = try await rpc.getSignatureStatus(txSignature)
        let proof  = try keypair.signProof(
            txSignature: txSignature,
            status:      status.status,
            slot:        status.slot,
            blockTime:   status.blockTime,
            errorCode:   0
        )
        return ConsensusResult(settled: true, status: proof.status,
                               slot: proof.slot, blockTime: proof.blockTime, proofCount: 1)
    }

    // MARK: - Private

    private func rewireCrossTransportForwarding() {
        for i in transports.indices {
            let others = transports.indices.filter { $0 != i }.map { transports[$0].router }
            transports[i].router.setExternalForwarders(
                requestSender: { data in others.forEach { $0.injectRequest(data) } },
                proofSender:   { data in others.forEach { $0.injectProof(data) } }
            )
        }
    }

    private func evaluateCombinedProofs(minProofs: Int) -> ConsensusResult? {
        var seenSigners = Set<Data>()
        let allProofs = transports
            .flatMap { $0.router.collectedProofsList() }
            .filter { seenSigners.insert($0.verifierPublicKey).inserted }

        guard !allProofs.isEmpty else { return nil }

        var tally: [(key: (TxStatus, UInt64), count: Int, blockTime: UInt64)] = []
        for proof in allProofs {
            let k = (proof.status, proof.slot)
            if let i = tally.firstIndex(where: { $0.key == k }) {
                tally[i].count += 1
            } else {
                tally.append((key: k, count: 1, blockTime: proof.blockTime))
            }
        }
        guard let best = tally.max(by: { $0.count < $1.count }) else { return nil }

        return ConsensusResult(
            settled:    best.count >= minProofs,
            status:     best.key.0,
            slot:       best.key.1,
            blockTime:  best.blockTime,
            proofCount: best.count
        )
    }
}

public struct FernlinkClientConfig {
    public var rpcEndpoint: String
    public var keypairSeed: Data?
    public var minProofs:   Int

    public init(
        rpcEndpoint: String = "https://api.mainnet-beta.solana.com",
        keypairSeed: Data?  = nil,
        minProofs:   Int    = 2
    ) {
        self.rpcEndpoint = rpcEndpoint
        self.keypairSeed = keypairSeed
        self.minProofs   = minProofs
    }
}
