import {
  act,
  allowedActions,
  deal,
  toPublic,
  type Action,
} from "@/lib/game/blackjack";
import {
  award,
  debit,
  LedgerError,
  randomInt,
  RULES,
  summary,
  type PlayerRecord,
} from "@/lib/server/ledger";
import { currentPlayer, errorResponse } from "@/lib/server/player";

type Body = { action: "deal"; bet: number } | { action: Action };

export async function GET() {
  const player = await currentPlayer();
  return Response.json(view(player));
}

export async function POST(request: Request) {
  try {
    const player = await currentPlayer();
    const body = (await request.json()) as Body;
    const state = player.blackjack;

    if (body.action === "deal") {
      if (state.phase === "player") throw new LedgerError("Finish the current hand first");
      const bet = body.bet;
      if (!Number.isInteger(bet) || bet < RULES.minBet)
        throw new LedgerError(`Minimum bet is ${RULES.minBet} Ticket`);
      if (bet > RULES.maxBetPerRound)
        throw new LedgerError(`Maximum bet is ${RULES.maxBetPerRound} Tickets per hand`);
      debit(player, bet);
      player.blackjack = deal(state, bet, randomInt);
    } else {
      const action = body.action;
      if (!allowedActions(state, player.tickets).includes(action))
        throw new LedgerError(`You can't ${action} right now`);
      // Doubling and splitting each put up another stake equal to the hand's bet.
      if (action === "double" || action === "split") debit(player, state.hands[state.active].bet);
      player.blackjack = act(state, action);
    }

    let pointsWon = 0;
    if (player.blackjack.phase === "settled") {
      for (const hand of player.blackjack.hands) {
        if (hand.result === "win" || hand.result === "blackjack" || hand.result === "push") {
          pointsWon += award(player, hand.bet, hand.winnings ?? 0);
        }
      }
    }

    return Response.json({ ...view(player), pointsWon });
  } catch (err) {
    return errorResponse(err);
  }
}

function view(player: PlayerRecord) {
  return {
    game: toPublic(player.blackjack),
    allowedActions: allowedActions(player.blackjack, player.tickets),
    player: summary(player),
  };
}
