import type { Abi, Address } from "viem";

import deployment from "@/contracts/deployment.json";

// npm run contracts:deploy writes deployment.json with the live addresses and ABIs.
export const usdc = {
  address: deployment.contracts.MockUSDC.address as Address,
  abi: deployment.contracts.MockUSDC.abi as Abi,
};

export const vault = {
  address: deployment.contracts.SmemVault.address as Address,
  abi: deployment.contracts.SmemVault.abi as Abi,
};

export const hexGame = {
  address: deployment.contracts.HexGame.address as Address,
  abi: deployment.contracts.HexGame.abi as Abi,
};

export const USDC_DECIMALS = 6;
export const TICKET_DECIMALS = 18;
export const TILES = [1, 2, 3, 4, 5, 6] as const;
export const POINTS_PER_TICKET_ON_WIN = 6n;
