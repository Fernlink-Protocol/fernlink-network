# Fernlink Technical Whitepaper

## Abstract

Fernlink is a decentralized peer-to-peer protocol for distributing Solana transaction verification proofs across local networks using Bluetooth Low Energy (BLE), Wi-Fi/TCP, and NFC. Inspired by ferns that spread through both airborne spores and underground rhizomes, Fernlink enables nearby devices to collaboratively verify transaction status without relying on centralized RPC infrastructure. When a user submits a transaction to Solana, peers with better connectivity retrieve the transaction status and propagate cryptographically signed Ed25519 proofs back through the mesh network. Proofs are transmitted with a negotiable compression codec (LZ4 or zstd); the default is uncompressed for cross-platform compatibility. Devices that cannot immediately reach a peer queue requests locally and drain the queue automatically on reconnection. This approach reduces RPC load, enables verification in low-bandwidth and offline environments, and creates a resilient public good for the Solana ecosystem.

## Table of Contents

- [1. Introduction](#1-introduction)
- [2. Problem Statement](#2-problem-statement)
- [3. System Overview](#3-system-overview)
- [4. Peer-to-Peer Network Architecture](#4-peer-to-peer-network-architecture)
- [5. Proof Distribution Protocol](#5-proof-distribution-protocol)
- [6. Wire Compression](#6-wire-compression)
- [7. Verification and Trust Model](#7-verification-and-trust-model)
- [8. Store-and-Forward](#8-store-and-forward)
- [9. Transport Layer](#9-transport-layer)
- [10. Security Considerations](#10-security-considerations)
- [11. SDK Architecture](#11-sdk-architecture)
- [12. Performance Characteristics](#12-performance-characteristics)
- [13. Use Cases](#13-use-cases)
- [14. Future Extensions](#14-future-extensions)
- [15. Conclusion](#15-conclusion)

---

## 1. Introduction

The Solana blockchain processes transactions at high throughput, but verifying transaction status remains tightly coupled to centralized RPC infrastructure. Users must repeatedly query RPC endpoints to confirm whether their transactions succeeded, creating several problems:

- Mobile wallets consume expensive RPC credits checking transaction status
- Network congestion makes confirmation delays unpredictable
- Users in low-bandwidth regions cannot reliably verify transactions
- Free public RPCs are rate-limited and unreliable under load
- No offline fallback exists when RPC providers experience downtime

Fernlink addresses these challenges by enabling devices to help each other verify transaction status through local peer-to-peer networks. The name draws from ferns, which propagate through dual mechanisms: airborne spores for long-distance dispersal and underground rhizomes for local network growth. Fernlink similarly uses wireless broadcasts (BLE, Wi-Fi) for aerial propagation and peer-to-peer connections for resilient local mesh networking.

---

## 2. Problem Statement

### 2.1 Current Verification Model

When a user submits a Solana transaction, they must repeatedly poll RPC endpoints to check whether the transaction was confirmed. This polling typically runs every 500ms–1s, creating significant load on RPC infrastructure. For mobile applications with thousands of active users, this results in millions of redundant RPC calls.

### 2.2 Cost and Reliability Issues

RPC access has become increasingly expensive:

- Premium RPC providers charge per request or implement strict rate limits
- Mobile apps must choose between user experience and infrastructure costs
- Free alternatives throttle aggressively during peak usage
- Geographic concentration of RPC nodes creates latency for global users

### 2.3 The Verification Gap

The current model creates a verification gap: users with poor connectivity cannot reliably confirm transactions, even when nearby devices have excellent connections. This gap is critical during network congestion, when verification is most important but also most difficult.

---

## 3. System Overview

Fernlink operates through three phases:

### 3.1 Request Phase

After submitting a transaction to Solana, the originating device broadcasts a verification request containing the transaction signature to nearby peers via BLE, Wi-Fi/TCP, or NFC. The request is compact and includes the desired commitment level and timeout parameters.

### 3.2 Verification Phase

Peers receiving the request attempt to verify the transaction status by querying their configured RPC endpoints. Devices with active internet connections and available RPC resources become verification nodes. Upon verification, each node produces a cryptographically signed proof containing the transaction signature, confirmation status, slot number, block time, and any error encountered.

### 3.3 Propagation Phase

Signed proofs propagate back through the mesh using a gossip protocol with TTL and UUID deduplication. Each device that receives a proof validates the signature, caches it, and forwards it to other peers. The originating device receives the proof even if its own internet connection is poor or unavailable. Two or more matching proofs from independent verifiers settle consensus.

### 3.4 Network Flow

```
Device A (poor connection)
  │  broadcast VerificationRequest over BLE / TCP / NFC
  ▼
Device B (good connection)
  │  RPC query → Solana → confirmation status
  │  sign proof with Ed25519 keypair
  │  broadcast VerificationProof back into mesh
  ▼
Device A receives signed proof → consensus → confirmed
```

---

## 4. Peer-to-Peer Network Architecture

### 4.1 Transport Overview

Fernlink implements a transport-agnostic architecture supporting multiple physical layers:

| Transport | Range | Throughput | Primary Use |
|---|---|---|---|
| BLE 5.0 | ~30–50 m | 1–2 Mbps | Background mesh, always-on |
| Wi-Fi / TCP | LAN | 100+ Mbps | High-throughput, desktop, server |
| NFC | ~10 cm | 424 Kbps | Peer bootstrapping, sub-200ms pairing |

BLE is the primary transport due to its ubiquity and low power consumption. Wi-Fi/TCP provides higher throughput for LAN scenarios and desktop nodes. NFC is used exclusively for bootstrapping: physical contact pre-exchanges identifiers, reducing BLE discovery time from ~5 seconds to under 200ms.

### 4.2 Peer Discovery

**BLE:** Devices advertise Fernlink capabilities using a standardized 128-bit service UUID (`fern0000-…`). Characteristics:
- `REQUEST` — write-only, receives incoming verification requests
- `PROOF` — notify-enabled, pushes signed proofs to subscribers
- `STATUS` — read-only, advertises device capabilities and supported codecs

Devices act as both Central (scanning) and Peripheral (advertising) simultaneously, enabling true mesh topologies without designated coordinators.

**Wi-Fi / TCP:** Peers advertise via mDNS using the service type `_fernlink._tcp.local.` A deterministic connection rule (the device with the lexicographically lower public key initiates) prevents duplicate connections between the same two peers.

### 4.3 Network Topology

The mesh organizes into dynamic clusters:

- **Local Clusters** — devices within direct communication range
- **Bridge Nodes** — devices connecting multiple clusters
- **Gateway Nodes** — devices with active internet connectivity
- **Verification Nodes** — gateway nodes with available RPC resources

---

## 5. Proof Distribution Protocol

### 5.1 Wire Message Envelope

All messages on all transports share a common envelope:

| Field | Size | Description |
|---|---|---|
| Codec | 1 byte | Compression codec (see §6) |
| Version | 1 byte | Protocol version |
| Message Type | 1 byte | `0x01` REQUEST, `0x02` PROOF |
| Message ID | 16 bytes | UUID v4 for gossip deduplication |
| Timestamp | 8 bytes | Unix timestamp (milliseconds, LE) |
| TTL | 1 byte | Hop count; default 8, decrements per hop |
| Payload | Variable | Request or Proof fields (see below) |

### 5.2 VerificationRequest Payload

| Field | Size | Description |
|---|---|---|
| Transaction Signature | 64 bytes | Base58 string, UTF-8 encoded |
| Commitment Level | 1 byte | `0x00` processed, `0x01` confirmed, `0x02` finalized |
| Timeout | 2 bytes | Milliseconds (LE) |
| Originator Public Key | 32 bytes | Ed25519 public key |

### 5.3 VerificationProof Payload

| Field | Size | Description |
|---|---|---|
| Transaction Signature | 64 bytes | Mirrors request signature |
| Status | 1 byte | `0x00` confirmed, `0x01` failed, `0x02` unknown |
| Slot | 8 bytes | Confirmation slot (u64 LE) |
| Block Time | 8 bytes | Unix timestamp (u64 LE) |
| Error Code | 2 bytes | Non-zero on failure (u16 LE) |
| Verifier Public Key | 32 bytes | Ed25519 public key of the verifier |
| Signature | 64 bytes | Ed25519 signature over the signable bytes (see §5.4) |

### 5.4 Signable Bytes

The Ed25519 signature covers a deterministic concatenation of proof fields. The canonical encoding is:

```
signable = UTF8(txSignature)          // variable length
         ‖ status_byte                // 1 byte
         ‖ slot as u64 LE             // 8 bytes
         ‖ blockTime as u64 LE        // 8 bytes
         ‖ errorCode as u16 LE        // 2 bytes
         ‖ verifierPublicKey          // 32 bytes
```

The transaction signature is encoded as UTF-8 (not base58-decoded) because Solana signatures are ASCII-safe base58 strings and this encoding is consistent across Rust, TypeScript, Kotlin, and Swift.

### 5.5 Gossip Protocol

- Each device maintains a UUID-keyed seen-message cache with TTL eviction
- Messages are forwarded to all connected peers except the sender
- TTL decrements on each hop; messages with TTL = 0 are not forwarded
- Duplicate message IDs are silently dropped
- BLE fragmentation uses a 2-byte `[chunk_index, total_chunks]` header per MTU-sized frame; reassembly is performed before gossip forwarding

---

## 6. Wire Compression

All Fernlink transports support negotiable payload compression as of Protocol v2. Compression is applied to the message payload after the outer envelope codec byte.

### 6.1 Codec Byte

The first byte of every wire message is the codec identifier:

| Value | Codec | Description |
|---|---|---|
| `0x00` | None | Uncompressed; Protocol v1 compatible |
| `0x01` | LZ4 | LZ4 block format with 4-byte LE original size prefix |
| `0x02` | zstd | zstd frame format |
| `0x7B` (`{`) | Legacy | Unframed JSON; detected for backwards compatibility |

### 6.2 Codec Negotiation

Peers advertise supported codecs in the BLE STATUS characteristic and in TCP handshake metadata. The sending peer selects the highest-throughput codec mutually supported. If no negotiation has occurred, senders default to `0x00` (None / uncompressed). Receivers that do not recognise a codec byte fall back to treating the payload as uncompressed.

### 6.3 Backwards Compatibility

Protocol v2 is fully backwards-compatible with Protocol v1 (uncompressed) peers. A v1 peer sends messages starting with `{` (`0x7B`), which v2 receivers detect and route to the uncompressed path. A v2 peer receiving a message from an unknown peer will attempt to decode it as uncompressed if the codec byte is unrecognised.

### 6.4 LZ4 Block Format

LZ4-compressed payloads prepend a 4-byte little-endian original length:

```
[ original_len: u32 LE ] [ lz4_block_data ]
```

This format is used by Rust (`lz4_flex`) and TypeScript (`lz4js`). **Note:** Apple's `Compression.framework` (`COMPRESSION_LZ4`) produces a proprietary streaming format that is not compatible with this block layout. Android uses the Rust FFI (`lz4_flex`) and is therefore compatible with the TypeScript peer. Cross-platform LZ4 between Apple and non-Apple implementations is not supported; for iOS↔Android deployments use `0x00` (None) or `0x02` (zstd/LZFSE) instead.

---

## 7. Verification and Trust Model

### 7.1 Proof Authenticity

Every verification proof is signed by the verifying device using Ed25519. The signature covers the full set of proof fields per §5.4. Recipients reject proofs with invalid signatures before caching or forwarding.

### 7.2 Multi-Proof Consensus

When multiple proofs arrive for the same transaction signature, the receiving device applies stateless consensus rules:

- **Agreement** — if 2 or more proofs match on status and slot, accept the result immediately
- **Disagreement** — if proofs conflict, wait for additional proofs or fall back to direct RPC
- **Finality preference** — a `finalized` proof supersedes a `confirmed` proof for the same transaction
- **Distinct signers** — consensus requires proofs from distinct verifier public keys; multiple proofs from the same verifier count as one

### 7.3 RPC Fallback

If the mesh produces no consensus within the configured timeout (`timeoutMs`), the client falls back to a direct RPC query against its configured endpoint. Mesh verification is an optimisation, not a replacement.

---

## 8. Store-and-Forward

When no peers are connected at the time a verification request is issued, the request is not dropped. Instead it is placed in a bounded queue (`ProofStore`) and retried as peers become available.

- **Queue capacity** — 64 pending requests (FIFO; oldest request is evicted when the queue is full)
- **Drain trigger** — the queue is drained immediately when a peer connection is established; there is no polling interval
- **Persistence** — the queue is in-memory; it does not survive process restart
- **Deduplication** — requests already in-flight (UUID seen by gossip cache) are not re-queued

This ensures that users in intermittently connected environments do not lose verification requests during brief disconnections.

---

## 9. Transport Layer

### 9.1 BLE Transport

**GATT profile:**
- Service UUID: `fern0000-0000-0000-0000-000000000000` (128-bit)
- `REQUEST` characteristic (`fern0001-…`) — write-without-response
- `PROOF` characteristic (`fern0002-…`) — notify
- `STATUS` characteristic (`fern0003-…`) — read

**Fragmentation:** BLE MTU is typically 20–512 bytes. Fernlink fragments messages using a 2-byte header `[chunk_index, total_chunks]` prepended to each frame. The receiver reassembles chunks before processing.

**Android:** Native Kotlin foreground service (`FernlinkBleService`) managing `GattServerManager` (peripheral role) and `GattClientManager` (central role) simultaneously. Cryptographic operations are performed via JNI calls to the Rust core (`fernlink-core-ffi`).

**iOS:** Swift implementation using `CoreBluetooth` framework for both `CBPeripheralManager` and `CBCentralManager` roles.

**Desktop / Node.js:** TypeScript implementation using `bleno` (peripheral) and `noble` (central). A `FernlinkSimulator` provides an in-process peer for testing without hardware.

**Desktop / Rust:** `btleplug` on macOS/Windows, `bluer` on Linux.

### 9.2 Wi-Fi / TCP Transport

All TCP transports use a length-prefixed framing protocol:

```
[ payload_len: u32 BE ] [ type_tag: u8 ] [ payload ]
```

Type tags: `0x01` REQUEST, `0x02` PROOF.

**Peer discovery:** mDNS service type `_fernlink._tcp.local.`. Peers listen on an ephemeral TCP port advertised in the mDNS TXT record.

**Connection deduplication:** The device with the lexicographically lower Ed25519 public key (hex-encoded) always initiates the TCP connection. This prevents both devices from opening duplicate connections to each other simultaneously.

**Android Wi-Fi Direct:** Uses Android's `WifiP2pManager` API for peer discovery and group formation, then a TCP socket for the Fernlink framing layer.

**iOS Multipeer Connectivity:** Uses Apple's `MultipeerConnectivity` framework (`MCSession`, `MCNearbyServiceAdvertiser`, `MCNearbyServiceBrowser`) for automatic peer discovery and data transfer.

**TypeScript / Node.js:** `net.createServer` / `net.Socket` with the `bonjour-service` library for mDNS.

**Rust desktop:** `tokio::net::TcpListener` / `TcpStream` with `mdns-sd` for service discovery.

### 9.3 NFC Transport (Bootstrapping Only)

NFC is used exclusively to accelerate BLE peer discovery. Physical contact exchanges the peer's Ed25519 public key and BLE advertisement name. This reduces BLE discovery from ~5 seconds to under 200ms.

**Android:** NDEF tag writing/reading via Android's `NfcAdapter`.  
**iOS:** CoreNFC `NFCNDEFReaderSession` (read-only on iOS; write not available without entitlement).

NFC does not carry verification requests or proofs directly.

---

## 10. Security Considerations

### 10.1 Proof Forgery

Ed25519 signatures make proof forgery computationally infeasible. A malicious peer cannot produce a valid proof for a transaction status they did not verify without knowledge of the verifier's private key.

### 10.2 Sybil Attacks

A single attacker controlling many keypairs could attempt to flood consensus with false proofs. Mitigations:

- Consensus requires distinct verifier public keys (not just distinct proofs)
- RPC fallback provides ground truth if mesh consensus is absent or contradictory
- Future work: on-chain verifier reputation weighted by historical accuracy

### 10.3 Replay Attacks

Each message carries a UUID (Message ID) and a millisecond-precision timestamp. The gossip seen-cache rejects any message whose UUID has been seen within the TTL window. Proofs with timestamps outside a configurable window (default ±30 seconds) are rejected.

### 10.4 Denial of Service

- Rate limiting: max 10 verification requests per device per minute
- TTL bound: messages die after 8 hops regardless of mesh size
- Queue cap: `ProofStore` holds at most 64 pending requests
- Malformed messages are dropped without forwarding

### 10.5 Privacy

Transaction signatures are public on Solana and are therefore not sensitive. Optional transport-level encryption (e.g. Diffie-Hellman key exchange over NFC followed by AES-GCM on BLE) can conceal the identity of the requesting device, but is not required for the verification protocol to function correctly.

### 10.6 Trust Assumptions

Fernlink assumes an honest majority of verification nodes. A client that requires absolute certainty should always confirm the mesh result against direct RPC. The mesh is an optimisation layer, not a replacement for the Solana RPC trust model.

---

## 11. SDK Architecture

### 11.1 Rust Core (`fernlink-core`)

Published to [crates.io/crates/fernlink-core](https://crates.io/crates/fernlink-core).

| Module | Responsibility |
|---|---|
| `crypto.rs` | `Keypair` wrapper around `ed25519-dalek`; `sign_proof` / `verify_proof` |
| `message.rs` | Binary wire types: `VerificationRequest`, `VerificationProof`, `Header`, enums |
| `gossip.rs` | `SeenCache` — UUID deduplication with TTL eviction |
| `consensus.rs` | `evaluate()` — stateless multi-proof consensus (2+ distinct matching proofs) |
| `rpc.rs` | Blocking `getSignatureStatuses` JSON-RPC call via `reqwest` |

Feature flags: `rpc` (reqwest), `lz4` (lz4_flex), `zstd`. Default: all three enabled.

### 11.2 TypeScript SDK (`fernlink-sdk`)

Published to [npmjs.com/package/fernlink-sdk](https://www.npmjs.com/package/fernlink-sdk).

| Module | Responsibility |
|---|---|
| `types.ts` | Shared TypeScript interfaces matching Rust wire types |
| `crypto.ts` | Ed25519 via `tweetnacl`; `signProof` / `verifyProof` |
| `consensus.ts` | `evaluate()` — mirrors Rust consensus rules |
| `rpc.ts` | `getSignatureStatus()` — async fetch to Solana JSON-RPC |
| `peer.ts` | `SimulatedPeer` — in-process stand-in for a BLE peer (real RPC calls) |
| `client.ts` | `FernlinkClient` — public API; broadcasts to peers, collects proofs, runs consensus, falls back to RPC |

`WebBluetoothPeer` (also exported from `fernlink-sdk`) connects Chrome and Edge browsers directly to Android or iOS Fernlink nodes over BLE via the Web Bluetooth API — no native app or Node.js runtime required.

### 11.3 Android SDK (`packages/android`)

Gradle multi-module project: `fernlink-sdk` (library AAR) + `fernlink-demo-app`.

| Component | Description |
|---|---|
| `fernlink-core-ffi` | Rust cdylib — JNI exports for `generateKeypair`, `signProof`, `verifyProof`, `evaluateProofs`, `compress`, `decompress`. Prebuilt `.so` files for `arm64-v8a`, `armeabi-v7a`, `x86_64`. |
| `FernlinkJni.kt` | JNI bridge; loads `libfernlink_core_ffi.so` |
| `FernlinkClient.kt` | Public API; orchestrates BLE and Wi-Fi transports |
| `FernlinkBleService.kt` | Android foreground service managing BLE adapter lifecycle |
| `GattServerManager.kt` | Peripheral role: advertises GATT profile, handles REQUEST writes, notifies PROOF |
| `GattClientManager.kt` | Central role: scans, connects, subscribes to PROOF notifications |
| `WifiDirectTransport.kt` | Wi-Fi Direct peer discovery and TCP framing |
| `ProofStore.kt` | Store-and-forward queue (64 requests, drains on reconnect) |
| `WirePayload.kt` | Codec-byte encoding/decoding for all wire payloads |

### 11.4 iOS SDK (`packages/ios/Sources/FernlinkSDK`)

| Component | Description |
|---|---|
| `FernlinkClient.swift` | Public API; orchestrates all transports |
| `CentralManager.swift` | `CBCentralManager` — scans, connects, subscribes to PROOF notifications |
| `PeripheralManager.swift` | `CBPeripheralManager` — advertises GATT profile, handles REQUEST writes |
| `MultipeerTransport.swift` | `MCSession` / `MCNearbyServiceAdvertiser` / `MCNearbyServiceBrowser` |
| `NfcBootstrapHelper.swift` | CoreNFC NDEF read for BLE pairing bootstrap |
| `Compression.swift` | `encodeWirePayload` / `decodeWirePayload` using Apple's `Compression` framework |

### 11.5 Platform Support Matrix

| Platform | Status | Transport(s) | Crypto |
|---|---|---|---|
| Android (Kotlin) | Shipped | BLE + Wi-Fi Direct + NFC | Rust core via JNI |
| iOS (Swift) | Shipped | BLE + Multipeer Connectivity + NFC | CryptoKit Ed25519 |
| TypeScript / Node.js | Shipped | BLE (bleno/noble) + TCP/mDNS | tweetnacl |
| Browser (Chrome/Edge) | Shipped | BLE via Web Bluetooth API | tweetnacl |
| Rust desktop | Shipped | BLE (btleplug/bluer) + TCP/mDNS | ed25519-dalek |
| React Native | Planned | — | — |

### 11.6 Integration Example

```typescript
import { FernlinkClient } from "fernlink-sdk";
import { TransportManager } from "@fernlink/wifi";

const client = new FernlinkClient({
  rpcEndpoint: "https://api.mainnet-beta.solana.com",
  minProofs: 2,
});

// Discovers peers automatically via mDNS on the local network
const transport = new TransportManager(client, "https://api.mainnet-beta.solana.com");
await transport.start();

const result = await client.verifyTransaction(txSignature, {
  commitment: "confirmed",
  timeoutMs: 15_000,
});

console.log(result.status, result.slot, result.proofCount);
// "confirmed"  312847291  3
```

---

## 12. Performance Characteristics

### 12.1 Message Size

An uncompressed `VerificationProof` (without envelope) is approximately 187 bytes:
- 64 bytes transaction signature + 1 status + 8 slot + 8 block time + 2 error code + 32 public key + 64 Ed25519 signature + 8 bytes timestamp/TTL

With LZ4 compression, typical proof payloads compress to 140–160 bytes — a 15–25% reduction. For high-frequency DeFi workloads where many proofs share common prefix bytes (same transaction signature), compression ratios improve further.

### 12.2 Latency

- BLE peer discovery: ~5 seconds cold; ~200ms with NFC bootstrap
- BLE round-trip (request → proof): typically 800ms–2s depending on RPC latency
- Wi-Fi/TCP round-trip: typically 200–600ms on LAN
- NFC bootstrap → BLE connection: under 200ms

### 12.3 Gossip Convergence

With TTL = 8 and a mesh of N devices, a proof reaches all devices within ⌈log₂(N)⌉ hops in a well-connected mesh. In practice, for a cluster of 10–20 devices with BLE range overlap, convergence occurs within 1–3 hops.

---

## 13. Use Cases

### 13.1 Mobile Wallets in Crowded Venues

At high-attendance events (conferences, concerts, markets), many users submit transactions simultaneously, congesting public RPCs. Nearby devices in a Fernlink mesh share verification proofs, reducing per-device RPC calls to near zero.

### 13.2 Emerging Market Connectivity

Users in areas with intermittent or expensive internet access can use nearby devices with better connectivity as verification proxies. A single connected device in a local cluster can serve verification proofs to many peers.

### 13.3 Point-of-Sale

A merchant device or dedicated verification node maintains a persistent BLE/Wi-Fi Fernlink node. Customer wallets nearby receive proofs immediately upon payment confirmation without each customer device hitting RPC directly.

### 13.4 DeFi Operations

High-frequency DeFi users (arbitrage bots, liquidators) can deploy dedicated desktop Fernlink nodes over TCP/mDNS on a LAN, sharing proof verification across multiple trading accounts without multiplying RPC usage.

### 13.5 Offline-Tolerant Applications

Applications that must function during intermittent connectivity (IoT devices, field operations) benefit from store-and-forward queuing: transactions are submitted and verification requests are queued, resolved automatically when connectivity is restored.

---

## 14. Future Extensions

### 14.1 Transaction Broadcasting

Devices with no internet could sign a Solana transaction locally and relay it through the mesh to a connected node for submission. This would make the protocol bidirectional: currently Fernlink only verifies; broadcasting would also enable offline transaction submission.

### 14.2 Account and Program State Queries

Extending beyond transaction confirmation: devices query peers for account balances, token holdings, and program state. Peers with internet fetch, sign, and return the response using the same proof-signing infrastructure.

### 14.3 Offline Payment Channels

Two devices with no internet could open a signed payment channel over BLE. Either device settles the final state on-chain when connectivity returns. No RPC is required until settlement.

### 14.4 Verifier Reputation

A lightweight on-chain registry could track verifier accuracy over time. Proofs from high-reputation verifiers could settle consensus with fewer confirmations (e.g., 1 proof from a high-reputation node vs. 2 from unknown nodes).

### 14.5 Cross-Chain Support

The BLE mesh and Ed25519 infrastructure are chain-agnostic. Only the RPC call and transaction status interpretation change per chain. Ethereum and other EVM chains using secp256k1 would require a signing module swap but are otherwise compatible with the transport and gossip layers.

### 14.6 Token Incentives ($FERN)

Rewarding verifiers with micro-payments or governance tokens for providing mesh verification services. Protocol maturity and a stable verifier reputation system are prerequisites before introducing an incentive layer.

### 14.7 Hardware Modules

Dedicated Fernlink hardware for merchants and infrastructure operators: always-on verification nodes that require no user device and can be deployed in retail, transport, or IoT environments.

---

## 15. Conclusion

Fernlink demonstrates that Solana transaction verification can be decentralized at the device layer using existing wireless hardware. The protocol has been implemented across five platforms (Android, iOS, TypeScript, browser, Rust desktop) with three transport types (BLE, Wi-Fi/TCP, NFC), negotiable wire compression, store-and-forward queuing, and a hardware-free CI test suite. Core packages are published and versioned on crates.io and npm.

The architecture establishes a foundation for a broader resilience layer on top of Solana: the same mesh infrastructure that propagates verification proofs today can carry transaction broadcasts, account state queries, and payment channels as the protocol matures. Every well-connected device becomes a public good for the network.
