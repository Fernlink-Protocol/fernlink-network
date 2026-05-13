import Foundation

final class TransportMessageRouter {

    private let transport:  FernlinkTransport
    private let keypair:    FernlinkKeypair
    private let rpc:        SolanaRpc
    private let proofStore: ProofStore

    private let routerLock             = NSLock()
    private var _currentTxSig:         String              = ""
    private var _collectedProofs:      [VerificationProof] = []
    private var _seenVerifierKeys:     Set<Data>           = []
    private var _originatedRequestIds: Set<String>         = []

    var externalRequestSender: ((Data) -> Void)?
    var externalProofSender:   ((Data) -> Void)?
    var onMeshEvent:           ((String) -> Void)?

    init(
        transport:   FernlinkTransport,
        keypair:     FernlinkKeypair,
        rpcEndpoint: String,
        proofStore:  ProofStore
    ) {
        self.transport  = transport
        self.keypair    = keypair
        self.rpc        = SolanaRpc(rpcEndpoint)
        self.proofStore = proofStore
    }

    func setExternalForwarders(
        requestSender: @escaping (Data) -> Void,
        proofSender:   @escaping (Data) -> Void
    ) {
        externalRequestSender = requestSender
        externalProofSender   = proofSender
    }

    func start() {
        transport.onIncomingRequest = { [weak self] data in self?.handleIncomingRequest(data) }
        transport.onIncomingProof   = { [weak self] data in self?.handleIncomingProof(data) }
    }

    func clearProofs() {
        routerLock.withLock {
            _collectedProofs       = []
            _seenVerifierKeys      = []
            _originatedRequestIds  = []
            _currentTxSig          = ""
        }
    }

    func collectedProofsList() -> [VerificationProof] {
        routerLock.withLock { _collectedProofs }
    }

    func broadcastRequest(txSignature: String, commitment: String = "confirmed", ttl: Int = 8) {
        let requestId = UUID().uuidString
        routerLock.withLock {
            _currentTxSig = txSignature
            _originatedRequestIds.insert(requestId)
        }
        if transport.connectedPeerCount == 0 {
            proofStore.enqueue(.init(txSignature: txSignature, commitment: commitment, ttl: ttl))
            return
        }
        sendRequest(txSignature: txSignature, commitment: commitment, ttl: ttl, requestId: requestId)
    }

    // Relay a request from another transport to this transport's peers — no local RPC.
    func injectRequest(_ data: Data) {
        transport.sendRequest(data)
    }

    // Accept a proof from another transport: verify, dedup, collect, forward to local peers.
    // Does NOT call externalProofSender to prevent inter-transport bouncing.
    func injectProof(_ data: Data) {
        guard let proof = try? JSONDecoder().decode(VerificationProof.self, from: data),
              verifyProof(proof)
        else { return }
        let added: Bool = routerLock.withLock {
            // proof.txSignature holds at most 64 chars (wire format truncates to 64 bytes).
            let txKey = String(_currentTxSig.prefix(64))
            guard !txKey.isEmpty, proof.txSignature == txKey else { return false }
            guard _seenVerifierKeys.insert(proof.verifierPublicKey).inserted else { return false }
            _collectedProofs.append(proof)
            return true
        }
        if added { transport.sendProof(data) }
    }

    // MARK: - Private

    private func handleIncomingRequest(_ data: Data) {
        Task {
            guard let json = try? JSONDecoder().decode(VerificationRequest.self, from: data) else { return }
            if let reqId = json.requestId {
                let isOwn = routerLock.withLock { _originatedRequestIds.contains(reqId) }
                if isOwn { return }
            }
            onMeshEvent?("REQUEST_IN:\(json.txSignature.prefix(20))")
            do {
                onMeshEvent?("RPC_QUERYING")
                let status = try await rpc.getSignatureStatus(json.txSignature)
                let proof  = try keypair.signProof(
                    txSignature: json.txSignature,
                    status:      status.status,
                    slot:        status.slot,
                    blockTime:   status.blockTime,
                    errorCode:   0
                )
                if let proofData = try? JSONEncoder().encode(proof) {
                    transport.sendProof(proofData)
                    let statusStr: String
                    switch proof.status {
                    case .confirmed: statusStr = "Confirmed"
                    case .failed:    statusStr = "Failed"
                    case .unknown:   statusStr = "Unknown"
                    }
                    onMeshEvent?("PROOF_SENT:\(statusStr):\(proof.slot)")
                }
            } catch {
                onMeshEvent?("RPC_FAIL")
                if json.ttl > 0 {
                    let forwarded = VerificationRequest(
                        txSignature: json.txSignature,
                        commitment:  json.commitment,
                        ttl:         json.ttl - 1,
                        requestId:   json.requestId
                    )
                    if let fwdData = try? JSONEncoder().encode(forwarded) {
                        transport.sendRequest(fwdData)
                        externalRequestSender?(fwdData)
                        onMeshEvent?("FORWARDING:\(json.ttl - 1)")
                    }
                }
            }
        }
    }

    private func handleIncomingProof(_ data: Data) {
        guard let proof = try? JSONDecoder().decode(VerificationProof.self, from: data),
              verifyProof(proof)
        else { return }
        let (added, count): (Bool, Int) = routerLock.withLock {
            let txKey = String(_currentTxSig.prefix(64))
            guard !txKey.isEmpty, proof.txSignature == txKey else { return (false, 0) }
            guard _seenVerifierKeys.insert(proof.verifierPublicKey).inserted else { return (false, 0) }
            _collectedProofs.append(proof)
            return (true, _collectedProofs.count)
        }
        if added {
            let pubKey = proof.verifierPublicKey.map { String(format: "%02x", $0) }.joined()
            onMeshEvent?("PROOF_RECV:\(count):\(pubKey)")
            transport.sendProof(data)
            externalProofSender?(data)
        }
    }

    private func sendRequest(txSignature: String, commitment: String, ttl: Int, requestId: String? = nil) {
        let req = VerificationRequest(txSignature: txSignature, commitment: commitment, ttl: ttl, requestId: requestId)
        guard let data = try? JSONEncoder().encode(req) else { return }
        transport.sendRequest(data)
    }
}
