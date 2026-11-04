import { summary } from "@/lib/server/ledger";
import { currentPlayer } from "@/lib/server/player";

export async function GET() {
  const player = await currentPlayer();
  return Response.json({ player: summary(player) });
}
