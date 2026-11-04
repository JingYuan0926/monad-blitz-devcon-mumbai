# Morney — More and More Money

*Pronounced “more-nee” — because the goal is more and more money for our users.*

**Save more. Play more. Compete for daily rewards.**

Morney is a gamified savings app on Monad. You deposit USDC, and your savings earn **Tickets** every day. You stake Tickets on the **Hex Yield Draw**: one of 6 hexes wins the day's yield, and everyone on that hex splits 95% of it by their share of the hex. You can also try to multiply your Tickets in two **Ticket Boosters**, Roulette and Blackjack.

Your savings never play. Games spend and pay only Tickets, so a loss costs Tickets, never your deposit.

## Judging checklist (Monad Blitz Mumbai — Devcon Edition)

### Basic points

| Item | Where |
| --- | --- |
| Forked GitHub repo | <https://github.com/JingYuan0926/monad-blitz-devcon-mumbai> |
| Live public page | <https://morney.fun> (landing) · <https://morney.fun/savings> · <https://morney.fun/draw> · <https://morney.fun/play> |
| Contract addresses | SmemVault `0x6b3067314c8f76efb6ac9da6ec263eb933f428df` · HexGame `0x1237eb3b8c735de71370dadc56e7325da5cc3260` · TicketRoulette `0x3101889fbcbe4cbad9c32a1af04d0bde950a10e3` · TicketBlackjack `0xf458e77ec371126cb9a5f5eba70bed5b8b9ab74c` · USDC (test) `0xe0599e3d4f799dd051ea9b9c2db2d245b1796b92` |
| Deployment | Contracts on **Monad Testnet** (chain ID 10143). Web app on **Railway** at the custom domain `morney.fun`. |

### Project working

| Item | Where |
| --- | --- |
| Announced functions | Deposit, withdraw, daily Tickets, Hex Yield Draw (stake on several hexes and draw in one transaction), gasless Next day, Roulette, Blackjack, test USDC faucet. See [What works today](#what-works-today). |
| Live transaction during the demo | Every deposit, withdraw, lock-in, spin, deal, hit and stand is a Monad Testnet transaction. The pages link each one to the explorer. |
| Verified contracts | All 5 contracts are verified on Sourcify. See the links in the tables below. |
| Run it from this README | See [Run it yourself](#run-it-yourself). The app uses the deployed contracts, so `npm install` and `npm run dev` are enough to play. |

### Build in public

| Item | Link |
| --- | --- |
| Post on X / LinkedIn (tags @monad, @monad_dev, @geeky_kartikey) | <https://x.com/ilovetofupeach/status/2117930357781942726> |
| Demo video (30 s+, product running) | _add link_ |
| Product ad video | _add link_ |
| Combined views at 5:45 PM IST | _add number_ |

### Bonus

| Item | Status |
| --- | --- |
| Contracts on Monad Mainnet | Not deployed. The vault is built to call Aave's Pool on Monad Mainnet (`0x69a5F9AD4f96ebf0a0C792dD42a01cC5C0102fef`); testnet uses simulated yield. |
| Custom domain | Yes: <https://morney.fun> |
| Pre-market fit | Prize-linked savings already work in traditional finance. Morney adds games and daily draws, so a small saver can win a share of the yield that the whole pool earns. Savings are never staked in the games. |
| Revenue | Morney keeps **5% of the yield**. At about 4.2% APY on Aave USDC, a $1,000,000 pool earns about $42,000 a year, so Morney earns about $2,100 a year. Revenue grows with total deposits. |
| Innovation | Tickets turn savings into play credits, so nobody risks their deposit. One shared yield pool is drawn by Tickets (more Tickets, better odds) and split by share on the winning hex. Each draw settles on Monad in about a second. |

## Live on Monad Testnet

- **Live app:** <https://morney.fun> (landing page) → <https://morney.fun/savings> (savings), <https://morney.fun/draw> (Hex Yield Draw) and <https://morney.fun/play> (Ticket Boosters) · backup URL: <https://web-production-aabfb.up.railway.app>
- **Network:** Monad Testnet (chain ID 10143)

| Contract | Address | Source |
| --- | --- | --- |
| SmemVault | [`0x6b3067314c8f76efb6ac9da6ec263eb933f428df`](https://testnet.monadexplorer.com/address/0x6b3067314c8f76efb6ac9da6ec263eb933f428df) | [Verified](https://sourcify-api-monad.blockvision.org/repo-ui/10143/0x6b3067314c8f76efb6ac9da6ec263eb933f428df) |
| HexGame | [`0x1237eb3b8c735de71370dadc56e7325da5cc3260`](https://testnet.monadexplorer.com/address/0x1237eb3b8c735de71370dadc56e7325da5cc3260) | [Verified](https://sourcify-api-monad.blockvision.org/repo-ui/10143/0x1237eb3b8c735de71370dadc56e7325da5cc3260) |
| MockUSDC (USDC) | [`0xe0599e3d4f799dd051ea9b9c2db2d245b1796b92`](https://testnet.monadexplorer.com/address/0xe0599e3d4f799dd051ea9b9c2db2d245b1796b92) | [Verified](https://sourcify-api-monad.blockvision.org/repo-ui/10143/0xe0599e3d4f799dd051ea9b9c2db2d245b1796b92) |

### What works today

1. Connect MetaMask. The app asks MetaMask to switch to Monad Testnet.
2. Click **Get 1,000 USDC** to mint test USDC. This USDC is a test token with no value.
3. Deposit USDC into the vault. You can withdraw your full deposit at any time.
4. Wait for the day to end. Tickets arrive only at the end of each day.
5. Play the **Hex Yield Draw**. Each day shows today's total yield (an estimate) and the Tickets that other players put on each of the 6 hexes.
6. Put Tickets on one or more hexes, for example 3 on hex 2 and 10 on hex 4. Press **Lock in & draw** and sign once. The game spends the staked Tickets.
7. The board spins for 5 seconds. Then one hex wins at random, weighted by its Tickets: a hex with more Tickets has better odds.
8. Morney keeps 5% of the yield. Everyone on the winning hex splits the other 95% by their share of that hex. Your USDC goes straight to your wallet.
9. The board stays on the result. Press **Next day** to get a new random yield and new Tickets on every hex.

**Demo switch:** Tick **Demo: make my hex win** before you draw. Then the hex where you put the most Tickets wins. This exists only for live demos.

**How Tickets work:** 100 USDC held for a full day earns 1 Ticket when the day ends. For example, 250 USDC earns 2.5 Tickets per day. Each day pays the lowest balance you held during that day. A deposit starts to earn on the next full day. In this demo, **1 day = 10 seconds**. The page shows your Tickets per day and a countdown to the end of the day.

**Hex Yield Draw example:** Today's yield is 2,000 USDC. Other players have 3 Tickets on hex 3, and you stake 1. Hex 3 wins. Morney keeps 100 USDC (5%). Hex 3 shares 1,900 USDC: you get 1,900 × 1 ÷ 4 = 475 USDC.

The game can spend Tickets and pay out the yield pool. It cannot touch anyone's savings. Only the depositor can withdraw their deposit.

### Play games with your Tickets

Your savings earn Tickets. Use your Tickets in the Hex Yield Draw to win USDC yield, or in the Ticket Boosters to win more Tickets.

| Game | Type | Status |
| --- | --- | --- |
| Hex Yield Draw | Stake Tickets on any of 6 hexes. The draw is weighted by Tickets. The winning hex splits the day's yield by share. | Live on testnet: <https://morney.fun/draw> |
| Ticket Boosters: Roulette and Blackjack | Earn more Tickets | Live on testnet: <https://morney.fun/play> |
| Daily prediction challenges | Prediction | Planned |

Every game uses the same Tickets.

### More ways to earn Tickets: Ticket Boosters

Savings are the main way to earn Tickets. **Ticket Boosters** are a second way: put Tickets in and try to multiply them. You can come out with more Tickets, or lose the Tickets you put in. Your saved USDC never moves. Extra Tickets give you a bigger share in the Hex Yield Draw, where Tickets win real USDC yield.

Two boosters are live as contracts on Monad Testnet. The vault lets them spend and pay Tickets. The [Ticket Boosters page](https://morney.fun/play) lists them. You can play both on that page: Roulette spins in one transaction, and Blackjack uses Deal, then Hit or Stand.

| Booster | Contract | How to play | Tickets you get back |
| --- | --- | --- | --- |
| Roulette | [`0x3101889fbcbe4cbad9c32a1af04d0bde950a10e3`](https://testnet.monadexplorer.com/address/0x3101889fbcbe4cbad9c32a1af04d0bde950a10e3) ([verified](https://sourcify-api-monad.blockvision.org/repo-ui/10143/0x3101889fbcbe4cbad9c32a1af04d0bde950a10e3)) | `spin(bet, pick, tickets)`. Bet 0 = one number (`pick` 0-36), 1 = red, 2 = black, 3 = odd, 4 = even, 5 = 1-18, 6 = 19-36. | One number: 36×. Every other bet: 2×. A 0 loses every bet except a bet on 0. |
| Blackjack | [`0xf458e77ec371126cb9a5f5eba70bed5b8b9ab74c`](https://testnet.monadexplorer.com/address/0xf458e77ec371126cb9a5f5eba70bed5b8b9ab74c) ([verified](https://sourcify-api-monad.blockvision.org/repo-ui/10143/0xf458e77ec371126cb9a5f5eba70bed5b8b9ab74c)) | `deal(tickets)`, then `hit()` or `stand()`. The dealer draws to 17. | Blackjack: 2.5×. Win: 2×. Tie: 1×. Loss: 0. |

Both boosters use demo randomness from block data, the same as the Hex Yield Draw.

## Run it yourself

You need Node.js 22 or later and MetaMask.

### Run the web app

1. Install the packages: `npm install`
2. Start the app: `npm run dev`
3. Open <http://localhost:3000> for the landing page, or <http://localhost:3000/savings> for the app.
4. In MetaMask, get testnet MON for gas from the [Monad Blitz faucet](https://blitz.devnads.com/events/monad-blitz-mumbai-devcon-edition).
5. In MetaMask, import the test USDC token: `0xe0599e3d4f799dd051ea9b9c2db2d245b1796b92` (6 decimals).
6. Click **Get 1,000 USDC**, then deposit.

The app uses the deployed testnet contracts in `src/contracts/deployment.json`.

**Optional: gasless Next day.** The **Next day** button calls a server route that signs the transaction for the player. To use it locally, create `.env.local` with `RELAYER_PRIVATE_KEY=0x...`, a key that holds a little testnet MON. The route only calls `nextDay()`, which anyone can call, so this key cannot move any funds.

### Deploy your own contracts (optional)

1. Go to the contracts folder: `cd contracts`
2. Install the packages: `npm install`
3. Run the tests: `npm test`
4. Copy `.env.example` to `.env`. Set `PRIVATE_KEY` to a key that holds testnet MON.
5. Deploy: `npm run deploy`. This writes the new addresses to `src/contracts/deployment.json`.
6. Verify the source: `npm run verify`
7. Run the full flow on chain: `npm run smoke`
8. Deploy the Ticket Boosters (Roulette and Blackjack): `npm run deploy-casino`

## Project layout

| Path | What it holds |
| --- | --- |
| `src/app/(landing)/` | Landing page at `/` and the Ticket Booster screens at `/play`, `/play/roulette` and `/play/blackjack` |
| `src/app/(app)/` | Savings at `/savings` and Hex Yield Draw at `/draw` (wagmi + viem + MetaMask) |
| `src/lib/client/api.ts` | Sends Roulette and Blackjack actions to the contracts through MetaMask |
| `src/app/api/next-day/` | Server route that opens the next day for the player |
| `contracts/contracts/` | Solidity contracts |
| `contracts/test/` | Contract tests |
| `contracts/scripts/` | Deploy, verify, smoke-test, booster deploy and mainnet scripts |

## How Morney works

1. **Deposit.** You deposit USDC into the Morney vault. You can withdraw it at any time. In production, the vault supplies the USDC to Aave on Monad, where borrowers pay interest. On testnet, the yield is simulated.
2. **Earn Tickets.** At the end of each day, the vault gives you Tickets for the USDC you held for that whole day. 100 USDC earns 1 Ticket per day. Tickets are play credits, not a claim on USDC.
3. **Stake Tickets on the hexes.** Each day has a yield pool. You put Tickets on one or more of 6 hexes and lock in with one signature.
4. **The draw.** One hex wins. The draw is weighted by Tickets: a hex with more Tickets has better odds.
5. **Share the yield.** Morney keeps **5%** of the day's yield. Everyone on the winning hex splits the other **95%** by their share of that hex. The USDC goes straight to their wallets.
6. **Multiply Tickets (optional).** Ticket Boosters (Roulette and Blackjack) let you try to win more Tickets, or lose the Tickets you put in.

## Daily payout model

`Your reward = 95% × day's yield × your Tickets on the winning hex ÷ all Tickets on the winning hex`

For example, the day's yield is **$2,000**. Morney keeps **$100** (5%). Hex 3 wins, and it holds 4 Tickets. You have 1 of them, so you get **$1,900 × 1 ÷ 4 = $475**.

If nobody staked on the winning hex, the yield stays in the reserve for later days.

## What makes Morney different

- **Savings never play.** Games use Tickets only. The vault keeps deposits apart from every game.
- **One shared prize.** Many small savers pool their yield into one daily prize that is worth playing for.
- **Fair odds by Tickets.** More Tickets on a hex give it better odds, and the prize is shared by Tickets.
- **Aligned revenue.** Morney earns a **5% share of the yield**, so revenue grows with deposits. Players never buy Tickets.

## Principal and risk

Morney does not use deposited principal to fund game losses, prizes, or the platform fee. Users give up their direct share of lending yield in exchange for participation in the rewards system.

However, deposits remain exposed to lending-protocol, smart-contract, stablecoin, and liquidity risks. Withdrawals depend on vault rules and underlying liquidity, and neither yield nor individual rewards are guaranteed.

**Testnet demo limits:** the yield, the other players' Tickets on each hex, and the 3,000,000 USDC prize reserve are simulated. All draws use block data for randomness, which is safe for a demo only. The contracts have no audit.

## Hackathon scope

For Monad Blitz Mumbai, Morney ships the savings vault, daily Tickets, the Hex Yield Draw with yield payouts, two Ticket Boosters (Roulette and Blackjack), and a gasless Next day button. Real Aave yield, verifiable randomness and Morney Trade are roadmap items.

## Future roadmap

**Morney Trade:** A planned long-and-short trading mode where eligible collateral earns Tickets over time. Traders can use those Tickets across Morney’s gaming ecosystem while managing their positions. Trading margin remains exposed to losses and liquidation.

For example:

- A user allocates **$100 as trading margin**.
- At 5× leverage, they open a **$500 position**.
- Tickets accrue based on the **eligible $100 collateral and time committed**, not the $500 exposure.
- Those Tickets can be used in Morney’s games and rewards system.
- The trade independently earns or loses money, with fees, funding, and liquidation risk.

**Tickets are an additional reward—not protection against trading losses.** The same funds count only once: moving money from savings into trading margin does not earn duplicate allocations.

Margin does not automatically generate lending yield. Morney Trade needs an exchange integration that explicitly supports yield-bearing collateral, or a separate budget to fund trading rewards.

**Morney’s vision is to make saving more engaging: keep savings productive, use Tickets to play, and compete for a share of daily yield.**
