// Settles each HexGame round soon after its day ends, so winners get paid without waiting for the next stake.
// Run: npm run keeper   (stop with Ctrl+C)
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { network } from "hardhat";
import { formatUnits, getAddress } from "viem";

const here = path.dirname(fileURLToPath(import.meta.url));
const deployment = JSON.parse(await readFile(path.resolve(here, "../../src/contracts/deployment.json"), "utf8"));

const { viem } = await network.create();
const publicClient = await viem.getPublicClient();
const game = await viem.getContractAt("HexGame", getAddress(deployment.contracts.HexGame.address));

console.log(`Keeper is watching HexGame ${game.address}`);

for (;;) {
  try {
    if (await game.read.hasPending()) {
      const hash = await game.write.settlePending({ gas: 2_000_000n });
      const receipt = await publicClient.waitForTransactionReceipt({ hash });
      const events = await game.getEvents.Settled({}, { blockHash: receipt.blockHash });
      for (const e of events) {
        const { roundId, winningHex, yieldPool, paidToWinners, winners } = e.args;
        console.log(
          `Round ${roundId}: hex ${winningHex} won. Pool ${formatUnits(yieldPool!, 6)} USDC, paid ${formatUnits(paidToWinners!, 6)} USDC to ${winners} player(s).`,
        );
      }
    }
  } catch (error) {
    console.error(`Keeper error: ${(error as Error).message.split("\n")[0]}`);
  }
  await new Promise((r) => setTimeout(r, 1500));
}
