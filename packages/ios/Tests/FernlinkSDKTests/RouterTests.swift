import XCTest
@testable import FernlinkSDK

// MARK: - Mock transport

private final class MockTransport: FernlinkTransport {
    var transportType: TransportType = .ble
    var connectedPeerCount: Int = 1
    var onIncomingRequest: ((Data) -> Void)?
    var onIncomingProof:   ((Data) -> Void)?

    private(set) var sentProofs:   [Data] = []
    private(set) var sentRequests: [Data] = []

    func start() {}
    func stop()  {}
    func sendProof(_ data: Data)   { sentProofs.append(data) }
    func sendRequest(_ data: Data) { sentRequests.append(data) }

    func simulateIncomingProof(_ data: Data)   { onIncomingProof?(data) }
    func simulateIncomingRequest(_ data: Data) { onIncomingRequest?(data) }
}

// MARK: - Helpers

private func makeProofData(txSig: String, keypair: FernlinkKeypair? = nil) throws -> Data {
    let kp    = keypair ?? FernlinkKeypair()
    let proof = try kp.signProof(txSignature: txSig, status: .confirmed, slot: 1, blockTime: 0, errorCode: 0)
    return try JSONEncoder().encode(proof)
}

private func makeRouter(
    transport: MockTransport,
    peers: Int = 1,
    proofStore: ProofStore = ProofStore()
) -> TransportMessageRouter {
    transport.connectedPeerCount = peers
    let router = TransportMessageRouter(
        transport:   transport,
        keypair:     FernlinkKeypair(),
        rpcEndpoint: "https://api.mainnet-beta.solana.com",
        proofStore:  proofStore
    )
    router.start()
    return router
}

// MARK: - RouterTests

final class RouterTests: XCTestCase {

    // Proof whose txSignature doesn't match the current round is rejected.
    func testRoundTaggingRejectsStaleProof() throws {
        let transport = MockTransport()
        let router    = makeRouter(transport: transport)
        let proofData = try makeProofData(txSig: "sigA")

        router.broadcastRequest(txSignature: "sigB")
        transport.simulateIncomingProof(proofData)

        XCTAssertEqual(router.collectedProofsList().count, 0)
    }

    // Proof whose txSignature matches the active round is accepted.
    func testRoundTaggingAcceptsMatchingProof() throws {
        let transport = MockTransport()
        let router    = makeRouter(transport: transport)
        let proofData = try makeProofData(txSig: "sigMatch")

        router.broadcastRequest(txSignature: "sigMatch")
        transport.simulateIncomingProof(proofData)

        XCTAssertEqual(router.collectedProofsList().count, 1)
    }

    // The same proof arriving twice is only counted once.
    func testSeenVerifierKeysDedup() throws {
        let transport = MockTransport()
        let router    = makeRouter(transport: transport)
        let proofData = try makeProofData(txSig: "dupSig")

        router.broadcastRequest(txSignature: "dupSig")
        transport.simulateIncomingProof(proofData)
        transport.simulateIncomingProof(proofData)

        XCTAssertEqual(router.collectedProofsList().count, 1)
    }

    // Two proofs from different verifier keypairs both count.
    func testTwoDistinctVerifiersCount() throws {
        let transport = MockTransport()
        let router    = makeRouter(transport: transport)

        let p1 = try makeProofData(txSig: "multiSig")
        let p2 = try makeProofData(txSig: "multiSig")

        router.broadcastRequest(txSignature: "multiSig")
        transport.simulateIncomingProof(p1)
        transport.simulateIncomingProof(p2)

        XCTAssertEqual(router.collectedProofsList().count, 2)
    }

    // clearProofs wipes the collected list and allows a fresh round.
    func testClearProofsResetsState() throws {
        let transport = MockTransport()
        let router    = makeRouter(transport: transport)

        router.broadcastRequest(txSignature: "sig1")
        transport.simulateIncomingProof(try makeProofData(txSig: "sig1"))
        XCTAssertEqual(router.collectedProofsList().count, 1)

        router.clearProofs()
        XCTAssertEqual(router.collectedProofsList().count, 0)

        router.broadcastRequest(txSignature: "sig2")
        transport.simulateIncomingProof(try makeProofData(txSig: "sig2"))
        XCTAssertEqual(router.collectedProofsList().count, 1)
    }

    // Stale proof from a previous round cannot sneak in after clearProofs.
    func testStaleProofRejectedAfterNewRound() throws {
        let transport = MockTransport()
        let router    = makeRouter(transport: transport)
        let kp        = FernlinkKeypair()
        let stale     = try makeProofData(txSig: "round1", keypair: kp)

        router.broadcastRequest(txSignature: "round1")
        router.clearProofs()
        router.broadcastRequest(txSignature: "round2")

        // Stale proof for "round1" arrives while active round is "round2"
        transport.simulateIncomingProof(stale)

        XCTAssertEqual(router.collectedProofsList().count, 0)
    }

    // broadcastRequest with 0 peers enqueues the request and sends nothing.
    func testBroadcastQueuesWhenNoPeers() throws {
        let transport  = MockTransport()
        let store      = ProofStore()
        let router     = makeRouter(transport: transport, peers: 0, proofStore: store)

        router.broadcastRequest(txSignature: "queuedSig")

        XCTAssertFalse(store.isEmpty)
        XCTAssertEqual(transport.sentRequests.count, 0)
    }

    // injectProof deduplicates by verifier pubkey just like handleIncomingProof.
    func testInjectProofDedup() throws {
        let transport = MockTransport()
        let router    = makeRouter(transport: transport)
        let proofData = try makeProofData(txSig: "injectSig")

        router.broadcastRequest(txSignature: "injectSig")
        router.injectProof(proofData)
        router.injectProof(proofData)

        XCTAssertEqual(router.collectedProofsList().count, 1)
    }

    // Proof arriving on transport A is forwarded to router B via externalProofSender.
    func testCrossTransportBridgeForwardsProof() throws {
        let tA = MockTransport()
        let tB = MockTransport()
        let rA = makeRouter(transport: tA)
        let rB = makeRouter(transport: tB)

        rA.broadcastRequest(txSignature: "bridge")
        rB.broadcastRequest(txSignature: "bridge")

        rA.setExternalForwarders(
            requestSender: { _ in },
            proofSender:   { data in rB.injectProof(data) }
        )

        tA.simulateIncomingProof(try makeProofData(txSig: "bridge"))

        XCTAssertEqual(rA.collectedProofsList().count, 1, "Router A should collect the proof")
        XCTAssertEqual(rB.collectedProofsList().count, 1, "Router B should receive bridged proof")
    }

    // injectProof must NOT call externalProofSender — prevents bouncing between transports.
    func testInjectProofDoesNotCallExternalSender() throws {
        let transport = MockTransport()
        let router    = makeRouter(transport: transport)
        var externalCalled = false

        router.broadcastRequest(txSignature: "bounceSig")
        router.setExternalForwarders(
            requestSender: { _ in },
            proofSender:   { _ in externalCalled = true }
        )

        router.injectProof(try makeProofData(txSig: "bounceSig"))

        XCTAssertFalse(externalCalled)
    }

    // A cryptographically tampered proof is silently rejected.
    func testTamperedProofRejected() throws {
        let transport = MockTransport()
        let router    = makeRouter(transport: transport)
        let kp        = FernlinkKeypair()
        var proof     = try kp.signProof(txSignature: "tamper", status: .confirmed, slot: 1, blockTime: 0, errorCode: 0)
        proof = VerificationProof(
            txSignature: proof.txSignature, status: .failed,
            slot: proof.slot, blockTime: proof.blockTime, errorCode: proof.errorCode,
            verifierPublicKey: proof.verifierPublicKey, signature: proof.signature
        )
        router.broadcastRequest(txSignature: "tamper")
        transport.simulateIncomingProof(try JSONEncoder().encode(proof))

        XCTAssertEqual(router.collectedProofsList().count, 0)
    }
}
