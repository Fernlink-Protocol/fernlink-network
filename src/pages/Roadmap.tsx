import { Link } from "react-router-dom";
import { GITHUB } from "@/lib/constants";

const phases = [
  {
    id: "PHASE_01",
    title: "Core Protocol",
    status: "COMPLETE",
    desc: "Established the canonical protocol implementation: Ed25519 keypairs, proof signing and verification, gossip UUID deduplication with TTL, stateless multi-proof consensus, and Solana RPC client. Published to crates.io (Rust) and npm (TypeScript).",
    items: ["fernlink-core Rust crate", "fernlink-sdk TypeScript package", "Ed25519 sign / verify / consensus", "devnet demo (npx fernlink-demo)"],
  },
  {
    id: "PHASE_02",
    title: "Android BLE Transport",
    status: "COMPLETE",
    desc: "Native Kotlin BLE service with full GATT server and client. Advertises the Fernlink GATT profile, handles characteristic writes for requests, and pushes proof notifications to subscribed centrals. JNI bindings expose the Rust core to Android.",
    items: ["FernlinkBleService (Android foreground service)", "GattServerManager + GattClientManager", "BleMessageRouter wiring", "FernlinkJni (JNI bridge to Rust core)"],
  },
  {
    id: "PHASE_03",
    title: "CI / CD",
    status: "COMPLETE",
    desc: "GitHub Actions pipelines covering all packages. Rust core and FFI compile and test on every push. TypeScript SDK runs Vitest. Android assembles the release AAR. Artifacts uploaded automatically.",
    items: ["rust.yml — cargo test (core + ffi)", "sdk.yml — npm test (Vitest, 8 tests)", "android.yml — assembleRelease + APK artifact"],
  },
  {
    id: "PHASE_04",
    title: "Robustness",
    status: "COMPLETE",
    desc: "Production hardening: store-and-forward queuing for offline scenarios, a hardware-free BLE simulator for CI, and instrumented Android JNI tests. The protocol now degrades gracefully when peers are intermittently unavailable.",
    items: ["ProofStore — 64-request store-and-forward queue", "FernlinkSimulator — 8 Vitest tests, no hardware", "FernlinkJniTest — 6 Android instrumented tests"],
  },
  {
    id: "PHASE_05",
    title: "iOS Transport",
    status: "COMPLETE",
    desc: "Native Swift SDK using CoreBluetooth for BLE and Multipeer Connectivity for peer-to-peer WiFi. NFC bootstrapping via CoreNFC reduces BLE peer discovery from ~5 seconds to under 200ms. Full Ed25519 signing via CryptoKit.",
    items: ["FernlinkClient.swift + FernlinkTransport protocol", "CoreBluetooth BLE central / peripheral", "Multipeer Connectivity transport", "NfcBootstrapHelper (CoreNFC)"],
  },
  {
    id: "PHASE_06",
    title: "WiFi / TCP Transport",
    status: "COMPLETE",
    desc: "High-throughput LAN transport for TypeScript (Node.js) and Rust desktop. Peers advertise via mDNS on _fernlink._tcp.local. and connect automatically. A deterministic connection rule (lower public key connects) prevents duplicate connections.",
    items: ["WifiPeer + TcpServer + TcpClient (TypeScript)", "MdnsDiscovery using bonjour-service", "Rust wifi module with mdns-sd 0.9", "Dual-transport Rust desktop binary (BLE + WiFi simultaneously)"],
  },
  {
    id: "PHASE_07",
    title: "Multi-Transport Orchestration",
    status: "COMPLETE",
    desc: "TransportManager on Android, iOS, and TypeScript coordinates multiple transports simultaneously. Verification automatically uses the highest-priority transport with active peers, falling back to direct RPC if none respond within the timeout. Security audit fixes applied across all platforms.",
    items: ["TransportManager.kt (Android — BLE + WiFi)", "TransportManager.swift (iOS)", "TransportManager.ts (TypeScript)", "Security audit: distinct-signer consensus, proof verification, TTL capping"],
  },
  {
    id: "PHASE_08",
    title: "Wire Compression (Protocol v2)",
    status: "COMPLETE",
    desc: "Negotiable LZ4 and zstd compression on every transport layer. A 1-byte codec prefix wraps each payload; peers advertise supported codecs via the STATUS characteristic. Backwards-compatible with uncompressed Protocol v1 messages.",
    items: ["LZ4 + zstd codec negotiation (0x01/0x02 prefix)", "Android BLE + WiFi/TCP transports", "iOS CoreBluetooth + Multipeer Connectivity", "TypeScript WebBluetoothPeer", "Rust core compression feature flags"],
  },
  {
    id: "PHASE_09",
    title: "Protocol Extensions",
    status: "PLANNED",
    desc: "The verification mesh is the foundation. The next layer extends it from read-only proof queries to full bidirectional protocol capabilities, peer reputation, and cross-chain support.",
    items: ["Transaction broadcasting through the mesh", "Account and program state queries", "Offline payment channels over BLE", "Peer reputation and verifier incentives"],
  },
];

const upcoming = [
  {
    title: "Transaction Broadcasting",
    desc: "Devices with no internet can create and sign a transaction locally, then relay it through the mesh to a connected node for submission. Makes the protocol bidirectional.",
  },
  {
    title: "Account State Queries",
    desc: "Extend the query layer beyond transaction confirmation. Devices ask peers for account balances, token holdings, and program state. Peers with internet fetch, sign, and return the response.",
  },
  {
    title: "Offline Payment Channels",
    desc: "Two devices open a signed payment channel over BLE with no internet. Either settles the final state on-chain when connectivity returns. No RPC needed until settlement.",
  },
  {
    title: "Peer Reputation",
    desc: "Verifiers who consistently return accurate proofs accumulate on-chain reputation. Nodes that return bad proofs lose standing, shifting trust from consensus-only to track-record-backed.",
  },
  {
    title: "Cross-Chain Support",
    desc: "The BLE mesh and Ed25519 infrastructure are chain-agnostic. Only the RPC call and signature scheme change per chain. Ethereum and other EVM chains are the first targets.",
  },
  {
    title: "Token Incentives ($Fern)",
    desc: "Reward verifiers with micro-payments or governance tokens for providing verification services to the mesh. Protocol maturity comes before incentive layer design.",
  },
  {
    title: "Hardware Modules",
    desc: "Dedicated Fernlink hardware for merchants and infrastructure operators: always-on verification nodes requiring no user device.",
  },
];

const statusStyle: Record<string, string> = {
  COMPLETE: "bg-[#22C55E] text-black",
  PLANNED:  "bg-[#064e3b]/60 text-[#166534] border border-[#064e3b]",
};

export default function Roadmap() {
  const complete = phases.filter((p) => p.status === "COMPLETE");
  const planned  = phases.filter((p) => p.status === "PLANNED");

  return (
    <div className="pt-24 pb-20 px-6 max-w-[1440px] mx-auto">

      {/* Header */}
      <section className="pb-12 border-b border-[#064e3b]">
        <div className="font-mono text-[#22C55E] text-sm uppercase tracking-widest mb-4">
          $ cat ./roadmap.md
        </div>
        <h1 className="font-mono font-bold text-4xl sm:text-5xl text-[#22C55E] mb-4 data-glow">
          Roadmap
        </h1>
        <p className="font-mono text-[#166534] text-lg max-w-2xl leading-relaxed">
          Eight phases shipped. The verification mesh is live across Android, iOS,
          TypeScript, and Rust desktop. Phase 9 extends the protocol from read-only proofs
          to full bidirectional mesh capabilities.
        </p>
      </section>

      {/* Phase timeline */}
      <section className="py-16 border-b border-[#064e3b]">
        <div className="font-mono text-[#22C55E] text-sm uppercase tracking-widest mb-10">
          // DEVELOPMENT_PHASES
        </div>

        <div className="relative">
          {/* Vertical line */}
          <div className="absolute left-[11px] top-2 bottom-2 w-px bg-[#064e3b] hidden sm:block" />

          <div className="space-y-6">
            {phases.map((phase) => (
              <div key={phase.id} className="sm:pl-10 relative">
                {/* Dot */}
                <div className={`absolute left-0 top-5 w-[23px] h-[23px] border-2 hidden sm:flex items-center justify-center ${
                  phase.status === "COMPLETE"
                    ? "border-[#22C55E] bg-[#22C55E]"
                    : "border-[#064e3b] bg-black"
                }`}>
                  {phase.status === "COMPLETE" && (
                    <svg className="w-3 h-3 text-black" viewBox="0 0 12 12" fill="currentColor">
                      <path d="M2 6l3 3 5-5" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                  )}
                </div>

                <div className={`bg-black border p-6 terminal-border ${
                  phase.status === "COMPLETE" ? "border-[#064e3b] hover:border-[#22C55E]" : "border-[#064e3b]/50"
                } transition-colors`}>
                  <div className="flex flex-wrap items-start justify-between gap-4 mb-4">
                    <div>
                      <div className="font-mono text-[10px] text-[#166534] uppercase tracking-widest mb-1">
                        {phase.id}
                      </div>
                      <h3 className="font-mono font-semibold text-xl text-[#22C55E] data-glow">
                        {phase.title}
                      </h3>
                    </div>
                    <span className={`font-mono text-[10px] uppercase tracking-widest px-3 py-1 shrink-0 ${statusStyle[phase.status]}`}>
                      {phase.status}
                    </span>
                  </div>

                  <p className="font-mono text-sm text-[#166534] leading-relaxed mb-5">
                    {phase.desc}
                  </p>

                  <ul className="grid sm:grid-cols-2 gap-1">
                    {phase.items.map((item) => (
                      <li key={item} className="font-mono text-xs text-[#22C55E] flex items-center gap-2">
                        <span className="text-[#22C55E] shrink-0">›</span> {item}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Upcoming extensions */}
      <section className="py-16 border-b border-[#064e3b]">
        <div className="font-mono text-[#22C55E] text-sm uppercase tracking-widest mb-10">
          // UPCOMING_EXTENSIONS
        </div>
        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
          {upcoming.map((item) => (
            <div key={item.title} className="bg-black border border-[#064e3b] p-5 terminal-border hover:border-[#22C55E]/50 transition-colors">
              <h3 className="font-mono font-semibold text-sm text-[#22C55E] mb-3">{item.title}</h3>
              <p className="font-mono text-xs text-[#166534] leading-relaxed">{item.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section className="pt-16">
        <div className="bg-black border border-[#064e3b] p-8 terminal-border flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
          <div>
            <div className="font-mono text-[#22C55E] text-sm uppercase tracking-widest mb-2">
              // CONTRIBUTE
            </div>
            <p className="font-mono text-sm text-[#166534] max-w-lg leading-relaxed">
              Fernlink is open source under the Apache 2.0 License. If you're working on
              Solana infrastructure, offline-first applications, or mesh networking, contributions
              and feedback are welcome.
            </p>
          </div>
          <div className="flex flex-wrap gap-4 shrink-0">
            <a
              href={GITHUB}
              target="_blank"
              rel="noopener noreferrer"
              className="font-mono text-sm uppercase tracking-widest border border-[#22C55E] text-[#22C55E] px-5 py-2 inline-block hover:bg-[#22C55E] hover:text-black transition-all"
            >
              [ VIEW ON GITHUB ]
            </a>
            <Link
              to="/contact"
              className="font-mono text-sm uppercase tracking-widest border border-[#064e3b] text-[#166534] px-5 py-2 inline-block hover:border-[#22C55E] hover:text-[#22C55E] transition-all"
            >
              [ GET IN TOUCH ]
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}
