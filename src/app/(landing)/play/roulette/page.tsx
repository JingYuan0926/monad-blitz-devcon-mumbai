import type { Metadata } from "next";
import { RouletteGame } from "@/components/game/roulette/RouletteGame";

export const metadata: Metadata = {
  title: "Roulette — Morney",
  description: "European single-zero roulette played with Tickets on Monad. Wins pay more Tickets.",
};

export default function RoulettePage() {
  return <RouletteGame />;
}
