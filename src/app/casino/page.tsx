import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Ticket Boosters — Morney",
  description: "Ways to earn more Tickets. Win more Tickets or lose the Tickets you put in. Your savings never move.",
};

import deployment from "@/contracts/deployment.json";
import { addressUrl } from "@/lib/wagmi";

type Game = {
  name: string;
  tag: string;
  how: string;
  payout: string;
  risk: "Low" | "Medium" | "High" | "All in";
  address: string;
  calls: string;
};

const GAMES: Game[] = [
  {
    name: "Roulette",
    tag: "European wheel, 0 to 36",
    how: "Bet Tickets on one number, red or black, odd or even, 1-18 or 19-36. The wheel spins on chain in one transaction.",
    payout: "One number: 36× · Red, black, odd, even, 1-18, 19-36: 2×",
    risk: "High",
    address: deployment.casino.TicketRoulette.address,
    calls: "spin(bet, pick, tickets)",
  },
  {
    name: "Blackjack",
    tag: "Beat the dealer to 21",
    how: "Bet Tickets and get 2 cards. Hit to take more cards, or stand. The dealer draws to 17. The higher total without going over 21 wins.",
    payout: "Blackjack: 2.5× · Win: 2× · Tie: stake back",
    risk: "Medium",
    address: deployment.casino.TicketBlackjack.address,
    calls: "deal(tickets) · hit() · stand()",
  },
];

const riskColor: Record<Game["risk"], string> = {
  Low: "text-win border-win/40",
  Medium: "text-accent-strong border-accent/50",
  High: "text-lose border-lose/50",
  "All in": "text-lose border-lose",
};

export default function CasinoPage() {
  return (
    <main className="flex-1">
      <div className="mx-auto w-full max-w-5xl px-4 py-6 sm:py-10">
        <header className="flex items-center justify-between gap-3">
          <Link href="/" className="flex items-center gap-3">
            <div className="hex grid h-10 w-11 place-items-center bg-accent text-lg font-bold">M</div>
            <div>
              <div className="text-xl font-semibold leading-tight">Morney</div>
              <div className="text-xs text-muted">Save more. Play more.</div>
            </div>
          </Link>
          <Link href="/" className="btn-secondary">
            ← Back to savings
          </Link>
        </header>

        <section className="mt-10 text-center">
          <span className="rounded-full border border-accent/60 bg-accent/10 px-3 py-1 text-xs text-accent-strong">
            Contracts live on Monad Testnet
          </span>
          <h1 className="mt-4 text-3xl font-semibold tracking-tight sm:text-5xl">
            Ticket Boosters
          </h1>
          <p className="mx-auto mt-3 max-w-xl text-sm text-muted sm:text-base">
            Your savings earn Tickets every day. Boosters are a second way to earn: put Tickets in to multiply them. Win more Tickets, or lose the Tickets
            you put in. Your saved USDC never moves.
          </p>
        </section>

        <section className="mt-8 grid gap-3 sm:grid-cols-2">
          {GAMES.map((g) => (
            <article key={g.name} className="card flex flex-col">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <h2 className="text-lg font-semibold">{g.name}</h2>
                  <p className="text-xs text-muted">{g.tag}</p>
                </div>
                <span className={`rounded-full border px-2 py-0.5 text-[11px] ${riskColor[g.risk]}`}>
                  {g.risk} risk
                </span>
              </div>
              <p className="mt-3 flex-1 text-sm text-muted">{g.how}</p>
              <p className="mt-3 font-mono text-sm">{g.payout}</p>
              <p className="mt-3 text-xs text-muted">
                Live contract:{" "}
                <a className="font-mono text-accent-strong hover:underline" href={addressUrl(g.address)} target="_blank" rel="noreferrer">
                  {g.address.slice(0, 6)}…{g.address.slice(-4)} ↗
                </a>
                <br />
                Calls: <span className="font-mono">{g.calls}</span>
              </p>
              <button className="btn-secondary mt-4 w-full" disabled>
                Play screen coming soon
              </button>
            </article>
          ))}
        </section>

        <section className="mt-8 grid gap-3 sm:grid-cols-3">
          <div className="rounded-2xl border border-border bg-surface p-4">
            <h3 className="text-sm font-semibold">Tickets only</h3>
            <p className="mt-1 text-sm text-muted">Every booster uses Tickets. No booster can touch your saved USDC.</p>
          </div>
          <div className="rounded-2xl border border-border bg-surface p-4">
            <h3 className="text-sm font-semibold">On-chain draws</h3>
            <p className="mt-1 text-sm text-muted">
              Each result settles on Monad. Fast blocks make every round feel instant.
            </p>
          </div>
          <div className="rounded-2xl border border-border bg-surface p-4">
            <h3 className="text-sm font-semibold">More Tickets, more yield</h3>
            <p className="mt-1 text-sm text-muted">
              Tickets you win go into the Hex Yield Draw, where they win real USDC yield.
            </p>
          </div>
        </section>

        <p className="mt-8 text-center text-xs text-muted">
          The contracts are live and verified on Monad Testnet. The play screens are not built yet. Testnet demo only.
        </p>
      </div>
    </main>
  );
}
