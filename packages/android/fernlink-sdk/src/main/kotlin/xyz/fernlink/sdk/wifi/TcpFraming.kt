package xyz.fernlink.sdk.wifi

import java.io.InputStream
import java.io.OutputStream

/**
 * Simple length-prefix framing for TCP streams.
 *
 * Wire format per message: [typeTag: 1 byte][length: 4 bytes BE][payload: length bytes]
 *
 * typeTag values:
 *   TYPE_HELLO   = 0x00 — Pubkey fingerprint (16 hex chars) sent immediately on connect
 *   TYPE_REQUEST = 0x01 — VerificationRequest JSON
 *   TYPE_PROOF   = 0x02 — VerificationProof JSON
 */
internal object TcpFraming {

    const val TYPE_HELLO:   Byte = 0x00
    const val TYPE_REQUEST: Byte = 0x01
    const val TYPE_PROOF:   Byte = 0x02

    /** Write one framed message to the output stream. Thread-safe per stream with external sync. */
    fun write(out: OutputStream, typeTag: Byte, payload: ByteArray) {
        val len = payload.size
        out.write(byteArrayOf(
            typeTag,
            (len shr 24 and 0xFF).toByte(),
            (len shr 16 and 0xFF).toByte(),
            (len shr  8 and 0xFF).toByte(),
            (len        and 0xFF).toByte(),
        ))
        out.write(payload)
        out.flush()
    }

    /**
     * Read one complete frame from the input stream. Blocks until the full
     * frame is received or throws if the stream is closed.
     *
     * Returns Pair(typeTag, payload) or null if the stream reached EOF cleanly.
     */
    fun read(input: InputStream): Pair<Byte, ByteArray>? {
        val header = ByteArray(5)
        var totalRead = 0
        while (totalRead < 5) {
            val n = input.read(header, totalRead, 5 - totalRead)
            if (n < 0) return null   // EOF
            totalRead += n
        }
        val typeTag = header[0]
        val length  = ((header[1].toInt() and 0xFF) shl 24) or
                      ((header[2].toInt() and 0xFF) shl 16) or
                      ((header[3].toInt() and 0xFF) shl  8) or
                       (header[4].toInt() and 0xFF)
        if (length <= 0 || length > 1_048_576) return null   // sanity cap 1 MB

        val payload = ByteArray(length)
        var read = 0
        while (read < length) {
            val n = input.read(payload, read, length - read)
            if (n < 0) return null
            read += n
        }
        return Pair(typeTag, payload)
    }
}
