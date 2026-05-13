import { useState } from "react";

const TABS = ["OVERVIEW", "ARCHITECTURE", "SDK", "PERFORMANCE", "FUTURE"] as const;
type Tab = typeof TABS[number];

const transports = [
  { name: "BLE 5.0",              range: "~100m",  throughput: "2 Mbps",      latency: "Low",      power: "Very Low", note: "Primary mesh transport — Android GATT, iOS CoreBluetooth, desktop btleplug" },
  { name: "WiFi / TCP (mDNS)",    range: "~250m",  throughput: "250 Mbps",    latency: "Very Low", power: "Medium",   note: "LAN transport with automatic peer discovery via mDNS (_fernlink._tcp.local.) — TypeScript and Rust desktop" },
  { name: "WiFi Direct (P2P)",    range: "~200m",  throughput: "250 Mbps",    latency: "Very Low", power: "Medium",   note: "Android peer-to-peer WiFi mesh without a router. DNS-SD service registration for automatic discovery; deterministic GO election by pubkey; TYPE_HELLO TCP handshake exchanges peer fingerprint on connect" },
  { name: "NFC Bootstrap",        range: "~4cm",   throughput: "Pairing only", latency: "<200ms",   power: "Minimal",  note: "Exchanges BLE connection metadata over NFC tap — accelerates pairing from ~5s to <200ms" },
];

const platforms = [
  { name: "TypeScript / Node.js", lang: "TypeScript", status: "Available", note: "FernlinkClient + WifiPeer + TransportManager" },
  { name: "Rust Core",            lang: "Rust",        status: "Available", note: "BLE + WiFi/TCP dual-transport desktop binary" },
  { name: "Android",              lang: "Kotlin",      status: "Available", note: "Native GATT BLE service + WiFi Direct P2P + NFC bootstrap + TransportManager" },
  { name: "iOS (Swift)",          lang: "Swift",       status: "Available", note: "CoreBluetooth + Multipeer Connectivity + NFC bootstrap" },
  { name: "Web (Browser)",        lang: "TypeScript",  status: "Available", note: "WebBluetoothPeer — Chrome/Edge connect as BLE centrals to Android/iOS nodes" },
  { name: "React Native",         lang: "TypeScript",  status: "Planned",  note: "—" },
];

const codeExampleRust = `use fernlink_core::{Keypair, sign_proof, verify_proof, evaluate};

fn main() {
    let keypair = Keypair::generate();

    let proof = keypair.sign_proof(
        tx_sig,             // [u8; 64] — transaction signature
        TxStatus::Confirmed,
        slot,               // u64
        block_time,         // u64
        0,                  // error_code
    );

    assert!(verify_proof(&proof).is_ok());
    let result = evaluate(&[proof], Commitment::Confirmed);
    println!("settled: {}", result.settled);
}`;

const codeExampleTS = `import { FernlinkClient } from "fernlink-sdk";
import { TransportManager } from "@fernlink/wifi";

const client = new FernlinkClient({
  rpcEndpoint: "https://api.mainnet-beta.solana.com",
  minProofs: 2,
});

// Start WiFi/TCP transport — discovers peers via mDNS automatically
const transport = new TransportManager(
  client,
  "https://api.mainnet-beta.solana.com"
);
await transport.start();

const result = await client.verifyTransaction(txSignature, {
  commitment: "confirmed",
  timeoutMs:  15_000,
});

console.log(result.status, result.slot, result.proofCount);
// "confirmed"  312847291  3`;

const phases = [
  { phase: "01", title: "Request",     desc: "A device needing verification broadcasts a signed request containing the transaction signature, requested confirmation level, and a TTL." },
  { phase: "02", title: "Verification", desc: "Nodes with RPC access verify the transaction against the Solana ledger, then sign a proof with their Ed25519 key and return it." },
  { phase: "03", title: "Propagation", desc: "Verified proofs spread through the mesh via a gossip protocol. Each hop is tracked, duplicates are filtered, and TTL prevents infinite propagation." },
];

const optimizations = [
  { title: "Bandwidth",   desc: "Compact binary serialization, delta compression for repeated proofs, and adaptive payload sizing based on transport." },
  { title: "Battery",     desc: "Intelligent duty cycling, transport selection based on power budget, and background operation modes for mobile devices." },
  { title: "Latency",     desc: "Parallel verification requests, pre-cached proofs for popular transactions, and optimistic proof acceptance with async validation." },
  { title: "Scalability", desc: "Bloom filters for duplicate detection, geographic sharding of the gossip protocol, and adaptive TTL based on network density." },
];

const shippedItems = [
  { title: "WiFi / TCP Transport",         desc: "High-throughput LAN verification using TCP with mDNS auto-discovery. Implemented in TypeScript (Node.js) and Rust desktop. Peers advertise via _fernlink._tcp.local. and connect automatically — no manual configuration required." },
  { title: "NFC Bootstrapping",            desc: "Android and iOS support NFC tap-to-pair: an NDEF record exchange hands off the BLE address and public key, reducing peer discovery from ~5 seconds to under 200ms. The BLE connection then carries all subsequent proof traffic." },
  { title: "Store-and-Forward",            desc: "A 64-request queue on Android and iOS holds outbound verification requests when no peers are reachable. The queue drains automatically the moment a peer connects, ensuring no request is silently dropped in intermittent connectivity scenarios." },
  { title: "Multi-Transport Orchestration", desc: "TransportManager on Android, iOS, and TypeScript coordinates BLE and WiFi simultaneously. On Android, verifyTransaction() broadcasts to all active transports at once and evaluates a combined proof list — proofs from BLE peers and WiFi Direct peers contribute toward the same consensus threshold. Falls back to direct RPC if no peers are available on any transport." },
  { title: "Android WiFi Direct (P2P) Transport", desc: "Full WiFi Direct mesh layer on Android: DNS-SD service registration and discovery, deterministic group owner election (lower pubkey becomes client, higher becomes GO running the TCP ServerSocket), and a TYPE_HELLO handshake that exchanges 8-byte pubkey fingerprints on every new TCP connection. Peers are uniquely identified across transports so one physical device with both BLE and WiFi Direct counts as a single peer." },
  { title: "Cross-Transport Mesh Bridge", desc: "A device reachable only over BLE can receive a verification response from a verifier reachable only over WiFi Direct, through a shared peer. Each transport holds externalRequestSender and externalProofSender callbacks wired by FernlinkClient. When a node's RPC call fails and the request is forwarded with TTL-1, it also relays across transports. Incoming proofs propagate across transports so multi-hop return paths resolve correctly." },
  { title: "Proof Round Integrity", desc: "Each router tracks the txSignature of the active verification round. Proofs are accepted only if their embedded tx_signature byte array matches the current round — preventing stale proofs from a previous verifyTransaction() call from contaminating the next round after seenVerifierKeys is cleared." },
  { title: "Negotiable Wire Compression (Protocol v2)", desc: "LZ4 and zstd codecs are now negotiated per-connection via the STATUS characteristic. Every outgoing payload is compressed with a 1-byte codec prefix; incoming payloads are decoded transparently. Backwards-compatible: messages starting with '{' are treated as legacy uncompressed JSON. Wired into all five transport layers — Android BLE GATT, Android WiFi/TCP, iOS CoreBluetooth, iOS Multipeer Connectivity, and the TypeScript WebBluetoothPeer." },
  { title: "CI/CD Auto-publish Pipelines", desc: "GitHub Actions workflows cover every platform: Rust cargo test, TypeScript SDK tests + BLE simulator, Android assembleRelease, and iOS swift build. The SDK workflow gates the npm publish job behind all four checks — type-check, unit tests, WiFi transport check, and BLE simulator tests — before bumping the patch version and publishing to npm automatically on every push to main." },
];

const futureItems = [
  { title: "Transaction Broadcasting",   desc: "Devices with no internet can create and sign a transaction locally, then pass it through the mesh to a connected node that submits it to the RPC. Makes the protocol bidirectional: not just proofs coming back, but transactions going out." },
  { title: "Account State Queries",      desc: "Extend the mesh query layer beyond transaction confirmation. A device asks nearby peers for account balances, token holdings, or recent history. Peers with internet fetch, sign, and return the response — full read access without a direct connection." },
  { title: "Offline Payment Channels",   desc: "Two devices open a payment channel over BLE and exchange signed state updates with no internet at all. Either device settles the final state on-chain when connectivity returns. No RPC is needed until settlement." },
  { title: "Program State Queries",      desc: "Query on-chain program and smart contract state through the mesh. A device asks for the current state of a DeFi pool, an NFT collection, or any on-chain account. Peers fetch and sign the response." },
  { title: "Peer Reputation",            desc: "Verifiers who consistently return accurate proofs accumulate on-chain reputation. Nodes that return bad proofs or go offline during a request lose standing. Shifts trust from consensus-only to track-record-backed, and lays the ground for the incentive layer." },
  { title: "Token Incentives ($Fern)",   desc: "Reward verifiers with micro-payments or governance tokens for providing verification services to the mesh." },
  { title: "Hardware Modules",           desc: "Dedicated Fernlink hardware for merchants and infrastructure operators, providing always-on verification nodes." },
  { title: "Decentralized Governance",   desc: "Community-driven protocol upgrades via on-chain voting and proposal mechanisms." },
  { title: "Cross-Chain Support",        desc: "Extend the proof and gossip layer to additional blockchain networks. The BLE mesh and Ed25519 infrastructure are not Solana-specific — only the RPC call and signature scheme change per chain." },
];

function Block({ children }: { children: React.ReactNode }) {
  return (
    <div className="bg-black border border-[#064e3b] p-6 md:p-8 terminal-border">
      {children}
    </div>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return <h2 className="font-mono font-semibold text-xl text-[#22C55E] mb-6 data-glow">{children}</h2>;
}

export default function Docs() {
  const [active, setActive] = useState<Tab>("OVERVIEW");

  return (
    <div className="pt-24 pb-20 px-6 max-w-[1440px] mx-auto">

      {/* Header */}
      <section className="pb-12 border-b border-[#064e3b]">
        <div className="font-mono text-[#22C55E] text-sm uppercase tracking-widest mb-4">
          $ cat ./technical_docs.md
        </div>
        <h1 className="font-mono font-bold text-4xl sm:text-5xl text-[#22C55E] mb-4 data-glow">
          Technical Documentation
        </h1>
        <p className="font-mono text-[#166534] text-lg max-w-2xl">
          Everything you need to understand, integrate, and contribute to the Fernlink protocol.
        </p>
      </section>

      {/* Tab bar */}
      <div className="flex flex-wrap gap-0 border-b border-[#064e3b] mt-8 mb-10">
        {TABS.map((tab) => (
          <button
            key={tab}
            onClick={() => setActive(tab)}
            className={`font-mono text-xs uppercase tracking-widest px-5 py-3 border-r border-[#064e3b] transition-colors ${
              active === tab
                ? "bg-[#22C55E] text-black"
                : "text-[#166534] hover:text-[#22C55E]"
            }`}
          >
            [{tab}]
          </button>
        ))}
      </div>

      {/* OVERVIEW */}
      {active === "OVERVIEW" && (
        <div className="space-y-6">
          <Block>
            <SectionLabel>System Overview</SectionLabel>
            <p className="font-mono text-sm text-[#166534] mb-8">
              Fernlink operates in three core phases to distribute transaction verification across a local device mesh:
            </p>
            <div className="grid md:grid-cols-3 gap-6">
              {phases.map((p) => (
                <div key={p.phase} className="border border-[#064e3b] p-5">
                  <div className="font-mono text-[#22C55E] text-2xl mb-2 data-glow">{p.phase}</div>
                  <h3 className="font-mono font-semibold text-[#22C55E] mb-2">{p.title}</h3>
                  <p className="font-mono text-xs text-[#166534] leading-relaxed">{p.desc}</p>
                </div>
              ))}
            </div>
          </Block>

          <Block>
            <SectionLabel>Security & Trust Model</SectionLabel>
            <div className="space-y-3 font-mono text-sm text-[#166534]">
              {[
                ["Proof Signing", "Every verification proof is signed using the verifier's Ed25519 keypair, ensuring authenticity and non-repudiation."],
                ["Multi-Validator Consensus", "Configurable threshold, default 2+ proofs. Proofs are only accepted when enough independent verifiers agree."],
                ["Attack Prevention", "Replay attacks mitigated via UUID deduplication with TTL. Sybil resistance enforced by deduplicating consensus votes by verifier public key — each distinct signer counts once, regardless of message volume."],
                ["Privacy", "No private keys are shared. Only transaction signatures and verification proofs traverse the mesh."],
              ].map(([title, desc]) => (
                <div key={title} className="flex gap-2">
                  <span className="text-[#22C55E] shrink-0">&gt;&gt;</span>
                  <p><span className="text-[#22C55E]">{title}:</span> {desc}</p>
                </div>
              ))}
            </div>
          </Block>
        </div>
      )}

      {/* ARCHITECTURE */}
      {active === "ARCHITECTURE" && (
        <div className="space-y-6">
          <Block>
            <SectionLabel>Transport Layer</SectionLabel>
            <div className="overflow-x-auto">
              <table className="w-full font-mono text-sm">
                <thead>
                  <tr className="border-b border-[#064e3b]">
                    {["Transport", "Range", "Throughput", "Latency", "Power", "Notes"].map((h) => (
                      <th key={h} className="text-left py-3 px-4 text-[#22C55E] uppercase text-xs tracking-widest">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {transports.map((t) => (
                    <tr key={t.name} className="border-b border-[#064e3b]">
                      <td className="py-3 px-4 text-[#22C55E] whitespace-nowrap">{t.name}</td>
                      <td className="py-3 px-4 text-[#166534]">{t.range}</td>
                      <td className="py-3 px-4 text-[#166534]">{t.throughput}</td>
                      <td className="py-3 px-4 text-[#166534]">{t.latency}</td>
                      <td className="py-3 px-4 text-[#166534]">{t.power}</td>
                      <td className="py-3 px-4 text-[#166534] text-xs max-w-xs">{t.note}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Block>

          <Block>
            <SectionLabel>Message Format</SectionLabel>
            <pre className="bg-black border border-[#064e3b] p-4 overflow-x-auto font-mono text-sm text-[#22C55E] leading-relaxed">
{`{
  "messageId":        "uuid-v4",
  "txSignature":      "base58...",
  "status":           "confirmed",
  "slot":             123456789,
  "blockTime":        1700000000,
  "errorCode":        0,
  "verifierPublicKey":"hex(32 bytes)",
  "signature":        "hex(64 bytes) — Ed25519",
  "timestampMs":      1700000000000
}`}
            </pre>
          </Block>

          <Block>
            <SectionLabel>Wire Encoding (Protocol v2)</SectionLabel>
            <p className="font-mono text-sm text-[#166534] mb-4 leading-relaxed">
              Every payload is prefixed with a single codec byte before transmission. The receiver
              strips the prefix, decompresses, and parses JSON. Legacy v1 messages (starting with
              <span className="text-[#22C55E]"> {'{'} </span>
              / 0x7B) are detected automatically and passed through without decompression.
            </p>
            <div className="overflow-x-auto">
              <table className="w-full font-mono text-sm">
                <thead>
                  <tr className="border-b border-[#064e3b]">
                    {["Byte", "Codec", "Library", "Notes"].map((h) => (
                      <th key={h} className="text-left py-3 px-4 text-[#22C55E] uppercase text-xs tracking-widest">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {[
                    { byte: "0x00", codec: "none",  lib: "—",                        note: "Raw JSON, no compression" },
                    { byte: "0x01", codec: "lz4",   lib: "lz4_flex / lz4js",         note: "Block format with 4-byte LE size prefix — default codec" },
                    { byte: "0x02", codec: "zstd",  lib: "zstd / COMPRESSION_LZFSE", note: "Higher ratio; iOS uses LZFSE (same wire byte)" },
                  ].map((r) => (
                    <tr key={r.byte} className="border-b border-[#064e3b]">
                      <td className="py-3 px-4 text-[#22C55E]">{r.byte}</td>
                      <td className="py-3 px-4 text-[#166534]">{r.codec}</td>
                      <td className="py-3 px-4 text-[#166534] text-xs">{r.lib}</td>
                      <td className="py-3 px-4 text-[#166534] text-xs">{r.note}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Block>
        </div>
      )}

      {/* SDK */}
      {active === "SDK" && (
        <div className="space-y-6">
          <Block>
            <SectionLabel>Platform Support</SectionLabel>
            <div className="overflow-x-auto">
              <table className="w-full font-mono text-sm">
                <thead>
                  <tr className="border-b border-[#064e3b]">
                    {["Platform", "Language", "Status", "Transports"].map((h) => (
                      <th key={h} className="text-left py-3 px-4 text-[#22C55E] uppercase text-xs tracking-widest">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {platforms.map((p) => (
                    <tr key={p.name} className="border-b border-[#064e3b]">
                      <td className="py-3 px-4 text-[#22C55E]">{p.name}</td>
                      <td className="py-3 px-4 text-[#166534]">{p.lang}</td>
                      <td className="py-3 px-4">
                        <span className={`text-xs px-2 py-1 font-mono uppercase ${
                          p.status === "Available"
                            ? "bg-[#22C55E]/10 text-[#22C55E]"
                            : "bg-[#064e3b]/40 text-[#166534]"
                        }`}>
                          {p.status}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-[#166534] text-xs">{p.note}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Block>

          <Block>
            <SectionLabel>Quick Start — TypeScript</SectionLabel>
            <pre className="bg-black border border-[#064e3b] p-4 overflow-x-auto font-mono text-sm text-[#22C55E] leading-relaxed">
              {codeExampleTS}
            </pre>
          </Block>

          <Block>
            <SectionLabel>Quick Start — Rust Core</SectionLabel>
            <pre className="bg-black border border-[#064e3b] p-4 overflow-x-auto font-mono text-sm text-[#22C55E] leading-relaxed">
              {codeExampleRust}
            </pre>
          </Block>
        </div>
      )}

      {/* PERFORMANCE */}
      {active === "PERFORMANCE" && (
        <div className="space-y-6">
          <Block>
            <SectionLabel>Optimizations</SectionLabel>
            <div className="grid md:grid-cols-2 gap-6">
              {optimizations.map((o) => (
                <div key={o.title} className="border border-[#064e3b] p-5">
                  <div className="font-mono text-[#22C55E] text-xs uppercase tracking-widest mb-2">{o.title}</div>
                  <p className="font-mono text-sm text-[#166534] leading-relaxed">{o.desc}</p>
                </div>
              ))}
            </div>
          </Block>
        </div>
      )}

      {/* FUTURE */}
      {active === "FUTURE" && (
        <div className="space-y-6">
          <Block>
            <SectionLabel>Recently Shipped</SectionLabel>
            <div className="space-y-4">
              {shippedItems.map((f) => (
                <div key={f.title} className="flex gap-4 items-start border border-[#22C55E]/30 p-5 bg-[#22C55E]/5">
                  <div className="shrink-0 font-mono text-[10px] uppercase tracking-widest text-black bg-[#22C55E] px-2 py-1 mt-0.5">
                    SHIPPED
                  </div>
                  <div>
                    <h3 className="font-mono font-semibold text-[#22C55E] mb-1">{f.title}</h3>
                    <p className="font-mono text-sm text-[#166534] leading-relaxed">{f.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </Block>

          <Block>
            <SectionLabel>Upcoming Extensions</SectionLabel>
            <div className="space-y-4">
              {futureItems.map((f, i) => (
                <div key={f.title} className="flex gap-4 items-start border border-[#064e3b] p-5 hover:border-[#22C55E] transition-colors">
                  <div className="font-mono text-[#22C55E] text-2xl shrink-0 data-glow">
                    {String(i + 1).padStart(2, "0")}
                  </div>
                  <div>
                    <h3 className="font-mono font-semibold text-[#22C55E] mb-1">{f.title}</h3>
                    <p className="font-mono text-sm text-[#166534] leading-relaxed">{f.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </Block>
        </div>
      )}
    </div>
  );
}
