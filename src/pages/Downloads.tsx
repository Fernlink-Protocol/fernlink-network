import { useState } from "react";
import { Link } from "react-router-dom";
import { GITHUB } from "@/lib/constants";

const sdks = [
  { platform: "TypeScript / Node.js", version: "v0.2.1", pkg: "fernlink-sdk",     install: "npm install fernlink-sdk",           repo: `${GITHUB}/tree/main/packages/sdk`,            status: "Available" },
  { platform: "Rust Core",            version: "v0.1.0", pkg: "fernlink-core",    install: "cargo add fernlink-core",             repo: `${GITHUB}/tree/main/packages/fernlink-core`,  status: "Available" },
  { platform: "Android (Kotlin)",     version: null,     pkg: "fernlink-android", install: null,                                  repo: `${GITHUB}/tree/main/packages/android`,        status: "Available" },
  { platform: "iOS (Swift)",          version: null,     pkg: "fernlink-ios",     install: null,                                  repo: `${GITHUB}/tree/main/packages/ios`,            status: "Available" },
  { platform: "Web (Browser)",        version: "v0.2.1", pkg: "fernlink-sdk",     install: "npm install fernlink-sdk",           repo: `${GITHUB}/tree/main/packages/sdk`,            status: "Available" },
  { platform: "Desktop (Rust)",       version: null,     pkg: "fernlink-node",    install: "cargo install fernlink-ble-desktop",  repo: `${GITHUB}/tree/main/packages/ble-desktop`,   status: "Available" },
  { platform: "React Native",         version: null,     pkg: "fernlink-rn",      install: null,                                  repo: null,                                          status: "Planned" },
];


function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={() => { navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 1500); }}
      className="ml-3 font-mono text-[10px] uppercase text-[#166534] hover:text-[#22C55E] transition-colors border border-[#064e3b] px-2 py-0.5"
    >
      {copied ? "COPIED" : "COPY"}
    </button>
  );
}

function CodeLine({ cmd }: { cmd: string }) {
  return (
    <div className="flex items-center bg-black border border-[#064e3b] px-4 py-3 font-mono text-sm">
      <span className="text-[#22C55E] mr-3 select-none">$</span>
      <span className="text-[#22C55E]">{cmd}</span>
      <CopyButton text={cmd} />
    </div>
  );
}

export default function Downloads() {
  return (
    <div className="pt-24 pb-20 px-6 max-w-[1440px] mx-auto">

      {/* Header */}
      <section className="pb-12 border-b border-[#064e3b]">
        <div className="font-mono text-[#22C55E] text-sm uppercase tracking-widest mb-4">
          $ ls ./downloads/
        </div>
        <h1 className="font-mono font-bold text-4xl sm:text-5xl text-[#22C55E] mb-4 data-glow">
          Downloads & Resources
        </h1>
        <p className="font-mono text-[#166534] text-lg max-w-2xl">
          Get the SDK, run the demo, read the whitepaper, and explore the source code.
        </p>
      </section>

      {/* Quick Start */}
      <section className="py-12 border-b border-[#064e3b]">
        <div className="font-mono text-[#22C55E] text-sm uppercase tracking-widest mb-6">
          // QUICK_START
        </div>
        <div className="bg-black border border-[#064e3b] p-6 md:p-8 terminal-border space-y-6">
          <div>
            <div className="font-mono text-[10px] text-[#166534] uppercase tracking-widest mb-2">Install TypeScript SDK</div>
            <CodeLine cmd="npm install fernlink-sdk" />
          </div>
          <div>
            <div className="font-mono text-[10px] text-[#166534] uppercase tracking-widest mb-2">Install Rust core</div>
            <CodeLine cmd="cargo add fernlink-core" />
          </div>
          <div>
            <div className="font-mono text-[10px] text-[#166534] uppercase tracking-widest mb-2">Try the live devnet demo</div>
            <CodeLine cmd="npx fernlink-demo" />
          </div>
          <div>
            <div className="font-mono text-[10px] text-[#166534] uppercase tracking-widest mb-3">Verify a transaction via the multi-transport mesh</div>
            <pre className="bg-black border border-[#064e3b] px-4 py-4 font-mono text-sm text-[#22C55E] overflow-x-auto leading-relaxed">
{`import { FernlinkClient } from "fernlink-sdk";
import { TransportManager } from "@fernlink/wifi";

const client = new FernlinkClient({
  rpcEndpoint: "https://api.mainnet-beta.solana.com",
  minProofs: 2,
});

// Discovers peers automatically via mDNS on the local network
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
// "confirmed"  312847291  3`}
            </pre>
          </div>
        </div>
      </section>

      {/* Whitepaper + GitHub */}
      <section className="py-12 border-b border-[#064e3b]">
        <div className="grid md:grid-cols-2 gap-6">
          <div className="bg-black border border-[#064e3b] p-8 terminal-border">
            <span className="material-symbols-outlined text-[#22C55E] text-4xl mb-4 block data-glow">description</span>
            <h2 className="font-mono font-semibold text-xl text-[#22C55E] mb-3">Whitepaper</h2>
            <p className="font-mono text-sm text-[#166534] mb-6 leading-relaxed">
              The complete technical specification covering protocol design,
              security model, transport layers, and performance analysis.
            </p>
            <a
              href={`${GITHUB}/blob/main/whitepaper.md`}
              target="_blank"
              rel="noopener noreferrer"
              className="font-mono text-sm uppercase tracking-widest border border-[#22C55E] text-[#22C55E] px-5 py-2 inline-block hover:bg-[#22C55E] hover:text-black transition-all"
            >
              [ READ WHITEPAPER ]
            </a>
          </div>

          <div className="bg-black border border-[#064e3b] p-8 terminal-border">
            <span className="material-symbols-outlined text-[#22C55E] text-4xl mb-4 block data-glow">code</span>
            <h2 className="font-mono font-semibold text-xl text-[#22C55E] mb-3">Source Code</h2>
            <p className="font-mono text-sm text-[#166534] mb-6 leading-relaxed">
              Full monorepo: Rust core, TypeScript SDK, Android and iOS SDKs, BLE, WiFi Direct P2P
              (Android), and WiFi/TCP (TypeScript/Rust) transports, NFC bootstrapping, cross-transport
              mesh bridge, LZ4/zstd wire compression, and a live devnet demo.
              Apache 2.0 licensed and open for contributions.
            </p>
            <a
              href={GITHUB}
              target="_blank"
              rel="noopener noreferrer"
              className="font-mono text-sm uppercase tracking-widest border border-[#064e3b] text-[#166534] px-5 py-2 inline-block hover:border-[#22C55E] hover:text-[#22C55E] transition-all"
            >
              [ VIEW ON GITHUB ]
            </a>
          </div>
        </div>
      </section>

      {/* SDK table */}
      <section className="py-12 border-b border-[#064e3b]">
        <div className="font-mono text-[#22C55E] text-sm uppercase tracking-widest mb-6">
          // SDK_PACKAGES
        </div>
        <div className="bg-black border border-[#22C55E]/30 p-5 mb-6 flex gap-4 items-start bg-[#22C55E]/5">
          <div className="shrink-0 font-mono text-[10px] uppercase tracking-widest text-black bg-[#22C55E] px-2 py-1 mt-0.5">NEW</div>
          <p className="font-mono text-sm text-[#166534] leading-relaxed">
            <span className="text-[#22C55E]">WebBluetoothPeer</span> is now included in{" "}
            <span className="text-[#22C55E]">fernlink-sdk</span>. Chrome and Edge browsers
            can connect directly to Android or iOS Fernlink nodes over BLE — no native app required.
            Import <span className="text-[#22C55E]">{"{ WebBluetoothPeer }"} from "fernlink-sdk"</span> and
            call <span className="text-[#22C55E]">WebBluetoothPeer.connect()</span> from a button click.
          </p>
        </div>
        <div className="bg-black border border-[#064e3b] terminal-border overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full font-mono text-sm">
              <thead>
                <tr className="border-b border-[#064e3b]">
                  {["Platform", "Install", "Status", "Source"].map((h) => (
                    <th key={h} className="text-left py-3 px-5 text-[#22C55E] text-[10px] uppercase tracking-widest">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {sdks.map((sdk) => (
                  <tr key={sdk.pkg} className="border-b border-[#064e3b] hover:bg-[#22C55E]/5 transition-colors">
                    <td className="py-4 px-5 text-[#22C55E]">
                      {sdk.platform}
                      {sdk.version && (
                        <span className="ml-2 text-[10px] font-mono text-[#166534] border border-[#064e3b] px-1.5 py-0.5">{sdk.version}</span>
                      )}
                    </td>
                    <td className="py-4 px-5 text-[#166534]">
                      {sdk.install ? (
                        <div className="flex items-center">
                          <span>{sdk.install}</span>
                          <CopyButton text={sdk.install} />
                        </div>
                      ) : "—"}
                    </td>
                    <td className="py-4 px-5">
                      <span className={`text-[10px] uppercase tracking-widest px-2 py-1 ${
                        sdk.status === "Available"
                          ? "bg-[#22C55E]/10 text-[#22C55E]"
                          : "bg-[#064e3b]/40 text-[#166534]"
                      }`}>
                        {sdk.status}
                      </span>
                    </td>
                    <td className="py-4 px-5">
                      {sdk.repo ? (
                        <a
                          href={sdk.repo}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-[10px] uppercase text-[#166534] hover:text-[#22C55E] transition-colors"
                        >
                          [ SOURCE ]
                        </a>
                      ) : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* Blog callout */}
      <section className="pt-12">
        <div className="bg-black border border-[#064e3b] p-8 terminal-border flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6">
          <div>
            <div className="font-mono text-[#22C55E] text-sm uppercase tracking-widest mb-2">
              // BLOG_AND_UPDATES
            </div>
            <p className="font-mono text-sm text-[#166534] leading-relaxed max-w-lg">
              Protocol updates, architecture deep-dives, and developer guides are published on the Fernlink blog.
            </p>
          </div>
          <Link
            to="/blog"
            className="font-mono text-sm uppercase tracking-widest border border-[#22C55E] text-[#22C55E] px-5 py-2 inline-block hover:bg-[#22C55E] hover:text-black transition-all shrink-0"
          >
            [ VIEW BLOG ]
          </Link>
        </div>
      </section>
    </div>
  );
}
