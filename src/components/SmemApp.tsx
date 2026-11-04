"use client";

import { keepPreviousData } from "@tanstack/react-query";
import Link from "next/link";

import { Wordmark } from "@/components/Logo";
import { NETWORK, TOKEN_SYMBOL } from "@/lib/network";
import { useEffect, useState, useSyncExternalStore } from "react";
import { formatUnits, maxUint256, parseUnits, type Hash } from "viem";
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

import {
  DAY_LENGTH,
  hexGame,
  LEGACY_VAULTS,
  legacyVaultAbi,
  TILES,
  TICKET_DECIMALS,
  usdc,
  USDC_DECIMALS,
  vault,
} from "@/lib/contracts";
import { addressUrl, chain, txUrl } from "@/lib/wagmi";

type Busy = null | "connect" | "faucet" | "deposit" | "withdraw" | "play" | "nextDay" | "switch" | "migrate";

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

export function SmemApp({ view }: { view: "savings" | "draw" }) {
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
  // Keep MetaMask on the same network as the app: ask it to switch once when they differ.
  const [askedSwitch, setAskedSwitch] = useState(false);
  useEffect(() => {
    if (!wrongChain || askedSwitch) return;
    const id = setTimeout(() => {
      setAskedSwitch(true);
      switchChain.mutate({ chainId: chain.id });
    }, 0);
    return () => clearTimeout(id);
  }, [wrongChain, askedSwitch, switchChain]);
  const ready = mounted && isConnected && !wrongChain && !!address;

  const [busy, setBusy] = useState<Busy>(null);
  const [error, setError] = useState<string | null>(null);
  const [lastTx, setLastTx] = useState<{ label: string; hash: Hash } | null>(null);
  const [amount, setAmount] = useState("100");
  const [tile, setTile] = useState<number>(1);
  // Tickets the player plans to put on each hex before locking in.
  const [plan, setPlan] = useState<string[]>(["", "", "", "", "", ""]);
  const planTickets = plan.map((v) => BigInt(Math.max(0, Math.floor(Number(v) || 0))));
  const planTotal = planTickets.reduce((a, b) => a + b, 0n);
  const planHexes = planTickets.filter((v) => v > 0n).length;
  const setPlanFor = (hexId: number, value: string) =>
    setPlan((p) => p.map((v, i) => (i === hexId - 1 ? value.replace(/[^0-9]/g, "") : v)));
  // After a play, the board spins for 5 seconds before it shows the result.
  const [revealUntil, setRevealUntil] = useState(0);
  const [forceWin, setForceWin] = useState(false);

  // A browser clock that ticks every 100 ms. It stays 0 during the server prerender.
  const [now, setNow] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 100);
    return () => clearInterval(id);
  }, []);
  // The vault splits time into days of DAY_LENGTH seconds. Tickets arrive when a day ends.
  const nowSeconds = Math.floor(now / 1000);
  const dayIndex = Math.floor(nowSeconds / DAY_LENGTH);
  const secondsLeft = DAY_LENGTH - (nowSeconds % DAY_LENGTH);
  const dayProgress = 1 - secondsLeft / DAY_LENGTH;
  const user = address ?? "0x0000000000000000000000000000000000000000";

  const reads = useReadContracts({
    contracts: [
      { ...usdc, functionName: "balanceOf", args: [user] },
      { ...usdc, functionName: "allowance", args: [user, vault.address] },
      { ...vault, functionName: "principalOf", args: [user] },
      { ...vault, functionName: "ticketsOf", args: [user] },
      { ...vault, functionName: "ticketsPerDayOf", args: [user] },
      { ...vault, functionName: "ticketsAtDayEndOf", args: [user] },
      { ...hexGame, functionName: "usdcWonOf", args: [user] },
      { ...hexGame, functionName: "lastSettledRound" },
      { ...vault, functionName: "totalPrincipal" },
      { ...hexGame, functionName: "prizeReserve" },
      { ...hexGame, functionName: "currentRoundId" },
      { ...hexGame, functionName: "currentStakesOf", args: [user] },
      { ...vault, functionName: "currentDay" },
    ],
    // keepPreviousData keeps the old numbers on screen while a new read loads.
    query: { enabled: ready && now > 0, refetchInterval: 2000, placeholderData: keepPreviousData },
  });

  // Read again as soon as a new day starts, so the new Tickets show at once.
  const { refetch } = reads;
  useEffect(() => {
    if (ready && dayIndex > 0) void refetch();
  }, [dayIndex, ready, refetch]);

  const value = (i: number) => (reads.data?.[i]?.result as bigint | undefined) ?? 0n;
  const walletUsdc = value(0);
  const allowance = value(1);
  const principal = value(2);
  const tickets = value(3);
  const ticketsPerDay = value(4);
  const ticketsAtDayEnd = value(5);
  const usdcWon = value(6);
  const lastRound = value(7);
  const totalPrincipal = value(8);
  const prizeReserve = value(9);
  const currentId = value(10);
  const myStakes = (reads.data?.[11]?.result as readonly bigint[] | undefined) ?? ZERO_STAKES;

  // Show new Tickets the moment a day ends. The chain's latest block can lag the browser clock by a second or
  // two, so compare with the day of the block that the read came from, not the time of the read.
  const chainDay = reads.data?.[12]?.result as bigint | undefined;
  const readDay = chainDay !== undefined ? Number(chainDay) : dayIndex;
  const daysSinceRead = Math.max(0, dayIndex - readDay);
  const shownTickets =
    tickets + (daysSinceRead > 0 ? ticketsAtDayEnd + ticketsPerDay * BigInt(daysSinceRead - 1) : 0n);
  // Tickets that build up during the current day and arrive when it ends.
  const eligibleToday = daysSinceRead > 0 ? ticketsPerDay : ticketsAtDayEnd;
  const accruing = Number(formatUnits(eligibleToday, TICKET_DECIMALS)) * dayProgress;

  // The last settled round: which hex won, and what this player got.
  const lastReads = useReadContracts({
    contracts: [
      { ...hexGame, functionName: "getRound", args: [lastRound] },
      { ...hexGame, functionName: "stakesOf", args: [lastRound, user] },
      { ...hexGame, functionName: "wonInRound", args: [lastRound, user] },
      { ...hexGame, functionName: "getRound", args: [currentId] },
    ],
    query: { enabled: ready && now > 0, refetchInterval: 2000, placeholderData: keepPreviousData },
  });
  const myLastWin = (lastReads.data?.[2]?.result as bigint | undefined) ?? 0n;
  const current = currentId > 0n ? (lastReads.data?.[3]?.result as RoundData | undefined) : undefined;

  // The demo day stays open until someone draws, then stays on the result until "Next day".
  const settled = !!current?.[4];

  // Deposits left in older vaults from earlier deploys.
  const legacyReads = useReadContracts({
    contracts: LEGACY_VAULTS.map(
      (address) => ({ address, abi: legacyVaultAbi, functionName: "principalOf", args: [user] }) as const,
    ),
    query: { enabled: ready && now > 0, refetchInterval: 10_000, placeholderData: keepPreviousData },
  });
  const legacy = LEGACY_VAULTS.map((address, i) => ({
    address,
    amount: (legacyReads.data?.[i]?.result as bigint | undefined) ?? 0n,
  })).filter((v) => v.amount > 0n && v.address.toLowerCase() !== vault.address.toLowerCase());
  const legacyTotal = legacy.reduce((sum, v) => sum + v.amount, 0n);

  const toTickets = (v: bigint) => Number(formatUnits(v, TICKET_DECIMALS));
  const wholeTickets = Math.floor(toTickets(tickets));

  async function run(label: Exclude<Busy, null>, action: () => Promise<Hash>) {
    if (!publicClient) return;
    setBusy(label);
    setError(null);
    try {
      const hash = await action();
      const receipt = await publicClient.waitForTransactionReceipt({ hash, timeout: 45_000 }).catch(() => {
        throw new Error(`No confirmation after 45 seconds. Check the transaction: ${txUrl(hash)}`);
      });
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
    // Prefer MetaMask's own EIP-6963 connector, so Phantom does not ask which wallet to use.
    const metaMask = connectors.find((c) => c.id === "io.metamask") ?? connectors[0];
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
    if (value > walletUsdc) return setError(`Your wallet does not have that much ${TOKEN_SYMBOL}. Get some from the faucet.`);
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

  // Withdraws from every old vault, then deposits the total into the current vault.
  async function onMigrate() {
    await run("migrate", async () => {
      for (const old of legacy) {
        const hash = await write.mutateAsync({
          address: old.address,
          abi: legacyVaultAbi,
          functionName: "withdraw",
          args: [old.amount],
        });
        await publicClient!.waitForTransactionReceipt({ hash });
      }
      if (allowance < legacyTotal) {
        const approveHash = await write.mutateAsync({
          ...usdc,
          functionName: "approve",
          args: [vault.address, maxUint256],
        });
        await publicClient!.waitForTransactionReceipt({ hash: approveHash });
      }
      return write.mutateAsync({ ...vault, functionName: "deposit", args: [legacyTotal] });
    });
    await legacyReads.refetch();
  }

  async function onWithdraw() {
    const value = safeParse(amount, USDC_DECIMALS);
    if (!value) return setError("Enter an amount greater than 0.");
    if (value > principal) return setError("You cannot withdraw more than you saved.");
    await run("withdraw", () => write.mutateAsync({ ...vault, functionName: "withdraw", args: [value] }));
  }

  async function onPlay() {
    if (planTotal === 0n) return setError("Put Tickets on at least one hex.");
    if (Number(planTotal) > wholeTickets) return setError("You do not have enough Tickets for this plan.");
    const receipt = await run("play", async () => {
      // Estimate the gas, then add a 50% margin. A fixed high limit makes MetaMask show a fee alert.
      const estimate = await publicClient!.estimateContractGas({
        ...hexGame,
        functionName: "playMany",
        args: [planTickets, forceWin],
        account: address!,
      });
      return write.mutateAsync({
        ...hexGame,
        functionName: "playMany",
        args: [planTickets, forceWin],
        gas: (estimate * 3n) / 2n + 50_000n,
      });
    });
    if (receipt) {
      setRevealUntil(now + 5000);
      setPlan(["", "", "", "", "", ""]);
      await lastReads.refetch();
    }
  }

  // The server opens the next day, so the player does not sign anything.
  async function onNextDay() {
    setBusy("nextDay");
    setError(null);
    try {
      const res = await fetch("/api/next-day", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ network: NETWORK }),
      });
      const body = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(body.error ?? "The next day did not open.");
      await Promise.all([reads.refetch(), lastReads.refetch()]);
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(null);
    }
  }

  const usdcText = (v: bigint) => fmt(Number(formatUnits(v, USDC_DECIMALS)));
  const roundTotals = current?.[1] ?? ZERO_STAKES;
  const roundTickets = roundTotals.reduce((a, b) => a + b, 0n);
  const roundPool = current?.[2] ?? 0n;
  // What the winning hex shares: the day's yield after the platform fee (FEE_BPS = 500 in HexGame).
  const prizePool = (roundPool * 9_500n) / 10_000n;
  const revealing = busy === "play" || now < revealUntil;
  const revealSeconds = Math.max(0, Math.ceil((revealUntil - now) / 1000));
  const showResult = settled && !revealing;
  const rollingHex = revealing ? TILES[Math.floor(now / 120) % TILES.length] : undefined;
  const winningHex = showResult ? current?.[3] : undefined;
  const myTotal = myStakes.reduce((a, b) => a + b, 0n);
  const myOnWinner = winningHex ? myStakes[winningHex - 1] : 0n;
  const winnerTotal = winningHex ? roundTotals[winningHex - 1] : 0n;
  const myShare = winnerTotal > 0n ? Number((myOnWinner * 10_000n) / winnerTotal) / 100 : 0;
  const myWinNow = currentId > 0n && lastRound === currentId ? myLastWin : 0n;

  // The network choice lives in the browser, so draw the app only after it loads there.
  if (!mounted) return <div className="min-h-screen" />;

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-6 sm:py-10">
      {/* Header: same bar as the landing page */}
      <header className="fixed inset-x-0 top-0 z-50 border-b border-border bg-background/80 backdrop-blur-xl">
        <nav className="mx-auto flex h-16 max-w-[1400px] items-center justify-between gap-3 px-4 sm:px-6">
          <Link href="/" aria-label="Morney home">
            <Wordmark />
          </Link>
          <div className="hidden items-center gap-8 font-mono text-[13px] uppercase tracking-[0.08em] md:flex">
            <Link
              href="/savings"
              className={view === "savings" ? "text-accent" : "text-foreground/70 transition-colors hover:text-accent"}
            >
              Savings
            </Link>
            <Link
              href="/draw"
              className={view === "draw" ? "text-accent" : "text-foreground/70 transition-colors hover:text-accent"}
            >
              Hex Draw
            </Link>
            <Link href="/play" className="text-foreground/70 transition-colors hover:text-accent">
              Ticket Boosters
            </Link>
            <a
              href={NETWORK === "mainnet" ? "https://testnet.morney.fun" : "https://morney.fun"}
              className="border border-accent/50 px-2 py-1 text-accent transition-colors hover:bg-accent/10"
              title={NETWORK === "mainnet" ? "Try Morney on Monad Testnet with free tokens" : "Go to Morney on Monad Mainnet"}
            >
              {NETWORK === "mainnet" ? "Testnet ↗" : "Mainnet ↗"}
            </a>
          </div>
          <div className="flex items-center gap-2">
          {!mounted ? (
            <span className="w-36" />
          ) : !isConnected ? (
            <button className="btn-primary" onClick={onConnect} disabled={busy === "connect"}>
              {busy === "connect" ? "Connecting…" : "Connect MetaMask"}
            </button>
          ) : wrongChain ? (
            <button className="btn-primary" onClick={onSwitch} disabled={busy === "switch"}>
              {busy === "switch" ? "Switching…" : "Switch network"}
            </button>
          ) : (
            <button
              className="border border-foreground/15 px-4 py-2.5 font-mono text-xs uppercase tracking-[0.08em] transition-colors hover:border-accent hover:text-accent"
              onClick={() => disconnect.mutate({})}
              title="Disconnect"
            >
              {short(address!)}
            </button>
          )}
          </div>
        </nav>
      </header>
      <div className="h-16" />

      {/* Hero */}
      <section className="mt-10 sm:mt-14">
        <p className="section-label">
          <span className="text-accent">01</span>
          <span className="h-px w-8 bg-accent/40" />
          {view === "savings" ? "Savings" : "Hex Yield Draw"}
        </p>
        <h2 className="mt-6 font-display text-[clamp(2.2rem,5.6vw,4.5rem)] font-medium uppercase leading-[0.98] tracking-[-0.03em]">
          {view === "savings" ? (
            <>
              <span className="block">Your savings stay safe.</span>
              <span className="slice-text block pr-[0.1em] italic">They earn Tickets every day.</span>
            </>
          ) : (
            <>
              <span className="block">Your Tickets play.</span>
              <span className="slice-text block pr-[0.1em] italic">One hex wins today&apos;s yield.</span>
            </>
          )}
        </h2>
        <p className="mt-6 max-w-2xl text-lg leading-relaxed text-muted">
          {view === "savings"
            ? "Deposit USDC and withdraw it any time. Every 100 USDC you hold for a full day earns 1 Ticket. Take your Tickets to the Hex Yield Draw."
            : "Put Tickets on one or more hexes and lock in. A hex with more Tickets has better odds. A loss costs Tickets, never your deposit."}
        </p>
      </section>

      {ready && legacyTotal > 0n && (
        <div className="mt-6 flex flex-col gap-3 border border-accent/60 bg-accent/10 p-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm">
            You have <span className="font-semibold">{fmt(Number(formatUnits(legacyTotal, USDC_DECIMALS)))} USDC</span>{" "}
            in an old Morney vault from an earlier deploy. Move it to the current vault to earn Tickets.
          </p>
          <button className="btn-primary shrink-0" onClick={onMigrate} disabled={!!busy}>
            {busy === "migrate" ? "Moving…" : "Move to current vault"}
          </button>
        </div>
      )}

      {/* Stats */}
      <section className="mt-10 grid grid-cols-2 border-l border-t border-border sm:grid-cols-4">
        <Stat label="Wallet" value={ready ? fmt(Number(formatUnits(walletUsdc, USDC_DECIMALS))) : "—"} unit="USDC" />
        <Stat label="Saved" value={ready ? fmt(Number(formatUnits(principal, USDC_DECIMALS))) : "—"} unit="USDC" />
        <Stat
          label="Tickets"
          value={ready ? fmt(toTickets(shownTickets)) : "—"}
          unit={
            ready
              ? `+${fmt(accruing)} building up · ${fmt(toTickets(ticketsPerDay))}/day`
              : "Tickets"
          }
          highlight
        />
        <Stat
          label="Yield won"
          value={ready ? usdcText(usdcWon) : "—"}
          unit="USDC · all time"
        />
      </section>

      {!ready && mounted && (
        <div className="mt-6 border border-dashed border-border p-6 text-center text-sm text-muted">
          {wrongChain ? `Switch MetaMask to ${chain.name} to continue.` : "Connect MetaMask to start saving and playing."}
        </div>
      )}

      {/* Main */}
      <section className={`mt-6 grid gap-4 ${view === "savings" ? "md:grid-cols-2" : "mx-auto max-w-3xl"}`}>
        {view === "savings" && (
          <>
        {/* Savings */}
        <div id="savings" className="card scroll-mt-20">
          <div className="flex items-center justify-between">
            <div>
              <p className="section-label">
                <span className="text-accent">02</span>
                <span className="h-px w-6 bg-accent/40" />
                Vault
              </p>
              <h3 className="mt-3 font-display text-2xl font-medium uppercase tracking-tight">Savings</h3>
            </div>

          </div>
          <p className="mt-1 text-sm text-muted">
            Every 100 USDC you hold for a full day earns 1 Ticket when the day ends. Withdraw your full deposit at any
            time.
          </p>

          <label className="mt-5 block text-xs uppercase tracking-wider text-muted" htmlFor="amount">
            Amount (USDC)
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
              className="border border-border px-3 font-mono text-xs text-muted hover:border-accent hover:text-accent disabled:opacity-40"
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
          {/* Faucet: mints demo tokens to your wallet so you can try the app. */}
          <button
            className="mt-2 flex w-full items-center justify-center gap-2 border border-dashed border-accent/60 bg-accent/5 px-4 py-3 font-mono text-xs uppercase tracking-[0.08em] text-accent transition hover:bg-accent/10 disabled:cursor-not-allowed disabled:opacity-40"
            onClick={onFaucet}
            disabled={!ready || !!busy}
          >
            {busy === "faucet" ? "Minting…" : `Faucet · Get 1,000 ${TOKEN_SYMBOL}`}
          </button>

          <dl className="mt-5 space-y-2 border-t border-border pt-4 text-sm">
            <Row label="Total saved by everyone" value={`${fmt(Number(formatUnits(totalPrincipal, USDC_DECIMALS)))} USDC`} />
            <Row label="Your Tickets per day" value={fmt(toTickets(ticketsPerDay))} />
            <Row label="Day length (demo)" value={`${DAY_LENGTH} seconds`} />
          </dl>
        </div>

        <SavingsCharts
          principal={Number(formatUnits(principal, USDC_DECIMALS))}
          total={Number(formatUnits(totalPrincipal, USDC_DECIMALS))}
          wallet={Number(formatUnits(walletUsdc, USDC_DECIMALS))}
          dayProgress={dayProgress}
          secondsLeft={secondsLeft}
          accruing={accruing}
          perDay={Number(formatUnits(ticketsPerDay, TICKET_DECIMALS))}
          ready={ready}
        />
          </>
        )}
        {view === "draw" && (
        <>
        {/* Game */}
        <div id="draw" className="card scroll-mt-20">
          <div className="flex items-center justify-between">
            <div>
              <p className="section-label">
                <span className="text-accent">03</span>
                <span className="h-px w-6 bg-accent/40" />
                Daily draw
              </p>
              <h3 className="mt-3 font-display text-2xl font-medium uppercase tracking-tight">Hex Yield Draw</h3>
            </div>
            <span className="border border-border px-3 py-1 font-mono text-[11px] uppercase tracking-[0.12em] text-muted">
              Day {currentId.toString()} · {revealing ? "drawing" : settled ? "drawn" : "open"}
            </span>
          </div>
          <p className="mt-1 text-sm text-muted">
            Put Tickets on one or more hexes, then lock in. Five seconds later, one hex wins today&apos;s prize pool.
            Everyone on it splits the pool by their share of the hex.
          </p>

          <div className="mt-4 flex flex-wrap items-baseline justify-between gap-2 border border-accent/30 bg-accent/5 px-4 py-4">
            <span className="text-sm text-muted">Today&apos;s prize pool (estimate)</span>
            <span className="font-display text-2xl font-medium tabular-nums text-accent">{usdcText(prizePool)} USDC</span>
          </div>

          <div className="mt-4 grid grid-cols-3 justify-items-center gap-x-2 gap-y-3">
            {TILES.map((t) => {
              const picked = t === tile;
              const won = winningHex === t;
              const lost = showResult && !won;
              const rolling = rollingHex === t;
              const onHex = roundTotals[t - 1];
              const mine = myStakes[t - 1];
              const planned = planTickets[t - 1];
              return (
                <button
                  key={t}
                  onClick={() => setTile(t)}
                  aria-pressed={picked}
                  aria-label={`Hex ${t}`}
                  className={[
                    "hex grid aspect-[1.15] w-full max-w-28 place-items-center font-semibold transition",
                    rolling
                      ? "hex-rolling bg-accent-strong text-background"
                      : won
                      ? "bg-win text-background"
                      : picked && !showResult
                        ? "bg-accent text-white"
                        : planned > 0n && !settled
                          ? "bg-accent/35 text-foreground"
                        : lost
                          ? "bg-surface-2 text-muted opacity-50"
                          : "bg-surface-2 text-muted hover:bg-border",
                  ].join(" ")}
                >
                  <span className="flex flex-col items-center leading-tight">
                    <span className="text-2xl">{t}</span>
                    <span className="font-mono text-[11px] font-normal opacity-90">{onHex.toLocaleString()} Tickets</span>
                    {mine > 0n && <span className="font-mono text-[10px] font-normal">you {mine.toLocaleString()}</span>}
                    {!settled && planned > 0n && (
                      <span className="font-mono text-[11px] font-semibold">✓ +{planned.toLocaleString()} yours</span>
                    )}
                  </span>
                </button>
              );
            })}
          </div>
          <p className="mt-2 text-center text-xs text-muted">
            {roundTickets.toLocaleString()} Tickets on the board today · you staked {myTotal.toLocaleString()}
          </p>

          {revealing ? (
            <div aria-live="polite" className="mt-4 border border-accent/60 bg-accent/10 px-4 py-4 text-center text-sm">
              {busy === "play" ? "Confirm in MetaMask, then the draw runs on chain…" : `Drawing the winning hex… ${revealSeconds}s`}
            </div>
          ) : !settled ? (
            <>
              <label className="mt-4 block text-xs uppercase tracking-wider text-muted" htmlFor="stake">
                Tickets for hex {tile} · tap another hex to add it too · you have{" "}
                {ready ? wholeTickets.toLocaleString() : "—"}
              </label>
              <div className="mt-2 flex gap-2">
                <input
                  id="stake"
                  inputMode="numeric"
                  className="input"
                  placeholder="0"
                  value={plan[tile - 1]}
                  onChange={(e) => setPlanFor(tile, e.target.value)}
                />
                {[1, 5, 10].map((n) => (
                  <button
                    key={n}
                    className="border border-border px-3 font-mono text-xs text-muted hover:border-accent hover:text-accent"
                    onClick={() => setPlanFor(tile, String(Number(plan[tile - 1] || 0) + n))}
                  >
                    +{n}
                  </button>
                ))}
              </div>
              {/* Selected hexes: each one stays until you remove it */}
              <div className="mt-4">
                <div className="flex items-center justify-between font-mono text-[11px] uppercase tracking-[0.14em] text-muted">
                  <span>
                    Your selection · {planHexes} hex{planHexes === 1 ? "" : "es"} · {planTotal.toLocaleString()} Ticket
                    {planTotal === 1n ? "" : "s"}
                  </span>
                  {planTotal > 0n && (
                    <button className="underline hover:text-foreground" onClick={() => setPlan(["", "", "", "", "", ""])}>
                      Clear all
                    </button>
                  )}
                </div>
                {planHexes === 0 ? (
                  <p className="mt-2 text-sm text-muted">Tap a hex and enter Tickets. You can pick several hexes.</p>
                ) : (
                  <ul className="mt-2 flex flex-wrap gap-2">
                    {planTickets.map((v, i) =>
                      v > 0n ? (
                        <li
                          key={i}
                          className={`flex items-center border text-sm ${tile === i + 1 ? "border-accent bg-accent/10" : "border-border"}`}
                        >
                          <button className="px-3 py-1.5" onClick={() => setTile(i + 1)} title="Edit this hex">
                            Hex {i + 1} · <span className="font-mono">{v.toLocaleString()}</span> Ticket{v === 1n ? "" : "s"}
                          </button>
                          <button
                            className="border-l border-border px-2 py-1.5 text-muted hover:text-lose"
                            onClick={() => setPlanFor(i + 1, "")}
                            aria-label={`Remove hex ${i + 1}`}
                            title="Remove"
                          >
                            ✕
                          </button>
                        </li>
                      ) : null,
                    )}
                  </ul>
                )}
                {Number(planTotal) > wholeTickets && (
                  <p className="mt-2 text-sm text-lose">That is more Tickets than you have ({wholeTickets.toLocaleString()}).</p>
                )}
              </div>
              <button className="btn-primary mt-3 w-full" onClick={onPlay} disabled={!ready || !!busy || planTotal === 0n}>
                {planTotal > 0n
                  ? `Submit stake · ${planTotal.toLocaleString()} Ticket${planTotal === 1n ? "" : "s"} on ${planHexes} hex${planHexes === 1 ? "" : "es"} & draw`
                  : "Select a hex to stake"}
              </button>
              <label className="mt-3 flex cursor-pointer items-center gap-2 text-sm text-muted">
                <input
                  type="checkbox"
                  className="h-4 w-4 accent-[var(--accent)]"
                  checked={forceWin}
                  onChange={(e) => setForceWin(e.target.checked)}
                />
                Demo: make my hex win
              </label>
            </>
          ) : (
            <div aria-live="polite" className="mt-4 border border-border px-4 py-3 text-sm">
              <div>
                Hex <span className="font-semibold">{winningHex}</span> won today&apos;s{" "}
                <span className="font-mono">{usdcText(prizePool)} USDC</span>
                {current?.[5] ? " (demo: forced)" : ""}.
              </div>
              {myOnWinner > 0n ? (
                <div className="mt-1 text-win">
                  You had {myOnWinner.toLocaleString()} of {winnerTotal.toLocaleString()} Tickets on hex {winningHex} ({myShare}
                  %). You won <span className="font-mono font-semibold">{usdcText(myWinNow)} USDC</span>. It is in your
                  wallet now.
                </div>
              ) : myTotal > 0n ? (
                <div className="mt-1 text-lose">You were not on hex {winningHex}. Your staked Tickets are spent.</div>
              ) : (
                <div className="mt-1 text-muted">You did not stake today.</div>
              )}
              <button className="btn-primary mt-3 w-full" onClick={onNextDay} disabled={!ready || !!busy}>
                {busy === "nextDay" ? "Opening the next day…" : "Next day"}
              </button>
            </div>
          )}

          <dl className="mt-4 space-y-2 text-sm">
            <Row label="Prize reserve (simulated yield)" value={`${usdcText(prizeReserve)} USDC`} />
          </dl>
        </div>
        </>
        )}
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
          <ContractLink name={TOKEN_SYMBOL} address={usdc.address} />
        </div>
        <p className="mt-3">
          Demo on {chain.name}. {TOKEN_SYMBOL} is a demo token with no value. The hex draw uses block data and is not safe for real prizes.
        </p>
      </footer>
    </div>
  );
}

// getRound: crowd, totals, yieldPool, winningHex, settled, forced, paidToWinners, fee
type RoundData = readonly [readonly bigint[], readonly bigint[], bigint, number, boolean, boolean, bigint, bigint];
const ZERO_STAKES: readonly bigint[] = [0n, 0n, 0n, 0n, 0n, 0n];

function safeParse(value: string, decimals: number) {
  try {
    const parsed = parseUnits(value.trim() || "0", decimals);
    return parsed > 0n ? parsed : null;
  } catch {
    return null;
  }
}

/// A circle chart: a ring filled to `fraction`, with text in the middle.
function Ring({ fraction, color, children }: { fraction: number; color: string; children: React.ReactNode }) {
  const r = 52;
  const c = 2 * Math.PI * r;
  const f = Math.min(1, Math.max(0, fraction));
  return (
    <div className="relative mx-auto h-44 w-44">
      <svg viewBox="0 0 120 120" className="h-full w-full -rotate-90">
        <circle cx="60" cy="60" r={r} fill="none" stroke="var(--surface-2)" strokeWidth="12" />
        <circle
          cx="60"
          cy="60"
          r={r}
          fill="none"
          stroke={color}
          strokeWidth="12"
          strokeDasharray={`${c * f} ${c}`}
          className="transition-[stroke-dasharray] duration-300 ease-out"
        />
      </svg>
      <div className="absolute inset-0 grid place-items-center text-center">{children}</div>
    </div>
  );
}

function SavingsCharts(p: {
  principal: number;
  total: number;
  wallet: number;
  dayProgress: number;
  secondsLeft: number;
  accruing: number;
  perDay: number;
  ready: boolean;
}) {
  const share = p.total > 0 ? p.principal / p.total : 0;
  const savedOfAll = p.principal + p.wallet > 0 ? p.principal / (p.principal + p.wallet) : 0;
  const pct = (v: number) => `${(v * 100).toLocaleString("en-US", { maximumFractionDigits: 1 })}%`;
  return (
    <div className="card">
      <p className="section-label">
        <span className="text-accent">03</span>
        <span className="h-px w-6 bg-accent/40" />
        Overview
      </p>
      <h3 className="mt-3 font-display text-2xl font-medium uppercase tracking-tight">Your savings</h3>
      <div className="mt-6 grid gap-6 sm:grid-cols-2">
        <div>
          <Ring fraction={p.ready ? savedOfAll : 0} color="var(--accent)">
            <div>
              <div className="font-display text-3xl font-medium">{p.ready ? pct(savedOfAll) : "—"}</div>
              <div className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted">of your USDC saved</div>
            </div>
          </Ring>
          <p className="mt-3 text-center text-xs text-muted">
            Your share of the vault: {p.ready ? pct(share) : "—"}
          </p>
        </div>
        <div>
          <Ring fraction={p.dayProgress} color="#12a46b">
            <div>
              <div className="font-display text-3xl font-medium">+{p.accruing.toFixed(2)}</div>
              <div className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted">Tickets in {p.secondsLeft}s</div>
            </div>
          </Ring>
          <p className="mt-3 text-center text-xs text-muted">
            {p.perDay.toLocaleString("en-US", { maximumFractionDigits: 2 })} Tickets per day
          </p>
        </div>
      </div>
      <Link href="/draw" className="btn-primary mt-6 block w-full text-center">
        Use your Tickets in the Hex Yield Draw →
      </Link>
    </div>
  );
}

function Stat({ label, value, unit, highlight }: { label: string; value: string; unit: string; highlight?: boolean }) {
  return (
    <div className={`border-b border-r border-border p-5 sm:p-6 ${highlight ? "bg-accent/5" : "bg-background/70"}`}>
      <div className={`font-mono text-[11px] uppercase tracking-[0.18em] ${highlight ? "text-accent" : "text-muted"}`}>
        {label}
      </div>
      <div className="mt-4 font-display text-2xl font-medium tabular-nums sm:text-3xl">{value}</div>
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
