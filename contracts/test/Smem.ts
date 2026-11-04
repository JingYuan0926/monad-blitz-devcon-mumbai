import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { network } from "hardhat";
import { parseUnits } from "viem";

const USDC = (n: string) => parseUnits(n, 6);
const TICKET = 10n ** 18n;
const DAY = 10n; // 1 day = 10 seconds, like the demo.
const ROUND = 30n; // A game round lasts 30 seconds from the first stake.

describe("Smem", async function () {
  const { viem, networkHelpers } = await network.create();
  const [owner, alice, bob] = await viem.getWalletClients();

  // Moves the chain to the first second of the next day.
  async function toNextDay() {
    const now = BigInt(await networkHelpers.time.latest());
    await networkHelpers.time.increaseTo((now / DAY + 1n) * DAY);
  }

  async function setup() {
    const usdc = await viem.deployContract("MockUSDC");
    // 1 Ticket per 1 USDC per day.
    const vault = await viem.deployContract("SmemVault", [usdc.address, 6, TICKET, DAY, owner.account.address]);
    // Yield pool per round: 1 to 10 USDC. Fee goes to the owner.
    const game = await viem.deployContract("HexGame", [
      vault.address,
      usdc.address,
      owner.account.address,
      USDC("1"),
      USDC("10"),
      ROUND,
    ]);
    await vault.write.setGame([game.address, true]);
    // Fund the prize reserve with 1,000 USDC.
    await usdc.write.faucet();
    await usdc.write.transfer([game.address, USDC("1000")]);

    await usdc.write.faucet({ account: alice.account });
    await usdc.write.approve([vault.address, USDC("1000")], { account: alice.account });
    return { usdc, vault, game };
  }

  // Deposits at the start of a day, then waits until the deposit has held for one full day.
  async function depositAndEarnOneDay(vault: Awaited<ReturnType<typeof setup>>["vault"], amount: string) {
    await toNextDay();
    await vault.write.deposit([USDC(amount)], { account: alice.account });
    await toNextDay(); // The deposit day ends. It pays nothing, because the day did not start with the deposit.
    await toNextDay(); // The first full day ends.
  }

  it("keeps the deposit as principal", async function () {
    const { usdc, vault } = await setup();
    await vault.write.deposit([USDC("100")], { account: alice.account });

    assert.equal(await vault.read.principalOf([alice.account.address]), USDC("100"));
    assert.equal(await vault.read.totalPrincipal(), USDC("100"));
    assert.equal(await usdc.read.balanceOf([vault.address]), USDC("100"));
  });

  it("gives Tickets only when a full day ends", async function () {
    const { vault } = await setup();
    await toNextDay();
    await vault.write.deposit([USDC("100")], { account: alice.account });
    const aliceAddr = alice.account.address;

    assert.equal(await vault.read.ticketsOf([aliceAddr]), 0n);
    assert.equal(await vault.read.ticketsPerDayOf([aliceAddr]), 100n * TICKET);
    // The deposit day did not start with the deposit, so it pays nothing.
    assert.equal(await vault.read.ticketsAtDayEndOf([aliceAddr]), 0n);

    await toNextDay();
    assert.equal(await vault.read.ticketsOf([aliceAddr]), 0n);
    assert.equal(await vault.read.ticketsAtDayEndOf([aliceAddr]), 100n * TICKET);

    // Halfway through the day, nothing new arrives.
    await networkHelpers.time.increase(5);
    assert.equal(await vault.read.ticketsOf([aliceAddr]), 0n);

    await toNextDay();
    assert.equal(await vault.read.ticketsOf([aliceAddr]), 100n * TICKET);

    await toNextDay();
    await toNextDay();
    assert.equal(await vault.read.ticketsOf([aliceAddr]), 300n * TICKET);
  });

  it("pays the lowest balance of a day after a withdrawal", async function () {
    const { vault } = await setup();
    await depositAndEarnOneDay(vault, "100");
    assert.equal(await vault.read.ticketsOf([alice.account.address]), 100n * TICKET);

    // Withdraw half during the day. This day now pays 50.
    await vault.write.withdraw([USDC("50")], { account: alice.account });
    assert.equal(await vault.read.ticketsAtDayEndOf([alice.account.address]), 50n * TICKET);

    await toNextDay();
    assert.equal(await vault.read.ticketsOf([alice.account.address]), 150n * TICKET);
  });

  it("burns staked Tickets and records them on the hex", async function () {
    const { vault, game } = await setup();
    await depositAndEarnOneDay(vault, "100");
    await game.write.stake([2, 4n], { account: alice.account });

    const round = await game.read.currentRoundId();
    assert.equal(round, 1n);
    const [totals, yieldPool, , , winningHex, settled] = await game.read.getRound([round]);
    assert.equal(totals[1], 4n);
    assert.ok(yieldPool >= USDC("1") && yieldPool <= USDC("10"));
    assert.equal(winningHex, 0);
    assert.equal(settled, false);
    assert.equal((await game.read.stakesOf([round, alice.account.address]))[1], 4n);
    // The test vault gives 1 Ticket per USDC per day: 100 earned, 4 staked.
    assert.equal(await vault.read.ticketsOf([alice.account.address]), 96n * TICKET);
    assert.equal(await vault.read.principalOf([alice.account.address]), USDC("100"));
  });

  it("splits 95% of the yield pool by share on the winning hex and sends 5% to the treasury", async function () {
    const { usdc, vault, game } = await setup();
    // Bob saves too.
    await usdc.write.faucet({ account: bob.account });
    await usdc.write.approve([vault.address, USDC("1000")], { account: bob.account });
    await toNextDay();
    await vault.write.deposit([USDC("100")], { account: alice.account });
    await vault.write.deposit([USDC("100")], { account: bob.account });
    await toNextDay();
    await toNextDay();

    // Both players cover every hex, so the winning hex always has Alice 1 : Bob 3.
    // Mine all 12 stakes in one block, so they land in the same 10-second round.
    const publicClient = await viem.getPublicClient();
    const testClient = await viem.getTestClient();
    await testClient.setAutomine(false);
    const hashes = [];
    for (let h = 1; h <= 6; h++) {
      hashes.push(await game.write.stake([h, 1n], { account: alice.account, gas: 500_000n }));
      hashes.push(await game.write.stake([h, 3n], { account: bob.account, gas: 500_000n }));
    }
    await networkHelpers.mine();
    await testClient.setAutomine(true);
    for (const hash of hashes) {
      assert.equal((await publicClient.waitForTransactionReceipt({ hash })).status, "success");
    }
    const round = await game.read.currentRoundId();
    const [, yieldPool] = await game.read.getRound([round]);

    const aliceBefore = await usdc.read.balanceOf([alice.account.address]);
    const bobBefore = await usdc.read.balanceOf([bob.account.address]);
    const treasuryBefore = await usdc.read.balanceOf([owner.account.address]);

    // Nothing settles before the round ends.
    await game.write.settlePending();
    assert.equal((await game.read.getRound([round]))[5], false);

    await networkHelpers.time.increase(ROUND);
    assert.equal(await game.read.hasPending(), true);
    await game.write.settlePending();

    const [, , , , winningHex, settled, paidToWinners, fee] = await game.read.getRound([round]);
    assert.equal(settled, true);
    assert.ok(winningHex >= 1 && winningHex <= 6);
    assert.equal(fee, (yieldPool * 500n) / 10_000n);
    const forWinners = yieldPool - fee;
    const aliceWon = forWinners / 4n;
    const bobWon = (forWinners * 3n) / 4n;
    assert.equal(paidToWinners, aliceWon + bobWon);
    assert.equal(await usdc.read.balanceOf([alice.account.address]), aliceBefore + aliceWon);
    assert.equal(await usdc.read.balanceOf([bob.account.address]), bobBefore + bobWon);
    assert.equal(await usdc.read.balanceOf([owner.account.address]), treasuryBefore + fee);
    assert.equal(await game.read.usdcWonOf([alice.account.address]), aliceWon);
    assert.equal(await game.read.lastSettledRound(), round);
    // Savings never move.
    assert.equal(await vault.read.principalOf([alice.account.address]), USDC("100"));
  });

  it("waits after a draw, and the next stake opens a new round", async function () {
    const { vault, game } = await setup();
    await depositAndEarnOneDay(vault, "1000");

    // Stake only on hex 1 for several rounds. Each new stake draws the round before it.
    const played: bigint[] = [];
    for (let i = 0; i < 8; i++) {
      await game.write.stake([1, 1n], { account: alice.account });
      played.push(await game.read.currentRoundId());
      await networkHelpers.time.increase(ROUND);
    }
    await game.write.settlePending();
    assert.deepEqual(played, [1n, 2n, 3n, 4n, 5n, 6n, 7n, 8n]);

    let losses = 0;
    for (const round of played) {
      const [, , , , winningHex, settled, paidToWinners, fee] = await game.read.getRound([round]);
      assert.equal(settled, true);
      if (winningHex !== 1) {
        losses++;
        assert.equal(paidToWinners, 0n);
        assert.equal(fee, 0n);
      }
    }
    assert.ok(losses > 0, "expected at least one round where hex 1 lost");

    // After the last draw, no new round opens by itself.
    await networkHelpers.time.increase(ROUND * 3n);
    assert.equal(await game.read.hasPending(), false);
    assert.equal(await game.read.currentRoundId(), 8n);
  });

  it("rejects a stake larger than the Ticket balance", async function () {
    const { vault, game } = await setup();
    await depositAndEarnOneDay(vault, "100");

    await viem.assertions.revertWithCustomError(
      game.write.stake([1, 101n], { account: alice.account }),
      vault,
      "InsufficientTickets",
    );
  });

  it("rejects an invalid tile", async function () {
    const { game } = await setup();
    await viem.assertions.revertWithCustomError(
      game.write.stake([7, 1n], { account: alice.account }),
      game,
      "InvalidTile",
    );
  });

  it("stops a non-game address from spending or crediting Tickets", async function () {
    const { vault } = await setup();
    await viem.assertions.revertWithCustomError(
      vault.write.spendTickets([alice.account.address, 1n], { account: bob.account }),
      vault,
      "NotGame",
    );
    await viem.assertions.revertWithCustomError(
      vault.write.creditTickets([bob.account.address, 1n], { account: bob.account }),
      vault,
      "NotGame",
    );
  });

  it("returns principal on withdraw and keeps earned Tickets", async function () {
    const { usdc, vault } = await setup();
    await depositAndEarnOneDay(vault, "100");

    await vault.write.withdraw([USDC("100")], { account: alice.account });

    assert.equal(await usdc.read.balanceOf([alice.account.address]), USDC("1000"));
    assert.equal(await vault.read.principalOf([alice.account.address]), 0n);
    assert.equal(await vault.read.ticketsOf([alice.account.address]), 100n * TICKET);

    // No principal means no new Tickets.
    await toNextDay();
    await toNextDay();
    assert.equal(await vault.read.ticketsOf([alice.account.address]), 100n * TICKET);
  });

  it("rejects a withdraw larger than principal", async function () {
    const { vault } = await setup();
    await vault.write.deposit([USDC("100")], { account: alice.account });
    await viem.assertions.revertWithCustomError(
      vault.write.withdraw([USDC("101")], { account: alice.account }),
      vault,
      "InsufficientPrincipal",
    );
  });
});
