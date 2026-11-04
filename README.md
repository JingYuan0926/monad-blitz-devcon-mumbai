# Smem — Save More, Earn More

*Pronounced “seh-mem”*

**Save more. Play more. Compete for daily rewards.**

Smem is a gamified savings platform designed for Monad that lets users turn the yield from their savings into daily gaming rewards. Users deposit USDC, receive Tickets based on their eligible savings balance, and use those Tickets to participate in games and prediction challenges. Their results earn Prize Points, which determine their share of a daily yield-funded prize pool.

The deposited savings remain separate from gameplay. Players compete using Tickets, so losing a game does not deduct their savings principal.

## How Smem works

1. **Deposit and generate yield.** Users deposit USDC into Smem’s vault. The planned integration supplies those funds to Aave on Monad, where borrower interest generates variable yield.

2. **Receive daily Tickets.** Users receive a daily Ticket allowance based on their eligible deposited balance and time deposited. Tickets serve as play credits rather than a fixed claim on USDC.

3. **Choose how to play.** Smem is designed to support multiple experiences, potentially including arcade games, casino-style games, and daily prediction challenges. The initial game lineup is still being selected.

4. **Earn Prize Points.** Eligible game results award Prize Points under published scoring rules. Each game can have its own leaderboard, while a shared daily leaderboard combines results using a defined scoring system.

5. **Share the daily rewards.** Smem takes a **5% platform fee from the day’s generated yield**. The remaining **95% forms the daily prize pool**, distributed proportionally according to eligible Prize Points.

## Daily payout model

`Player reward = Daily prize pool × Player’s eligible points ÷ Total eligible points`

For example, if the vault generates **$100 in daily yield**, Smem retains **$5** and allocates **$95** to rewards. A player holding **10% of that day’s eligible Prize Points** receives **$9.50**.

Payouts depend on actual available yield and settled results. A prediction that has not resolved contributes to a later payout cycle. This model distributes rewards through points rather than requiring a separate random jackpot draw.

## What makes Smem different

Smem combines a shared savings vault with a flexible gaming experience. Users can choose how they participate while competing for the same daily reward pool. Savings determine access to play; eligible game results determine reward allocation.

The platform’s revenue comes from its **5% share of generated yield**, aligning revenue with the earning activity of the vault. The core model does not require users to purchase Tickets or wager their deposits.

## Principal and risk

Smem does not use deposited principal to fund game losses, prizes, or the platform fee. Users give up their direct share of lending yield in exchange for participation in the rewards system.

However, deposits remain exposed to lending-protocol, smart-contract, stablecoin, and liquidity risks. Withdrawals depend on vault rules and underlying liquidity, and neither yield nor individual rewards are guaranteed.

**Smem’s vision is to make saving more engaging: keep savings productive, use Tickets to play, and compete for a share of daily yield.**
