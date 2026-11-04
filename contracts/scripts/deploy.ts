// Deploys MockUSDC, SmemVault and HexGame, then writes the addresses and ABIs for the web app.
// Run: npm run deploy
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { network } from "hardhat";
import { parseUnits } from "viem";

const here = path.dirname(fileURLToPath(import.meta.url));
const outFile = path.resolve(here, "../../src/contracts/deployment.json");

// Tickets that 1 USDC earns in 1 hour. 10 makes Tickets visible within seconds in a demo.
const TICKETS_PER_USDC_PER_HOUR = process.env.TICKETS_PER_USDC_PER_HOUR ?? "10";

const { viem, networkName } = await network.create();
const publicClient = await viem.getPublicClient();
const [deployer] = await viem.getWalletClients();
const chainId = await publicClient.getChainId();

console.log(`Network:  ${networkName} (chain ${chainId})`);
console.log(`Deployer: ${deployer.account.address}`);
console.log(`Balance:  ${(await publicClient.getBalance({ address: deployer.account.address })) / 10n ** 15n} mMON`);

const startBlock = await publicClient.getBlockNumber();

const usdc = await viem.deployContract("MockUSDC");
console.log(`MockUSDC:  ${usdc.address}`);

const ticketRate = parseUnits(TICKETS_PER_USDC_PER_HOUR, 18);
const vault = await viem.deployContract("SmemVault", [usdc.address, 6, ticketRate, deployer.account.address]);
console.log(`SmemVault: ${vault.address}`);

const game = await viem.deployContract("HexGame", [vault.address]);
console.log(`HexGame:   ${game.address}`);

const hash = await vault.write.setGame([game.address, true]);
await publicClient.waitForTransactionReceipt({ hash });
console.log("HexGame is allowed to spend Tickets.");

async function abiOf(name: string) {
  const artifact = JSON.parse(
    await readFile(path.resolve(here, `../artifacts/contracts/${name}.sol/${name}.json`), "utf8"),
  );
  return artifact.abi;
}

const deployment = {
  chainId,
  network: networkName,
  deployedAt: new Date().toISOString(),
  startBlock: startBlock.toString(),
  deployer: deployer.account.address,
  constructorArgs: {
    SmemVault: [usdc.address, 6, ticketRate.toString(), deployer.account.address],
    HexGame: [vault.address],
  },
  contracts: {
    MockUSDC: { address: usdc.address, abi: await abiOf("MockUSDC") },
    SmemVault: { address: vault.address, abi: await abiOf("SmemVault") },
    HexGame: { address: game.address, abi: await abiOf("HexGame") },
  },
};

await mkdir(path.dirname(outFile), { recursive: true });
await writeFile(outFile, JSON.stringify(deployment, null, 2) + "\n");
console.log(`Wrote ${path.relative(process.cwd(), outFile)}`);
