// Deploys a new TicketRoulette on the current vault, turns the old one off, verifies it,
// and saves the address. Run: DEPLOYMENT_FILE=deployments/mainnet.json npx hardhat run scripts/redeploy-roulette.ts --network monadMainnet
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import hre, { network } from "hardhat";
import { verifyContract } from "@nomicfoundation/hardhat-verify/verify";
import { getAddress } from "viem";

const here = path.dirname(fileURLToPath(import.meta.url));
const files = (process.env.DEPLOYMENT_FILE ?? "src/contracts/deployment.json").split(",");
const first = JSON.parse(await readFile(path.resolve(here, "../..", files[0]), "utf8"));

const { viem } = await network.create();
const publicClient = await viem.getPublicClient();
const vault = await viem.getContractAt("SmemVault", getAddress(first.contracts.SmemVault.address));
const old = first.casino?.TicketRoulette?.address;

const roulette = await viem.deployContract("TicketRoulette", [vault.address]);
await publicClient.waitForTransactionReceipt({ hash: await vault.write.setGame([roulette.address, true]) });
console.log(`TicketRoulette: ${roulette.address} (allowed in the vault)`);
if (old) {
  await publicClient.waitForTransactionReceipt({ hash: await vault.write.setGame([getAddress(old), false]) });
  console.log(`Old TicketRoulette ${old} is turned off.`);
}
try {
  await verifyContract(
    { address: roulette.address, constructorArgs: [vault.address], contract: "contracts/TicketRoulette.sol:TicketRoulette", provider: "sourcify" },
    hre,
  );
} catch (error) {
  console.error(`verify failed: ${(error as Error).message.split("\n")[0]}`);
}
for (const f of files) {
  const p = path.resolve(here, "../..", f);
  const d = JSON.parse(await readFile(p, "utf8"));
  d.casino = { ...(d.casino ?? {}), TicketRoulette: { address: roulette.address } };
  await writeFile(p, JSON.stringify(d, null, 2) + "\n");
  console.log(`Saved to ${f}`);
}
