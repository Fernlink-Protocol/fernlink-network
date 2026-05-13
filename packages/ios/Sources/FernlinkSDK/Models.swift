import Foundation

public enum TxStatus: UInt8, Codable {
    case confirmed = 0
    case failed    = 1
    case unknown   = 2
}

public enum Commitment: String, Codable {
    case confirmed  = "confirmed"
    case finalized  = "finalized"
    case processed  = "processed"
}

public struct VerificationProof: Codable {
    public let txSignature:      String
    public let status:           TxStatus
    public let slot:             UInt64
    public let blockTime:        UInt64
    public let errorCode:        UInt16
    public let verifierPublicKey: Data   // 32 bytes
    public let signature:        Data    // 64-byte Ed25519 signature
}

public struct ConsensusResult {
    public let settled:     Bool
    public let status:      TxStatus?
    public let slot:        UInt64?
    public let blockTime:   UInt64?
    public let proofCount:  Int
}

struct SignatureStatus {
    let status:    TxStatus
    let slot:      UInt64
    let blockTime: UInt64
}

struct VerificationRequest: Codable {
    let txSignature: String
    let commitment:  String
    let ttl:         Int
    let requestId:   String?
}
