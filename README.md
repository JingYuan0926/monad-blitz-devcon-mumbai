# Morney — More and More Money

*Pronounced “more-nee” — because the goal is more and more money for our users.*

**Save more. Play more. Compete for daily rewards.**

Morney is a gamified savings platform designed for Monad that lets users turn the yield from their savings into daily gaming rewards. Users deposit USDC, receive Tickets based on their eligible savings balance, and use those Tickets to participate in games and prediction challenges. Their results earn Prize Points, which determine their share of a daily yield-funded prize pool.

The deposited savings remain separate from gameplay. Players compete using Tickets, so losing a game does not deduct their savings principal.

## Live on Monad Testnet

- **Live app:** _not hosted yet_
- **Network:** Monad Testnet (chain ID 10143)

| Contract | Address | Source |
| --- | --- | --- |
| SmemVault | [`0xd1204811989616d1b92efb8730591c67703b4e9c`](https://testnet.monadexplorer.com/address/0xd1204811989616d1b92efb8730591c67703b4e9c) | [Verified](https://sourcify-api-monad.blockvision.org/repo-ui/10143/0xd1204811989616d1b92efb8730591c67703b4e9c) |
| HexGame | [`0xc7d030468a0c95662e067243e81f7bd7c9e6510e`](https://testnet.monadexplorer.com/address/0xc7d030468a0c95662e067243e81f7bd7c9e6510e) | [Verified](https://sourcify-api-monad.blockvision.org/repo-ui/10143/0xc7d030468a0c95662e067243e81f7bd7c9e6510e) |
| MockUSDC (tUSDC) | [`0x3ba77514287ff71f9d93ef011b84bf378a35036a`](https://testnet.monadexplorer.com/address/0x3ba77514287ff71f9d93ef011b84bf378a35036a) | [Verified](https://sourcify-api-monad.blockvision.org/repo-ui/10143/0x3ba77514287ff71f9d93ef011b84bf378a35036a) |

### What works today

1. Connect MetaMask. The app asks MetaMask to switch to Monad Testnet.
2. Click **Get 1,000 test USDC** to mint tUSDC. tUSDC has no value.
3. Deposit tUSDC into the vault. You can withdraw your full deposit at any time.
4. Watch your Tickets grow. 1 tUSDC earns 10 Tickets per hour.
5. Play **Hex Spin**. Pick a tile from 1 to 6 and stake Tickets. The game burns the stake.
6. If the drawn tile matches your pick, you win stake × 6 Prize Points.

The game can burn Tickets and award Prize Points. It cannot move USDC. Only the depositor can withdraw their deposit.

The vault contract is named `SmemVault` because we deployed it before the project rename. The contract name does not change how it works.

**Testnet limits:** The yield is simulated, because Aave is not on Monad Testnet. The hex draw uses block data, so it is for the demo only.

## Run it yourself

You need Node.js 22 or later and MetaMask.

### Run the web app

1. Install the packages: `npm install`
2. Start the app: `npm run dev`
3. Open <http://localhost:3000>.

The app uses the deployed testnet contracts in `src/contracts/deployment.json`.

### Deploy your own contracts (optional)

1. Go to the contracts folder: `cd contracts`
2. Install the packages: `npm install`
3. Run the tests: `npm test`
4. Copy `.env.example` to `.env`. Set `PRIVATE_KEY` to a key that holds testnet MON.
5. Deploy: `npm run deploy`. This writes the new addresses to `src/contracts/deployment.json`.
6. Verify the source: `npm run verify`
7. Run the full flow on chain: `npm run smoke`

## Project layout

| Path | What it holds |
| --- | --- |
| `src/` | Next.js app (wagmi + viem + MetaMask) |
| `contracts/contracts/` | Solidity contracts |
| `contracts/test/` | Contract tests |
| `contracts/scripts/` | Deploy, verify and smoke-test scripts |

## How Morney works

1. **Deposit and generate yield.** Users deposit USDC into Morney’s vault. The planned integration supplies those funds to Aave on Monad, where borrower interest generates variable yield.

2. **Receive daily Tickets.** Users receive a daily Ticket allowance based on their eligible deposited balance and time deposited. Tickets serve as play credits rather than a fixed claim on USDC.

3. **Choose how to play.** Morney is designed to support multiple experiences, potentially including arcade games, casino-style games, and daily prediction challenges. The initial game lineup is still being selected.

4. **Earn Prize Points.** Eligible game results award Prize Points under published scoring rules. Each game can have its own leaderboard, while a shared daily leaderboard combines results using a defined scoring system.

5. **Share the daily rewards.** Morney takes a **5% platform fee from the day’s generated yield**. The remaining **95% forms the daily prize pool**, distributed proportionally according to eligible Prize Points.

## Daily payout model

`Player reward = Daily prize pool × Player’s eligible points ÷ Total eligible points`

For example, if the vault generates **$100 in daily yield**, Morney retains **$5** and allocates **$95** to rewards. A player holding **10% of that day’s eligible Prize Points** receives **$9.50**.

Payouts depend on actual available yield and settled results. A prediction that has not resolved contributes to a later payout cycle. This model distributes rewards through points rather than requiring a separate random jackpot draw.

## What makes Morney different

Morney combines a shared savings vault with a flexible gaming experience. Users can choose how they participate while competing for the same daily reward pool. Savings determine access to play; eligible game results determine reward allocation.

The platform’s revenue comes from its **5% share of generated yield**, aligning revenue with the earning activity of the vault. The core model does not require users to purchase Tickets or wager their deposits.

## Principal and risk

Morney does not use deposited principal to fund game losses, prizes, or the platform fee. Users give up their direct share of lending yield in exchange for participation in the rewards system.

However, deposits remain exposed to lending-protocol, smart-contract, stablecoin, and liquidity risks. Withdrawals depend on vault rules and underlying liquidity, and neither yield nor individual rewards are guaranteed.

## Hackathon scope

For Monad Blitz Mumbai, Morney ships the savings vault, daily Tickets, one game, and daily reward distribution. Trading is a roadmap feature.

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
