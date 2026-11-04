// The app can run on Monad Mainnet or Monad Testnet. The header toggle saves the choice and reloads the page.
import { monad, monadTestnet } from "viem/chains";

import mainnet from "@/contracts/deployment.json";
import testnet from "@/contracts/deployment.testnet.json";

export type NetworkName = "mainnet" | "testnet";

const STORAGE_KEY = "morney-network";

function readNetwork(): NetworkName {
  if (typeof window === "undefined") return "mainnet";
  try {
    return window.localStorage.getItem(STORAGE_KEY) === "testnet" ? "testnet" : "mainnet";
  } catch {
    return "mainnet";
  }
}

export const deployments = { mainnet, testnet };
export const NETWORK: NetworkName = readNetwork();
export const deployment = deployments[NETWORK];
export const chainFor = (n: NetworkName) => (n === "testnet" ? monadTestnet : monad);
export const activeChain = chainFor(NETWORK);
export const rpcFor = (n: NetworkName) => (n === "testnet" ? "https://testnet-rpc.monad.xyz" : "https://rpc.monad.xyz");
/// The demo token is "USDC" on testnet and "mUSD" (Morney Demo USD) on mainnet.
export const TOKEN_SYMBOL = NETWORK === "testnet" ? "USDC" : "mUSD";

/// Saves the choice, asks MetaMask to move to the same network, then reloads the page.
export async function setNetwork(n: NetworkName) {
  try {
    window.localStorage.setItem(STORAGE_KEY, n);
  } catch {
    // Storage is blocked. The page stays on the current network.
  }
  const eth = (window as { ethereum?: { request: (a: { method: string; params?: unknown[] }) => Promise<unknown> } })
    .ethereum;
  const target = chainFor(n);
  if (eth) {
    const chainId = `0x${target.id.toString(16)}`;
    try {
      await eth.request({ method: "wallet_switchEthereumChain", params: [{ chainId }] });
    } catch (e) {
      // 4902: MetaMask does not know this network yet, so add it.
      if ((e as { code?: number }).code === 4902) {
        await eth
          .request({
            method: "wallet_addEthereumChain",
            params: [
              {
                chainId,
                chainName: target.name,
                nativeCurrency: target.nativeCurrency,
                rpcUrls: [rpcFor(n)],
                blockExplorerUrls: [target.blockExplorers.default.url],
              },
            ],
          })
          .catch(() => {});
      }
    }
  }
  window.location.reload();
}
