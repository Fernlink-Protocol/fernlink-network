import CryptoKit
import Foundation

/// Ed25519 keypair backed by CryptoKit.
/// Wire format is identical to ed25519-dalek (RFC 8032), so proofs are
/// interoperable with the Rust core and tweetnacl TypeScript layer.
struct FernlinkKeypair {
    let privateKey: Curve25519.Signing.PrivateKey

    init() { privateKey = Curve25519.Signing.PrivateKey() }

    init(seed: Data) throws {
        privateKey = try Curve25519.Signing.PrivateKey(rawRepresentation: seed)
    }

    var publicKeyBytes: Data { privateKey.publicKey.rawRepresentation }

    /// Build and sign a VerificationProof.
    ///
    /// Signable bytes layout (must stay in sync with Rust core and TypeScript SDK):
    ///   UTF-8(txSignature) | statusByte(u8) | slot(u64 LE) | blockTime(u64 LE)
    ///   | errorCode(u16 LE) | verifierPublicKey(32 bytes)
    func signProof(
        txSignature: String,
        status:      TxStatus,
        slot:        UInt64,
        blockTime:   UInt64,
        errorCode:   UInt16
    ) throws -> VerificationProof {
        let pubKey = publicKeyBytes
        let signable = buildSignableBytes(
            txSignature: txSignature,
            status:      status.rawValue,
            slot:        slot,
            blockTime:   blockTime,
            errorCode:   errorCode,
            pubKey:      pubKey
        )
        let sig = try privateKey.signature(for: signable)
        return VerificationProof(
            txSignature:       txSignature,
            status:            status,
            slot:              slot,
            blockTime:         blockTime,
            errorCode:         errorCode,
            verifierPublicKey: pubKey,
            signature:         sig
        )
    }
}

/// Verify the Ed25519 signature on a proof.
func verifyProof(_ proof: VerificationProof) -> Bool {
    guard let key = try? Curve25519.Signing.PublicKey(rawRepresentation: proof.verifierPublicKey)
    else { return false }
    let signable = buildSignableBytes(
        txSignature: proof.txSignature,
        status:      proof.status.rawValue,
        slot:        proof.slot,
        blockTime:   proof.blockTime,
        errorCode:   proof.errorCode,
        pubKey:      proof.verifierPublicKey
    )
    return key.isValidSignature(proof.signature, for: signable)
}

private func buildSignableBytes(
    txSignature: String,
    status:      UInt8,
    slot:        UInt64,
    blockTime:   UInt64,
    errorCode:   UInt16,
    pubKey:      Data
) -> Data {
    var d = Data()
    // Mirror the Rust FFI: store the first 64 UTF-8 bytes of txSignature, zero-padded.
    // This ensures proof signatures are cross-platform compatible with Android/Rust.
    var txPadded = [UInt8](repeating: 0, count: 64)
    let raw = Array(txSignature.utf8)
    txPadded.replaceSubrange(0..<min(raw.count, 64), with: raw[0..<min(raw.count, 64)])
    d.append(contentsOf: txPadded)
    d.append(status)
    d.append(littleEndian: slot)
    d.append(littleEndian: blockTime)
    d.append(littleEndian: errorCode)
    d.append(pubKey)
    return d
}

private extension Data {
    mutating func append<T: FixedWidthInteger>(littleEndian value: T) {
        var v = value.littleEndian
        append(Data(bytes: &v, count: MemoryLayout<T>.size))
    }
}
