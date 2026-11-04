"use client";

// The same top bar as the Savings and Hex Draw pages, for the Ticket Booster screens.
// These screens have no wagmi provider, so this header talks to MetaMask directly.
import Link from "next/link";
import { useEffect, useState, useSyncExternalStore } from "react";

import { Wordmark } from "@/components/Logo";
import { activeChain, NETWORK, rpcFor, setNetwork } from "@/lib/network";

type Eth = {
  request: (a: { method: string; params?: unknown[] }) => Promise<unknown>;
  on?: (event: string, cb: (...args: unknown[]) => void) => void;
  removeListener?: (event: string, cb: (...args: unknown[]) => void) => void;
};
const getEth = () => (typeof window === "undefined" ? undefined : (window as { ethereum?: Eth }).ethereum);

const NAV = [
  { href: "/savings", label: "Savings" },
  { href: "/draw", label: "Hex Draw" },
  { href: "/play", label: "Ticket Boosters" },
];

const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;

async function ensureChain(eth: Eth) {
  const chainId = `0x${activeChain.id.toString(16)}`;
  try {
    await eth.request({ method: "wallet_switchEthereumChain", params: [{ chainId }] });
  } catch (e) {
    if ((e as { code?: number }).code === 4902) {
      await eth.request({
        method: "wallet_addEthereumChain",
        params: [
          {
            chainId,
            chainName: activeChain.name,
            nativeCurrency: activeChain.nativeCurrency,
            rpcUrls: [rpcFor(NETWORK)],
            blockExplorerUrls: [activeChain.blockExplorers.default.url],
          },
        ],
      });
    }
  }
}

export function SiteHeader() {
  const mounted = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );
  const [account, setAccount] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Read the connected account, and follow account changes in MetaMask.
  useEffect(() => {
    const eth = getEth();
    if (!eth) return;
    const update = (accs: unknown) => setAccount(((accs as string[]) ?? [])[0] ?? null);
    eth.request({ method: "eth_accounts" }).then(update).catch(() => {});
    const onChange = (accs: unknown) => {
      update(accs);
      window.location.reload();
    };
    eth.on?.("accountsChanged", onChange);
    return () => eth.removeListener?.("accountsChanged", onChange);
  }, []);

  async function connect() {
    const eth = getEth();
    if (!eth) return setError("Install MetaMask to play.");
    setBusy(true);
    setError(null);
    try {
      await eth.request({ method: "eth_requestAccounts" });
      await ensureChain(eth);
      // Reload so the game reads this wallet's Tickets.
      window.location.reload();
    } catch (e) {
      const msg = (e as { message?: string }).message ?? "";
      setError(/reject|denied/i.test(msg) ? "You rejected the request in MetaMask." : "Could not connect MetaMask.");
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto flex h-16 max-w-[1400px] items-center justify-between gap-3 px-4 sm:px-6">
      <Link href="/" aria-label="Morney home">
        <Wordmark />
      </Link>
      <nav className="hidden items-center gap-8 font-mono text-[13px] uppercase tracking-[0.08em] md:flex">
        {NAV.map((n) => (
          <Link
            key={n.href}
            href={n.href}
            className={n.href === "/play" ? "text-primary" : "text-foreground/70 transition-colors hover:text-primary"}
          >
            {n.label}
          </Link>
        ))}
      </nav>
      <div className="flex items-center gap-2">
        {mounted && (
          <button
            className="flex items-center gap-1 border border-foreground/15 p-1 font-mono text-[11px] uppercase tracking-[0.08em]"
            onClick={() => setNetwork(NETWORK === "mainnet" ? "testnet" : "mainnet")}
            title="Switch between Monad Mainnet and Monad Testnet"
          >
            <span className={`px-2 py-1 ${NETWORK === "mainnet" ? "bg-primary text-white" : "text-muted"}`}>Mainnet</span>
            <span className={`px-2 py-1 ${NETWORK === "testnet" ? "bg-primary text-white" : "text-muted"}`}>Testnet</span>
          </button>
        )}
        {!mounted ? (
          <span className="w-36" />
        ) : account ? (
          <span className="border border-foreground/15 px-4 py-2.5 font-mono text-xs uppercase tracking-[0.08em]">
            {short(account)}
          </span>
        ) : (
          <button
            className="bg-primary px-4 py-3 font-mono text-xs uppercase tracking-[0.08em] text-white transition hover:bg-foreground disabled:opacity-50"
            onClick={connect}
            disabled={busy}
            title={error ?? undefined}
          >
            {busy ? "Connecting…" : error ? "Retry MetaMask" : "Connect MetaMask"}
          </button>
        )}
      </div>
    </div>
  );
}
