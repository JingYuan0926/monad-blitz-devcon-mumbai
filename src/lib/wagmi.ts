import { createConfig, http } from "wagmi";
import { monad } from "wagmi/chains";
import { injected } from "wagmi/connectors";

// The app runs on Monad Mainnet. The testnet addresses are kept in src/contracts/deployment.testnet.json.
export const chain = monad;

export const config = createConfig({
  chains: [monad],
  // The injected connector talks to the MetaMask browser extension directly.
  connectors: [injected({ target: "metaMask" })],
  transports: {
    [monad.id]: http(process.env.NEXT_PUBLIC_MONAD_RPC_URL ?? "https://rpc.monad.xyz"),
  },
  ssr: true,
});

declare module "wagmi" {
  interface Register {
    config: typeof config;
  }
}

export const explorer = monad.blockExplorers.default.url;
export const txUrl = (hash: string) => `${explorer}/tx/${hash}`;
export const addressUrl = (address: string) => `${explorer}/address/${address}`;
