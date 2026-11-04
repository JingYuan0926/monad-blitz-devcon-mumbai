import { randomUUID } from "node:crypto";
import { cookies } from "next/headers";
import { getPlayer, LedgerError } from "./ledger";

const COOKIE = "morney_pid";

/**
 * Identifies the player by an anonymous cookie.
 * TODO: replace with the connected wallet address once wallet login lands.
 */
export async function currentPlayer() {
  const jar = await cookies();
  let id = jar.get(COOKIE)?.value;
  if (!id) {
    id = randomUUID();
    jar.set(COOKIE, id, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      maxAge: 60 * 60 * 24 * 365,
      path: "/",
    });
  }
  return getPlayer(id);
}

export function errorResponse(err: unknown) {
  if (err instanceof LedgerError) {
    return Response.json({ error: err.message }, { status: 400 });
  }
  console.error(err);
  return Response.json({ error: "Something went wrong" }, { status: 500 });
}
