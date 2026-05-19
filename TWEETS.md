# Fernlink — Tweet Content

The rule for every tweet: if you can imagine another project posting the same words,
delete it and start over. Every tweet must be specific to what we actually built,
what we actually hit, or what we actually believe.

---

## WEEK 1 — Arrival

---

### DAY 1 — Launch (pin this)

**Hook tweet**
```
Solana's verification layer is three companies.

Not three protocols. Three companies — with SLAs, rate limits, and engineering teams that go home at night.

Every wallet. Every dApp. Every POS terminal. All of them dependent on the same small set of servers to confirm whether a transaction happened.

We built a mesh to route around it. Thread. 🧵
```

**2/**
```
The way verification works today:

Device needs to know if a transaction confirmed.
Device calls an RPC endpoint.
RPC endpoint calls the Solana validator network.
RPC endpoint responds.

Now imagine 10,000 devices at a conference asking the same question about the same set of transactions, all hitting the same endpoint. That's not a scaling problem. That's a design problem.
```

**3/**
```
Fernlink routes verification through the devices already in the room.

One phone hits the RPC. Signs the result with its Ed25519 key. Broadcasts the proof over BLE.

Every nearby device that receives that proof skips the call entirely.

The RPC still exists. It just serves one request instead of ten thousand.
```

**4/**
```
The security property that makes this work:

A peer can't lie about what the RPC returned.

The proof is Ed25519 signed by the verifying node. Anyone can check the signature. And consensus requires 2+ independent verifiers to agree before a result is accepted — one compromised peer can't settle a transaction alone.
```

**5/**
```
Three transports. Each solves a different problem.

BLE — works between any two devices, across Android and iOS, no setup.
WiFi Direct / Multipeer Connectivity — 10–40 Mbps when you need to move data fast.
NFC — tap two devices together, connection established in 200ms, no scan cycle.

All three run simultaneously. The fastest available path wins.
```

**6/**
```
Four platforms. One wire format.

Android (Kotlin + Rust core via JNI)
iOS (Swift + CryptoKit)
TypeScript (Node.js + browser)
Rust desktop (BLE + WiFi simultaneously)

An Android device verifies a proof signed by an iPhone. The signature check passes.
No translation layer, no format negotiation. The protocol handles it.
```

**7/**
```
Open source. Apache 2.0.

No VC round. No presale. No token yet. Just the protocol.

Run the devnet demo — three simulated peers, a real SOL transfer, signed proofs, consensus — with no hardware:

$ npx fernlink-demo

Whitepaper and source at fernlink.vercel.app
```

---

### DAY 3 — Demo (6pm UTC)

```
$ npx fernlink-demo

Three simulated peers. Real devnet transaction. Verification request routed through the mesh. Signed proofs. Consensus result. Printed to your terminal.

No BLE hardware. No setup. No account.

[screen recording]
```

---

### DAY 5 — The real take (9am UTC)

```
The Solana RPC market looks competitive.

It isn't.

When a major provider has an incident, every application using them degrades at exactly the same moment. The ecosystem has the aesthetic of redundancy — multiple providers, multiple endpoints — without the substance of it.

The correct fix isn't a better RPC provider. It's not treating confirmation as a problem each device must solve alone.
```

---

### DAY 7 — One week (6pm UTC)

```
One week open source.

[X] stars. [Y] forks. [Z] unique clones.

The repo has 7 Rust unit tests, a TypeScript SDK with full coverage, 6 instrumented Android JNI tests, and a BLE simulator that runs in CI with no physical hardware.

The number that matters most isn't any of those.
It's how many people ran npx fernlink-demo and saw the proofs come back.
```

---

## WEEK 2 — Technical credibility

---

### DAY 9 — BLE thread (9am UTC)

**1/**
```
We spent three days debugging why BLE notifications were disappearing on mid-range Android devices.

The ATT MTU negotiated fine. The code looked right. Data just wasn't arriving.

Here's what was actually happening — and what it taught us about building reliable BLE infrastructure.

Thread. 🧵
```

**2/**
```
BLE has two ways to push data to a subscribed device: NOTIFY and INDICATE.

NOTIFY: the server sends the packet and moves on. Whether it arrived is your problem.

INDICATE: the client sends a confirmation back before the server can send the next packet.

We started with NOTIFY. That was the mistake.
```

**3/**
```
The firmware on cheaper BLE chips has an undocumented limit on back-to-back notification payload size.

Modern Pixel hardware negotiates an ATT MTU of 517 bytes — 514 bytes of usable payload. The firmware accepts it. Then quietly drops packets above a certain size when they arrive in rapid succession.

No error. No callback. The data just disappears.
```

**4/**
```
Switching to INDICATE fixed it.

INDICATE is slower — there's a round-trip confirmation before each fragment. But the ATT layer guarantees delivery. Fragment N is confirmed before fragment N+1 is sent. Silent drops become impossible.

We also capped fragment size at 185 bytes regardless of negotiated MTU. Small, boring, reliable.
```

**5/**
```
Then iOS threw a different problem at us.

iOS rotates the BLE MAC address of each peripheral roughly every 15 minutes, to prevent tracking. From the Android server's perspective, a subscribed device vanishes. The old address stays in the subscriber list. Notifications to it hang forever.

We detect it with a 2-second timeout per fragment. No callback in 2 seconds: the subscriber is stale, evict it.
```

**6/**
```
The fragmentation header is two bytes: [index, total].

That's the whole scheme. INDICATE provides delivery. The reassembler provides ordering. Every fragment arrives confirmed before the next one is queued.

The same two bytes run identically in Kotlin, Swift, TypeScript, and Rust.
Simple things took a long time to get right.
```

---

### DAY 11 — Cross-platform wire format (6pm UTC)

```
The hardest part of a cross-platform protocol isn't the cryptography.

It's getting four runtimes to agree on byte order.

The Fernlink signable bytes:
tx signature (UTF-8) + status byte (u8) + slot (u64 LE) + blockTime (u64 LE) + errorCode (u16 LE) + verifier pubkey (32 bytes)

Change one byte width on one platform — Swift to u32 instead of u64 for slot — and cross-platform verification fails silently. The signature is valid. The bytes are wrong. You have no idea until you test an Android verifying an iOS proof.

We keep them in sync with cross-platform test vectors. Known input. Expected output. All four runtimes verify against the same vector set.
```

---

### DAY 13 — Real take (9am UTC)

```
Financial access is a connectivity problem as much as a legal one.

A Solana wallet that requires a live RPC call for every confirmation is designed for users with reliable internet. That's not the market that needs financial infrastructure most.

The mesh changes the assumption. If someone nearby already verified a transaction, you receive their signed proof without touching the internet. The verification is ambient. It follows the density of devices, not the density of cell towers.
```

---

### DAY 14 — Bug story (6pm UTC)

```
We shipped a bug that silently dropped every verification request on freshly connected iOS peers.

The logic: if connectedPeerCount > 0, broadcast the request. Sensible.

The problem: iOS reports a peripheral as "discovered" the moment didDiscover fires. Not after connect. Not after service discovery. Not after the CCC descriptor write that actually enables notifications. Just — discovered.

peripherals.count was 1. requestChars was empty. We wrote to a characteristic that didn't exist yet. The write returned no error. Nothing happened.

Fix: count requestChars.count. Only peers with a confirmed request characteristic count as connected.

Two days. One map. Shipped.
```

---

## WEEK 3 — Mobile depth

---

### DAY 15 — Android BLE service thread (9am UTC)

**1/**
```
Running BLE as a persistent Android background service is a fundamentally different problem from connecting from an Activity.

The OS will kill a background process doing BLE work unless you explicitly tell it not to. Here's how FernlinkBleService stays alive and why the foreground service model is the only correct approach.

Thread. 🧵
```

**2/**
```
Android 8 introduced background execution limits. Any app doing network or sensor work in the background without a foreground service gets killed during power-save events.

BLE advertising and scanning — both of which Fernlink runs continuously — qualify. The fix is non-optional: call startForeground() in onCreate() with a notification the user can see.

The notification isn't UX. It's the operating system requiring you to disclose what you're doing.
```

**3/**
```
The GATT profile has three characteristics.

REQUEST — centrals write verification requests here.
PROOF — the server notifies here with signed proofs. Uses INDICATE.
STATUS — readable JSON: version, supported commitment levels, supported compression codecs.

STATUS is how capability negotiation works. A peer reads it before sending its first request. If it sees "lz4" in the compression list, it compresses. If not, it doesn't. No separate handshake.
```

**4/**
```
Advertisement is split across two BLE packets: primary (31 bytes) and scan response (31 bytes).

Primary: Fernlink service UUID. Scanners filtering by UUID find us.
Scan response: 8-byte pubkey fingerprint as manufacturer-specific data.

Active scanners receive both. The fingerprint is why we can recognize a peer across MAC rotations — same fingerprint, different address, same device. Skip the reconnect.
```

**5/**
```
On disconnect, we hold the fingerprint reservation for 10 seconds before allowing reconnect.

Without that delay: disconnect fires, reservation clears, the scan callback fires again within milliseconds, connectGatt() is called immediately. If the connection fails again — same loop. The Android GATT interface pool exhausts itself in under a minute.

10 seconds is enough for the stack to settle. Entirely undocumented. Found empirically.
```

---

### DAY 17 — iOS thread (6pm UTC)

**1/**
```
Five things CoreBluetooth does differently from Android BLE.

Two of them are documented. Three of them we found by shipping broken code.

Thread. 🧵
```

**2/**
```
Android 13 deprecated one onCharacteristicChanged override and added a new one that passes the value directly as a parameter.

If you implement only the new one: pre-API-33 devices never deliver notifications.
If you implement only the old one: API 33+ devices pass a stale or null byte array.

Both overrides must exist in the same class. The platform calls whichever is appropriate for the OS version. The Kotlin compiler will not warn you.
```

**3/**
```
allowDuplicates: true.

Without it, iOS delivers exactly one scan result per peripheral. If the first connection attempt fails, that device is never rediscovered. It sits in the peripheral map as "connecting" indefinitely.

One flag. We missed it for a week. Every failed connection on iOS was a permanent loss.
```

**4/**
```
peripherals.count is not connectedPeerCount.

iOS increments peripherals.count when didDiscover fires. The connect → service discovery → CCC write sequence takes another 300–800ms. During that window, broadcastRequest() will write to a characteristic that doesn't exist.

The write returns no error. The proof request goes nowhere.

requestChars.count is the correct count. Only peers with a confirmed CHAR_REQUEST handle are actually ready.
```

**5/**
```
iOS cannot emit NFC. No Host Card Emulation, no workaround.

The bootstrap is one-directional: Android emits an NDEF record via HCE, iPhone reads it with CoreNFC, calls connectDirect(), skips the scan cycle.

iPhone-to-iPhone doesn't need NFC. Multipeer Connectivity finds the peer automatically and negotiates the session. For Apple-to-Apple, the problem is already solved.
```

---

### DAY 19 — NFC (9am UTC)

```
NFC is not a transport.

We tried to think of it as one early on. Small payloads, terrible range, no background operation on iOS. Completely wrong mental model.

NFC is a bootstrap. Its job is to exchange enough information in a single tap that BLE can take over without a scan cycle.

The NDEF record carries three things: Ed25519 public key, Fernlink service UUID, BLE MAC address. Under a hundred bytes. Transfers in the field interaction itself, before the user has pulled the devices apart.

The receiving device calls connectDirect() with the MAC address it just received. No scan. No discovery timeout. Connection in ~200ms.

That's the whole protocol. It exists so the slow part never happens.
```

---

### DAY 21 — Grant tweet (9am UTC)

```
The Solana Foundation rejected our grant application in February.

We had a website and a whitepaper.

Since then: Android SDK, iOS SDK, TypeScript SDK, Rust core, BLE mesh, WiFi Direct, Multipeer Connectivity, NFC bootstrap, LZ4 and zstd wire compression, cross-transport relay, store-and-forward, CI for all four platforms, two technical blog posts.

Applied again last week.
```

---

## WEEK 4 — Proof of work

---

### DAY 22 — Blog post (9am UTC)

```
New post on the blog.

How BLE, WiFi Direct, and NFC work together under a single API — and every production failure we hit along the way.

The MTU ceiling that silently drops packets on certain chipsets.
The 2-byte fragmentation header and why it's all you need.
The WiFi Direct deadlock that happens when both devices set groupOwnerIntent 0.
The iOS peripheral count bug.
The NFC tap-to-pair protocol.

Written from the code, not from the documentation.

fernlink.vercel.app/blog/multi-transport
```

---

### DAY 23 — WiFi Direct (6pm UTC)

```
WiFi Direct forms a peer-to-peer network between Android devices with no access point. Roughly 10–40 Mbps, versus BLE's 1–3 Mbps. The right transport when you need throughput.

The Group Owner problem almost broke us.

One device becomes the GO and runs the IP layer. The other connects as client. The framework lets you express a preference — a value from 0 to 15 — but if both devices express the same preference simultaneously, the result is non-deterministic. We hit a case where both devices waited for the other to start a TCP server. Neither did.

The fix came from thinking about it differently. Both devices already have something stable, pre-agreed, and unique: their Ed25519 public keys. The device with the lexicographically lower key becomes the client. The higher key becomes the Group Owner.

Both devices learn the peer's key from the DNS-SD TXT record before connecting. They make the same decision independently. No negotiation round-trip. No race condition. Zero deadlocks since.

The same rule runs on iOS with Multipeer Connectivity. One determinism principle, two platforms.
```

---

### DAY 24 — Integration ask (9am UTC)

```
If you're building a Solana mobile app, a POS product, or anything that needs to work in low-connectivity environments:

We want to talk.

Not selling anything. Looking for real integration scenarios to find the edge cases that simulated testing won't catch. Full SDK access, full engineering support, no fees.

DMs open. GitHub issues work too.
```

---

### DAY 26 — Store-and-forward (6pm UTC)

```
The edge case nobody thinks about until it breaks in production:

Your user calls verifyTransaction() before any peers have connected.

The scan is still running. The WiFi Direct group hasn't formed. There are no peers. What happens to the request?

Old behavior: it was dropped. The client fell back to direct RPC.

New behavior: the request queues in a ConcurrentLinkedQueue, capped at 64 entries. The moment a peer connects and its CCC subscription is confirmed, the queue drains. The peer verifies. The proof comes back. Consensus happens.

No internet required on the originating device. The peer does the RPC work.

This is the pattern that makes Fernlink useful in markets with intermittent connectivity, not just conference demos.
```

---

### DAY 28 — Month 1 (9am UTC)

```
Month 1 in public.

[X] GitHub stars. [Y] devs ran the demo. [Z] integration conversations.

What we shipped this month is less interesting than what we learned:

Reliable BLE delivery requires INDICATE, not NOTIFY. The MTU your stack negotiates is not the MTU you should use. iOS peripheral count is wrong at the moment that matters. WiFi Direct needs a determinism rule or it deadlocks. NFC is a bootstrap protocol, not a transport. A 10-second fingerprint reservation cooldown is the difference between a stable BLE stack and an exhausted one.

None of that is in the documentation. All of it is now in the code.

Month 2: the performance post, first integrations, and the beginning of an honest public conversation about what $FERN needs to do.
```

---

## WEEKS 5–8 — Growth

---

### THREAD: mDNS and the LAN transport

**1/**
```
How do two Fernlink nodes on the same WiFi network find each other without a discovery server?

mDNS. The same mechanism your Mac uses to find printers, and AirPlay uses to find Apple TVs.

It's a solved problem. We use it as-is. Thread on what that looks like in practice. 🧵
```

**2/**
```
Each Fernlink LAN node advertises on _fernlink._tcp.local.

The TXT record carries two fields: the node's Ed25519 public key and the protocol version. Any peer that discovers this record knows who it's talking to before opening a TCP connection.

That's all the information needed to decide who connects and who listens.
```

**3/**
```
Same determinism rule as Android WiFi Direct.

Lower public key connects outbound. Higher public key listens on port 8765.

Both nodes learn the peer's key from the mDNS TXT record. Both make the same routing decision independently. No coin flip. No timing race.
```

**4/**
```
Once the TCP connection is live, the framing is three fields: 1-byte type tag, 4-byte big-endian length, payload.

Three type tags: REQUEST, PROOF, HELLO.

HELLO fires immediately after connect and carries the first 16 bytes of the local public key. It's how each side confirms identity before trusting anything else.
```

**5/**
```
The Rust desktop node runs BLE and TCP simultaneously.

A proof arriving over BLE from an Android device is relayed to TypeScript nodes on the same LAN over TCP. A request arriving over TCP is relayed back to BLE peers. Neither side knows which transport carried a given payload.

The cross-transport bridge is the part that makes the mesh feel like a mesh rather than a collection of point-to-point links.
```

---

### THREAD: UUID deduplication and why gossip needs TTL

**1/**
```
Without deduplication, gossip protocols turn into broadcast storms.

Node A sends a proof to B and C. B forwards to C. C forwards to B. Both forward back to A. The same 200-byte payload crosses every link in the mesh dozens of times.

Here's how Fernlink prevents that without a central coordinator. 🧵
```

**2/**
```
Every verification request carries a UUID.

When a node sees a UUID it has already processed, it drops the message immediately. No re-broadcast. No RPC call. No proof generation.

The node also adds its own request UUIDs to the seen cache immediately on broadcast — so its own echoes, returned by neighbors, are dropped before they're processed twice.
```

**3/**
```
TTL controls how far a request propagates.

Each hop decrements the TTL by 1. A request with TTL 0 is verified locally but not forwarded. A request with TTL 8 can cross 8 hops before it stops.

The originating device sets the TTL. Small mesh, low TTL. Large mesh or high-stakes transaction, higher TTL.
```

**4/**
```
Proof deduplication works differently — by verifier identity, not by UUID.

When a proof arrives, the router checks the verifier's public key against a seen set. If that identity has already contributed a proof to the current round, the new one is verified (the signature is checked) but not counted toward consensus.

One verifier. One vote. No matter how many transports it arrives on.
```

**5/**
```
This means a Sybil attack on the proof layer requires controlling independent keypairs.

Replaying the same proof from the same key does nothing — the verifier-key deduplication catches it. Submitting proofs from many keys is expensive to set up and easy to rate-limit at the application layer.

Simple deduplication, real security property.
```

---

### THREAD: Ed25519 across four runtimes

**1/**
```
The same Ed25519 keypair must produce the same signature on Rust, Kotlin, Swift, and TypeScript.

That sentence sounds obvious. Making it true in practice took longer than any other part of the protocol.

Thread on what actually goes wrong when you try to synchronize binary formats across language runtimes. 🧵
```

**2/**
```
Rust uses ed25519-dalek. This is the canonical implementation — fast, audited, widely used.

The Android SDK compiles fernlink-core to a native library via cargo-ndk. Kotlin calls it through JNI. The crypto never touches the JVM. The signatures are computed by the same Rust code running on the same hardware.
```

**3/**
```
iOS uses CryptoKit's Curve25519.Signing.

CryptoKit is Apple's native crypto framework. It's fast, it's correct, and it doesn't give you access to the internal state you'd need to verify against Rust's output by inspection.

You verify by test: same keypair, same message, check that CryptoKit and ed25519-dalek agree on the signature. They do. We confirmed this explicitly before shipping.
```

**4/**
```
TypeScript uses tweetnacl.

tweetnacl.sign.detached() maps directly to ed25519-dalek's sign(). Same key format, same message, same output.

The SDK runs in Node.js, in the browser, and in the devnet demo CLI. The same keypair works in all three environments. The BLE simulator uses it for proof generation in CI tests with no physical hardware.
```

**5/**
```
The trap is in the message format.

The signable bytes contain a u64 slot value. In Rust: u64, little-endian, 8 bytes. In TypeScript: we write it with a DataView and have to explicitly choose endianness. In Swift: UInt64, and we use withUnsafeBytes to get the little-endian representation.

One platform uses big-endian by mistake and the signature is invalid. The signature itself gives you no information about which field is wrong. You need test vectors.
```

**6/**
```
Test vectors are the only reliable synchronization mechanism for binary protocols across runtimes.

Known keypair. Known tx signature. Known slot, blockTime, errorCode. Expected Ed25519 output.

If any implementation drifts — a field reordered, a byte width wrong, an encoding decision — the vector fails immediately. The Rust core defines the vectors. Every other runtime is tested against them.

This is the thing we wish we had set up before we started, not after the first cross-platform verification failure.
```

---

### STANDALONE tweets for weeks 5–8

```
The BLE layer uses INDICATE.
The WiFi Direct layer uses TCP.
The Multipeer layer uses MCSession with .reliable delivery.

Three different delivery guarantees. One shared fragmentation format — two bytes, index and total — that works correctly on all three.

Design once for the weakest guarantee. The stronger ones give you the same correctness for free.
```

---

```
Something we didn't expect: the cross-transport relay is the most interesting part of the protocol.

A request arrives from an Android device over BLE. No WiFi Direct peers.
The BLE layer forwards it to a connected iOS peer via BLE.
The iOS peer has a Multipeer Connectivity session to another iPhone.
The proof comes back over MCF, relays through BLE, arrives at the Android device.

Four hops. Three transports. No single device coordinated any of it.
```

---

```
The store-and-forward drain fires on every new peer connection, not just the first.

If the first peer connects, fails to return a proof, and goes offline — then a second peer connects — the second drain retransmits the pending requests.

This is not duplicate detection at the request level. Each verifier independently queries the RPC and signs its own result. The originating device collects whatever proofs come back.
```

---

```
"Why not just use a caching RPC?"

A caching RPC is still a server you don't control.

When it's down, you're down. When it's rate-limiting, you're rate-limited. When it's deciding which transactions to cache, you're trusting that decision.

The mesh has no server. The peers are the infrastructure.
```

---

## WEEKS 9–12 — Ecosystem positioning

---

```
Every wallet currently confirms transactions the same way: make an RPC call.

It's worked fine at current scale. At the scale Solana is targeting — billions of transactions, billions of users — it becomes a structural bottleneck.

The mesh is infrastructure. It can sit under any wallet with a few lines of SDK integration and reduce their RPC load by 60–80% in high-density environments.

If you're building a wallet on Solana, we should talk.
```

---

```
Solana Mobile is the right hardware for what Fernlink does.

BLE, WiFi Direct, and NFC are all native on Saga and Chapter 2. The SDK is Kotlin. The foreground service runs while the app is active.

A dApp on Solana Mobile with Fernlink integrated gets mesh verification for free during any event, market, or gathering where multiple devices are in the same space.

@SolanaMobile
```

---

```
Fernlink and RPC providers solve different problems.

When no mesh peers are nearby, Fernlink falls back to direct RPC — same endpoint, same call. The mesh reduces load during high-density events. The direct fallback handles everything else.

Infrastructure that makes each other more resilient is better than infrastructure that competes.
```

---

```
We will submit to the Solana Foundation grant program again.

The first application had a website and a whitepaper.

This application has: an Android SDK, an iOS SDK, a TypeScript SDK, a Rust core, BLE mesh, WiFi Direct, Multipeer Connectivity, NFC bootstrap, wire compression, store-and-forward, full CI, two public blog posts, and a working devnet demo anyone can run in 30 seconds.

The code is the application.

@SolanaFndn
```

---

## WEEKS 13–16 — Pre-$FERN

---

### WEEK 13

```
Verification nodes do real work.

They advertise over BLE. They scan for peers. They make RPC calls. They sign proofs with their Ed25519 keys. They relay data across transports.

Right now they do all of this for free. Which means only developers running test setups do it at all.

The protocol can't scale on altruism. We're building the economic layer that changes that.
```

---

### WEEK 14

```
$FERN is a coordination mechanism, not a reward program.

A node stakes to enter the verifier set. Accurate proofs — ones that match the ledger and pass multi-proof consensus — build on-chain standing. Inaccurate or absent proofs reduce it.

Clients route requests to high-standing verifiers first. Low-standing verifiers get fewer requests. The protocol selects for honest behavior without a central authority making that call.

You can't buy standing directly. You earn it by being right, consistently, over time.
```

---

### WEEK 15

```
We are not launching a token to fund the protocol.

We are launching a token because the protocol is ready for one.

There is a difference. We take it seriously.

The distinction: if the token disappeared tomorrow, the mesh would keep working. The token adds economic incentive for nodes to participate honestly at scale. The mesh itself doesn't depend on it.
```

---

### WEEK 16

```
$FERN is coming.

Before it launches, you will have:
— A full public document explaining what the token does, how it distributes, and why the design is what it is
— A contract that has been reviewed before it touches mainnet
— A clear answer to every question about allocation, unlock schedule, and how to get it

No presale. No hidden VC round. No mystery.

The announcement thread drops next week.
```

---

## WEEKS 17–20 — Launch

---

**Launch hook**
```
$FERN is live.

Everything you need to know. Thread. 🧵
```

**2/**
```
Fernlink is a peer-to-peer verification mesh for Solana.

Devices in proximity share the work of confirming transactions over BLE, WiFi, and NFC. One device queries the RPC. The signed proof propagates. Nearby devices skip the call.

60–80% fewer RPC calls in a dense environment. Open source since May 2026. Apache 2.0.

Full spec: fernlink.vercel.app
```

**3/**
```
$FERN solves the verifier incentive problem.

Running a Fernlink node is real work: RPC calls, proof signing, staying online.

Without an economic reason to do it, only developers bother. With $FERN, any device that runs the client and returns accurate proofs earns standing. High standing means more routing. More routing means more rewards.

The economics follow the protocol. The protocol doesn't follow the economics.
```

**4/**
```
Standing is earned, not bought.

A node stakes $FERN to enter the verifier set. Every accurate proof — confirmed by multi-proof consensus against the Solana ledger — builds standing. Inaccurate proofs reduce it.

You cannot purchase standing directly. You accumulate it by being correct, consistently, at real scale.
```

**5/**
```
Distribution:

[X]% community — airdrop to early mesh participants and GitHub contributors
[X]% verifier incentives — released over [Y] years as protocol rewards
[X]% development fund — audits, infrastructure, ongoing grants
[X]% team — locked [Y] years, linear vesting over [Z] years

Full table and unlock schedule: [link]
```

**6/**
```
How to get $FERN:

[Specific instructions — airdrop claim, DEX listing, etc.]

Contract: [address]
```

**7/**
```
The Solana Foundation rejected our first grant application.

We had a website and a whitepaper.

We built six SDKs, three transports, NFC bootstrapping, wire compression, cross-transport relay, store-and-forward, and full CI across four platforms without it.

$FERN is the economic layer the protocol was always going to need. It just took longer to earn the right to build it.
```

**8/**
```
What's next after launch:

Verifier reputation on-chain, fully live
Peer routing weighted by standing
Account and program state queries through the mesh
Transaction broadcasting via mesh relay — submit from a device with no internet
Offline payment channel design

The token launch is not the product. The protocol is the product.
```

**9/**
```
Security:

Every proof is Ed25519 signed. Consensus requires 2+ independent verifiers. UUID deduplication prevents replay attacks. No private keys traverse the mesh. The Rust core is the reference implementation and is fully open source.

Read the whitepaper before trusting this with real funds.

fernlink.vercel.app
```

**10/**
```
$FERN is live.

GitHub: github.com/OnoseAnthony/fernlink-network
Website: fernlink.vercel.app
Telegram: t.me/Stranger3145
Contract: [address]

Build something. Run a node. Read the whitepaper.
```

---

## ALWAYS-ON — Standalone tweets for quiet days

```
The thing about running four transports simultaneously:

BLE finds a peer in 3 seconds. WiFi Direct finds the same peer in 6. NFC skips both and connects in 200ms via tap.

TransportManager doesn't pick one. All three run. The first confirmed connection wins. The others quietly keep looking.
```

---

```
The Rust core has no async runtime.

The rpc feature — which pulls in reqwest — is disabled for the Android FFI build. No OpenSSL, no Tokio, no SSL handshake. The JNI exports are synchronous: generateKeypair, signProof, verifyProof, evaluateProofs.

The Kotlin layer handles all async. The Rust layer handles all crypto. Clean separation, no FFI complexity leaking upward.
```

---

```
A proof that arrives over WiFi Direct and a proof that arrives over BLE are deduplicated by verifier public key.

The second one is verified — the Ed25519 signature check runs — but not counted toward consensus if the key has already contributed to the current round.

One verifier, one vote, regardless of how many paths that vote traveled to reach you.
```

---

```
The whitepaper was written before the first line of code shipped.

Not because that's good practice — though it is — but because building a cross-platform binary protocol without a spec is how you end up with four implementations that mostly agree.

Mostly is not acceptable for a cryptographic protocol.
```

---

```
We run BLE hardware tests in CI with no BLE hardware.

FernlinkSimulator creates N in-process peer instances, routes requests through the mesh, and verifies that consensus is reached — all in Vitest.

8 tests. Zero radios. Every PR.

Shipping without a hardware simulator means shipping without a safety net.
```

---

```
The 2-byte fragmentation header — [index, total] — is the same across Kotlin, Swift, TypeScript, and Rust.

We didn't design a complex framing layer and then simplify it. We started with the minimum and added nothing.

When you have INDICATE guaranteeing delivery and a reassembler handling ordering, two bytes is genuinely all you need.
```
