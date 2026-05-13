import { Link } from "react-router-dom";
import heroBg from "@/assets/hero-bg.jpg";

const stats = [
  { value: "60-80%", label: "RPC_REDUCTION_LOAD" },
  { value: "<2s",    label: "PROOF_PROPAGATION_LATENCY" },
  { value: "100m+",  label: "BLE_MESH_SIG_RANGE" },
  { value: "64",     label: "STORE_AND_FORWARD_QUEUE" },
];

const features = [
  {
    icon: "hub",
    title: "Peer-to-Peer Mesh",
    desc: "Devices connect directly via Bluetooth LE and WiFi/TCP, creating a resilient web of local verification that operates independently of centralized infrastructure.",
    stat: "ACTIVE_TRANSPORTS: 04",
  },
  {
    icon: "enhanced_encryption",
    title: "Cryptographic Proofs",
    desc: "Every verification is backed by an Ed25519-signed proof tied to the verifier's identity keypair, ensuring authenticity and non-repudiation without exposing private data.",
    stat: "ED25519_STATUS: ACTIVE",
  },
  {
    icon: "dynamic_feed",
    title: "Multi-Transport",
    desc: "BLE for low-power mesh networking, WiFi Direct P2P for high-throughput Android-to-Android verification without a router, WiFi/TCP with mDNS for LAN nodes, and NFC for sub-200ms peer bootstrapping.",
    stat: "BLE + WIFI_DIRECT + NFC",
  },
  {
    icon: "shield_lock",
    title: "Proof Integrity",
    desc: "Every proof is Ed25519-signed by its issuing node. Tampering or substitution is detectable at any hop. Consensus requires agreement from distinct verifier keypairs.",
    stat: "ED25519_PROOF_INTEGRITY",
  },
];

const steps = [
  {
    n: "01",
    title: "Request",
    desc: "Client broadcasts a transaction verification request to nearby peers via BLE, WiFi/TCP, or NFC-bootstrapped connection.",
  },
  {
    n: "02",
    title: "Verify",
    desc: "Validator nodes perform local cryptographic checks to confirm the structural integrity of the Solana payload.",
  },
  {
    n: "03",
    title: "Sign",
    desc: "Nodes generate a multi-sig proof attesting to the validity of the state without requiring immediate RPC access.",
  },
  {
    n: "04",
    title: "Propagate",
    desc: "The signed proof is gossiped across the network until it reaches a bridge node with active internet connectivity.",
  },
];

export default function Index() {
  return (
    <>
      {/* ── Hero ─────────────────────────────────────────────────────── */}
      <header className="relative pt-40 pb-20 px-6 min-h-screen flex flex-col items-center justify-center overflow-hidden">
        <div className="relative z-10 text-center max-w-4xl mx-auto w-full">
          {/* Status badge */}
          <div className="inline-flex items-center gap-2 px-3 py-1 bg-[#22C55E]/10 border border-[#22C55E]/50 mb-8">
            <span className="w-2 h-2 rounded-full bg-[#22C55E] animate-ping" />
            <span className="font-mono text-[#22C55E] uppercase text-xs tracking-widest">
              SYSTEM_STATUS: MAINNET_BETA_ONLINE
            </span>
          </div>

          <h1 className="font-mono font-bold text-4xl sm:text-5xl lg:text-6xl mb-6 text-[#22C55E] leading-[1.1] data-glow">
            Decentralized Transaction<br />Verification for Solana
          </h1>

          <p className="font-mono text-[#166534] text-lg mb-12 max-w-2xl mx-auto leading-relaxed">
            A resilient, peer-to-peer verification layer that works beyond traditional
            infrastructure. Devices share cryptographic proofs locally so the network
            keeps running even when centralized services don't.
          </p>

          {/* Stats */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 w-full">
            {stats.map((s) => (
              <div key={s.label} className="p-4 bg-black/80 backdrop-blur-sm terminal-border">
                <div className="font-mono text-[#22C55E] text-xl font-bold">{s.value}</div>
                <div className="font-mono text-[10px] text-[#166534] uppercase mt-1">{s.label}</div>
              </div>
            ))}
          </div>
        </div>
      </header>

      {/* ── Propagation ──────────────────────────────────────────────── */}
      <section className="py-20 px-6 max-w-[1440px] mx-auto border-t border-[#064e3b]">
        <div className="grid md:grid-cols-2 gap-12 items-center">
          <div className="space-y-6">
            <div className="font-mono text-[#22C55E] text-sm uppercase tracking-widest">
              $ cat ./protocol_overview.md
            </div>
            <h2 className="font-mono font-semibold text-3xl text-[#22C55E] data-glow">
              Like Ferns, Fernlink Propagates
            </h2>
            <div className="w-16 h-px bg-[#22C55E]" />
            <p className="font-mono text-[#166534] leading-relaxed">
              Inspired by the airborne distribution of fern spores, Fernlink uses a decentralized
              gossip protocol that doesn't rely on centralized relays. Each node acts as both a
              recipient and a broadcaster, ensuring that transaction proofs saturate the network
              with biological efficiency and mathematical rigor.
            </p>
            <ul className="space-y-3 font-mono text-[#22C55E] text-sm">
              {["Fractal Expansion Logic", "Zero-Trust Spore Propagation", "Autonomous Network Healing"].map((item) => (
                <li key={item} className="flex items-center gap-2">
                  <span className="animate-pulse">&gt;&gt;</span> {item}
                </li>
              ))}
            </ul>
          </div>

          <div className="relative group">
            <div className="absolute -inset-1 bg-[#22C55E]/20 blur opacity-30 group-hover:opacity-100 transition duration-1000" />
            <div className="relative bg-black border border-[#22C55E]/30 p-4 aspect-square flex items-center justify-center overflow-hidden terminal-border">
              <img
                src={heroBg}
                alt="Fernlink mesh visualization"
                className="w-full h-full object-cover opacity-40 group-hover:opacity-70 transition-opacity"
                style={{ filter: "grayscale(0%) brightness(0.5) sepia(100%) hue-rotate(60deg)" }}
              />
              <div className="absolute inset-0 border border-[#22C55E]/20 pointer-events-none" />
            </div>
          </div>
        </div>
      </section>

      {/* ── Core Infrastructure ───────────────────────────────────────── */}
      <section className="py-20 px-6 bg-black">
        <div className="max-w-[1440px] mx-auto">
          <div className="mb-12 text-center md:text-left">
            <h2 className="font-mono font-semibold text-3xl mb-4 text-[#22C55E] data-glow">
              Core Infrastructure
            </h2>
            <p className="font-mono text-[#166534] uppercase tracking-widest text-sm">
              // Modular components for the decentralized web
            </p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
            {features.map((f) => (
              <div
                key={f.title}
                className="bg-black border border-[#064e3b] p-6 flex flex-col hover:border-[#22C55E] transition-all duration-300 group terminal-border"
              >
                <div className="mb-8">
                  <span
                    className="material-symbols-outlined text-[#22C55E] text-4xl group-hover:scale-110 transition-transform inline-block data-glow"
                  >
                    {f.icon}
                  </span>
                </div>
                <h3 className="font-mono font-semibold text-xl mb-3 text-[#22C55E]">{f.title}</h3>
                <p className="font-mono text-sm text-[#166534] mb-6 flex-grow leading-relaxed">{f.desc}</p>
                <div className="pt-3 border-t border-[#064e3b] font-mono text-[10px] text-[#22C55E] uppercase">
                  {f.stat}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── How Verification Works ────────────────────────────────────── */}
      <section className="py-20 px-6 max-w-[1440px] mx-auto">
        <div className="text-center mb-12">
          <h2 className="font-mono font-semibold text-3xl mb-4 text-[#22C55E] data-glow">
            How Verification Works
          </h2>
          <div className="font-mono text-[#22C55E] tracking-widest text-sm">
            PHASE_01 // SEQUENCE_INITIATED // STACK_TRACE
          </div>
        </div>

        <div className="grid md:grid-cols-4 gap-0 border border-[#064e3b]">
          {steps.map((s, i) => (
            <div
              key={s.n}
              className={`p-6 relative group hover:bg-[#22C55E]/5 transition-colors ${
                i < steps.length - 1 ? "border-b md:border-b-0 md:border-r border-[#064e3b]" : ""
              }`}
            >
              <div className="font-mono text-[#22C55E] text-4xl mb-4 data-glow">{s.n}</div>
              <h4 className="font-mono font-semibold text-xl mb-3 text-[#22C55E]">{s.title}</h4>
              <p className="font-mono text-xs text-[#166534] leading-relaxed">{s.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── CTA ──────────────────────────────────────────────────────── */}
      <section className="py-20 px-6">
        <div className="max-w-[1000px] mx-auto bg-black border border-[#22C55E] p-12 text-center relative overflow-hidden terminal-border">
          {/* Corner dots */}
          {["top-0 left-0", "top-0 right-0", "bottom-0 left-0", "bottom-0 right-0"].map((pos) => (
            <div key={pos} className={`absolute ${pos} w-2 h-2 bg-[#22C55E]`} />
          ))}

          <h2 className="font-mono font-bold text-4xl sm:text-5xl mb-6 text-[#22C55E] data-glow">
            Ready to Build with Fernlink?
          </h2>
          <p className="font-mono text-[#166534] text-lg mb-10 max-w-2xl mx-auto">
            Join the ecosystem that's bringing offline resilience and local-first
            verification to the Solana network.
          </p>
          <div className="flex flex-col md:flex-row gap-6 justify-center items-center">
            <Link
              to="/downloads"
              className="w-full md:w-auto px-12 py-4 bg-[#22C55E] text-black font-mono uppercase tracking-widest hover:bg-black hover:text-[#22C55E] border border-[#22C55E] transition-all shadow-[0_0_20px_rgba(34,197,94,0.3)]"
            >
              [ GET STARTED ]
            </Link>
            <Link
              to="/contact"
              className="w-full md:w-auto px-12 py-4 border border-[#22C55E] text-[#22C55E] font-mono uppercase tracking-widest hover:bg-[#22C55E]/10 transition-all"
            >
              JOIN_COMMUNITY
            </Link>
          </div>
        </div>
      </section>
    </>
  );
}
