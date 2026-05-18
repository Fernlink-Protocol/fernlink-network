# Fernlink — Written Tweet Content

All tweets are ready to post. Threads are numbered per tweet.
Media notes are in [brackets]. Post times: 9am or 6pm UTC.

---

## WEEK 1 — Arrival

---

### DAY 1 — Launch thread (9am UTC)

**Tweet 1 of 9 — Hook (pin this)**
```
Solana has a centralized verification problem.

Every wallet. Every dApp. Every POS terminal. All hammering the same handful of RPC endpoints to confirm the same transactions.

We built a mesh to fix it.

Thread. 🧵
```

**Tweet 2 of 9**
```
The problem is architectural, not operational.

When three providers handle the majority of Solana's confirmation traffic, every outage is a network-wide event. Every rate limit hits everyone simultaneously. There's no redundancy — just the appearance of it.
```

**Tweet 3 of 9**
```
Fernlink routes verification through the devices already in the room.

One phone hits the RPC, signs the result with its Ed25519 key, and broadcasts the proof over BLE. Nearby devices skip the call entirely.

The proof is cryptographically signed. A peer can't lie about what the RPC returned.
```

**Tweet 4 of 9**
```
Multi-proof consensus means one compromised peer can't settle a transaction.

Default threshold: 2 independent verifiers must agree before a result is accepted. UUID deduplication with TTL prevents replay. The same proof can't be counted twice.
```

**Tweet 5 of 9**
```
Three phases:

REQUEST — a device broadcasts a signed verification request over the mesh.
VERIFY — a peer with RPC access checks the transaction, signs the result.
PROPAGATE — the proof gossips outward. Each hop is tracked. TTL limits the spread.
```

**Tweet 6 of 9**
```
Four platforms. One protocol.

Android (Kotlin + Rust JNI)
iOS (Swift + CoreBluetooth + CryptoKit)
TypeScript (Node.js + browser WebBluetooth)
Rust desktop (BLE + WiFi simultaneously)

An Android device verifies a proof signed by an iPhone. No translation layer.
```

**Tweet 7 of 9**
```
Three transports.

BLE — universal, cross-platform, battery-conscious.
WiFi Direct / Multipeer Connectivity — high-throughput local links, 10–40 Mbps.
NFC — tap-to-pair bootstrap in ~200ms, bypasses the scan cycle entirely.

All three active simultaneously. TransportManager picks the best available path.
```

**Tweet 8 of 9**
```
The numbers: 60–80% fewer RPC calls in a dense environment.

A conference hall. A market. A city block. One device verifies. The signed proof reaches dozens of nearby devices. Each one that receives it never asks the RPC.
```

**Tweet 9 of 9**
```
Open source. Apache 2.0.

No VC round. No presale. No token (yet). Just the code.

Run the devnet demo — three simulated peers, a real SOL transfer, signed proofs, consensus result — with no hardware:

$ npx fernlink-demo

Whitepaper: fernlink.vercel.app
GitHub: github.com/OnoseAnthony/fernlink-network
```

---

### DAY 3 — Demo (6pm UTC)

```
Run this.

$ npx fernlink-demo

It spins up three simulated mesh peers, sends a real SOL transfer on devnet, routes the verification request through the peer mesh, and prints every signed Ed25519 proof alongside the final consensus result.

No hardware. No API keys. No setup.

[attach: terminal screen recording of the demo output]
```

---

### DAY 5 — Problem framing (9am UTC)

```
The Solana RPC market looks competitive. Helius, QuickNode, Triton, a handful of others.

It isn't. When one provider goes down, every application using them goes down simultaneously. The ecosystem doesn't have redundancy — it has the illusion of it.

The correct fix isn't a better RPC provider. It's not needing one for every device.
```

---

### DAY 7 — First week numbers (6pm UTC)

```
One week since we open sourced Fernlink.

[X] stars. [Y] forks. [Z] unique clones.

The repo has:
— 7 Rust unit tests in fernlink-core
— Full TypeScript SDK coverage
— 6 instrumented Android JNI tests
— 8 BLE simulator tests, running in CI with no physical hardware

Code first. Hype later.

github.com/OnoseAnthony/fernlink-network
```

---

## WEEK 2 — Technical credibility

---

### DAY 9 — BLE fragmentation thread (9am UTC)

**Tweet 1 of 9 — Hook**
```
BLE feels simple. Characteristics, notifications, a couple of UUIDs.

Here's what it actually takes to send a 200-byte signed proof reliably across the ATT layer without losing data.

Thread. 🧵
```

**Tweet 2 of 9**
```
The ATT protocol has two ways to push data to a subscribed central: NOTIFY and INDICATE.

NOTIFY is fire-and-forget. The server sends the packet. Whether it arrived is not confirmed at the ATT layer. You find out when the data is wrong.

INDICATE waits.
```

**Tweet 3 of 9**
```
INDICATE sends ATT_HANDLE_VALUE_INDICATION. The client responds with ATT_HANDLE_VALUE_CONFIRM. Only then does the ATT layer consider the transaction complete.

That confirmation is what triggers onNotificationSent on the Android GATT server. It's the only signal you have that the fragment was actually received.
```

**Tweet 4 of 9**
```
We serialize every fragment send behind a CompletableDeferred<Unit>.

Before writing fragment N, we park a deferred and wait for onNotificationSent to complete it. Fragment N+1 is never queued until N is confirmed delivered.

It's the same pattern as a write queue — applied to the notification path.
```

**Tweet 5 of 9**
```
The MTU problem is more subtle.

Android negotiates up to 517 bytes on modern Pixel hardware — 514 bytes of ATT payload. We tried using it. Some BLE controller firmware on mid-range devices drops back-to-back large notifications silently. No error. No callback. Data just disappears.

We cap at 185 bytes regardless of what was negotiated.
```

**Tweet 6 of 9**
```
At 182 bytes of ATT payload per fragment, a 200-byte Fernlink proof assembles in two fragments.

Small, reliable, boring. Exactly what you want from infrastructure code.
```

**Tweet 7 of 9**
```
iOS adds MAC address rotation.

Every ~15 minutes, iOS rotates the BLE address of each peripheral. From the Android server side, a subscribed device vanishes. The old address stays in subscribedDevices. The next notification hangs waiting for a callback that will never fire.
```

**Tweet 8 of 9**
```
We detect stale subscribers with a 2-second withTimeoutOrNull on each fragment.

If onNotificationSent doesn't fire, the subscriber is evicted and the send moves on. That 2-second timeout is the only reason notification delivery doesn't stall indefinitely when an iOS device rotates its MAC.
```

**Tweet 9 of 9**
```
The fragmentation header is two bytes: [index, total].

That's the whole scheme. INDICATE gives you the delivery guarantee. The reassembler handles ordering. The same two bytes run identically in Kotlin, Swift, TypeScript, and Rust.

Simple things are hard to build and easy to use. That's the goal.
```

---

### DAY 11 — Cross-platform wire format (6pm UTC)

```
Four platforms. One wire format.

Rust (ed25519-dalek) · Kotlin (JNI to Rust core) · Swift (CryptoKit) · TypeScript (tweetnacl)

The signable bytes are identical everywhere:
tx signature (UTF-8) + status byte + slot (u64 LE) + blockTime (u64 LE) + errorCode (u16 LE) + verifier pubkey (32 bytes)

An Android device verifies a proof signed by an iPhone. No translation, no negotiation. The protocol handles it.
```

---

### DAY 13 — Ecosystem take (9am UTC)

```
Billions of people live where internet is intermittent.

A Solana wallet that requires a live RPC call for every confirmation doesn't work for them. Not because of Solana — because of an architecture decision that was never questioned.

The mesh works differently. If someone nearby already verified a transaction, you receive their signed cryptographic proof without touching the internet. That's financial inclusion that works in the field.
```

---

### DAY 14 — Week 2 recap (6pm UTC)

```
Week 2 notes.

Shipped: improved iOS peer reconnect after MAC rotation. Fixed a connectedPeerCount race that was silently dropping writes on freshly discovered peripherals.

The bug was subtle. iOS reports a peripheral as discovered the moment didDiscover fires — before the connect → service discovery → CCC sequence completes (~500ms later). We were counting peripherals.count, which meant broadcastRequest() fired while requestChars was still empty. Writes went nowhere.

Fix: count requestChars.count instead.

Next week: Android foreground service deep dive, NFC bootstrap internals, WiFi Direct Group Owner election.
```

---

## WEEK 3 — Mobile depth

---

### DAY 15 — Android BLE service thread (9am UTC)

**Tweet 1 of 8 — Hook**
```
Running BLE as a persistent Android background service is a different problem from connecting in an Activity.

Here's how FernlinkBleService works — GATT server, advertisement, foreground service lifecycle, and the one GATT characteristic property that makes fragmented delivery safe.

Thread. 🧵
```

**Tweet 2 of 8**
```
Android 8+ requires foreground services for any background operation that needs consistent CPU time. BLE advertising and scanning qualify.

FernlinkBleService extends Service, calls startForeground() immediately in onCreate(), and shows a persistent notification. Without it, the OS kills the process during BLE scan cycles.
```

**Tweet 3 of 8**
```
The GATT profile has three characteristics:

REQUEST — writable by centrals. Verification requests come in here.
PROOF — indicatable. Signed proofs go out here. INDICATE, not NOTIFY.
STATUS — readable. Returns a JSON blob: version, supported commitment levels, supported compression codecs.
```

**Tweet 4 of 8**
```
The STATUS characteristic is how capability negotiation works.

Current value:
{"version":2,"commitment":["confirmed","finalized"],"compression":["lz4","zstd"]}

A connecting peer reads this before sending its first request. If it supports LZ4, it compresses. If not, it doesn't. The server handles both.
```

**Tweet 5 of 8**
```
Advertisement is split across two packets: primary (31 bytes) and scan response (31 bytes).

The primary carries the Fernlink service UUID — so scanners filtering by UUID find us.
The scan response carries an 8-byte pubkey fingerprint as manufacturer-specific data.

Active scanners receive both. The fingerprint lets us recognize a peer across MAC rotations.
```

**Tweet 6 of 8**
```
The fingerprint matters because iOS rotates MAC addresses every ~15 minutes.

When a rotation happens, the scan callback fires again for the same physical device with a new address. Without the fingerprint, we'd call connectGatt() a second time and try to hold two simultaneous connections to the same peer.

With it, we skip the reconnect entirely.
```

**Tweet 7 of 8**
```
On disconnect, we hold the fingerprint reservation for 10 seconds before allowing reconnect.

Without that delay: disconnect fires, reservation clears, scan callback sees the device immediately, connectGatt() is called again within milliseconds. Repeat. The Android GATT interface pool exhausts itself.

10 seconds is enough to let the stack settle.
```

**Tweet 8 of 8**
```
The GATT server and client run together in the same service — every device is both a peripheral (advertising, accepting writes) and a central (scanning, connecting to peers).

When a request arrives on CHAR_REQUEST, the service router signs a proof and sends it back via CHAR_PROOF. The requesting device never needs to know it's talking to both halves of the same process.
```

---

### DAY 17 — iOS CoreBluetooth thread (6pm UTC)

**Tweet 1 of 6 — Hook**
```
CoreBluetooth and Android BLE look similar on the surface.

They are not. Here are the four things that are actually different, and the two bugs that only manifest on iOS.

Thread. 🧵
```

**Tweet 2 of 6**
```
Android 13 split onCharacteristicChanged into two overrides.

The old one reads from characteristic.value. The new one (API 33+) receives value as a direct parameter and ignores characteristic.value entirely.

Implement only the new one: pre-13 devices never deliver notifications.
Implement only the old one: API 33+ devices deliver null.

Both are required in the same class.
```

**Tweet 3 of 6**
```
allowDuplicates: true is not optional on iOS if you care about reconnects.

Without it, iOS delivers one scan result per device. If the connection fails, the device is never rediscovered — it stays in the peripheral map as "connecting" indefinitely.

One flag. Took two days to find.
```

**Tweet 4 of 6**
```
iOS peripheral count is not the same as connected peer count.

peripherals.count goes up when didDiscover fires. CHAR_REQUEST isn't available until after connect → service discovery → CCC — roughly 500ms later.

We wrote to peripherals[id] with no request characteristic. Writes went nowhere. Count requestChars.count.
```

**Tweet 5 of 6**
```
iOS cannot emit NFC. No HCE, no workaround.

NFC bootstrap is one-directional: Android emits the NDEF record via Host Card Emulation, iPhone reads it via CoreNFC and calls connectDirect() to skip the scan cycle.

iPhone → iPhone pairing doesn't need NFC. Multipeer Connectivity finds the peer and negotiates the session automatically.
```

**Tweet 6 of 6**
```
Multipeer Connectivity automatically selects the best available radio.

Same network: infrastructure WiFi. Different networks: peer-to-peer WiFi. Neither: Bluetooth.

When two iPhones are on the same LAN, MCF negotiates over WiFi and BLE goes quiet. The application code doesn't change. The framework handles it.

Apple solved the radio selection problem. We just plug into it.
```

---

### DAY 19 — NFC bootstrap (9am UTC)

```
Tap two devices together.

NFC bootstrap exchanges credentials in the field interaction itself — before either device has run a BLE scan cycle. The receiving device calls connectDirect() with the peer's known BLE address and skips the scan entirely.

~200ms from tap to connected peer. A normal BLE scan takes 5–8 seconds.

The NDEF record carries three things: the peer's Ed25519 public key, the Fernlink service UUID, and the current BLE MAC address. Compact enough to transfer in a single NFC field interaction.

Works Android → iPhone. For iPhone → iPhone, Multipeer Connectivity handles discovery automatically — no tap required.
```

---

### DAY 21 — Grant rejection (9am UTC)

```
The Solana Foundation rejected our grant application in February.

We shipped anyway.

Android SDK. iOS SDK. TypeScript SDK. Rust core. BLE mesh. WiFi Direct. NFC bootstrap. LZ4/zstd wire compression. Cross-transport proof relay. Store-and-forward. 6 instrumented Android JNI tests. 8 BLE simulator tests running in CI.

We're applying again. The code is the application.
```

---

## WEEK 4 — Proof of work

---

### DAY 22 — Blog post drop (9am UTC)

```
New post: how BLE, WiFi Direct, and NFC work together under a single TransportManager.

Covers:
— The MTU ceiling that kills back-to-back BLE notifications on certain firmware
— Why INDICATE beats NOTIFY for fragmented delivery
— Stale subscriber eviction via CompletableDeferred timeout
— Deterministic WiFi Direct GO election using public keys as tie-breaker
— NFC NDEF record structure and the iOS asymmetry
— Cross-transport proof relay

Written like a post-mortem, not a press release.

fernlink.vercel.app/blog/multi-transport
```

---

### DAY 23 — WiFi Direct standalone (6pm UTC)

```
WiFi Direct gives you peer-to-peer TCP between Android devices with no access point. Roughly 10–40 Mbps versus BLE's 1–3 Mbps. It's the right transport once you need to move real data quickly.

The non-obvious part: Group Owner election.

One device becomes the GO and runs the access point. The other connects to it. The framework lets you set an intent value to influence the outcome. What it doesn't document: if both devices set intent 0 simultaneously, the result is non-deterministic. Both wait for the other to start the TCP server. Neither does.

Our fix: the device with the lexicographically lower Ed25519 public key always becomes the client. Both devices know the peer's key from the DNS-SD TXT record before connecting. They agree on roles without a negotiation round-trip.

The same rule applies on iOS Multipeer Connectivity — lower pubkey sends the session invitation. One determinism rule, two platforms, zero deadlocks.
```

---

### DAY 24 — Community ask (9am UTC)

```
If you're building on Solana Mobile, shipping a POS product, or working on anything that runs transactions in low-connectivity environments: we want to talk.

Not selling anything. Looking for real usage to test real edge cases.

Full SDK access. Full support. No fees.

DMs open. GitHub issues work too.
```

---

### DAY 26 — Store-and-forward ship log (6pm UTC)

```
Shipped: store-and-forward for offline scenarios.

When verifyTransaction() is called with no connected peers, the request queues locally in a ConcurrentLinkedQueue capped at 64 entries. The moment a peer connects and its CCC subscription is confirmed, the queue drains — every request goes to the new peer as if just submitted.

The peer verifies against Solana RPC, signs the proof, returns it. Consensus happens without a direct internet connection from the originating device.

This is the pattern that makes Fernlink useful in low-connectivity markets, not just conference demos.
```

---

### DAY 28 — Month 1 wrap (9am UTC)

```
Month 1.

[X] GitHub stars. [Y] developers ran the demo. [Z] integration conversations started.

What shipped:
— BLE INDICATE fragmentation, cross-platform reliable
— iOS CoreBluetooth central + peripheral
— Android GATT server + client with foreground service
— WiFi Direct transport, deterministic GO election
— Multipeer Connectivity for Apple-to-Apple links
— NFC bootstrap (Android HCE → iPhone CoreNFC)
— Cross-transport proof relay and deduplication
— Store-and-forward, cap 64, drains on reconnect
— Full CI: Rust, TypeScript, Android, BLE simulator

What's next: integration partners, the performance deep-dive blog post, and the start of an honest conversation about what $FERN needs to do economically.

Building in public.
```

---

## WEEKS 5–8 — Growth and community

---

### MONDAY — Week preview format

```
This week:

Shipping [specific feature or fix].
Thread on [technical topic] Wednesday.
[Demo/benchmark/diagram] drops Friday.

[One sentence on why the shipping item matters.]
```

**Example week 5:**
```
This week:

Finishing the LZ4 compression benchmarks across transport types.
Thread on mDNS peer discovery for the TypeScript/Rust LAN transport Wednesday.
Side-by-side proof delivery comparison — BLE vs WiFi Direct — Friday.

Compression reduces proof payload from ~200 bytes to ~140. Not dramatic. Meaningful at scale.
```

---

### WEDNESDAY — Technical thread topics (fully written)

---

**Thread: mDNS peer discovery on the LAN transport**

**Tweet 1 of 7 — Hook**
```
How Fernlink finds peers on a local network without any central registry.

The TypeScript and Rust desktop transports use mDNS. Here's how it works, why it's the right call for LAN discovery, and what happens when two peers discover each other simultaneously.

Thread. 🧵
```

**Tweet 2 of 7**
```
mDNS (multicast DNS) is how devices on a LAN advertise services to each other without a DNS server.

Your Mac finding printers on the office network: mDNS. AirPlay discovering Apple TVs: mDNS. Fernlink finding other Fernlink nodes on the same WiFi: same mechanism.

It's a solved problem. We use it as-is.
```

**Tweet 3 of 7**
```
Each Fernlink LAN node advertises on _fernlink._tcp.local.

The TXT record carries two fields: the node's public key (pk) and the protocol version (v). Any peer that discovers this record knows the cryptographic identity of the other node before establishing a TCP connection.

That's all the information needed for role negotiation.
```

**Tweet 4 of 7**
```
Same determinism rule as Android WiFi Direct.

The node with the lexicographically lower public key connects outbound. The higher public key listens on port 8765.

Both nodes learn each other's keys from the mDNS TXT record. Both make the same decision independently. No coin flip, no race condition.
```

**Tweet 5 of 7**
```
Once the TCP connection is live, the framing is minimal: 1-byte type tag + 4-byte big-endian length prefix + payload.

Three type tags:
0x01 — REQUEST
0x02 — PROOF
0x03 — HELLO

HELLO carries the first 16 bytes of the local public key and fires immediately after connection. It's how the other side confirms who it's talking to.
```

**Tweet 6 of 7**
```
The Rust desktop node runs BLE and WiFi simultaneously.

A proof arriving over BLE from an Android peer can be relayed to TypeScript nodes on the same LAN over TCP, and vice versa. The cross-transport bridge handles it. Neither side knows or cares which transport carried a given proof.
```

**Tweet 7 of 7**
```
The TypeScript LAN transport is in @fernlink/wifi:

$ npm install @fernlink/wifi

const manager = new TransportManager(client, rpcEndpoint)
await manager.start()   // binds TCP server + starts mDNS

Peers on the same network connect automatically. No configuration, no registry, no central coordinator.
```

---

**Thread: UUID deduplication and gossip TTL**

**Tweet 1 of 6 — Hook**
```
If you gossip a proof across a mesh without deduplication, every node receives it multiple times — once from each neighbor that already forwarded it.

Here's how Fernlink prevents that without a central coordinator.

Thread. 🧵
```

**Tweet 2 of 6**
```
Each verification request carries a UUID and a TTL (time-to-live, max 8).

When a node receives a request it has seen before — same UUID — it drops it immediately. No re-broadcast, no RPC call, no proof generation.

The SeenCache in fernlink-core is a UUID set with TTL-based eviction. Entries expire after their validity window. The cache never grows unbounded.
```

**Tweet 3 of 6**
```
When a node broadcasts a request, it adds the UUID to its own seen cache immediately.

This prevents the node from processing its own echoes — which would happen if a neighbor received the request and immediately re-broadcast it back toward the originator.
```

**Tweet 4 of 6**
```
TTL controls propagation depth.

Each hop decrements the TTL by 1. A node that receives a request with TTL 0 verifies it locally but does not forward it. A request with TTL 8 can cross up to 8 hops before it stops propagating.

The originating device sets the TTL based on how broadly it wants the request to spread.
```

**Tweet 5 of 6**
```
Proof deduplication works differently — by verifier identity, not by UUID.

When a proof arrives, the router checks the verifier's public key against seenVerifierKeys. If that key has already contributed a proof to the current round, the new proof is verified cryptographically but not counted toward consensus.

One verifier, one vote.
```

**Tweet 6 of 6**
```
This design means a single malicious node can't inflate the proof count by sending the same proof twice from different transports.

The proof is verified (signature check passes), recognized as a duplicate verifier, and dropped before it reaches the consensus counter.

Cryptographic identity as deduplication key. Simple, correct, no coordination required.
```

---

**Thread: Ed25519 on four platforms**

**Tweet 1 of 7 — Hook**
```
The same Ed25519 keypair and signable bytes format needs to work across Rust, Kotlin, Swift, and TypeScript.

Here's how we keep four implementations in lockstep without a single source of truth breaking them.

Thread. 🧵
```

**Tweet 2 of 7**
```
Rust core uses ed25519-dalek. The canonical implementation.

fernlink-core compiles to a cdylib for Android via cargo-ndk. Kotlin calls it through JNI: generateKeypair(), signProof(), verifyProof(), evaluateProofs(). The Rust logic runs natively on the device — no interpreted crypto.
```

**Tweet 3 of 7**
```
iOS uses CryptoKit, Apple's native framework.

CryptoKit's Curve25519.Signing gives us Ed25519 sign and verify. The signable bytes are assembled identically to the Rust implementation: same field order, same encoding, same byte widths.

A proof signed by CryptoKit verifies cleanly against ed25519-dalek. We tested this explicitly.
```

**Tweet 4 of 7**
```
TypeScript uses tweetnacl.

tweetnacl.sign.detached() and tweetnacl.sign.detached.verify() map directly to the Rust sign/verify surface. Same keys, same message format, same output.

The TypeScript SDK runs in Node.js, in the browser, and in the fernlink-demo CLI.
```

**Tweet 5 of 7**
```
The signable bytes format is the hardest thing to keep synchronized.

tx signature (UTF-8 bytes, not base58-decoded — Solana signatures are ASCII-safe base58 strings)
+ status byte (u8: 0 confirmed, 1 failed, 2 unknown)
+ slot (u64 LE)
+ blockTime (u64 LE)
+ errorCode (u16 LE)
+ verifier public key (32 bytes)

Change one byte width on one platform and cross-platform verification fails silently.
```

**Tweet 6 of 7**
```
We keep them synchronized with cross-platform test vectors.

A known keypair, a known transaction signature, known slot and blockTime — the same inputs produce the same Ed25519 signature on every platform. If any implementation drifts, the vector test fails immediately.

Test vectors are the only reliable way to enforce binary protocol compatibility across language runtimes.
```

**Tweet 7 of 7**
```
The Rust core is the reference implementation.

When something changes — a field order, a byte width, an encoding decision — the Rust tests update first. Then the cross-platform vectors update. Then every other language follows the vectors.

One source of truth. Four implementations that can't silently diverge.
```

---

### FRIDAY — Ship log / demo format

**Example week 5 Friday:**
```
BLE vs WiFi Direct proof delivery, same payload, same two Android devices:

BLE (GATT INDICATE, 182-byte fragments):
— fragment 1: delivered + confirmed, 12ms
— fragment 2: delivered + confirmed, 18ms
— total: 30ms

WiFi Direct (TCP, no fragmentation needed):
— total: 4ms

BLE wins on power and universality. WiFi Direct wins on latency.
TransportManager uses both. When a WiFi Direct link exists, proof delivery routes there. BLE carries the cross-platform connections.

[attach: benchmark diagram]
```

---

## WEEKS 9–12 — Ecosystem positioning

---

### Ecosystem engagement tweets (adapt to real announcements)

**Wallet team angle:**
```
Every time a wallet confirms a transaction, it makes an RPC call.

In a conference room with 200 Phantom users, that's 200 identical calls to the same endpoint. One of them could verify and share the proof. The other 199 could skip the call entirely.

That's what Fernlink adds to wallet infrastructure. Happy to walk through the integration if the @phantom team is interested.
```

**Solana Mobile angle:**
```
Saga and Chapter 2 are the right hardware for what Fernlink does.

A dApp running on Solana Mobile has BLE, WiFi Direct, and NFC available natively. The SDK is Kotlin + JNI. The foreground service runs in the background while the app is active.

If you're building for Solana Mobile and want mesh verification baked in, we're ready to integrate.

@SolanaMobile
```

**RPC provider angle (not adversarial):**
```
Fernlink and RPC providers are not in competition.

When no mesh peers are nearby, Fernlink falls back to direct RPC — same endpoint, same call. The mesh reduces load during high-density events. The direct fallback covers everything else.

Infrastructure that makes each other more resilient. That's the right model. #Solana
```

**Grant committee angle:**
```
We applied to the Solana Foundation grant program in early 2026. We were rejected.

In the months since: Android SDK, iOS SDK, TypeScript SDK, Rust core, three transports, NFC bootstrap, wire compression, store-and-forward, CI for all four platforms.

We applied again this week.

@SolanaFndn — the application is the GitHub repo.
```

---

## WEEKS 13–16 — Pre-$FERN positioning

---

### WEEK 13 — Economic layer intro (post once, mid-week)

```
Verification nodes do real work.

They run BLE advertisements. They scan for peers. They make RPC calls. They sign proofs with their Ed25519 keys. They relay data across the mesh.

Right now they do all of it for free. That means only developers running test setups do it at all.

A protocol that depends on altruism doesn't scale. We're designing the economic layer now.
```

---

### WEEK 14 — Token mechanism framing

```
The $FERN token is a coordination mechanism, not a reward program.

Verifier nodes stake to participate. Accurate proofs — ones that match the Solana ledger and survive multi-proof consensus — build on-chain standing. Inaccurate or missing proofs reduce it.

Clients route verification requests to high-standing verifiers first. Low-standing nodes get fewer requests. The protocol self-selects for honest behavior without a central authority making that call.

The economics follow the protocol. Not the other way around.
```

---

### WEEK 15 — Standard-setting tweet

```
Before we announce the token:

The protocol runs on real devices across real transports.
The SDK has real integrations in production.
The consensus mechanism has survived real edge cases, not just simulated ones.

We are not launching a token to fund a protocol.
We are launching a token because the protocol is ready for one.

There is a difference. We take it seriously.
```

---

### WEEK 16 — The signal tweet

```
$FERN is coming.

Everything about it — what it does, how it distributes, why the design is what it is — will be published in full before launch. No surprises.

No presale. No hidden VC allocation. No whitelist that benefits insiders.

Follow for the announcement. The full breakdown thread drops next week.
```

---

## WEEKS 17–20 — Launch

---

### LAUNCH THREAD

**Tweet 1 of 10 — Hook**
```
$FERN is live.

Here's what it is, what it does, and how to get it.

Thread. 🧵
```

**Tweet 2 of 10 — What Fernlink is**
```
Fernlink is a peer-to-peer verification mesh for Solana.

Devices nearby share the work of confirming transactions over BLE, WiFi, and NFC. One device hits the RPC. The signed proof reaches everyone else. 60–80% fewer RPC calls in a dense environment.

Apache 2.0. Android, iOS, TypeScript, Rust. Shipping since May 2026.

Full protocol spec: fernlink.vercel.app
```

**Tweet 3 of 10 — What the token does**
```
$FERN solves the verifier incentive problem.

Running a Fernlink node means making RPC calls, signing proofs, staying online. Without a reason to do it, only developers bother.

$FERN gives nodes a reason. Stake to participate. Build standing through accurate proofs. Get routed more requests. The protocol rewards reliability.
```

**Tweet 4 of 10 — Staking and standing**
```
Standing is earned, not bought.

A node that stakes $FERN enters the verifier set. Each accurate proof — one that matches the ledger and passes multi-proof consensus — accrues standing. Inaccurate proofs subtract it.

High-standing nodes get priority routing. Low-standing nodes get fewer requests and fewer rewards. There is no way to purchase standing directly.
```

**Tweet 5 of 10 — Distribution**
```
$FERN distribution:

[X]% — community (airdrop to early mesh participants and GitHub contributors)
[X]% — verifier incentives (released over [Y] years as protocol rewards)
[X]% — development fund (used for audits, infrastructure, grants)
[X]% — team (locked [Y] years, vesting [Z] years)

Full allocation table and unlock schedule: [link]
```

**Tweet 6 of 10 — How to get it**
```
How to get $FERN:

[Airdrop details — specific instructions]
[DEX listing details]
[Where to track distribution]

Contract address: [address]
```

**Tweet 7 of 10 — What's next**
```
The token launch is not the finish line. It's the starting gun for the economic layer.

What's next:
— Verifier reputation on-chain
— Peer routing weighted by standing
— Account and program state queries through the mesh
— Offline payment channel design
— Transaction broadcasting via mesh relay
```

**Tweet 8 of 10 — The grant story, full circle**
```
In February 2026 the Solana Foundation rejected our grant application.

We had a website and a whitepaper.

Today we have an Android SDK, iOS SDK, TypeScript SDK, Rust core, three transports, NFC bootstrap, wire compression, cross-transport relay, store-and-forward, full CI, two published blog posts, and a live token.

We applied again.
```

**Tweet 9 of 10 — Security**
```
Every proof is Ed25519 signed. Consensus requires 2+ independent verifiers by default. UUID deduplication prevents replay. No private keys cross the mesh. The Rust core is the reference implementation and is open source.

Read the whitepaper before trusting the protocol with real funds.

fernlink.vercel.app
```

**Tweet 10 of 10 — CTA**
```
$FERN is live.

GitHub: github.com/OnoseAnthony/fernlink-network
Website: fernlink.vercel.app
Whitepaper: fernlink.vercel.app (link in nav)
Telegram: t.me/Stranger3145

Contract: [address]

Build something. Run a node. Read the code.
```

---

## ONGOING — Engagement replies

These are templates for replying to common questions in public. Reply publicly so the answer is visible to everyone watching the thread.

**"What stops a node from lying about the RPC result?"**
```
Nothing stops them from trying. The proof is Ed25519 signed — you can verify the signature is genuine. What the consensus layer catches is a node that returns a different result than the other verifiers. Consensus requires 2+ matching proofs by default. One bad actor can't settle a transaction alone. They can only fail to contribute.
```

**"How is this different from a caching RPC?"**
```
A caching RPC is still a centralized endpoint. If it goes down, every client using it goes down. Fernlink distributes the verification work to the devices already in the field. There's no single server to target. The mesh is the redundancy.
```

**"Why not just run more RPC nodes?"**
```
More RPC nodes help with capacity. They don't help with latency for nearby devices, with offline scenarios, or with the cost structure for high-volume mobile apps. The mesh addresses a different layer of the problem. The two are complementary.
```

**"Is the BLE range enough for real deployments?"**
```
BLE range is 10–100m depending on environment. For dense scenarios — markets, events, transit hubs — that's plenty. For wider geographic spread, the gossip layer relays proofs across multiple hops. A proof verified by one device can reach another 3–4 hops away without either device making a direct connection.
```

---

## QUICK STANDALONE TWEETS (use when nothing specific is shipping)

```
A Solana dApp that works offline is not a compromise.
It's what financial infrastructure looks like outside of reliable internet coverage.
```

---

```
The BLE layer and the WiFi Direct layer and the NFC layer are all active simultaneously.
TransportManager routes each proof to the fastest available path.
The app never has to pick.
```

---

```
We run in CI without physical hardware.

FernlinkSimulator spins up N in-process BLE peers, routes requests through the mesh, and verifies that consensus is reached — all in Vitest, no Bluetooth radio required.

8 tests. All passing.
```

---

```
The whitepaper is not marketing.

It's 40+ pages of protocol design, security model, transport layer specs, and consensus rules. Written before a single line of code shipped. Every implementation decision traces back to it.

fernlink.vercel.app
```

---

```
"How do you prevent the mesh from being used to propagate false confirmations?"

Multi-proof consensus. Ed25519 signatures. UUID dedup with TTL.

And: the Solana ledger is the ground truth. A peer can't forge a confirmation for a transaction that didn't happen — the signature check catches it immediately.
```

---

```
Store-and-forward means offline is not a failure mode.

If no peers are in range when you call verifyTransaction(), the request queues locally. The moment a peer appears — BLE, WiFi, NFC — the queue drains. Proofs come back. Consensus happens.

No dropped verifications. No silent failures.
```
