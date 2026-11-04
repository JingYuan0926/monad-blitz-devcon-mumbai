import {
  betKey,
  colorOf,
  coveredNumbers,
  settleBets,
  type RouletteBet,
} from "@/lib/game/roulette";
import {
  award,
  debit,
  LedgerError,
  randomInt,
  RULES,
  summary,
} from "@/lib/server/ledger";
import { currentPlayer, errorResponse } from "@/lib/server/player";

const HISTORY_LENGTH = 20;

export async function GET() {
  const player = await currentPlayer();
  return Response.json({
    player: summary(player),
    history: player.rouletteHistory,
  });
}

export async function POST(request: Request) {
  try {
    const player = await currentPlayer();
    const body = (await request.json()) as { bets?: RouletteBet[] };
    const bets = parseBets(body.bets);

    const total = bets.reduce((sum, b) => sum + b.amount, 0);
    if (total < RULES.minBet) throw new LedgerError(`Minimum bet is ${RULES.minBet} Ticket`);
    if (total > RULES.maxBetPerRound)
      throw new LedgerError(`Maximum bet is ${RULES.maxBetPerRound} Tickets per spin`);
    debit(player, total);

    const result = randomInt(37);
    const settled = settleBets(bets, result);
    let pointsWon = 0;
    let ticketsReturned = 0;
    for (const bet of settled) {
      if (!bet.won) continue;
      pointsWon += award(player, bet.amount, bet.winnings);
      ticketsReturned += bet.amount;
    }

    player.rouletteHistory = [result, ...player.rouletteHistory].slice(0, HISTORY_LENGTH);

    return Response.json({
      result: { number: result, color: colorOf(result) },
      bets: settled,
      totalStaked: total,
      ticketsReturned,
      pointsWon,
      player: summary(player),
      history: player.rouletteHistory,
    });
  } catch (err) {
    return errorResponse(err);
  }
}

function parseBets(input: unknown): RouletteBet[] {
  if (!Array.isArray(input) || input.length === 0) throw new LedgerError("Place a bet first");
  if (input.length > 200) throw new LedgerError("Too many bets");

  // Merge duplicate positions so each layout spot is one bet.
  const merged = new Map<string, RouletteBet>();
  for (const raw of input) {
    const bet = raw as RouletteBet;
    if (!Array.isArray(bet?.target) || !Number.isInteger(bet.amount) || bet.amount <= 0)
      throw new LedgerError("Invalid bet");
    if (!coveredNumbers(bet)) throw new LedgerError("Invalid bet position");
    const key = betKey(bet);
    const prev = merged.get(key);
    merged.set(key, {
      kind: bet.kind,
      target: bet.target,
      amount: (prev?.amount ?? 0) + bet.amount,
    });
  }
  return [...merged.values()];
}
