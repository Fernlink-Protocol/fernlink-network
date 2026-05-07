import { Link } from "react-router-dom";
import { GITHUB } from "@/lib/constants";

function H2({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="font-mono font-semibold text-2xl text-[#22C55E] mt-12 mb-4 data-glow">
      {children}
    </h2>
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

function Bullet({ children }: { children: React.ReactNode }) {
  return (
    <li className="font-mono text-sm text-[#166534] flex items-start gap-2 mb-2">
      <span className="text-[#22C55E] shrink-0 mt-0.5">&gt;</span>
      <span>{children}</span>
    </li>
  );
}

export default function IntroducingFernlink() {
  return (
    <div className="pt-24 pb-20 px-6 max-w-[860px] mx-auto">

      {/* Breadcrumb */}
      <div className="font-mono text-[10px] text-[#166534] uppercase tracking-widest mb-8 flex items-center gap-2">
        <Link to="/blog" className="hover:text-[#22C55E] transition-colors">BLOG</Link>
        <span>/</span>
        <span className="text-[#22C55E]">INTRODUCING FERNLINK</span>
      </div>

      {/* Header */}
      <section className="pb-10 border-b border-[#064e3b]">
        <div className="font-mono text-[#22C55E] text-sm uppercase tracking-widest mb-4">
          $ cat ./blog/01_introducing_fernlink.md
        </div>
        <h1 className="font-mono font-bold text-3xl sm:text-4xl text-[#22C55E] mb-5 data-glow leading-tight">
          Introducing Fernlink: A New Paradigm for Solana Verification
        </h1>
        <div className="flex items-center gap-6 font-mono text-[10px] uppercase tracking-widest text-[#166534]">
          <span>2026-05-02</span>
          <span className="border border-[#064e3b] px-2 py-0.5 text-[#22C55E]">PROTOCOL</span>
          <span className="border border-[#064e3b] px-2 py-0.5">OPEN SOURCE</span>
        </div>
      </section>

      {/* Body */}
      <article className="py-10">

        <P>
          Every Solana wallet, every dApp, every trading bot shares the same
          chokepoint: a handful of centralized RPC providers. When those providers slow
          down, every application on the network slows with them. When they go offline,
          transactions stop confirming. And as Solana's transaction volume grows, the
          cost of hammering those endpoints grows too.
        </P>
        <P>
          We built Fernlink to break that dependency. Today we're open-sourcing the full
          protocol stack: a peer-to-peer mesh that lets nearby devices collaboratively
          verify Solana transactions and share the cryptographic proof, so one RPC call
          does the work of many.
        </P>

        <H2>// THE_PROBLEM</H2>
        <P>
          Solana processes hundreds of thousands of transactions per day. For each one,
          every interested device (wallet, POS terminal, IoT node) makes its own
          independent call to an RPC endpoint to confirm the transaction is settled.
          That's a massive, duplicated load on a small number of infrastructure providers.
        </P>
        <P>
          The consequences compound in the real world:
        </P>
        <ul className="mb-6 space-y-1">
          <Bullet>
            <strong className="text-[#22C55E]">Cost at scale.</strong> High-volume applications pay for millions of RPC calls per day. Those costs flow through to developers and end users.
          </Bullet>
          <Bullet>
            <strong className="text-[#22C55E]">Single points of failure.</strong> Provider outages cascade across the entire ecosystem simultaneously. There is no fallback.
          </Bullet>
          <Bullet>
            <strong className="text-[#22C55E]">The connectivity gap.</strong> Billions of potential Solana users live in regions with intermittent internet. An RPC-dependent model excludes them entirely.
          </Bullet>
        </ul>

        <H2>// THE_SOLUTION</H2>
        <P>
          Fernlink introduces a three-phase mesh protocol that distributes verification
          across the devices that are already in the room.
        </P>
        <div className="bg-black border border-[#064e3b] p-6 terminal-border my-6 space-y-5">
          {[
            ["01 REQUEST", "A device needing verification broadcasts a signed request over BLE, WiFi Direct, or NFC. The message contains the transaction signature, desired commitment level, and a TTL."],
            ["02 VERIFY", "A peer with RPC access checks the transaction against the Solana ledger, signs the result with its Ed25519 key, and returns a compact proof."],
            ["03 PROPAGATE", "The proof spreads through the mesh via gossip. Each hop is tracked. UUID deduplication prevents replays. When enough independent verifiers agree, the transaction is settled."],
          ].map(([label, desc]) => (
            <div key={label} className="flex gap-4">
              <span className="font-mono text-[#22C55E] text-xs uppercase tracking-widest shrink-0 pt-0.5 w-24">{label}</span>
              <p className="font-mono text-sm text-[#166534] leading-relaxed">{desc}</p>
            </div>
          ))}
        </div>
        <P>
          The result: in a dense environment like a conference hall, a market, or a city block,
          one RPC call can settle verification for dozens of nearby devices.
          Our modelling puts the RPC reduction at <Highlight>60–80%</Highlight> in realistic mesh scenarios.
        </P>

        <H2>// SECURITY_MODEL</H2>
        <P>
          Distributing trust across unknown peers only works if the cryptography is tight.
          Fernlink's security properties:
        </P>
        <ul className="mb-6 space-y-1">
          <Bullet>
            Every proof is <Highlight>Ed25519 signed</Highlight> by the verifying node. Proofs cannot be forged or attributed to a different verifier.
          </Bullet>
          <Bullet>
            <Highlight>Multi-validator consensus</Highlight> with a configurable threshold, default 2+ independent proofs, before a transaction is considered settled. One compromised peer can't unilaterally confirm.
          </Bullet>
          <Bullet>
            <Highlight>UUID deduplication with TTL</Highlight> prevents replay attacks. Each proof ID can only be accepted once within its validity window.
          </Bullet>
          <Bullet>
            <Highlight>No private keys traverse the mesh.</Highlight> Only transaction signatures and verification proofs are shared between peers.
          </Bullet>
        </ul>

        <H2>// WHAT_WE_SHIPPED</H2>
        <P>
          The full Fernlink protocol stack is live on GitHub today, under the Apache 2.0 licence.
        </P>
        <div className="grid sm:grid-cols-2 gap-4 my-6">
          {[
            ["fernlink-core (Rust)", "The canonical protocol implementation. Covers Ed25519 keypairs, proof signing and verification, gossip deduplication, multi-proof consensus, and an optional Solana RPC client. Published to crates.io."],
            ["fernlink-sdk (TypeScript)", "Full TypeScript port of the core protocol. SimulatedPeer lets you build and test mesh behaviour without any hardware. WebBluetoothPeer connects Chrome and Edge browsers directly into the mesh. Published to npm."],
            ["Android SDK (Kotlin)", "Native Android library with JNI bindings to the Rust core. Includes a full BLE GATT service and client, WiFi Direct transport, NFC bootstrapping for sub-200ms pairing, and a TransportManager that orchestrates all transports simultaneously."],
            ["iOS SDK (Swift)", "Native Swift library using CoreBluetooth for BLE, Multipeer Connectivity for WiFi mesh, and CoreNFC for tap-to-pair bootstrapping. CryptoKit handles Ed25519 signing. A unified TransportManager coordinates all three transports."],
            ["WiFi / TCP Transport", "High-throughput LAN transport for TypeScript and Rust desktop. Peers advertise via mDNS on _fernlink._tcp.local. and connect automatically. A deterministic connection rule prevents duplicate links. Rust desktop runs BLE and WiFi simultaneously."],
            ["Wire Compression (Protocol v2)", "Negotiable LZ4 and zstd compression on every transport. A 1-byte codec prefix wraps each payload; peers advertise supported codecs via the STATUS characteristic. Fully backwards-compatible with uncompressed v1 peers."],
          ].map(([title, desc]) => (
            <div key={title} className="bg-black border border-[#064e3b] p-5 terminal-border">
              <div className="font-mono text-[#22C55E] text-xs uppercase tracking-widest mb-2">{title}</div>
              <p className="font-mono text-xs text-[#166534] leading-relaxed">{desc}</p>
            </div>
          ))}
        </div>

        <H2>// TRY_IT_NOW</H2>
        <P>
          The fastest way to see Fernlink in action is the devnet demo. It spins up three
          simulated mesh peers, sends a real SOL transfer on devnet, routes the verification
          request through the peer mesh, and prints each signed proof alongside the final
          consensus result. No hardware required.
        </P>
        <div className="bg-black border border-[#064e3b] px-5 py-4 font-mono text-sm text-[#22C55E] my-4 flex items-center gap-3">
          <span className="text-[#166534] select-none">$</span>
          <span>npx fernlink-demo</span>
        </div>
        <P>
          Or install the TypeScript SDK and start building:
        </P>
        <div className="bg-black border border-[#064e3b] px-5 py-4 font-mono text-sm text-[#22C55E] my-4 flex items-center gap-3">
          <span className="text-[#166534] select-none">$</span>
          <span>npm install fernlink-sdk</span>
        </div>

        <H2>// WHAT_S_NEXT</H2>
        <P>
          The foundation is solid. Here's what we're building toward:
        </P>
        <ul className="mb-6 space-y-1">
          <Bullet>
            <strong className="text-[#22C55E]">Transaction broadcasting</strong> through the mesh, so devices with no internet can sign locally and relay through a connected peer for submission — making the protocol fully bidirectional.
          </Bullet>
          <Bullet>
            <strong className="text-[#22C55E]">Account and program state queries</strong> so devices can request balances, token holdings, and program state from peers, with responses signed and returned through the gossip layer.
          </Bullet>
          <Bullet>
            <strong className="text-[#22C55E]">Offline payment channels</strong> over BLE. Two devices open a signed channel with no internet and settle on-chain when connectivity returns.
          </Bullet>
          <Bullet>
            <strong className="text-[#22C55E]">Peer reputation and verifier incentives.</strong> Nodes that consistently return accurate proofs accumulate on-chain standing. The $Fern token layer follows protocol maturity.
          </Bullet>
        </ul>
        <P>
          Fernlink is open source and built in public. If you're working on Solana
          infrastructure, offline-first dApps, or BLE mesh networking, we'd love to
          hear from you.
        </P>

        {/* CTA */}
        <div className="mt-12 pt-8 border-t border-[#064e3b] flex flex-wrap gap-4">
          <a
            href={GITHUB}
            target="_blank"
            rel="noopener noreferrer"
            className="font-mono text-sm uppercase tracking-widest border border-[#22C55E] text-[#22C55E] px-5 py-2 inline-block hover:bg-[#22C55E] hover:text-black transition-all"
          >
            [ VIEW ON GITHUB ]
          </a>
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
