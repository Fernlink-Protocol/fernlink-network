package xyz.fernlink.sdk.ble

import java.util.UUID

object BleUuids {
    val FERNLINK_SERVICE:   UUID = UUID.fromString("fe4e0000-0000-1000-8000-00805f9b34fb")
    val CHAR_REQUEST:       UUID = UUID.fromString("fe4e0001-0000-1000-8000-00805f9b34fb")
    val CHAR_PROOF:         UUID = UUID.fromString("fe4e0002-0000-1000-8000-00805f9b34fb")
    val CHAR_STATUS:        UUID = UUID.fromString("fe4e0003-0000-1000-8000-00805f9b34fb")
    val DESCRIPTOR_CCC:     UUID = UUID.fromString("00002902-0000-1000-8000-00805f9b34fb")

    const val MTU_REQUEST     = 185     // conservative start; Android negotiates down if needed
    const val MTU             = 512     // kept so BleFragmentation still uses max-size chunks
    // Used in the BLE scan response to advertise a stable 8-byte pubkey fingerprint.
    // Devices use this to recognise a peer across MAC address rotations.
    const val MANUFACTURER_ID = 0xFE4E
}
