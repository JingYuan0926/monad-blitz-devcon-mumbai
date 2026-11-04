// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {SmemVault} from "./SmemVault.sol";

/// @title HexGame
/// @notice Pick one of 6 hex tiles and stake whole Tickets. The game burns the Tickets.
///         If the drawn tile matches your pick, you win Prize Points equal to stake x 6.
/// @dev DEMO RANDOMNESS ONLY. The draw uses block data, which a block producer can influence.
///      Use a verifiable randomness service before real prizes depend on it.
contract HexGame {
    uint8 public constant TILES = 6;
    uint256 public constant POINTS_PER_TICKET_ON_WIN = 6;

    SmemVault public immutable vault;

    uint256 public roundsPlayed;

    event Played(
        address indexed player,
        uint256 indexed round,
        uint8 pickedTile,
        uint8 drawnTile,
        uint256 ticketsBurned,
        uint256 pointsWon
    );

    error InvalidTile();
    error ZeroStake();
    error OnlyEOA();

    constructor(SmemVault vault_) {
        vault = vault_;
    }

    /// @param tile The tile you pick, from 1 to 6.
    /// @param tickets The number of whole Tickets you stake.
    function play(uint8 tile, uint256 tickets) external returns (uint8 drawnTile, uint256 pointsWon) {
        if (tile < 1 || tile > TILES) revert InvalidTile();
        if (tickets == 0) revert ZeroStake();
        // Stops a contract from calling play() and reverting when it loses.
        if (msg.sender != tx.origin) revert OnlyEOA();

        vault.spendTickets(msg.sender, tickets * vault.TICKET_UNIT());

        uint256 round = roundsPlayed++;
        uint256 seed = uint256(
            keccak256(abi.encode(block.prevrandao, blockhash(block.number - 1), block.timestamp, msg.sender, round))
        );
        drawnTile = uint8(seed % TILES) + 1;

        if (drawnTile == tile) {
            pointsWon = tickets * POINTS_PER_TICKET_ON_WIN;
            vault.awardPoints(msg.sender, pointsWon);
        }

        emit Played(msg.sender, round, tile, drawnTile, tickets, pointsWon);
    }
}
