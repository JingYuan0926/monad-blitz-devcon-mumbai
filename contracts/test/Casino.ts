import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { network } from "hardhat";
import { parseUnits } from "viem";

const TICKET = 10n ** 18n;

describe("Ticket casino", async function () {
  const { viem, networkHelpers } = await network.create();
  const [owner, alice] = await viem.getWalletClients();

  async function setup() {
    const usdc = await viem.deployContract("MockUSDC", ["USDC", "USDC"]);
    // 1 Ticket per 1 USDC per day, 10-second days.
    const vault = await viem.deployContract("SmemVault", [usdc.address, 6, TICKET, 10n, owner.account.address]);
    const roulette = await viem.deployContract("TicketRoulette", [vault.address]);
    const blackjack = await viem.deployContract("TicketBlackjack", [vault.address]);
    await vault.write.setGame([roulette.address, true]);
    await vault.write.setGame([blackjack.address, true]);
    await usdc.write.faucet({ account: alice.account });
    await usdc.write.approve([vault.address, parseUnits("1000", 6)], { account: alice.account });
    await vault.write.deposit([parseUnits("1000", 6)], { account: alice.account });
    await networkHelpers.time.increase(30); // Earn 1,000 Tickets per day for a full day.
    return { vault, roulette, blackjack };
  }

  it("roulette pays by the multiplier table", async function () {
    const { roulette } = await setup();
    assert.equal(await roulette.read.payoutMultiplier([0, 7, 7]), 36n);
    assert.equal(await roulette.read.payoutMultiplier([0, 7, 8]), 0n);
    assert.equal(await roulette.read.payoutMultiplier([1, 0, 1]), 2n); // 1 is red
    assert.equal(await roulette.read.payoutMultiplier([2, 0, 2]), 2n); // 2 is black
    assert.equal(await roulette.read.payoutMultiplier([1, 0, 0]), 0n); // 0 loses outside bets
    assert.equal(await roulette.read.payoutMultiplier([3, 0, 9]), 2n);
    assert.equal(await roulette.read.payoutMultiplier([6, 0, 19]), 2n);
  });

  it("a roulette spin spends the bet and credits the win", async function () {
    const { vault, roulette } = await setup();
    const publicClient = await viem.getPublicClient();
    const me = alice.account.address;
    for (let i = 0; i < 10; i++) {
      const before = await vault.read.ticketsOf([me]);
      const hash = await roulette.write.spin([1, 0, 10n], { account: alice.account });
      const receipt = await publicClient.waitForTransactionReceipt({ hash });
      const [log] = await roulette.getEvents.Spun({}, { blockHash: receipt.blockHash });
      const after = await vault.read.ticketsOf([me]);
      const mult = await roulette.read.payoutMultiplier([1, 0, log.args.result!]);
      assert.equal(log.args.ticketsWon, 10n * TICKET * mult);
      // Allow for a day ending between the reads.
      const delta = after - before + 10n * TICKET - log.args.ticketsWon!;
      assert.ok(delta === 0n || delta === 1000n * TICKET, `delta ${delta}`);
    }
  });

  it("spinMany settles several bets on one spin", async function () {
    const { vault, roulette } = await setup();
    const publicClient = await viem.getPublicClient();
    const me = alice.account.address;
    const bit = (n: number) => 1n << BigInt(n);
    const red = [1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36].reduce((m, n) => m | bit(n), 0n);
    const split = bit(8) | bit(11);
    for (let i = 0; i < 8; i++) {
      const before = await vault.read.ticketsOf([me]);
      // 3 bets: 5 on red (2x), 2 on the split 8-11 (18x), 1 on number 0 (36x).
      const hash = await roulette.write.spinMany([[red, split, bit(0)], [5n, 2n, 1n]], { account: alice.account });
      const receipt = await publicClient.waitForTransactionReceipt({ hash });
      const [log] = await roulette.getEvents.SpunMany({}, { blockHash: receipt.blockHash });
      const r = log.args.result!;
      let expected = 0n;
      if ((red >> BigInt(r)) & 1n) expected += 5n * 2n;
      if ((split >> BigInt(r)) & 1n) expected += 2n * 18n;
      if (r === 0) expected += 36n;
      assert.equal(log.args.ticketsStaked, 8n);
      assert.equal(log.args.ticketsWon, expected * TICKET);
      const delta = (await vault.read.ticketsOf([me])) - before + 8n * TICKET - expected * TICKET;
      assert.ok(delta === 0n || delta === 1000n * TICKET, `delta ${delta}`);
    }
    // A mask that does not divide 36 (5 numbers) is refused.
    await viem.assertions.revertWithCustomError(
      roulette.write.spinMany([[0b111110n], [1n]], { account: alice.account }),
      roulette,
      "InvalidBet",
    );
  });

    it("blackjack deals, finishes, and pays by the result", async function () {
    const { vault, blackjack } = await setup();
    const publicClient = await viem.getPublicClient();
    const me = alice.account.address;
    for (let i = 0; i < 10; i++) {
      await blackjack.write.deal([5n], { account: alice.account });
      let [, , , active] = await blackjack.read.getHand([me]);
      if (active) {
        const hash = await blackjack.write.stand({ account: alice.account });
        await publicClient.waitForTransactionReceipt({ hash });
        [, , , active] = await blackjack.read.getHand([me]);
      }
      assert.equal(active, false);
      const [, playerCards, dealerCards, , p, d] = await blackjack.read.getHand([me]);
      assert.ok(playerCards.length >= 2);
      assert.ok(d >= 17 || p === 21, `dealer ${d}, player ${p}`);
      assert.ok(dealerCards.length >= 1);
    }
    // Hands cost Tickets, so the balance moved.
    assert.notEqual(await vault.read.ticketsOf([me]), 0n);
  });

  it("blackjack refuses a second deal while a hand is open, and a hit can bust", async function () {
    const { blackjack } = await setup();
    const me = alice.account.address;
    for (let i = 0; i < 20; i++) {
      await blackjack.write.deal([1n], { account: alice.account });
      const [, , , active] = await blackjack.read.getHand([me]);
      if (!active) continue; // Natural blackjack.
      await viem.assertions.revertWithCustomError(
        blackjack.write.deal([1n], { account: alice.account }),
        blackjack,
        "HandActive",
      );
      // Hit until the hand ends.
      for (;;) {
        await blackjack.write.hit({ account: alice.account });
        const [, , , still] = await blackjack.read.getHand([me]);
        if (!still) break;
      }
      return;
    }
  });
});
