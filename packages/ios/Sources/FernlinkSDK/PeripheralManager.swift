import CoreBluetooth
import Foundation

/// Advertises the Fernlink GATT service and routes REQUEST writes to a handler.
/// Mirrors GattServerManager.kt on Android.
final class FernlinkPeripheralManager: NSObject {

    var onRequest: ((Data) -> Void)?

    private var manager: CBPeripheralManager!
    private var requestChar: CBMutableCharacteristic!
    private var proofChar:   CBMutableCharacteristic!
    private var statusChar:  CBMutableCharacteristic!
    private var subscribedCentrals: [CBCentral] = []
    private let reassembler = BleFragmentation.Reassembler()
    private let queue = DispatchQueue(label: "xyz.fernlink.peripheral")
    // Fragments waiting to be sent — drained by peripheralManagerIsReady.
    private var pendingFragments: [(frag: Data, central: CBCentral)] = []

    override init() {
        super.init()
        manager = CBPeripheralManager(delegate: self, queue: queue)
    }

    func start() {
        // Advertising starts once the manager powers on (see peripheralManagerDidUpdateState).
    }

    func stop() {
        manager.stopAdvertising()
        manager.removeAllServices()
        subscribedCentrals = []
    }

    /// Push a signed proof to all subscribed centrals.
    /// Fragments per-central using the negotiated ATT MTU, and queues unsent
    /// fragments for delivery via peripheralManagerIsReady(toUpdateSubscribers:).
    func sendProof(_ data: Data) {
        let encoded = encodeWirePayload(data)
        for central in subscribedCentrals {
            // maximumUpdateValueLength is the negotiated ATT payload size (MTU - 3 overhead).
            // Use it as the total fragment size (header + chunk) so no fragment exceeds what
            // the central can receive — Android typically negotiates 182 bytes here.
            let fragSize = max(3, central.maximumUpdateValueLength)
            let frags = BleFragmentation.fragment(encoded, fragmentSize: fragSize)
            pendingFragments.append(contentsOf: frags.map { (frag: $0, central: central) })
        }
        drainPendingFragments()
    }

    private func drainPendingFragments() {
        while !pendingFragments.isEmpty {
            let entry = pendingFragments[0]
            if manager.updateValue(entry.frag, for: proofChar, onSubscribedCentrals: [entry.central]) {
                pendingFragments.removeFirst()
            } else {
                // Queue full — peripheralManagerIsReady will resume delivery.
                return
            }
        }
    }

    private func setupServices() {
        requestChar = CBMutableCharacteristic(
            type:       BleUuids.charRequest,
            properties: [.write, .writeWithoutResponse],
            value:      nil,
            permissions: .writeable
        )
        proofChar = CBMutableCharacteristic(
            type:       BleUuids.charProof,
            properties: .notify,
            value:      nil,
            permissions: .readable
        )
        statusChar = CBMutableCharacteristic(
            type:        BleUuids.charStatus,
            properties:  .read,
            value:       #"{"version":2,"commitment":["confirmed","finalized"],"compression":["lz4","zstd"]}"#.data(using: .utf8),
            permissions: .readable
        )
        let service = CBMutableService(type: BleUuids.fernlinkService, primary: true)
        service.characteristics = [requestChar, proofChar, statusChar]
        manager.add(service)
    }
}

extension FernlinkPeripheralManager: CBPeripheralManagerDelegate {

    func peripheralManagerDidUpdateState(_ peripheral: CBPeripheralManager) {
        guard peripheral.state == .poweredOn else { return }
        setupServices()
    }

    func peripheralManager(_ peripheral: CBPeripheralManager, didAdd service: CBService, error: Error?) {
        guard error == nil else { return }
        manager.startAdvertising([
            CBAdvertisementDataServiceUUIDsKey: [BleUuids.fernlinkService],
            CBAdvertisementDataLocalNameKey:    "Fernlink Node",
        ])
    }

    func peripheralManager(_ peripheral: CBPeripheralManager,
                           didReceiveWrite requests: [CBATTRequest]) {
        for req in requests where req.characteristic.uuid == BleUuids.charRequest {
            guard let value = req.value else { continue }
            if let complete = reassembler.feed(value) {
                onRequest?(decodeWirePayload(complete))
                reassembler.reset()
            }
            if req.characteristic.properties.contains(.write) {
                peripheral.respond(to: req, withResult: .success)
            }
        }
    }

    func peripheralManager(_ peripheral: CBPeripheralManager,
                           central: CBCentral,
                           didSubscribeTo characteristic: CBCharacteristic) {
        if characteristic.uuid == BleUuids.charProof {
            subscribedCentrals.append(central)
        }
    }

    func peripheralManager(_ peripheral: CBPeripheralManager,
                           central: CBCentral,
                           didUnsubscribeFrom characteristic: CBCharacteristic) {
        subscribedCentrals.removeAll { $0 == central }
        pendingFragments.removeAll { $0.central == central }
    }

    func peripheralManagerIsReady(toUpdateSubscribers peripheral: CBPeripheralManager) {
        drainPendingFragments()
    }
}
