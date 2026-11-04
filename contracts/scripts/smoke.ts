// Runs the full Smem flow on the deployed contracts: faucet, deposit, earn Tickets, play, withdraw.
// Run after npm run deploy: npm run smoke
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { network } from "hardhat";
import { formatUnits, getAddress, parseEventLogs, parseUnits, type Abi, type Hash } from "viem";

const here = path.dirname(fileURLToPath(import.meta.url));
const deployment = JSON.parse(await readFile(path.resolve(here, "../../src/contracts/deployment.json"), "utf8"));

const { viem } = await network.create();
const publicClient = await viem.getPublicClient();
const [wallet] = await viem.getWalletClients();
const me = wallet.account.address;

const usdc = await viem.getContractAt("MockUSDC", getAddress(deployment.contracts.MockUSDC.address));
const vault = await viem.getContractAt("SmemVault", getAddress(deployment.contracts.SmemVault.address));
const game = await viem.getContractAt("HexGame", getAddress(deployment.contracts.HexGame.address));

const explorer = "https://testnet.monadexplorer.com/tx/";
async function step(label: string, send: Promise<Hash>) {
  const hash = await send;
  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  if (receipt.status !== "success") throw new Error(`${label} reverted: ${hash}`);
  console.log(`✔ ${label.padEnd(10)} ${explorer}${hash}`);
  return receipt;
}
const tickets = async () => formatUnits(await vault.read.ticketsOf([me]), 18);

await step("faucet", usdc.write.faucet());
await step("approve", usdc.write.approve([vault.address, parseUnits("100", 6)]));
await step("deposit", vault.write.deposit([parseUnits("100", 6)]));
console.log(`  principal: ${formatUnits(await vault.read.principalOf([me]), 6)} tUSDC`);

console.log("  waiting 20 seconds for Tickets to build up…");
await new Promise((r) => setTimeout(r, 20_000));
console.log(`  tickets:   ${await tickets()}`);

const receipt = await step("play", game.write.play([3, 1n]));
const [played] = parseEventLogs({ abi: game.abi as Abi, logs: receipt.logs, eventName: "Played" }) as unknown as {
  args: { pickedTile: number; drawnTile: number; ticketsBurned: bigint; pointsWon: bigint };
}[];
console.log(
  `  picked ${played.args.pickedTile}, drew ${played.args.drawnTile}, burned ${played.args.ticketsBurned}, won ${played.args.pointsWon} points`,
);
console.log(`  tickets:   ${await tickets()}`);

await step("withdraw", vault.write.withdraw([parseUnits("100", 6)]));
console.log(`  principal: ${formatUnits(await vault.read.principalOf([me]), 6)} tUSDC`);
console.log(`  wallet:    ${formatUnits(await usdc.read.balanceOf([me]), 6)} tUSDC`);
