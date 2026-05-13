import CoreBluetooth
import Foundation

/// Scans for Fernlink peripherals, connects, and subscribes to PROOF notifications.
/// Mirrors GattClientManager.kt on Android.
final class FernlinkCentralManager: NSObject {

    var onProof: ((Data) -> Void)?

    private var manager:      CBCentralManager!
    private var peripherals:  [UUID: CBPeripheral]                = [:]
    private var requestChars: [UUID: CBCharacteristic]            = [:]
    private var reassemblers: [UUID: BleFragmentation.Reassembler] = [:]
    private let proofStore:   ProofStore
    private let queue = DispatchQueue(label: "xyz.fernlink.central")

    var connectedPeerCount: Int { peripherals.count }

    init(proofStore: ProofStore) {
        self.proofStore = proofStore
        super.init()
        manager = CBCentralManager(delegate: self, queue: queue)
    }

    func startScanning() {
        guard manager.state == .poweredOn else { return }
        manager.scanForPeripherals(withServices: [BleUuids.fernlinkService], options: nil)
    }

    func stop() {
        manager.stopScan()
        peripherals.values.forEach { manager.cancelPeripheralConnection($0) }
        peripherals.removeAll()
        requestChars.removeAll()
        reassemblers.removeAll()
    }

    /// Write a fragmented request to all connected peers.
    func sendRequest(_ data: Data) {
        let frags = BleFragmentation.fragment(encodeWirePayload(data))
        for (id, char) in requestChars {
            guard let peripheral = peripherals[id] else { continue }
            for frag in frags {
                peripheral.writeValue(frag, for: char, type: .withoutResponse)
            }
        }
    }

    /// Connect directly to a peripheral discovered via NFC bootstrap, skipping scan.
    func connectDirect(_ peripheral: CBPeripheral) {
        guard peripherals[peripheral.identifier] == nil else { return }
        peripherals[peripheral.identifier] = peripheral
        peripheral.delegate = self
        manager.connect(peripheral, options: nil)
    }

    private func drainStoreTo(_ peripheral: CBPeripheral, requestChar: CBCharacteristic) {
        let pending = proofStore.drain()
        guard !pending.isEmpty else { return }
        for req in pending {
            guard let data = try? JSONEncoder().encode(VerificationRequest(
                txSignature: req.txSignature,
                commitment:  req.commitment,
                ttl:         req.ttl,
                requestId:   nil
            )) else { continue }
            BleFragmentation.fragment(encodeWirePayload(data)).forEach {
                peripheral.writeValue($0, for: requestChar, type: .withoutResponse)
            }
        }
    }
}

extension FernlinkCentralManager: CBCentralManagerDelegate {

    func centralManagerDidUpdateState(_ central: CBCentralManager) {
        if central.state == .poweredOn { startScanning() }
    }

    func centralManager(_ central: CBCentralManager,
                        didDiscover peripheral: CBPeripheral,
                        advertisementData: [String: Any],
                        rssi RSSI: NSNumber) {
        guard peripherals[peripheral.identifier] == nil else { return }
        peripherals[peripheral.identifier] = peripheral
        peripheral.delegate = self
        manager.connect(peripheral, options: nil)
    }

    func centralManager(_ central: CBCentralManager, didConnect peripheral: CBPeripheral) {
        peripheral.discoverServices([BleUuids.fernlinkService])
    }

    func centralManager(_ central: CBCentralManager,
                        didDisconnectPeripheral peripheral: CBPeripheral, error: Error?) {
        peripherals.removeValue(forKey: peripheral.identifier)
        requestChars.removeValue(forKey: peripheral.identifier)
        reassemblers.removeValue(forKey: peripheral.identifier)
    }
}

extension FernlinkCentralManager: CBPeripheralDelegate {

    func peripheral(_ peripheral: CBPeripheral, didDiscoverServices error: Error?) {
        guard let service = peripheral.services?.first(where: { $0.uuid == BleUuids.fernlinkService })
        else { return }
        peripheral.discoverCharacteristics([BleUuids.charRequest, BleUuids.charProof], for: service)
    }

    func peripheral(_ peripheral: CBPeripheral,
                    didDiscoverCharacteristicsFor service: CBService, error: Error?) {
        guard let chars = service.characteristics else { return }
        var reqChar: CBCharacteristic?
        for char in chars {
            if char.uuid == BleUuids.charProof {
                peripheral.setNotifyValue(true, for: char)
            }
            if char.uuid == BleUuids.charRequest { reqChar = char }
        }
        if let reqChar {
            requestChars[peripheral.identifier] = reqChar
            reassemblers[peripheral.identifier] = BleFragmentation.Reassembler()
            drainStoreTo(peripheral, requestChar: reqChar)
        }
    }

    func peripheral(_ peripheral: CBPeripheral,
                    didUpdateValueFor characteristic: CBCharacteristic, error: Error?) {
        guard characteristic.uuid == BleUuids.charProof,
              let value = characteristic.value,
              let reassembler = reassemblers[peripheral.identifier]
        else { return }

        if let complete = reassembler.feed(value) {
            onProof?(decodeWirePayload(complete))
        }
    }
}
