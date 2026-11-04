import { randomInt as cryptoRandomInt } from "node:crypto";
import { initialState, type BlackjackState } from "@/lib/game/blackjack";

// Scoring and allowance rules, configurable per deployment.
export const RULES = {
  /** Tickets granted per eligible USDC deposited, each day. */
  ticketsPerUsdcPerDay: numberEnv("TICKETS_PER_USDC_PER_DAY", 1),
  /** Prize Points awarded per Ticket of winnings. */
  pointsPerTicketWon: numberEnv("POINTS_PER_TICKET_WON", 1),
  minBet: numberEnv("MIN_BET_TICKETS", 1),
  maxBetPerRound: numberEnv("MAX_BET_TICKETS_PER_ROUND", 500),
};

function numberEnv(name: string, fallback: number) {
  const n = Number(process.env[name]);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

export const randomInt = (max: number) => cryptoRandomInt(max);

export type PlayerRecord = {
  id: string;
  tickets: number;
  prizePoints: number;
  allowanceDay: string;
  rouletteHistory: number[];
  blackjack: BlackjackState;
};

export type PlayerSummary = {
  tickets: number;
  prizePoints: number;
  dailyAllowance: number;
  resetsAt: string;
  rules: { pointsPerTicketWon: number; minBet: number; maxBetPerRound: number };
};

/**
 * Eligible deposited USDC for a player.
 * TODO: read the player's eligible balance from the Morney vault contract
 * once it is deployed. Until then every player is treated as holding
 * DEMO_ELIGIBLE_DEPOSIT_USDC.
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
function eligibleDepositUsdc(playerId: string): number {
  return numberEnv("DEMO_ELIGIBLE_DEPOSIT_USDC", 100);
}

export function dailyAllowance(playerId: string) {
  return Math.floor(eligibleDepositUsdc(playerId) * RULES.ticketsPerUsdcPerDay);
}

const utcDay = (d = new Date()) => d.toISOString().slice(0, 10);

function nextUtcMidnight() {
  const d = new Date();
  d.setUTCHours(24, 0, 0, 0);
  return d.toISOString();
}

// In-memory store, kept on globalThis so it survives dev hot reloads.
// Swap for a database (or on-chain reads) for multi-instance deployments.
const store: Map<string, PlayerRecord> = ((
  globalThis as { __morneyPlayers?: Map<string, PlayerRecord> }
).__morneyPlayers ??= new Map());

export function getPlayer(id: string): PlayerRecord {
  let player = store.get(id);
  if (!player) {
    player = {
      id,
      tickets: dailyAllowance(id),
      prizePoints: 0,
      allowanceDay: utcDay(),
      rouletteHistory: [],
      blackjack: initialState(),
    };
    store.set(id, player);
  }
  // Daily Ticket allowance refreshes at UTC midnight.
  if (player.allowanceDay !== utcDay()) {
    player.tickets = dailyAllowance(id);
    player.allowanceDay = utcDay();
  }
  return player;
}

export function summary(player: PlayerRecord): PlayerSummary {
  return {
    tickets: player.tickets,
    prizePoints: round(player.prizePoints),
    dailyAllowance: dailyAllowance(player.id),
    resetsAt: nextUtcMidnight(),
    rules: {
      pointsPerTicketWon: RULES.pointsPerTicketWon,
      minBet: RULES.minBet,
      maxBetPerRound: RULES.maxBetPerRound,
    },
  };
}

export class LedgerError extends Error {}

export function debit(player: PlayerRecord, tickets: number) {
  if (!Number.isInteger(tickets) || tickets <= 0) throw new LedgerError("Invalid ticket amount");
  if (tickets > player.tickets) throw new LedgerError("Not enough Tickets");
  player.tickets -= tickets;
}

/** Return a winning (or pushed) stake and award winnings as Prize Points. */
export function award(player: PlayerRecord, stake: number, winnings: number) {
  player.tickets += stake;
  const points = winnings * RULES.pointsPerTicketWon;
  player.prizePoints += points;
  return round(points);
}

const round = (n: number) => Math.round(n * 100) / 100;
