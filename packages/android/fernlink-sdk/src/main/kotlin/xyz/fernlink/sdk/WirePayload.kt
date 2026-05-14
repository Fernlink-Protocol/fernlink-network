package xyz.fernlink.sdk

/**
 * Wire-level codec-byte encoding matching the TypeScript WebBluetoothPeer and Rust BLE layers.
 *
 * Format: [1 byte: codec (0x00–0x02)] [compressed or raw JSON bytes]
 * Backwards compat: messages starting with '{' (0x7B) are treated as legacy uncompressed JSON.
 */
internal object WirePayload {

    private const val CODEC_NONE = 0
    @Suppress("unused") private const val CODEC_LZ4 = 1

    fun encode(json: ByteArray, codec: Int = CODEC_NONE): ByteArray {
        val compressed = runCatching { FernlinkJni.compress(codec, json) }.getOrDefault(json)
        return byteArrayOf(codec.toByte()) + compressed
    }

    fun decode(data: ByteArray): ByteArray {
        if (data.isEmpty()) return data
        val first = data[0].toInt() and 0xFF
        if (first == 0x7B || first > 2) return data   // legacy '{' or unknown codec byte
        val body = data.copyOfRange(1, data.size)
        if (first == CODEC_NONE) return body
        // LZ4 (codec 0x01): try JNI (lz4_flex block, size-prepended).
        // Apple's COMPRESSION_LZ4 uses a different framing; JNI decompress will fail on it.
        // We fall back to the raw body so the caller gets a visible JSON-parse error rather
        // than a silent exception — and the peer is expected to switch to codec 0x00.
        return runCatching { FernlinkJni.decompress(first, body) }.getOrDefault(body)
    }
}
