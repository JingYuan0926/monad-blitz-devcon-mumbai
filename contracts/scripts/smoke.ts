// Runs the full Smem flow on the deployed contracts: faucet, deposit, earn Tickets, play, withdraw.
// Run after npm run deploy: npm run smoke
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { network } from "hardhat";
import { formatUnits, getAddress, parseUnits, type Hash } from "viem";

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
console.log(`  principal: ${formatUnits(await vault.read.principalOf([me]), 6)} USDC`);

console.log("  waiting for the first full day to end…");
const deadline = Date.now() + 60_000;
while ((await vault.read.ticketsOf([me])) === 0n) {
  if (Date.now() > deadline) throw new Error("No Tickets after 60 seconds.");
  await new Promise((r) => setTimeout(r, 2_000));
}
console.log(`  tickets:   ${await tickets()}`);

// Cover every hex with 1 Ticket, so this wallet is always on the winning hex.
// The first stake opens a round, so all 6 stakes land in the same round.
for (let h = 1; h <= 6; h++) await step(`stake ${h}`, game.write.stake([h, 1n], { gas: 1_000_000n }));
const round = await game.read.currentRoundId();
const wonBefore = 0n;
console.log(`  round ${round} is open. Waiting for it to end…`);
const settleBy = Date.now() + 120_000;
for (;;) {
  const [, yieldPool, , , winningHex, settled, paid, fee] = await game.read.getRound([round]);
  if (settled) {
    console.log(`  round ${round}: hex ${winningHex} won, pool ${formatUnits(yieldPool, 6)} USDC, paid ${formatUnits(paid, 6)}, fee ${formatUnits(fee, 6)}`);
    break;
  }
  if (Date.now() > settleBy) throw new Error("The round did not settle.");
  if (await game.read.hasPending()) await step("settle", game.write.settlePending({ gas: 1_000_000n }));
  else await new Promise((r) => setTimeout(r, 2_000));
}
console.log(`  this wallet won ${formatUnits((await game.read.wonInRound([round, me])) - wonBefore, 6)} USDC in round ${round}`);

await step("withdraw", vault.write.withdraw([parseUnits("100", 6)]));
console.log(`  principal: ${formatUnits(await vault.read.principalOf([me]), 6)} USDC`);
console.log(`  wallet:    ${formatUnits(await usdc.read.balanceOf([me]), 6)} USDC`);
