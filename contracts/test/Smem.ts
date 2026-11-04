import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { network } from "hardhat";
import { parseUnits } from "viem";

const USDC = (n: string) => parseUnits(n, 6);
const TICKET = 10n ** 18n;

describe("Smem", async function () {
  const { viem, networkHelpers } = await network.create();
  const [owner, alice, bob] = await viem.getWalletClients();

  async function setup() {
    const usdc = await viem.deployContract("MockUSDC");
    // 1 Ticket per 1 USDC per hour.
    const vault = await viem.deployContract("SmemVault", [usdc.address, 6, TICKET, owner.account.address]);
    const game = await viem.deployContract("HexGame", [vault.address]);
    await vault.write.setGame([game.address, true]);

    await usdc.write.faucet({ account: alice.account });
    await usdc.write.approve([vault.address, USDC("1000")], { account: alice.account });
    return { usdc, vault, game };
  }

  it("keeps the deposit as principal", async function () {
    const { usdc, vault } = await setup();
    await vault.write.deposit([USDC("100")], { account: alice.account });

    assert.equal(await vault.read.principalOf([alice.account.address]), USDC("100"));
    assert.equal(await vault.read.totalPrincipal(), USDC("100"));
    assert.equal(await usdc.read.balanceOf([vault.address]), USDC("100"));
  });

  it("earns Tickets from deposit size and time", async function () {
    const { vault } = await setup();
    await vault.write.deposit([USDC("100")], { account: alice.account });

    await networkHelpers.time.increase(3600);
    // 100 USDC for 1 hour = 100 Tickets.
    assert.equal(await vault.read.ticketsOf([alice.account.address]), 100n * TICKET);
  });

  it("burns Tickets when playing and does not touch principal", async function () {
    const { vault, game } = await setup();
    await vault.write.deposit([USDC("100")], { account: alice.account });
    await networkHelpers.time.increase(3600);

    await game.write.play([3, 10n], { account: alice.account });

    const tickets = await vault.read.ticketsOf([alice.account.address]);
    // 100 earned, 10 burned. A few extra seconds pass between blocks.
    assert.ok(tickets >= 90n * TICKET && tickets < 91n * TICKET, `tickets = ${tickets}`);
    assert.equal(await vault.read.principalOf([alice.account.address]), USDC("100"));
  });

  it("emits Played and awards 6x Prize Points on a win", async function () {
    const { vault, game } = await setup();
    await vault.write.deposit([USDC("1000")], { account: alice.account });
    await networkHelpers.time.increase(3600);

    const publicClient = await viem.getPublicClient();
    let wins = 0n;
    for (let i = 0; i < 30; i++) {
      const hash = await game.write.play([1, 1n], { account: alice.account });
      const receipt = await publicClient.waitForTransactionReceipt({ hash });
      const [log] = await game.getEvents.Played({}, { blockHash: receipt.blockHash });
      assert.equal(log.args.ticketsBurned, 1n);
      if (log.args.drawnTile === 1) {
        assert.equal(log.args.pointsWon, 6n);
        wins++;
      } else {
        assert.equal(log.args.pointsWon, 0n);
      }
    }
    assert.equal(await vault.read.lifetimePointsOf([alice.account.address]), wins * 6n);
  });

  it("rejects a stake larger than the Ticket balance", async function () {
    const { vault, game } = await setup();
    await vault.write.deposit([USDC("100")], { account: alice.account });
    await networkHelpers.time.increase(60);

    await viem.assertions.revertWithCustomError(
      game.write.play([1, 1000n], { account: alice.account }),
      vault,
      "InsufficientTickets",
    );
  });

  it("rejects an invalid tile", async function () {
    const { game } = await setup();
    await viem.assertions.revertWithCustomError(
      game.write.play([7, 1n], { account: alice.account }),
      game,
      "InvalidTile",
    );
  });

  it("stops a non-game address from spending Tickets", async function () {
    const { vault } = await setup();
    await viem.assertions.revertWithCustomError(
      vault.write.spendTickets([alice.account.address, 1n], { account: bob.account }),
      vault,
      "NotGame",
    );
  });

  it("returns principal on withdraw and keeps earned Tickets", async function () {
    const { usdc, vault } = await setup();
    await vault.write.deposit([USDC("100")], { account: alice.account });
    await networkHelpers.time.increase(3600);

    await vault.write.withdraw([USDC("100")], { account: alice.account });

    assert.equal(await usdc.read.balanceOf([alice.account.address]), USDC("1000"));
    assert.equal(await vault.read.principalOf([alice.account.address]), 0n);
    const tickets = await vault.read.ticketsOf([alice.account.address]);
    assert.ok(tickets >= 100n * TICKET, `tickets = ${tickets}`);

    // No principal means no new Tickets.
    await networkHelpers.time.increase(3600);
    assert.equal(await vault.read.ticketsOf([alice.account.address]), tickets);
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
