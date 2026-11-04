import type { Action, PublicBlackjackState } from "@/lib/game/blackjack";
import type { PocketColor, RouletteBet, SettledBet } from "@/lib/game/roulette";
import type { PlayerSummary } from "@/lib/server/ledger";

export type { PlayerSummary };

export type RouletteState = { player: PlayerSummary; history: number[] };

export type SpinResponse = RouletteState & {
  result: { number: number; color: PocketColor };
  bets: SettledBet[];
  totalStaked: number;
  ticketsReturned: number;
  pointsWon: number;
};

export type BlackjackView = {
  game: PublicBlackjackState;
  allowedActions: Action[];
  player: PlayerSummary;
  pointsWon?: number;
};

async function request<T>(url: string, body?: unknown): Promise<T> {
  const res = await fetch(url, {
    method: body === undefined ? "GET" : "POST",
    headers: body === undefined ? undefined : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
    cache: "no-store",
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? "Request failed");
  return data as T;
}

export const api = {
  roulette: () => request<RouletteState>("/api/roulette"),
  spin: (bets: RouletteBet[]) => request<SpinResponse>("/api/roulette", { bets }),
  blackjack: () => request<BlackjackView>("/api/blackjack"),
  deal: (bet: number) => request<BlackjackView>("/api/blackjack", { action: "deal", bet }),
  act: (action: Action) => request<BlackjackView>("/api/blackjack", { action }),
};
