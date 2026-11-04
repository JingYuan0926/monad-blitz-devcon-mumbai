import type { Metadata } from "next";
import { BlackjackGame } from "@/components/game/blackjack/BlackjackGame";

export const metadata: Metadata = {
  title: "Blackjack — Morney",
  description: "Blackjack played with Tickets on Monad. Wins pay more Tickets.",
};

export default function BlackjackPage() {
  return <BlackjackGame />;
}
