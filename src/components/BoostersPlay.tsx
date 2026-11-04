"use client";

import { useState, useSyncExternalStore } from "react";
import { formatUnits, parseAbi, parseEventLogs, type Address, type Hash } from "viem";
import {
  useConnect,
  useConnection,
  useConnectors,
  usePublicClient,
  useReadContracts,
  useSwitchChain,
  useWriteContract,
} from "wagmi";

import deployment from "@/contracts/deployment.json";
import { vault } from "@/lib/contracts";
import { chain, txUrl } from "@/lib/wagmi";

const rouletteAbi = parseAbi([
  "function spin(uint8 bet, uint8 pick, uint256 tickets) returns (uint8 result, uint256 ticketsWon)",
  "event Spun(address indexed player, uint8 bet, uint8 pick, uint256 tickets, uint8 result, uint256 ticketsWon)",
]);
const blackjackAbi = parseAbi([
  "function deal(uint256 tickets)",
  "function hit()",
  "function stand()",
  "function getHand(address player) view returns (uint256 tickets, uint8[] playerCards, uint8[] dealerCards, bool active, uint8 playerTotal, uint8 dealerTotal)",
  "event Finished(address indexed player, uint8 result, uint8 playerTotal, uint8 dealerTotal, uint256 ticketsWon)",
]);
const roulette = { address: deployment.casino.TicketRoulette.address as Address, abi: rouletteAbi };
const blackjack = { address: deployment.casino.TicketBlackjack.address as Address, abi: blackjackAbi };

const RED = new Set([1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36]);
const BETS = ["One number", "Red", "Black", "Odd", "Even", "1-18", "19-36"];
const RESULTS = ["You lost", "Tie: stake back", "You won", "Blackjack!"];
const CARD = ["", "A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"];

const fmtTickets = (v: bigint) =>
  Number(formatUnits(v, 18)).toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 2 });

function errorText(e: unknown) {
  const err = e as { shortMessage?: string; message?: string };
  const text = err.shortMessage ?? err.message ?? "Transaction failed.";
  if (/user rejected|denied/i.test(text)) return "You rejected the request in MetaMask.";
  if (/InsufficientTickets/.test(text)) return "You do not have enough Tickets.";
  return text.split("\n")[0].slice(0, 140);
}

export function BoostersPlay() {
  const mounted = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );
  const { address, isConnected, chainId } = useConnection();
  const connectors = useConnectors();
  const connect = useConnect();
  const switchChain = useSwitchChain();
  const write = useWriteContract();
  const publicClient = usePublicClient({ chainId: chain.id });
  const ready = mounted && isConnected && chainId === chain.id && !!address;
  const user = address ?? "0x0000000000000000000000000000000000000000";

  const reads = useReadContracts({
    contracts: [
      { ...vault, functionName: "ticketsOf", args: [user] },
      { ...blackjack, functionName: "getHand", args: [user] },
    ],
    query: { enabled: ready, refetchInterval: 3000 },
  });
  const tickets = (reads.data?.[0]?.result as bigint | undefined) ?? 0n;
  const hand = reads.data?.[1]?.result as
    | readonly [bigint, readonly number[], readonly number[], boolean, number, number]
    | undefined;

  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Roulette
  const [bet, setBet] = useState(1);
  const [pick, setPick] = useState("7");
  const [rTickets, setRTickets] = useState("1");
  const [spin, setSpin] = useState<{ result: number; won: bigint; staked: bigint; hash: Hash } | null>(null);

  // Blackjack
  const [bTickets, setBTickets] = useState("1");
  const [finish, setFinish] = useState<{ result: number; won: bigint; hash: Hash } | null>(null);

  async function send(label: string, action: () => Promise<Hash>) {
    if (!publicClient) return;
    setBusy(label);
    setError(null);
    try {
      const hash = await action();
      const receipt = await publicClient.waitForTransactionReceipt({ hash });
      if (receipt.status !== "success") throw new Error("The transaction reverted on chain.");
      await reads.refetch();
      return receipt;
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(null);
    }
  }

  const whole = (v: string) => BigInt(Math.max(0, Math.floor(Number(v) || 0)));

  async function onSpin() {
    const t = whole(rTickets);
    if (t === 0n) return setError("Bet at least 1 Ticket.");
    const p = Math.min(36, Math.max(0, Math.floor(Number(pick) || 0)));
    const receipt = await send("spin", () =>
      write.mutateAsync({ ...roulette, functionName: "spin", args: [bet, p, t], gas: 500_000n }),
    );
    if (!receipt) return;
    const [log] = parseEventLogs({ abi: rouletteAbi, logs: receipt.logs, eventName: "Spun" });
    if (log) setSpin({ result: log.args.result, won: log.args.ticketsWon, staked: t, hash: receipt.transactionHash });
  }

  async function onBlackjack(action: "deal" | "hit" | "stand") {
    if (action === "deal") {
      const t = whole(bTickets);
      if (t === 0n) return setError("Bet at least 1 Ticket.");
      setFinish(null);
    }
    const receipt = await send(action, () =>
      action === "deal"
        ? write.mutateAsync({ ...blackjack, functionName: "deal", args: [whole(bTickets)], gas: 900_000n })
        : write.mutateAsync({ ...blackjack, functionName: action, gas: 900_000n }),
    );
    if (!receipt) return;
    const [log] = parseEventLogs({ abi: blackjackAbi, logs: receipt.logs, eventName: "Finished" });
    if (log) setFinish({ result: log.args.result, won: log.args.ticketsWon, hash: receipt.transactionHash });
  }

  if (!mounted) return null;

  const gate = !isConnected ? (
    <button
      className="btn-primary"
      onClick={() =>
        connectors[0] &&
        connect.mutateAsync({ connector: connectors[0], chainId: chain.id }).catch((e) => setError(errorText(e)))
      }
    >
      Connect MetaMask to play
    </button>
  ) : chainId !== chain.id ? (
    <button className="btn-primary" onClick={() => switchChain.mutateAsync({ chainId: chain.id }).catch(() => {})}>
      Switch to Monad Testnet
    </button>
  ) : null;

  return (
    <section className="mt-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-semibold">Play now</h2>
        {gate ?? (
          <span className="rounded-full border border-accent/60 bg-accent/10 px-3 py-1 font-mono text-sm">
            {fmtTickets(tickets)} Tickets
          </span>
        )}
      </div>

      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        {/* Roulette */}
        <div className="card">
          <h3 className="font-semibold">Roulette</h3>
          <label className="mt-3 block text-xs uppercase tracking-wider text-muted">Bet</label>
          <div className="mt-2 flex flex-wrap gap-2">
            {BETS.map((b, i) => (
              <button
                key={b}
                onClick={() => setBet(i)}
                className={`rounded-xl border px-3 py-1.5 text-xs ${bet === i ? "border-accent bg-accent/20" : "border-border text-muted"}`}
              >
                {b}
              </button>
            ))}
          </div>
          <div className="mt-3 flex gap-2">
            {bet === 0 && (
              <input
                className="input w-24"
                inputMode="numeric"
                value={pick}
                onChange={(e) => setPick(e.target.value.replace(/[^0-9]/g, ""))}
                aria-label="Number from 0 to 36"
              />
            )}
            <input
              className="input"
              inputMode="numeric"
              value={rTickets}
              onChange={(e) => setRTickets(e.target.value.replace(/[^0-9]/g, ""))}
              aria-label="Tickets to bet"
            />
          </div>
          <button className="btn-primary mt-3 w-full" onClick={onSpin} disabled={!ready || !!busy}>
            {busy === "spin" ? "Spinning on chain…" : `Spin · bet ${rTickets || 0} Ticket${rTickets === "1" ? "" : "s"}`}
          </button>
          {spin && (
            <div className="mt-3 flex items-center gap-3 text-sm">
              <span
                className={`grid h-12 w-12 place-items-center rounded-full font-mono text-lg font-semibold text-white ${
                  spin.result === 0 ? "bg-emerald-600" : RED.has(spin.result) ? "bg-red-600" : "bg-neutral-800"
                }`}
              >
                {spin.result}
              </span>
              <span className={spin.won > 0n ? "text-win" : "text-lose"}>
                {spin.won > 0n
                  ? `You won ${fmtTickets(spin.won)} Tickets!`
                  : `You lost ${spin.staked.toString()} Ticket${spin.staked === 1n ? "" : "s"}.`}{" "}
                <a className="text-muted hover:underline" href={txUrl(spin.hash)} target="_blank" rel="noreferrer">
                  tx ↗
                </a>
              </span>
            </div>
          )}
        </div>

        {/* Blackjack */}
        <div className="card">
          <h3 className="font-semibold">Blackjack</h3>
          {hand && hand[1].length > 0 && (
            <div className="mt-3 space-y-2 text-sm">
              <Cards label={`You · ${hand[4]}`} cards={hand[1]} />
              <Cards label={`Dealer · ${hand[5]}`} cards={hand[2]} />
            </div>
          )}
          {hand?.[3] ? (
            <div className="mt-3 grid grid-cols-2 gap-2">
              <button className="btn-secondary" onClick={() => onBlackjack("hit")} disabled={!ready || !!busy}>
                {busy === "hit" ? "Drawing…" : "Hit"}
              </button>
              <button className="btn-primary" onClick={() => onBlackjack("stand")} disabled={!ready || !!busy}>
                {busy === "stand" ? "Dealer plays…" : "Stand"}
              </button>
            </div>
          ) : (
            <>
              <input
                className="input mt-3"
                inputMode="numeric"
                value={bTickets}
                onChange={(e) => setBTickets(e.target.value.replace(/[^0-9]/g, ""))}
                aria-label="Tickets to bet"
              />
              <button className="btn-primary mt-3 w-full" onClick={() => onBlackjack("deal")} disabled={!ready || !!busy}>
                {busy === "deal" ? "Dealing on chain…" : `Deal · bet ${bTickets || 0} Ticket${bTickets === "1" ? "" : "s"}`}
              </button>
            </>
          )}
          {finish && !hand?.[3] && (
            <p className={`mt-3 text-sm ${finish.result >= 2 ? "text-win" : finish.result === 1 ? "text-muted" : "text-lose"}`}>
              {RESULTS[finish.result]}
              {finish.won > 0n ? ` · ${fmtTickets(finish.won)} Tickets paid` : ""}{" "}
              <a className="text-muted hover:underline" href={txUrl(finish.hash)} target="_blank" rel="noreferrer">
                tx ↗
              </a>
            </p>
          )}
        </div>
      </div>

      {error && <p className="mt-3 text-center text-sm text-lose">{error}</p>}
    </section>
  );
}

function Cards({ label, cards }: { label: string; cards: readonly number[] }) {
  return (
    <div className="flex items-center gap-2">
      <span className="w-24 text-muted">{label}</span>
      <div className="flex gap-1">
        {cards.map((c, i) => (
          <span key={i} className="grid h-9 w-7 place-items-center rounded-md bg-white font-mono text-sm font-semibold text-neutral-900">
            {CARD[c]}
          </span>
        ))}
      </div>
    </div>
  );
}
