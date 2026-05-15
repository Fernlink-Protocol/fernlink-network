import { Link } from "react-router-dom";
import { GITHUB } from "@/lib/constants";

function H2({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="font-mono font-semibold text-2xl text-[#22C55E] mt-14 mb-4 data-glow">
      {children}
    </h2>
  );
}

function H3({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="font-mono font-semibold text-lg text-[#22C55E] mt-8 mb-3">
      {children}
    </h3>
  );
}

function P({ children }: { children: React.ReactNode }) {
  return (
    <p className="font-mono text-sm text-[#166534] leading-relaxed mb-4">
      {children}
    </p>
  );
}

function Highlight({ children }: { children: React.ReactNode }) {
  return <span className="text-[#22C55E]">{children}</span>;
}

function Mono({ children }: { children: React.ReactNode }) {
  return (
    <code className="font-mono text-[#22C55E] text-[0.8em] bg-[#22C55E]/5 border border-[#064e3b] px-1.5 py-0.5">
      {children}
    </code>
  );
}

function Bullet({ children }: { children: React.ReactNode }) {
  return (
    <li className="font-mono text-sm text-[#166534] flex items-start gap-2 mb-2">
      <span className="text-[#22C55E] shrink-0 mt-0.5">&gt;</span>
      <span>{children}</span>
    </li>
  );
}

function CalloutBlock({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="bg-black border border-[#064e3b] p-5 terminal-border my-6">
      <div className="font-mono text-[10px] text-[#22C55E] uppercase tracking-widest mb-3">{label}</div>
      <div className="font-mono text-sm text-[#166534] leading-relaxed">{children}</div>
    </div>
  );
}

function CodeBlock({ children }: { children: React.ReactNode }) {
  return (
    <pre className="bg-black border border-[#064e3b] px-5 py-4 font-mono text-sm text-[#22C55E] overflow-x-auto leading-relaxed my-5 whitespace-pre-wrap">
      {children}
    </pre>
  );
}

export default function MultiTransport() {
  return (
    <div className="pt-24 pb-20 px-6 max-w-[860px] mx-auto">

      {/* Breadcrumb */}
      <div className="font-mono text-[10px] text-[#166534] uppercase tracking-widest mb-8 flex items-center gap-2">
        <Link to="/blog" className="hover:text-[#22C55E] transition-colors">BLOG</Link>
        <span>/</span>
        <span className="text-[#22C55E]">MULTI-TRANSPORT FERNLINK</span>
      </div>

      {/* Header */}
      <section className="pb-10 border-b border-[#064e3b]">
        <div className="font-mono text-[#22C55E] text-sm uppercase tracking-widest mb-4">
          $ cat ./blog/02_multi_transport.md
        </div>
        <h1 className="font-mono font-bold text-3xl sm:text-4xl text-[#22C55E] mb-5 data-glow leading-tight">
          Multi-Transport Fernlink: BLE, WiFi/TCP, and NFC Working Together
        </h1>
        <div className="flex flex-wrap items-center gap-4 font-mono text-[10px] uppercase tracking-widest text-[#166534]">
          <span>2026-05-15</span>
          <span className="border border-[#064e3b] px-2 py-0.5 text-[#22C55E]">ARCHITECTURE</span>
          <span className="border border-[#064e3b] px-2 py-0.5">ANDROID</span>
          <span className="border border-[#064e3b] px-2 py-0.5">IOS</span>
        </div>
      </section>

      {/* Body */}
      <article className="py-10">

        <P>
          The first version of Fernlink shipped with BLE only. That was the right call
          for an early protocol: one transport, one set of failure modes, something you
          can reason about completely. But BLE has a ceiling. A proof payload is roughly
          200 bytes, a BLE MTU is 185 bytes in practice, and you're fragmenting across
          an ATT layer that does not guarantee ordering unless you enforce it yourself.
          Once you need to move actual data quickly between nearby Apple devices, or you
          need to pair two devices in under 200ms without waiting for a scan cycle,
          BLE alone is not the answer.
        </P>
        <P>
          So we added WiFi Direct on Android, Multipeer Connectivity on iOS, and NFC
          bootstrapping on both. Each transport solves a different part of the problem.
          None of them replaces the others. And wiring them together under a single
          coherent API without leaking transport-specific state upward took considerably
          more thought than any individual transport did on its own.
        </P>
        <P>
          This post is a detailed walkthrough of how each transport works at the
          implementation level, what surprised us, and how the cross-transport bridge
          connects them.
        </P>

        <H2>// THE_TRANSPORT_TRILEMMA</H2>
        <P>
          Every wireless transport is a tradeoff across three dimensions: range,
          throughput, and connection latency. BLE wins on power and ubiquity but loses on
          throughput. WiFi Direct wins on throughput but takes several seconds to form
          a group. NFC has essentially zero connection latency but zero range beyond a
          few centimeters. The insight that unlocked the architecture was realizing these
          are not competing options. They are sequential phases of a session.
        </P>

        <div className="bg-black border border-[#064e3b] p-6 terminal-border my-6 space-y-5">
          {[
            ["NFC", "Tap to exchange credentials in under 200ms. No scan cycle, no discovery timeout, no pairing UX. Pure bootstrap: the only thing NFC carries is a public key and a BLE MAC address."],
            ["BLE", "Universal baseline transport. Works across Android, iOS, Linux, and macOS. Lower throughput, higher latency, battery-conscious. The right choice when you need to reach a peer across any platform combination."],
            ["WiFi Direct / MCF", "High-throughput peer channel once you know who you're talking to. Android uses WiFi Direct; iOS uses Multipeer Connectivity. Both achieve peer-to-peer WiFi automatically when available. Orders of magnitude faster than BLE for anything beyond a few kilobytes."],
          ].map(([label, desc]) => (
            <div key={label} className="flex gap-4">
              <span className="font-mono text-[#22C55E] text-xs uppercase tracking-widest shrink-0 pt-0.5 w-28">{label}</span>
              <p className="font-mono text-sm text-[#166534] leading-relaxed">{desc}</p>
            </div>
          ))}
        </div>

        <P>
          At runtime, all three are active simultaneously. The <Highlight>TransportManager</Highlight> on
          Android binds both <Highlight>FernlinkBleService</Highlight> and <Highlight>FernlinkWifiService</Highlight> as
          foreground services, attaches them to the <Highlight>FernlinkClient</Highlight>, and routes events
          through a shared coroutine scope. On iOS, a <Highlight>TransportManager</Highlight> calls
          into <Highlight>client.startMesh()</Highlight> for BLE and <Highlight>client.attachMultipeerTransport()</Highlight> for
          MCF, then exposes a single <Highlight>verifyTransaction()</Highlight> surface. Neither caller needs
          to know which transport carries a given proof.
        </P>

        <H2>// BLE: MORE_DANGEROUS_THAN_IT_LOOKS</H2>
        <P>
          BLE feels approachable until you go below the characteristic read/write
          abstraction. The ATT protocol is asynchronous, stateful, and not particularly
          forgiving of incorrect sequencing. We hit three distinct failure modes before
          the BLE layer was reliable enough to ship.
        </P>

        <H3>// MTU negotiation and the silent-drop ceiling</H3>
        <P>
          A Fernlink proof is about 200 bytes. A BLE ATT payload is MTU minus 3 bytes
          for the opcode and handle. The question is: which MTU?
        </P>
        <P>
          Android requests 185 bytes, which gives 182 bytes of ATT payload. Modern
          hardware can negotiate higher: a Pixel 9 running Android 15 will happily
          negotiate 517 bytes, giving you 514 bytes of payload per fragment. We tried
          using the negotiated value. Fragments started disappearing.
        </P>
        <P>
          The problem is not the ATT layer itself. The problem is the BLE controller
          firmware on the receiving side. Several controllers, including some on popular
          mid-range Android devices, have undocumented limits on back-to-back notification
          payloads. When fragments arrive faster than the firmware can buffer them, it
          drops them silently. No error, no callback, just data loss.
        </P>
        <P>
          The fix is to cap fragment size at 185 bytes even when the system negotiates
          higher, and to serialize delivery so we wait for an ATT-level confirmation
          before sending the next fragment. We cap explicitly in <Mono>GattServerManager</Mono>:
        </P>
        <CodeBlock>{`val mtu = minOf(deviceMtu[device.address] ?: BleUuids.MTU_REQUEST, BleUuids.MTU_REQUEST)
val attPayload = mtu - 3
val fragments = BleFragmentation.fragment(encoded, attPayload)`}</CodeBlock>
        <P>
          Capping at our conservative constant keeps fragments small and reliable across
          the full hardware population. The negotiated MTU still matters for other
          reasons (notably the write path on the client side), but for outbound
          notifications we do not trust it blindly.
        </P>

        <H3>// INDICATE vs NOTIFY: the ATT guarantee that matters</H3>
        <P>
          GATT gives you two ways to push data to a subscribed central:
          NOTIFY and INDICATE. The difference is one line in the GATT characteristic
          properties bitmask and one very important behavioral difference in the
          ATT protocol.
        </P>
        <P>
          NOTIFY is fire-and-forget at the ATT layer. The server sends an
          ATT_HANDLE_VALUE_NOTIFICATION PDU and moves on. INDICATE sends an
          ATT_HANDLE_VALUE_INDICATION and waits for an ATT_HANDLE_VALUE_CONFIRM from
          the client before the ATT layer considers the transaction complete. That
          confirmation is what triggers <Mono>onNotificationSent</Mono> on the Android server side.
        </P>
        <P>
          Our PROOF characteristic uses INDICATE. When the server calls
          <Mono>notifyCharacteristicChanged</Mono> with <Mono>confirm=true</Mono>,
          it blocks at the ATT layer until the central confirms receipt. On the sender side,
          we park a <Mono>CompletableDeferred{"<Unit>"}</Mono> before each fragment write and
          complete it inside <Mono>onNotificationSent</Mono>:
        </P>
        <CodeBlock>{`for (frag in fragments) {
    val ack = CompletableDeferred<Unit>()
    notifyTargetAddress = device.address
    notifyAck = ack
    notifyCompat(server, device, proofChar, frag)
    val sent = withTimeoutOrNull(2_000) { ack.await() }
    if (sent == null) { stale = true; break }
}`}</CodeBlock>
        <P>
          The 2-second timeout is not arbitrary. It exists because iOS rotates its BLE
          MAC address roughly every 15 minutes. When iOS rotates, the old address
          becomes a ghost: it still appears in <Mono>subscribedDevices</Mono> but
          <Mono>onNotificationSent</Mono> will never fire for it again. Without the timeout,
          the server hangs indefinitely trying to notify a subscriber that no longer
          exists. With it, the ghost is detected and evicted after one failed fragment.
        </P>

        <H3>// MAC rotation and pubkey fingerprinting</H3>
        <P>
          iOS BLE address rotation is the source of more subtle bugs than any other
          BLE issue we debugged. The platform rotates the MAC address of each peripheral
          on a timer to prevent tracking. From the central's perspective, a device it
          was connected to simply vanishes and a new, unrelated-looking device appears.
        </P>
        <P>
          Our solution is to embed an 8-byte pubkey fingerprint in the BLE scan
          response as manufacturer-specific data. The primary advertisement packet
          is only 31 bytes, and we use all of that for the service UUID. The scan
          response is a second 31-byte packet delivered by active scanning, and it is
          where we put the fingerprint:
        </P>
        <CodeBlock>{`val fingerprint = pubKey.sliceArray(0 until minOf(8, pubKey.size))
val scanResponse = AdvertiseData.Builder()
    .addManufacturerData(BleUuids.MANUFACTURER_ID, fingerprint)
    .setIncludeDeviceName(false)
    .build()
advertiser?.startAdvertising(settings, data, scanResponse, advertiseCallback)`}</CodeBlock>
        <P>
          On the client side, the scan callback extracts the fingerprint and checks
          it against <Mono>connectedFingerprints</Mono> before calling
          <Mono>connectGatt</Mono>. This prevents reconnecting to a peer we are already
          connected to under its old MAC address. We reserve the fingerprint slot
          immediately on first contact, before the full connect sequence (which takes
          2 to 4 seconds), so any rotated-MAC scan results for the same device are
          skipped during that window.
        </P>
        <P>
          When a peer disconnects, we hold the fingerprint reservation for 10 seconds
          before clearing it. Without that delay, each failed connection attempt
          removes the reservation instantly, the scan callback sees the device again
          within milliseconds, and we exhaust the Android BLE stack's GATT interface
          pool inside a minute.
        </P>

        <H3>// Android 13 and the API split</H3>
        <P>
          Android 13 deprecated the variant of <Mono>onCharacteristicChanged</Mono> that
          reads the value from <Mono>characteristic.value</Mono> and added a new override
          that receives the value as a direct parameter. Both overrides are required in
          the same class: the old one for pre-13, the new one for 13 and above.
          If you implement only the new override, pre-13 devices never deliver notifications.
          If you implement only the old one, API 33+ devices pass a stale or null byte
          array. We implement both and route to the same handler:
        </P>
        <CodeBlock>{`// Android < 13
override fun onCharacteristicChanged(
    gatt: BluetoothGatt,
    characteristic: BluetoothGattCharacteristic,
) {
    handleProofFragment(gatt, characteristic.uuid, characteristic.value ?: return)
}

// Android 13+
override fun onCharacteristicChanged(
    gatt: BluetoothGatt,
    characteristic: BluetoothGattCharacteristic,
    value: ByteArray,
) {
    handleProofFragment(gatt, characteristic.uuid, value)
}`}</CodeBlock>

        <H3>// Fragmentation: two bytes that hold everything together</H3>
        <P>
          The fragmentation scheme is a 2-byte header prepended to each MTU-sized
          chunk: index (0-based) and total count, each a single unsigned byte. That
          limits payloads to 255 fragments, which at 182 bytes of body per fragment
          gives a maximum payload of about 46KB. In practice, Fernlink proofs top
          out around 300 bytes and requests around 200 bytes, so this is a practical
          ceiling we do not approach.
        </P>
        <P>
          The same scheme is implemented identically in Kotlin, Swift, TypeScript, and
          Rust. The reassembler is a simple slot map: each fragment fills its index
          slot, and when all slots are filled the payload is concatenated in order
          and emitted. The scheme is deliberately order-independent. You can receive
          fragments 2, 0, 1 and still reassemble correctly, which matters because
          WRITE_WITHOUT_RESPONSE on iOS does not guarantee delivery order.
        </P>

        <H2>// WIFI_DIRECT: DETERMINISM_IS_NOT_OPTIONAL</H2>
        <P>
          WiFi Direct is Android's peer-to-peer WiFi API. When two devices form a
          WiFi Direct group, one of them becomes the Group Owner, which runs the
          access point. The other connects to it. The GO runs the IP server; the
          client connects to the GO's IP. Once the link is up, both sides can send
          and receive freely over TCP.
        </P>
        <P>
          The framework lets you influence GO election via a
          <Mono>groupOwnerIntent</Mono> value from 0 to 15. What the framework does not
          tell you is what happens when both devices set intent 0 simultaneously.
          The answer is non-deterministic: whichever device's
          <Mono>WIFI_P2P_CONNECTION_CHANGED_ACTION</Mono> broadcast fires first
          wins the GO role. In our early testing, we occasionally formed groups where
          both devices were waiting for the other to start a TCP server, and neither
          did.
        </P>
        <P>
          The fix is to use the public keys as a tie-breaker. Each device includes
          its public key in the WiFi Direct DNS-SD TXT record. When a device discovers
          a peer, it compares its own public key to the peer's. The lexicographically
          lower public key always becomes the client and the higher becomes the Group
          Owner. This is deterministic regardless of which device discovered the other
          first:
        </P>
        <CodeBlock>{`private fun onServiceDiscovered(device: WifiP2pDevice, peerPubKey: String) {
    if (localPubKey < peerPubKey) {
        val config = WifiP2pConfig().apply {
            deviceAddress  = device.deviceAddress
            groupOwnerIntent = 0   // prefer to be client
        }
        wifiP2pManager.connect(p2pChannel, config, null)
    }
    // else: wait — the other device will connect to us
}`}</CodeBlock>
        <P>
          The same rule is applied identically on iOS Multipeer Connectivity. The lower
          pubkey sends the MCSession invitation; the higher pubkey waits to receive it.
          Cross-platform determinism: two devices that have never spoken agree on who
          calls whom without any negotiation round-trip.
        </P>

        <H3>// Stale groups and why you must evict them</H3>
        <P>
          WiFi Direct groups persist across app restarts on Android. If your app crashes
          or the device restarted recently, there is a non-zero probability that the
          WiFi Direct stack thinks it is still the Group Owner of a group that no longer
          exists. In that state, <Mono>discoverServices()</Mono> never finds peers because
          the stack is already "connected" to a phantom group. The service discovery
          never fires. Nothing works.
        </P>
        <P>
          Before starting discovery we call <Mono>requestGroupInfo</Mono> and, if a group
          exists, call <Mono>removeGroup</Mono> before proceeding. This adds about 300ms
          on cold start. It prevents the failure mode completely.
        </P>

        <H3>// TCP framing: one byte of type</H3>
        <P>
          Once the TCP connection is live, framing is minimal: a 1-byte type tag
          followed by a 4-byte big-endian length prefix followed by the payload. Three
          type tags cover everything: REQUEST (0x01), PROOF (0x02), and HELLO (0x03).
          The HELLO frame is sent immediately after TCP connection establishment and
          carries the first 16 bytes of the local public key as a printable identifier.
          It populates the <Mono>socketToFp</Mono> map that tracks which TCP socket
          belongs to which cryptographic identity.
        </P>

        <H2>// MULTIPEER_CONNECTIVITY: APPLES_SOLVE_THEIR_OWN_PROBLEM</H2>
        <P>
          Apple's Multipeer Connectivity Framework does something we spent weeks
          implementing manually on Android: it automatically selects the best available
          radio for each peer link. When two iPhones are on the same local network,
          MCF uses infrastructure WiFi. When they are not, it falls back to peer-to-peer
          WiFi and then to Bluetooth. The application code does not change.
        </P>
        <P>
          From Fernlink's perspective, MCF is a reliable ordered byte stream with no
          fragmentation required. We use <Mono>MCSession.send(_:toPeers:with:)</Mono> with
          <Mono>.reliable</Mono> delivery, which gives TCP-like semantics. The wire format
          is the same 1-byte type tag plus 4-byte length used by the Android WiFi Direct
          TCP layer. The BLE fragmentation layer is not involved.
        </P>
        <P>
          The one catch is that MCF only works between Apple devices. Android peers must
          use BLE. In a mixed environment, an Android device connects to an iOS peer via
          BLE, and that iOS peer relays to other iOS peers via MCF at full WiFi
          throughput. The cross-transport bridge handles that relay transparently.
        </P>
        <P>
          MCF also handles its own session negotiation, which means we do not set a
          <Mono>groupOwnerIntent</Mono> or deal with Group Owner election. But we still
          need the deterministic invitation rule, because if both sides call
          <Mono>browser.invitePeer</Mono> simultaneously they form two separate sessions.
          The same pubkey comparison applies: lower pubkey sends the invitation, higher
          pubkey accepts it.
        </P>

        <H2>// NFC_BOOTSTRAP: SUB-200MS_PAIRING</H2>
        <P>
          BLE discovery takes between 2 and 8 seconds depending on the scan interval
          and how quickly the advertising device's packet appears in the scanner's window.
          WiFi Direct service discovery adds another 3 to 5 seconds on top. For a
          point-of-sale payment scenario where two devices need to establish a mesh link
          before a transaction confirmation, that latency matters.
        </P>
        <P>
          NFC tap-to-pair solves it. The devices exchange credentials in the field
          interaction itself, before either has run a BLE or WiFi discovery cycle. The
          receiver calls <Mono>GattClientManager.connectDirect()</Mono> with the peer's
          known BLE address, bypassing the scan entirely. The connect-to-CCC sequence
          takes roughly 200ms on hardware with solid firmware.
        </P>

        <H3>// The NDEF record</H3>
        <P>
          The bootstrap payload is a JSON NDEF record with MIME type
          <Mono>application/x-fernlink-bootstrap</Mono>. It carries three fields:
        </P>
        <ul className="mb-6 space-y-1">
          <Bullet>
            <Highlight>pk</Highlight> — the peer's Ed25519 public key (hex encoded). This is the cryptographic identity used for proof verification.
          </Bullet>
          <Bullet>
            <Highlight>ble</Highlight> — the Fernlink GATT service UUID. The receiver uses this to target the correct service during connection without running a full service discovery.
          </Bullet>
          <Bullet>
            <Highlight>mac</Highlight> — the peer's current BLE MAC address. Optional: if present, the receiver calls <Mono>connectDirect</Mono> immediately. If absent, it falls back to scanning.
          </Bullet>
        </ul>
        <P>
          Keeping the payload minimal matters. NDEF records have a practical size ceiling
          around 1KB for fast transfers, but more importantly the field interaction
          duration is typically under 100ms. A compact JSON object transfers reliably
          in that window; a larger payload risks truncation on some NFC controllers.
        </P>

        <H3>// The iOS asymmetry</H3>
        <P>
          iOS devices can read NFC NDEF records using CoreNFC and an
          <Mono>NFCNDEFReaderSession</Mono>. They cannot emit NFC records, because iOS has
          no Host Card Emulation. This means the bootstrap is directional: an Android
          device (running HCE via <Mono>HostApduService</Mono>) emits the record; an iPhone
          reads it and calls <Mono>CentralManager.connectDirect()</Mono> to skip the scan.
        </P>
        <P>
          iPhone to iPhone pairing does not need NFC. MCF handles discovery
          automatically. Pair an iPhone with an Android device and NFC is the fastest
          path. Pair two iPhones and MCF finds each other without any user action.
          The right tool for each problem.
        </P>
        <P>
          One additional constraint: the CoreNFC session must be started from a direct
          user interaction. You cannot call <Mono>beginReading()</Mono> from a background
          handler or a timer callback. This is an iOS platform constraint with no
          workaround. The NFC tap is an intentional UI action, not a passive background
          event.
        </P>

        <CalloutBlock label="// NFC on iOS">
          CoreNFC requires the <Mono>NFCReaderUsageDescription</Mono> key in Info.plist and
          a matching entitlement. The entitlement gates App Store distribution; without it,
          the binary will not pass review. On simulator, <Mono>NFCNDEFReaderSession.readingAvailable</Mono> returns
          false and the reader silently no-ops, which is correct behavior for development.
        </CalloutBlock>

        <H2>// THE_GLUE: TRANSPORT_ABSTRACTION_AND_CROSS_TRANSPORT_RELAY</H2>
        <P>
          Each transport solves a connectivity problem. The harder problem is making them
          all participate in the same protocol round. A BLE request should be answerable
          by a WiFi Direct peer on the other side of the mesh. A proof arriving over
          MCF should be deduplicated against proofs that arrived over BLE ten milliseconds
          earlier.
        </P>
        <P>
          The transport abstraction on Android is a <Mono>FernlinkTransport</Mono>
          interface with two injection methods: <Mono>injectRequest(payload: ByteArray)</Mono>
          and <Mono>injectProof(payload: ByteArray)</Mono>. When a request arrives on BLE,
          the <Mono>TransportMessageRouter</Mono> passes it to any attached WiFi Direct transport
          via <Mono>externalRequestSender</Mono>. When a proof arrives over WiFi Direct,
          it flows through to the BLE transport via <Mono>externalProofSender</Mono>. The
          router does not know or care which direction the relay is going.
        </P>
        <P>
          Deduplication happens at the proof level using the verifier's public key.
          The <Mono>seenVerifierKeys</Mono> set in <Mono>TransportMessageRouter</Mono>
          tracks which cryptographic identities have already contributed a proof to
          the current verification round. If the same verifier's proof arrives on
          both BLE and WiFi Direct, only the first is counted toward consensus. The second
          is verified cryptographically but dropped from <Mono>collectedProofsList</Mono>
          before it can inflate the proof count.
        </P>
        <P>
          Stale proofs from a previous round are rejected by comparing the proof's
          embedded transaction signature against <Mono>currentTxSig</Mono>. When a new
          verification round starts, <Mono>broadcastRequest</Mono> updates
          <Mono>currentTxSig</Mono> and calls <Mono>clearProofs()</Mono>. Any proof
          that does not match the current signature is dropped.
        </P>

        <CalloutBlock label="// iOS transport architecture">
          On iOS, the transport abstraction works through closure callbacks rather than
          an interface. Each transport has <Mono>onIncomingRequest</Mono> and
          <Mono>onIncomingProof</Mono> closures that are set by <Mono>FernlinkClient</Mono>
          during <Mono>attachTransport</Mono>. The MCF transport and BLE transport are
          registered independently. When a proof arrives on MCF, the
          <Mono>onIncomingProof</Mono> closure fires and the client's proof-collection
          logic runs against the same deduplication set as BLE proofs.
        </CalloutBlock>

        <H2>// STORE_AND_FORWARD</H2>
        <P>
          The protocol needs to handle a timing problem: an app calls
          <Mono>verifyTransaction</Mono> before any peers have connected. The BLE scan
          may still be running. The WiFi Direct group may not have formed yet. Simply
          dropping the request and falling back to direct RPC is the safe choice.
          It is not the right choice in environments where RPC is unreliable or expensive.
        </P>
        <P>
          Instead, when <Mono>broadcastRequest</Mono> is called with zero connected peers,
          the request is enqueued in a <Mono>ProofStore</Mono>: a
          <Mono>ConcurrentLinkedQueue</Mono> capped at 64 entries. The cap prevents
          unbounded growth in edge cases where the app submits many verifications before
          connectivity stabilizes.
        </P>
        <P>
          When a new peer's CCC subscription is confirmed (meaning a GATT client has
          connected and successfully written the CCC descriptor), the client drains
          the store immediately. Every queued request is sent to the new peer as if
          it had been submitted just now. The peer verifies against the Solana RPC,
          signs a proof, and returns it. If enough proofs accumulate across the peer
          mesh, consensus is reached without any direct RPC from the originating device.
        </P>
        <P>
          The drain happens on every new peer connection, not just the first. If a
          first peer connects and goes offline before responding, and a second peer
          connects afterward, the second drain retransmits requests that did not get
          proofs the first time. This is not duplicate detection at the request level.
          Each verifier independently signs the result of its own RPC call.
        </P>

        <H2>// LESSONS</H2>
        <P>
          Building a multi-transport mesh across Android, iOS, TypeScript, and Rust
          taught us a few things that did not make it into any documentation we found.
        </P>
        <ul className="mb-6 space-y-1">
          <Bullet>
            <Highlight>BLE INDICATE is not optional if you care about reliability.</Highlight> NOTIFY
            is faster but you lose the ATT-level delivery guarantee. When you are
            fragmenting a payload across multiple characteristic notifications, that
            guarantee is what prevents partial reassembly and silent data loss.
          </Bullet>
          <Bullet>
            <Highlight>iOS peripheral count is not connected peer count.</Highlight> iOS reports
            a peripheral as discovered the moment <Mono>didDiscover</Mono> fires, before
            the connect-to-CCC sequence completes. Using <Mono>peripherals.count</Mono>
            as the peer count causes <Mono>broadcastRequest</Mono> to write to peripherals
            that do not yet have a <Mono>CHAR_REQUEST</Mono> handle. The write silently
            does nothing. Count peers only after <Mono>requestChars</Mono> is populated.
          </Bullet>
          <Bullet>
            <Highlight>WiFi Direct requires explicit stale group cleanup.</Highlight> The Android
            framework does not clean up leftover groups from previous sessions automatically.
            A stale group silently blocks all service discovery. Always call
            <Mono>requestGroupInfo</Mono> and <Mono>removeGroup</Mono> before
            <Mono>discoverServices</Mono>.
          </Bullet>
          <Bullet>
            <Highlight>Cross-platform determinism is the only reliable foundation.</Highlight> Any
            role negotiation that depends on timing, ordering, or race conditions will
            eventually fail in production. Using a stable, pre-known value (the public key)
            as a tie-breaker makes session establishment deterministic regardless of
            which device wins the discovery race.
          </Bullet>
          <Bullet>
            <Highlight>The 2-byte fragmentation header is enough.</Highlight> We considered a
            richer framing format with checksums and sequence numbers. What we shipped
            is two bytes: index and total. INDICATE gives you the delivery guarantee at
            the ATT layer. The reassembler gives you ordering. Anything beyond that is
            complexity without benefit.
          </Bullet>
        </ul>

        <H2>// USING_IT</H2>
        <P>
          On Android, starting all three transports is a single call:
        </P>
        <CodeBlock>{`class MyActivity : Activity() {
    private val client  = FernlinkClient(FernlinkClientConfig(
        rpcEndpoint = "https://api.mainnet-beta.solana.com",
        minProofs   = 2,
    ))
    private val manager = TransportManager(this, client)

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        client.start()
        manager.startAll()   // binds BLE + WiFi Direct as foreground services
    }

    fun onVerifyTapped(txSignature: String) {
        lifecycleScope.launch {
            val result = client.verifyTransaction(txSignature)
            // result.status, result.slot, result.proofCount
        }
    }

    override fun onDestroy() {
        manager.stopAll()
        client.stop()
        super.onDestroy()
    }
}`}</CodeBlock>
        <P>
          On iOS:
        </P>
        <CodeBlock>{`let manager = TransportManager()
manager.start()   // BLE + Multipeer Connectivity, both active immediately

let result = try await manager.verifyTransaction(
    txSignature,
    commitment: .confirmed,
    timeoutMs:  15_000
)

// Add NFC bootstrapping for Android pairing:
let nfcReader = client.createNfcBootstrapReader { peerPubKey, bleAddress in
    // connectDirect is called internally — mesh link in ~200ms
}
// From a button action:
nfcReader.beginReading()`}</CodeBlock>
        <P>
          On TypeScript with WiFi/TCP for LAN peers:
        </P>
        <CodeBlock>{`import { FernlinkClient } from "fernlink-sdk";
import { TransportManager } from "@fernlink/wifi";

const client  = new FernlinkClient({ rpcEndpoint: "https://api.mainnet-beta.solana.com" });
const manager = new TransportManager(client, "https://api.mainnet-beta.solana.com");

await client.start();
await manager.start();   // binds TCP server + starts mDNS advertisement

const result = await client.verifyTransaction(txSignature);`}</CodeBlock>

        <P>
          The full source for all transports is on GitHub under Apache 2.0.
          The Android SDK has six instrumented JNI tests and a set of unit tests
          for the BLE and WiFi Direct layers. The iOS SDK ships CryptoTests and
          RouterTests. The BLE simulator in the TypeScript package runs eight integration
          tests in CI without any hardware. You do not need physical devices to develop
          against any of these interfaces.
        </P>

        {/* CTA */}
        <div className="mt-14 pt-8 border-t border-[#064e3b] flex flex-wrap gap-4">
          <a
            href={GITHUB}
            target="_blank"
            rel="noopener noreferrer"
            className="font-mono text-sm uppercase tracking-widest border border-[#22C55E] text-[#22C55E] px-5 py-2 inline-block hover:bg-[#22C55E] hover:text-black transition-all"
          >
            [ VIEW ON GITHUB ]
          </a>
          <Link
            to="/downloads"
            className="font-mono text-sm uppercase tracking-widest border border-[#064e3b] text-[#166534] px-5 py-2 inline-block hover:border-[#22C55E] hover:text-[#22C55E] transition-all"
          >
            [ DOWNLOADS ]
          </Link>
          <a
            href="https://t.me/Stranger3145"
            target="_blank"
            rel="noopener noreferrer"
            className="font-mono text-sm uppercase tracking-widest border border-[#064e3b] text-[#166534] px-5 py-2 inline-block hover:border-[#22C55E] hover:text-[#22C55E] transition-all"
          >
            [ JOIN TELEGRAM ]
          </a>
        </div>
      </article>
    </div>
  );
}
