import { Link } from "react-router-dom";

const posts = [
  {
    slug:    "/blog/introducing-fernlink",
    date:    "2026-05-02",
    title:   "Introducing Fernlink: A New Paradigm for Solana Verification",
    excerpt: "Every Solana wallet and dApp shares the same chokepoint: a handful of centralized RPC providers. When they slow down, the entire ecosystem slows with them. We built Fernlink to break that dependency — open-sourcing a full peer-to-peer mesh that lets nearby devices collaboratively verify transactions and share the cryptographic proof.",
    tags:    ["PROTOCOL", "OPEN SOURCE"],
    status:  "published",
  },
  {
    slug:    "/blog/multi-transport",
    date:    "2026-05-15",
    title:   "Multi-Transport Fernlink: BLE, WiFi/TCP, and NFC Working Together",
    excerpt: "A deep-dive into the multi-transport architecture: how BLE, WiFi/TCP with mDNS peer discovery, and NFC bootstrapping each solve a different part of the connectivity problem, and how TransportManager coordinates them under a single API across Android, iOS, TypeScript, and Rust desktop.",
    tags:    ["ARCHITECTURE", "ANDROID", "IOS"],
    status:  "published",
  },
  {
    slug:    null,
    date:    "2026-06-01",
    title:   "How BLE Mesh Networks Can Reduce RPC Costs by 80%",
    excerpt: "A rigorous look at the math behind the 60–80% RPC reduction claim: density models, proof propagation curves, and the conditions under which the mesh provides the most value. Includes benchmarks from the devnet demo across simulated peer counts.",
    tags:    ["PERFORMANCE", "PROTOCOL"],
    status:  "upcoming",
  },
  {
    slug:    null,
    date:    "2026-06-15",
    title:   "Building Offline-First Solana Applications",
    excerpt: "A practical guide to integrating Fernlink into a Solana dApp: choosing the right transport for your use case, handling the direct RPC fallback, reasoning about consensus thresholds, and testing mesh behaviour without physical hardware using FernlinkSimulator.",
    tags:    ["DEVELOPER GUIDE", "SDK"],
    status:  "upcoming",
  },
];

export default function Blog() {
  return (
    <div className="pt-24 pb-20 px-6 max-w-[1440px] mx-auto">

      {/* Header */}
      <section className="pb-12 border-b border-[#064e3b]">
        <div className="font-mono text-[#22C55E] text-sm uppercase tracking-widest mb-4">
          $ ls ./blog/
        </div>
        <h1 className="font-mono font-bold text-4xl sm:text-5xl text-[#22C55E] mb-4 data-glow">
          Blog
        </h1>
        <p className="font-mono text-[#166534] text-lg max-w-2xl leading-relaxed">
          Protocol updates, technical deep-dives, and developer guides from the Fernlink team.
        </p>
      </section>

      {/* Post list */}
      <section className="py-16">
        <div className="space-y-6">
          {posts.map((post) => {
            const card = (
              <div className={`bg-black border p-8 terminal-border transition-all duration-300 ${
                post.status === "published"
                  ? "border-[#064e3b] hover:border-[#22C55E] cursor-pointer group"
                  : "border-[#064e3b]/50 opacity-70"
              }`}>
                <div className="flex flex-wrap items-start justify-between gap-4 mb-5">
                  {/* Tags + date */}
                  <div className="flex flex-wrap items-center gap-2">
                    {post.tags.map((tag) => (
                      <span
                        key={tag}
                        className="font-mono text-[10px] uppercase tracking-widest border border-[#064e3b] text-[#166534] px-2 py-0.5"
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <span className="font-mono text-[10px] uppercase tracking-widest text-[#166534]">
                      {post.date}
                    </span>
                    {post.status === "upcoming" && (
                      <span className="font-mono text-[10px] uppercase tracking-widest bg-[#064e3b]/60 text-[#166534] px-2 py-0.5 border border-[#064e3b]">
                        UPCOMING
                      </span>
                    )}
                    {post.status === "published" && (
                      <span className="font-mono text-[10px] uppercase tracking-widest bg-[#22C55E]/10 text-[#22C55E] px-2 py-0.5 border border-[#22C55E]/40">
                        PUBLISHED
                      </span>
                    )}
                  </div>
                </div>

                <h2 className={`font-mono font-semibold text-xl mb-3 leading-snug ${
                  post.status === "published"
                    ? "text-[#22C55E] group-hover:data-glow"
                    : "text-[#22C55E]/60"
                }`}>
                  {post.title}
                </h2>

                <p className="font-mono text-sm text-[#166534] leading-relaxed mb-6 max-w-3xl">
                  {post.excerpt}
                </p>

                {post.status === "published" && (
                  <div className="font-mono text-xs uppercase tracking-widest text-[#22C55E] flex items-center gap-2 group-hover:gap-3 transition-all">
                    <span>READ ARTICLE</span>
                    <span>→</span>
                  </div>
                )}
              </div>
            );

            return post.slug ? (
              <Link key={post.title} to={post.slug}>
                {card}
              </Link>
            ) : (
              <div key={post.title}>{card}</div>
            );
          })}
        </div>
      </section>

      {/* Subscribe nudge */}
      <section className="border-t border-[#064e3b] pt-12">
        <div className="bg-black border border-[#064e3b] p-8 terminal-border">
          <div className="font-mono text-[#22C55E] text-sm uppercase tracking-widest mb-3">
            // STAY_UPDATED
          </div>
          <p className="font-mono text-sm text-[#166534] leading-relaxed mb-5 max-w-xl">
            New posts are announced on Telegram and GitHub. Follow along to be notified
            when technical deep-dives and protocol updates are published.
          </p>
          <div className="flex flex-wrap gap-4">
            <a
              href="https://t.me/Stranger3145"
              target="_blank"
              rel="noopener noreferrer"
              className="font-mono text-sm uppercase tracking-widest border border-[#22C55E] text-[#22C55E] px-5 py-2 inline-block hover:bg-[#22C55E] hover:text-black transition-all"
            >
              [ JOIN TELEGRAM ]
            </a>
            <a
              href="https://github.com/OnoseAnthony/fernlink-network"
              target="_blank"
              rel="noopener noreferrer"
              className="font-mono text-sm uppercase tracking-widest border border-[#064e3b] text-[#166534] px-5 py-2 inline-block hover:border-[#22C55E] hover:text-[#22C55E] transition-all"
            >
              [ WATCH ON GITHUB ]
            </a>
          </div>
        </div>
      </section>
    </div>
  );
}
