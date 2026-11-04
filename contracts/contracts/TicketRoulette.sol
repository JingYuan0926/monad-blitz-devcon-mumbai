// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {SmemVault} from "./SmemVault.sol";

/// @title TicketRoulette
/// @notice European roulette (0 to 36) played with Tickets. Win more Tickets, or lose the Tickets you bet.
///         Bets: 0 = one number (pays 36x), 1 = red, 2 = black, 3 = odd, 4 = even, 5 = 1-18, 6 = 19-36 (each pays 2x).
///         0 loses every bet except a bet on the number 0.
/// @dev DEMO RANDOMNESS ONLY. The seed uses block data, which a block producer can influence.
contract TicketRoulette {
    uint8 public constant NUMBER = 0;
    uint8 public constant RED = 1;
    uint8 public constant BLACK = 2;
    uint8 public constant ODD = 3;
    uint8 public constant EVEN = 4;
    uint8 public constant LOW = 5;
    uint8 public constant HIGH = 6;

    // Bit n is set when n is a red number.
    uint256 private constant RED_MASK = (1 << 1) | (1 << 3) | (1 << 5) | (1 << 7) | (1 << 9) | (1 << 12) | (1 << 14)
        | (1 << 16) | (1 << 18) | (1 << 19) | (1 << 21) | (1 << 23) | (1 << 25) | (1 << 27) | (1 << 30) | (1 << 32)
        | (1 << 34) | (1 << 36);

    SmemVault public immutable vault;
    uint256 private immutable ticketUnit;
    uint256 public spins;

    event Spun(address indexed player, uint8 bet, uint8 pick, uint256 tickets, uint8 result, uint256 ticketsWon);
    event SpunMany(address indexed player, uint8 result, uint256 ticketsStaked, uint256 ticketsWon);

    error InvalidBet();
    error ZeroStake();
    error OnlyEOA();

    constructor(SmemVault vault_) {
        vault = vault_;
        ticketUnit = vault_.TICKET_UNIT();
    }

    /// @param bet The bet type, from 0 to 6.
    /// @param pick The number for a NUMBER bet, from 0 to 36. Ignored for other bets.
    /// @param tickets Whole Tickets to bet.
    function spin(uint8 bet, uint8 pick, uint256 tickets) external returns (uint8 result, uint256 ticketsWon) {
        if (bet > HIGH || (bet == NUMBER && pick > 36)) revert InvalidBet();
        if (tickets == 0) revert ZeroStake();
        if (msg.sender != tx.origin) revert OnlyEOA();

        vault.spendTickets(msg.sender, tickets * ticketUnit);

        result = uint8(
            uint256(keccak256(abi.encode(block.prevrandao, blockhash(block.number - 1), msg.sender, spins++))) % 37
        );
        uint256 multiplier = payoutMultiplier(bet, pick, result);
        if (multiplier > 0) {
            ticketsWon = tickets * ticketUnit * multiplier;
            vault.creditTickets(msg.sender, ticketsWon);
        }
        emit Spun(msg.sender, bet, pick, tickets, result, ticketsWon);
    }

    /// @notice Settles many bets on one spin. Each bet is the set of numbers it covers, as a bit mask
    ///         (bit n = number n, 0 to 36), plus whole Tickets. A win pays 36 / (numbers covered) times the bet,
    ///         including the stake: 1 number 36x, split 18x, street 12x, corner 9x, line 6x, dozen or column 3x,
    ///         red, black, odd, even, 1-18 or 19-36 2x.
    function spinMany(uint64[] calldata masks, uint256[] calldata tickets)
        external
        returns (uint8 result, uint256 ticketsWon)
    {
        if (masks.length == 0 || masks.length != tickets.length || masks.length > 40) revert InvalidBet();
        if (msg.sender != tx.origin) revert OnlyEOA();

        uint256 total;
        uint256[] memory multipliers = new uint256[](masks.length);
        for (uint256 i = 0; i < masks.length; i++) {
            if (tickets[i] == 0) revert ZeroStake();
            uint256 covered = _count(masks[i]);
            if (covered == 0 || masks[i] >> 37 != 0 || 36 % covered != 0 || covered > 18) revert InvalidBet();
            multipliers[i] = 36 / covered;
            total += tickets[i];
        }

        vault.spendTickets(msg.sender, total * ticketUnit);

        result = uint8(
            uint256(keccak256(abi.encode(block.prevrandao, blockhash(block.number - 1), msg.sender, spins++))) % 37
        );
        for (uint256 i = 0; i < masks.length; i++) {
            if ((masks[i] >> result) & 1 == 1) ticketsWon += tickets[i] * ticketUnit * multipliers[i];
        }
        if (ticketsWon > 0) vault.creditTickets(msg.sender, ticketsWon);
        emit SpunMany(msg.sender, result, total, ticketsWon);
    }

    function _count(uint64 mask) internal pure returns (uint256 n) {
        while (mask != 0) {
            n += mask & 1;
            mask >>= 1;
        }
    }

    /// @notice How many times the bet is paid back, including the stake. 0 means the bet loses.
    function payoutMultiplier(uint8 bet, uint8 pick, uint8 result) public pure returns (uint256) {
        if (bet == NUMBER) return result == pick ? 36 : 0;
        if (result == 0) return 0;
        bool red = (RED_MASK >> result) & 1 == 1;
        if (bet == RED) return red ? 2 : 0;
        if (bet == BLACK) return red ? 0 : 2;
        if (bet == ODD) return result % 2 == 1 ? 2 : 0;
        if (bet == EVEN) return result % 2 == 0 ? 2 : 0;
        if (bet == LOW) return result <= 18 ? 2 : 0;
        return result >= 19 ? 2 : 0; // HIGH
    }
}
