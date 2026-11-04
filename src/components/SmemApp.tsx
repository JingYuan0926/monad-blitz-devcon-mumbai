"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { formatUnits, maxUint256, parseEventLogs, parseUnits, type Hash } from "viem";
import {
  useConnect,
  useConnection,
  useConnectors,
  useDisconnect,
  usePublicClient,
  useReadContracts,
  useSwitchChain,
  useWriteContract,
} from "wagmi";

import { hexGame, TILES, TICKET_DECIMALS, usdc, USDC_DECIMALS, vault } from "@/lib/contracts";
import { addressUrl, chain, txUrl } from "@/lib/wagmi";

type Play = { hash: Hash; picked: number; drawn: number; staked: bigint; points: bigint };
type Busy = null | "connect" | "faucet" | "deposit" | "withdraw" | "play" | "switch";

const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;
const fmt = (n: number, digits = 2) =>
  n.toLocaleString("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits });

function errorText(e: unknown) {
  const err = e as { shortMessage?: string; message?: string };
  const text = err.shortMessage ?? err.message ?? "Transaction failed.";
  if (/user rejected|denied/i.test(text)) return "You rejected the request in MetaMask.";
  if (/InsufficientTickets/.test(text)) return "You do not have enough Tickets for this stake.";
  if (/InsufficientPrincipal/.test(text)) return "You cannot withdraw more than you saved.";
  if (/provider not found|connector not found/i.test(text)) return "MetaMask is not installed in this browser.";
  return text.split("\n")[0].slice(0, 160);
}

export function SmemApp() {
  // False during server render, true in the browser. Wallet state only exists in the browser.
  const mounted = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );

  const { address, isConnected, chainId } = useConnection();
  const connectors = useConnectors();
  const connect = useConnect();
  const disconnect = useDisconnect();
  const switchChain = useSwitchChain();
  const write = useWriteContract();
  const publicClient = usePublicClient({ chainId: chain.id });

  const wrongChain = isConnected && chainId !== chain.id;
  const ready = mounted && isConnected && !wrongChain && !!address;

  const [busy, setBusy] = useState<Busy>(null);
  const [error, setError] = useState<string | null>(null);
  const [lastTx, setLastTx] = useState<{ label: string; hash: Hash } | null>(null);
  const [amount, setAmount] = useState("100");
  const [tile, setTile] = useState<number>(1);
  const [stake, setStake] = useState("1");
  const [plays, setPlays] = useState<Play[]>([]);
  const [rollingTile, setRollingTile] = useState<number | null>(null);

  // A browser clock that ticks every 100 ms. It stays 0 during the server prerender.
  const [now, setNow] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 100);
    return () => clearInterval(id);
  }, []);
  // The vault counts Prize Points per UTC day.
  const today = BigInt(Math.floor(now / 1000 / 86400));
  const user = address ?? "0x0000000000000000000000000000000000000000";

  const reads = useReadContracts({
    contracts: [
      { ...usdc, functionName: "balanceOf", args: [user] },
      { ...usdc, functionName: "allowance", args: [user, vault.address] },
      { ...vault, functionName: "principalOf", args: [user] },
      { ...vault, functionName: "ticketsOf", args: [user] },
      { ...vault, functionName: "ticketRateOf", args: [user] },
      { ...vault, functionName: "pointsOf", args: [today, user] },
      { ...vault, functionName: "lifetimePointsOf", args: [user] },
      { ...vault, functionName: "totalPrincipal" },
    ],
    query: { enabled: ready && now > 0, refetchInterval: 4000 },
  });

  const value = (i: number) => (reads.data?.[i]?.result as bigint | undefined) ?? 0n;
  const walletUsdc = value(0);
  const allowance = value(1);
  const principal = value(2);
  const tickets = value(3);
  const ticketRate = value(4);
  const pointsToday = value(5);
  const lifetimePoints = value(6);
  const totalPrincipal = value(7);

  // Tickets grow every second. Count them up between reads so the user sees them grow.
  const readAt = reads.dataUpdatedAt;
  const elapsed = readAt && now > readAt ? (now - readAt) / 1000 : 0;
  const liveTickets =
    Number(formatUnits(tickets, TICKET_DECIMALS)) + Number(formatUnits(ticketRate, TICKET_DECIMALS)) * elapsed;
  const wholeTickets = Math.floor(Number(formatUnits(tickets, TICKET_DECIMALS)));
  const ticketsPerMinute = Number(formatUnits(ticketRate, TICKET_DECIMALS)) * 60;

  async function run(label: Exclude<Busy, null>, action: () => Promise<Hash>) {
    if (!publicClient) return;
    setBusy(label);
    setError(null);
    try {
      const hash = await action();
      const receipt = await publicClient.waitForTransactionReceipt({ hash });
      if (receipt.status !== "success") throw new Error("The transaction reverted on chain.");
      setLastTx({ label, hash });
      await reads.refetch();
      return receipt;
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(null);
    }
  }

  async function onConnect() {
    const metaMask = connectors[0];
    if (!metaMask) return setError("MetaMask is not installed in this browser.");
    setBusy("connect");
    setError(null);
    try {
      await connect.mutateAsync({ connector: metaMask, chainId: chain.id });
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(null);
    }
  }

  async function onSwitch() {
    setBusy("switch");
    setError(null);
    try {
      await switchChain.mutateAsync({ chainId: chain.id });
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(null);
    }
  }

  const onFaucet = () =>
    run("faucet", () => write.mutateAsync({ ...usdc, functionName: "faucet" }));

  async function onDeposit() {
    const value = safeParse(amount, USDC_DECIMALS);
    if (!value) return setError("Enter an amount greater than 0.");
    if (value > walletUsdc) return setError("Your wallet does not have that much tUSDC. Get some from the faucet.");
    await run("deposit", async () => {
      if (allowance < value) {
        // One approval lets every later deposit go through in a single transaction.
        const approveHash = await write.mutateAsync({
          ...usdc,
          functionName: "approve",
          args: [vault.address, maxUint256],
        });
        await publicClient!.waitForTransactionReceipt({ hash: approveHash });
      }
      return write.mutateAsync({ ...vault, functionName: "deposit", args: [value] });
    });
  }

  async function onWithdraw() {
    const value = safeParse(amount, USDC_DECIMALS);
    if (!value) return setError("Enter an amount greater than 0.");
    if (value > principal) return setError("You cannot withdraw more than you saved.");
    await run("withdraw", () => write.mutateAsync({ ...vault, functionName: "withdraw", args: [value] }));
  }

  async function onPlay() {
    const staked = BigInt(Math.max(0, Math.floor(Number(stake) || 0)));
    if (staked === 0n) return setError("Stake at least 1 Ticket.");
    if (Number(staked) > liveTickets) return setError("You do not have enough Tickets for this stake.");

    let i = 0;
    const roll = setInterval(() => setRollingTile(TILES[i++ % TILES.length]), 110);
    try {
      const receipt = await run("play", () =>
        write.mutateAsync({ ...hexGame, functionName: "play", args: [tile, staked] }),
      );
      if (!receipt) return;
      const [played] = parseEventLogs({ abi: hexGame.abi, logs: receipt.logs, eventName: "Played" }) as unknown as {
        args: { pickedTile: number; drawnTile: number; ticketsBurned: bigint; pointsWon: bigint };
      }[];
      if (played) {
        setPlays((p) =>
          [
            {
              hash: receipt.transactionHash,
              picked: played.args.pickedTile,
              drawn: played.args.drawnTile,
              staked: played.args.ticketsBurned,
              points: played.args.pointsWon,
            },
            ...p,
          ].slice(0, 6),
        );
      }
    } finally {
      clearInterval(roll);
      setRollingTile(null);
    }
  }

  const lastPlay = plays[0];
  const drawnTile = busy === "play" ? rollingTile : lastPlay?.drawn;

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-6 sm:py-10">
      {/* Header */}
      <header className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="hex grid h-10 w-11 place-items-center bg-accent text-lg font-bold">M</div>
          <div>
            <h1 className="text-xl font-semibold leading-tight">Morney</h1>
            <p className="text-xs text-muted">Save more. Play more.</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="hidden rounded-full border border-border px-3 py-1 text-xs text-muted sm:inline">
            Monad Testnet
          </span>
          {!mounted ? null : !isConnected ? (
            <button className="btn-primary" onClick={onConnect} disabled={busy === "connect"}>
              {busy === "connect" ? "Connecting…" : "Connect MetaMask"}
            </button>
          ) : wrongChain ? (
            <button className="btn-primary" onClick={onSwitch} disabled={busy === "switch"}>
              {busy === "switch" ? "Switching…" : "Switch to Monad Testnet"}
            </button>
          ) : (
            <button
              className="rounded-full border border-border bg-surface px-4 py-2 font-mono text-sm hover:border-accent"
              onClick={() => disconnect.mutate({})}
              title="Disconnect"
            >
              {short(address!)}
            </button>
          )}
        </div>
      </header>

      {/* Hero */}
      <section className="mt-8 text-center sm:mt-12">
        <h2 className="text-3xl font-semibold tracking-tight sm:text-5xl">
          Your savings stay safe.
          <br />
          <span className="text-accent-strong">Your Tickets play.</span>
        </h2>
        <p className="mx-auto mt-3 max-w-xl text-sm text-muted sm:text-base">
          Deposit USDC. Earn Tickets every second. Burn Tickets in the hex game to win Prize Points. A loss
          costs Tickets, never your deposit.
        </p>
      </section>

      {/* Stats */}
      <section className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Wallet" value={ready ? fmt(Number(formatUnits(walletUsdc, USDC_DECIMALS))) : "—"} unit="tUSDC" />
        <Stat label="Saved" value={ready ? fmt(Number(formatUnits(principal, USDC_DECIMALS))) : "—"} unit="tUSDC" />
        <Stat
          label="Tickets"
          value={ready ? fmt(liveTickets) : "—"}
          unit={ready && ticketRate > 0n ? `+${fmt(ticketsPerMinute)}/min` : "Tickets"}
          highlight
        />
        <Stat
          label="Prize Points"
          value={ready ? pointsToday.toLocaleString() : "—"}
          unit={ready ? `today · ${lifetimePoints.toLocaleString()} all time` : "today"}
        />
      </section>

      {!ready && mounted && (
        <div className="mt-6 rounded-2xl border border-dashed border-border p-6 text-center text-sm text-muted">
          {wrongChain ? "Switch MetaMask to Monad Testnet to continue." : "Connect MetaMask to start saving and playing."}
        </div>
      )}

      {/* Main */}
      <section className="mt-6 grid gap-4 md:grid-cols-[1fr_1.3fr]">
        {/* Savings */}
        <div className="card">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold">Savings</h3>
            <button className="text-sm text-accent-strong hover:underline disabled:opacity-40" onClick={onFaucet} disabled={!ready || !!busy}>
              {busy === "faucet" ? "Minting…" : "Get 1,000 test USDC"}
            </button>
          </div>
          <p className="mt-1 text-sm text-muted">
            Every 1 tUSDC you save earns Tickets each second. Withdraw your full deposit at any time.
          </p>

          <label className="mt-5 block text-xs uppercase tracking-wider text-muted" htmlFor="amount">
            Amount (tUSDC)
          </label>
          <div className="mt-2 flex gap-2">
            <input
              id="amount"
              inputMode="decimal"
              className="input"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="100"
            />
            <button
              className="rounded-xl border border-border px-3 text-xs text-muted hover:text-foreground disabled:opacity-40"
              disabled={!ready}
              onClick={() => setAmount(formatUnits(walletUsdc, USDC_DECIMALS))}
            >
              MAX
            </button>
          </div>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <button className="btn-primary" onClick={onDeposit} disabled={!ready || !!busy}>
              {busy === "deposit" ? "Depositing…" : "Deposit"}
            </button>
            <button className="btn-secondary" onClick={onWithdraw} disabled={!ready || !!busy || principal === 0n}>
              {busy === "withdraw" ? "Withdrawing…" : "Withdraw"}
            </button>
          </div>

          <dl className="mt-5 space-y-2 border-t border-border pt-4 text-sm">
            <Row label="Total saved by everyone" value={`${fmt(Number(formatUnits(totalPrincipal, USDC_DECIMALS)))} tUSDC`} />
            <Row label="Your Ticket rate" value={`${fmt(ticketsPerMinute)} per minute`} />
            <Row label="Yield source" value="Simulated (testnet)" />
          </dl>
        </div>

        {/* Game */}
        <div className="card">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold">Hex Spin</h3>
            <span className="text-xs text-muted">Win = stake × 6 Prize Points</span>
          </div>
          <p className="mt-1 text-sm text-muted">
            Pick a tile and stake Tickets. The game burns your stake. If the drawn tile matches your pick, you win
            Prize Points.
          </p>

          <div className="mt-5 grid grid-cols-3 justify-items-center gap-x-2 gap-y-3">
            {TILES.map((t) => {
              const picked = t === tile;
              const drawn = t === drawnTile;
              const won = drawn && busy !== "play" && lastPlay?.picked === t;
              return (
                <button
                  key={t}
                  onClick={() => setTile(t)}
                  disabled={busy === "play"}
                  aria-pressed={picked}
                  aria-label={`Tile ${t}`}
                  className={[
                    "hex grid aspect-[1.15] w-full max-w-28 place-items-center text-2xl font-semibold transition",
                    drawn && busy === "play" ? "hex-rolling bg-accent-strong text-background" : "",
                    drawn && busy !== "play" ? (won ? "bg-win text-background" : "bg-lose text-background") : "",
                    !drawn && picked ? "bg-accent text-foreground" : "",
                    !drawn && !picked ? "bg-surface-2 text-muted hover:bg-border" : "",
                  ].join(" ")}
                >
                  {t}
                </button>
              );
            })}
          </div>

          <label className="mt-5 block text-xs uppercase tracking-wider text-muted" htmlFor="stake">
            Stake (Tickets) · you have {ready ? wholeTickets.toLocaleString() : "—"}
          </label>
          <div className="mt-2 flex gap-2">
            <input
              id="stake"
              inputMode="numeric"
              className="input"
              value={stake}
              onChange={(e) => setStake(e.target.value.replace(/[^0-9]/g, ""))}
            />
            {[1, 5, 10].map((n) => (
              <button
                key={n}
                className="rounded-xl border border-border px-3 text-xs text-muted hover:text-foreground"
                onClick={() => setStake(String(n))}
              >
                {n}
              </button>
            ))}
          </div>
          <button className="btn-primary mt-3 w-full" onClick={onPlay} disabled={!ready || !!busy}>
            {busy === "play" ? "Drawing on chain…" : `Burn ${stake || 0} Ticket${stake === "1" ? "" : "s"} on tile ${tile}`}
          </button>

          <div aria-live="polite" className="mt-3 min-h-6 text-center text-sm">
            {lastPlay && busy !== "play" && (
              <span className={lastPlay.points > 0n ? "text-win" : "text-lose"}>
                Drew tile {lastPlay.drawn}.{" "}
                {lastPlay.points > 0n
                  ? `You won ${lastPlay.points.toLocaleString()} Prize Points!`
                  : `No match. You burned ${lastPlay.staked.toLocaleString()} Ticket${lastPlay.staked === 1n ? "" : "s"}.`}
              </span>
            )}
          </div>

          {plays.length > 0 && (
            <ul className="mt-3 divide-y divide-border border-t border-border text-sm">
              {plays.map((p) => (
                <li key={p.hash} className="flex items-center justify-between py-2">
                  <span className="text-muted">
                    Picked {p.picked} · drew {p.drawn} · {p.staked.toString()} burned
                  </span>
                  <a className="font-mono text-xs text-accent-strong hover:underline" href={txUrl(p.hash)} target="_blank" rel="noreferrer">
                    {p.points > 0n ? `+${p.points} pts` : "tx"} ↗
                  </a>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

      {/* Status */}
      <div aria-live="polite" className="mt-4 min-h-6 text-center text-sm">
        {error ? (
          <span className="text-lose">{error}</span>
        ) : lastTx ? (
          <a className="text-muted hover:text-foreground" href={txUrl(lastTx.hash)} target="_blank" rel="noreferrer">
            Last transaction ({lastTx.label}) confirmed on Monad: <span className="font-mono">{short(lastTx.hash)}</span> ↗
          </a>
        ) : null}
      </div>

      {/* Footer */}
      <footer className="mt-10 border-t border-border pt-6 text-xs text-muted">
        <div className="flex flex-wrap gap-x-6 gap-y-2">
          <ContractLink name="SmemVault" address={vault.address} />
          <ContractLink name="HexGame" address={hexGame.address} />
          <ContractLink name="tUSDC" address={usdc.address} />
        </div>
        <p className="mt-3">
          Testnet demo. tUSDC has no value. The hex draw uses block data and is not safe for real prizes.
        </p>
      </footer>
    </div>
  );
}

function safeParse(value: string, decimals: number) {
  try {
    const parsed = parseUnits(value.trim() || "0", decimals);
    return parsed > 0n ? parsed : null;
  } catch {
    return null;
  }
}

function Stat({ label, value, unit, highlight }: { label: string; value: string; unit: string; highlight?: boolean }) {
  return (
    <div className={`rounded-2xl border p-4 ${highlight ? "border-accent/60 bg-accent/10" : "border-border bg-surface"}`}>
      <div className="text-xs uppercase tracking-wider text-muted">{label}</div>
      <div className="mt-1 font-mono text-xl tabular-nums sm:text-2xl">{value}</div>
      <div className="mt-0.5 truncate text-xs text-muted">{unit}</div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4">
      <dt className="text-muted">{label}</dt>
      <dd className="text-right">{value}</dd>
    </div>
  );
}

function ContractLink({ name, address }: { name: string; address: string }) {
  return (
    <a className="hover:text-foreground" href={addressUrl(address)} target="_blank" rel="noreferrer">
      {name}: <span className="font-mono">{short(address)}</span> ↗
    </a>
  );
}
