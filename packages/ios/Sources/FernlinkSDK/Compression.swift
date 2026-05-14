import Compression
import Foundation

/// Wire compression codec values — must stay in sync with CompressionCodec in
/// fernlink-core (Rust) and CompressionCodec in fernlink-sdk (TypeScript).
public enum FernlinkCodec: UInt8, Codable {
    case none = 0x00
    case lz4  = 0x01
    case zstd = 0x02
}

/// Codecs this runtime can both compress and decompress.
public let supportedCodecs: [FernlinkCodec] = [.none, .lz4, .zstd]

/// Negotiate the best codec shared between local preference and peer capabilities.
public func negotiateCodec(preferred: FernlinkCodec, peerCodecs: [FernlinkCodec]) -> FernlinkCodec {
    if peerCodecs.contains(preferred) { return preferred }
    for codec in supportedCodecs where peerCodecs.contains(codec) { return codec }
    return .none
}

public func compress(_ data: Data, codec: FernlinkCodec) -> Data {
    switch codec {
    case .none: return data
    case .lz4:  return blockCompress(data, algorithm: COMPRESSION_LZ4)   ?? data
    case .zstd: return blockCompress(data, algorithm: COMPRESSION_LZFSE) ?? data
    // Apple's Compression framework does not expose zstd directly.
    // LZFSE is Apple's own algorithm with comparable ratio and better speed
    // on Apple Silicon. The codec byte on the wire is still 0x02.
    }
}

/// Prepend codec byte and compress — mirrors encodeWirePayload in TypeScript web-peer.ts.
public func encodeWirePayload(_ data: Data, codec: FernlinkCodec = .none) -> Data {
    var out = Data([codec.rawValue])
    out.append(compress(data, codec: codec))
    return out
}

/// Strip codec byte and decompress — backwards-compatible with legacy uncompressed JSON.
public func decodeWirePayload(_ data: Data) -> Data {
    guard let firstByte = data.first else { return data }
    // Legacy: starts with '{' (0x7B) or codec byte outside 0x00–0x02 — return as-is
    guard firstByte != 0x7B, let codec = FernlinkCodec(rawValue: firstByte) else { return data }
    let body = Data(data.dropFirst())
    return decompress(body, codec: codec) ?? body
}

public func decompress(_ data: Data, codec: FernlinkCodec) -> Data? {
    switch codec {
    case .none: return data
    case .lz4:  return blockDecompress(data, algorithm: COMPRESSION_LZ4)
    case .zstd: return blockDecompress(data, algorithm: COMPRESSION_LZFSE)
    }
}

// MARK: - Internal helpers

private func blockCompress(_ src: Data, algorithm: compression_algorithm) -> Data? {
    guard !src.isEmpty else { return src }
    let srcCount    = src.count
    let dstCapacity = srcCount + 64  // capture before any mutable borrow
    var dst         = Data(count: dstCapacity)
    let written     = dst.withUnsafeMutableBytes { dstBuf -> Int in
        src.withUnsafeBytes { srcBuf -> Int in
            compression_encode_buffer(
                dstBuf.baseAddress!.assumingMemoryBound(to: UInt8.self),
                dstCapacity,
                srcBuf.baseAddress!.assumingMemoryBound(to: UInt8.self),
                srcCount,
                nil,
                algorithm
            )
        }
    }
    guard written > 0 else { return nil }
    return dst.prefix(written)
}

private func blockDecompress(_ src: Data, algorithm: compression_algorithm) -> Data? {
    guard !src.isEmpty else { return src }
    let srcCount    = src.count
    let dstCapacity = Swift.max(srcCount * 4, 1024)  // capture before any mutable borrow
    var dst         = Data(count: dstCapacity)
    let written     = dst.withUnsafeMutableBytes { dstBuf -> Int in
        src.withUnsafeBytes { srcBuf -> Int in
            compression_decode_buffer(
                dstBuf.baseAddress!.assumingMemoryBound(to: UInt8.self),
                dstCapacity,
                srcBuf.baseAddress!.assumingMemoryBound(to: UInt8.self),
                srcCount,
                nil,
                algorithm
            )
        }
    }
    guard written > 0 else { return nil }
    return dst.prefix(written)
}
