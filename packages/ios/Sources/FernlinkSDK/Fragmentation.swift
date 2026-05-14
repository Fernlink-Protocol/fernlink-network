import Foundation

// 2-byte header [index: UInt8, total: UInt8] — identical to Android, Rust, and TypeScript layers.
enum BleFragmentation {
    static let headerSize = 2

    /// Fragment data into MTU-sized chunks.
    /// - Parameter fragmentSize: total bytes per fragment including the 2-byte header.
    ///   Defaults to BleUuids.mtu (512). Pass central.maximumUpdateValueLength for notifications.
    static func fragment(_ data: Data, fragmentSize: Int = BleUuids.mtu) -> [Data] {
        let chunkSize = max(1, fragmentSize - headerSize)
        var chunks: [Data] = []
        var offset = 0
        while offset < data.count {
            let end = min(offset + chunkSize, data.count)
            chunks.append(data[offset ..< end])
            offset = end
        }
        let total = UInt8(chunks.count)
        return chunks.enumerated().map { i, chunk in
            var frag = Data([UInt8(i), total])
            frag.append(chunk)
            return frag
        }
    }

    final class Reassembler {
        private var slots: [Data?] = []
        private var received = 0

        func feed(_ frag: Data) -> Data? {
            guard frag.count >= headerSize else { return nil }
            let index = Int(frag[0])
            let total = Int(frag[1])
            let payload = frag.dropFirst(headerSize)

            if slots.isEmpty { slots = [Data?](repeating: nil, count: total) }
            guard index < slots.count, slots[index] == nil else { return nil }

            slots[index] = Data(payload)
            received += 1

            guard received == slots.count else { return nil }
            let complete = slots.compactMap { $0 }.reduce(Data(), +)
            reset()
            return complete
        }

        func reset() { slots = []; received = 0 }
    }
}
