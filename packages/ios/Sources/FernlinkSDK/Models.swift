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

// Codable conformance is custom (extension below) to match the Rust/Android wire format:
// snake_case field names, byte arrays as [UInt8] integer arrays, status as string.
public struct VerificationProof {
    public let txSignature:       String
    public let status:            TxStatus
    public let slot:              UInt64
    public let blockTime:         UInt64
    public let errorCode:         UInt16
    public let verifierPublicKey: Data   // 32 bytes
    public let signature:         Data   // 64-byte Ed25519 signature
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

// MARK: - VerificationProof wire format (Rust/Android compatible)

// Minimal header included in every proof so Android's Rust FFI can deserialize it.
// The header is NOT part of the cryptographic signature.
private struct WireProofHeader: Encodable {
    let version:      UInt8  = 2
    let message_type: String = "Proof"
    let message_id:   String
    let timestamp_ms: UInt64
    let ttl:          UInt8  = 8
    let compression:  String = "None"
}

extension VerificationProof: Codable {

    private enum CodingKeys: String, CodingKey {
        case header
        case txSignature    = "tx_signature"
        case status
        case slot
        case blockTime      = "block_time"
        case errorCode      = "error_code"
        case verifierPubKey = "verifier_pubkey"
        case signature
    }

    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        // header is optional — iOS proofs include it; legacy proofs may not.
        // We never use its value, so we decode and discard if present.

        // tx_signature: [u8; 64] integer array → String (trim trailing zero-padding)
        let txBytes = try c.decode([UInt8].self, forKey: .txSignature)
        let trimmed = txBytes.prefix(while: { $0 != 0 })
        txSignature = String(bytes: Array(trimmed), encoding: .utf8) ?? ""

        // status: "Confirmed" / "Failed" / "Unknown" string (Rust serde enum default)
        let statusStr = (try? c.decode(String.self, forKey: .status)) ?? ""
        switch statusStr.lowercased() {
        case "confirmed": status = .confirmed
        case "failed":    status = .failed
        default:          status = .unknown
        }

        slot      = try c.decode(UInt64.self, forKey: .slot)
        blockTime = try c.decode(UInt64.self, forKey: .blockTime)
        errorCode = try c.decode(UInt16.self, forKey: .errorCode)

        // verifier_pubkey: [u8; 32] integer array → Data
        verifierPublicKey = Data(try c.decode([UInt8].self, forKey: .verifierPubKey))

        // signature: [u8; 64] integer array → Data
        signature = Data(try c.decode([UInt8].self, forKey: .signature))
    }

    public func encode(to encoder: Encoder) throws {
        var c = encoder.container(keyedBy: CodingKeys.self)

        try c.encode(WireProofHeader(
            message_id:   UUID().uuidString.lowercased(),
            timestamp_ms: UInt64(Date().timeIntervalSince1970 * 1000)
        ), forKey: .header)

        // tx_signature: first 64 UTF-8 bytes of txSignature, zero-padded to [u8; 64]
        var txPadded = [UInt8](repeating: 0, count: 64)
        let raw = Array(txSignature.utf8)
        txPadded.replaceSubrange(0..<min(raw.count, 64), with: raw[0..<min(raw.count, 64)])
        try c.encode(txPadded, forKey: .txSignature)

        let statusStr: String
        switch status {
        case .confirmed: statusStr = "Confirmed"
        case .failed:    statusStr = "Failed"
        case .unknown:   statusStr = "Unknown"
        }
        try c.encode(statusStr, forKey: .status)

        try c.encode(slot,      forKey: .slot)
        try c.encode(blockTime, forKey: .blockTime)
        try c.encode(errorCode, forKey: .errorCode)

        // verifier_pubkey / signature: Data → [UInt8] integer arrays
        try c.encode(Array(verifierPublicKey), forKey: .verifierPubKey)
        try c.encode(Array(signature),         forKey: .signature)
    }
}
