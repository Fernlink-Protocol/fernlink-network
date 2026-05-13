import XCTest
@testable import FernlinkSDK

final class CryptoTests: XCTestCase {

    func testSignAndVerifyRoundtrip() throws {
        let kp    = FernlinkKeypair()
        let proof = try kp.signProof(txSignature: "abc123", status: .confirmed, slot: 100, blockTime: 0, errorCode: 0)
        XCTAssertTrue(verifyProof(proof))
    }

    func testTamperedProofFails() throws {
        let kp   = FernlinkKeypair()
        var proof = try kp.signProof(txSignature: "abc123", status: .confirmed, slot: 100, blockTime: 0, errorCode: 0)
        // Tamper with status after signing
        proof = VerificationProof(
            txSignature: proof.txSignature, status: .failed,
            slot: proof.slot, blockTime: proof.blockTime,
            errorCode: proof.errorCode, verifierPublicKey: proof.verifierPublicKey,
            signature: proof.signature
        )
        XCTAssertFalse(verifyProof(proof))
    }

    func testDeterministicKeypairFromSeed() throws {
        let seed = Data(repeating: 0xAB, count: 32)
        let kp1  = try FernlinkKeypair(seed: seed)
        let kp2  = try FernlinkKeypair(seed: seed)
        XCTAssertEqual(kp1.publicKeyBytes, kp2.publicKeyBytes)
    }

    func testFragmentRoundtrip() {
        let data  = Data(repeating: 0xFF, count: 1500)
        let frags = BleFragmentation.fragment(data)
        XCTAssertEqual(frags.count, 3) // 1500 / 510 = 2 full + 1 partial

        let r = BleFragmentation.Reassembler()
        var result: Data?
        for frag in frags { result = r.feed(frag) }
        XCTAssertEqual(result, data)
    }

    // Wire format must use snake_case keys, integer arrays for byte fields, and
    // "Confirmed"/"Failed"/"Unknown" strings for status — matching the Rust/Android format.
    func testWireFormatUsesSnakeCaseAndIntegerArrays() throws {
        let kp    = FernlinkKeypair()
        let proof = try kp.signProof(txSignature: "sig123", status: .confirmed, slot: 42, blockTime: 0, errorCode: 0)
        let data  = try JSONEncoder().encode(proof)
        guard let json = try JSONSerialization.jsonObject(with: data) as? [String: Any] else {
            XCTFail("Expected JSON object"); return
        }

        // Required snake_case keys
        XCTAssertNotNil(json["tx_signature"],    "Missing tx_signature")
        XCTAssertNotNil(json["verifier_pubkey"], "Missing verifier_pubkey")
        XCTAssertNotNil(json["signature"],       "Missing signature")
        XCTAssertNotNil(json["block_time"],      "Missing block_time")
        XCTAssertNotNil(json["error_code"],      "Missing error_code")
        XCTAssertNotNil(json["header"],          "Missing header (needed for Android Rust FFI)")

        // camelCase keys must NOT appear
        XCTAssertNil(json["txSignature"],       "camelCase txSignature must not be present")
        XCTAssertNil(json["verifierPublicKey"], "camelCase verifierPublicKey must not be present")
        XCTAssertNil(json["blockTime"],         "camelCase blockTime must not be present")

        // Byte fields must be integer arrays
        XCTAssertTrue(json["tx_signature"]    is [Any], "tx_signature must be an array")
        XCTAssertTrue(json["verifier_pubkey"] is [Any], "verifier_pubkey must be an array")
        XCTAssertTrue(json["signature"]       is [Any], "signature must be an array")

        // tx_signature is exactly 64 bytes (zero-padded)
        XCTAssertEqual((json["tx_signature"] as? [Any])?.count, 64)

        // status is the Rust enum variant name string
        XCTAssertEqual(json["status"] as? String, "Confirmed")
    }

    // Encode → decode roundtrip preserves all fields and the signature remains valid.
    func testWireFormatRoundtrip() throws {
        let kp    = FernlinkKeypair()
        let proof = try kp.signProof(txSignature: "roundtripSig", status: .confirmed, slot: 99, blockTime: 42, errorCode: 7)
        let data    = try JSONEncoder().encode(proof)
        let decoded = try JSONDecoder().decode(VerificationProof.self, from: data)

        XCTAssertEqual(decoded.txSignature,       proof.txSignature)
        XCTAssertEqual(decoded.status,            proof.status)
        XCTAssertEqual(decoded.slot,              proof.slot)
        XCTAssertEqual(decoded.blockTime,         proof.blockTime)
        XCTAssertEqual(decoded.errorCode,         proof.errorCode)
        XCTAssertEqual(decoded.verifierPublicKey, proof.verifierPublicKey)
        XCTAssertEqual(decoded.signature,         proof.signature)
        XCTAssertTrue(verifyProof(decoded))
    }

    // A real Solana tx signature is ~88 chars. The wire format must truncate to 64 bytes
    // when signing, and the signature must still verify after decode.
    func testLongTxSignatureRoundtrip() throws {
        let longSig = String(repeating: "A", count: 88)  // simulates a real base58 Solana sig
        let kp      = FernlinkKeypair()
        let proof   = try kp.signProof(txSignature: longSig, status: .confirmed, slot: 1, blockTime: 0, errorCode: 0)
        let data    = try JSONEncoder().encode(proof)

        guard let json = try JSONSerialization.jsonObject(with: data) as? [String: Any],
              let arr  = json["tx_signature"] as? [Any]
        else { XCTFail("Bad JSON"); return }

        // Wire tx_signature is always 64 bytes regardless of original length
        XCTAssertEqual(arr.count, 64)

        // Decoded txSignature is the first 64 chars of the original
        let decoded = try JSONDecoder().decode(VerificationProof.self, from: data)
        XCTAssertEqual(decoded.txSignature, String(longSig.prefix(64)))
        XCTAssertTrue(verifyProof(decoded))
    }
}
