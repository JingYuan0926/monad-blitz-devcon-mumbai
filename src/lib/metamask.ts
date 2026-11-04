// Finds the MetaMask provider directly. When Phantom is also installed, it takes over window.ethereum and asks
// "Phantom or MetaMask?" on every request. EIP-6963 lets us talk to MetaMask by its id instead.
export type Eth = {
  request: (a: { method: string; params?: unknown[] }) => Promise<unknown>;
  on?: (event: string, cb: (...args: unknown[]) => void) => void;
  removeListener?: (event: string, cb: (...args: unknown[]) => void) => void;
  isMetaMask?: boolean;
  isPhantom?: boolean;
  providers?: Eth[];
};

let cached: Eth | undefined;

export async function getMetaMask(): Promise<Eth | undefined> {
  if (cached) return cached;
  if (typeof window === "undefined") return undefined;

  const announced = await new Promise<Eth | undefined>((resolve) => {
    let done = false;
    const onAnnounce = (event: Event) => {
      const detail = (event as CustomEvent<{ info?: { rdns?: string }; provider?: Eth }>).detail;
      if (!done && detail?.info?.rdns === "io.metamask" && detail.provider) {
        done = true;
        window.removeEventListener("eip6963:announceProvider", onAnnounce);
        resolve(detail.provider);
      }
    };
    window.addEventListener("eip6963:announceProvider", onAnnounce);
    window.dispatchEvent(new Event("eip6963:requestProvider"));
    setTimeout(() => {
      if (!done) {
        done = true;
        window.removeEventListener("eip6963:announceProvider", onAnnounce);
        resolve(undefined);
      }
    }, 400);
  });

  const injected = (window as { ethereum?: Eth }).ethereum;
  cached =
    announced ??
    injected?.providers?.find((p) => p.isMetaMask && !p.isPhantom) ??
    (injected?.isMetaMask && !injected.isPhantom ? injected : injected);
  return cached;
}
