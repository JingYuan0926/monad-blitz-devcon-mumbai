import { createConfig, http } from "wagmi";
import { monad, monadTestnet } from "wagmi/chains";

import { activeChain } from "@/lib/network";
import { injected } from "wagmi/connectors";

// The header toggle picks Monad Mainnet or Monad Testnet. See src/lib/network.ts.
export const chain = activeChain;

export const config = createConfig({
  chains: [monad, monadTestnet],
  // The injected connector talks to the MetaMask browser extension directly.
  connectors: [injected({ target: "metaMask" })],
  transports: {
    [monad.id]: http("https://rpc.monad.xyz"),
    [monadTestnet.id]: http("https://testnet-rpc.monad.xyz"),
  },
  ssr: true,
});

declare module "wagmi" {
  interface Register {
    config: typeof config;
  }
}

export const explorer = activeChain.blockExplorers.default.url;
export const txUrl = (hash: string) => `${explorer}/tx/${hash}`;
export const addressUrl = (address: string) => `${explorer}/address/${address}`;
