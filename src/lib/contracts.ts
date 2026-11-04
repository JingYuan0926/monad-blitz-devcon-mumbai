import { parseAbi, type Abi, type Address } from "viem";

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

/// Older vaults that use the same USDC token. The app finds deposits left in them
/// and offers to move them into the current vault.
export const LEGACY_VAULTS: Address[] = [
  "0x366ad9886c8460677240843f1ef702157c206ff0",
  "0x535189c9e737def24a6ff32e27591f6e7228af4d",
  "0xefac6f8d5074d5a60e08899896b0a3441dcb38fe",
];
export const legacyVaultAbi = parseAbi([
  "function principalOf(address user) view returns (uint256)",
  "function withdraw(uint256 amount)",
]);

/// Seconds in one vault day. The demo uses 10 seconds.
export const DAY_LENGTH = deployment.dayLengthSeconds;
/// The day the vault was deployed. The app shows day numbers from this day.
export const FIRST_DAY = Math.floor(Date.parse(deployment.deployedAt) / 1000 / DAY_LENGTH);

export const USDC_DECIMALS = 6;
export const TICKET_DECIMALS = 18;
export const TILES = [1, 2, 3, 4, 5, 6] as const;
