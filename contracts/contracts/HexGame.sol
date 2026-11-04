// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

import {SmemVault} from "./SmemVault.sol";

/// @title HexGame
/// @notice A yield draw on 6 hexes.
///         1. The first stake opens a round. The round lasts roundLength seconds.
///         2. Players stake Tickets on hexes. The game spends the staked Tickets.
///         3. Each round has a yield pool in USDC that builds up over the round.
///         4. When the round ends, one hex wins at random.
///         5. The treasury takes a 5% fee. Players on the winning hex split the other 95% by their share of that hex.
///         6. If nobody staked on the winning hex, the yield pool stays in the game.
///         7. After a draw, the game waits. The next stake opens the next round.
/// @dev The yield pool is SIMULATED on testnet: a random amount paid from USDC that the owner sends to this contract.
///      The production version pays the real yield that the vault earns on Aave.
///      DEMO RANDOMNESS ONLY. The seed uses block data, which a block producer can influence.
contract HexGame {
    using SafeERC20 for IERC20;

    uint8 public constant TILES = 6;
    uint256 public constant FEE_BPS = 500; // 5%

    SmemVault public immutable vault;
    IERC20 public immutable usdc;
    address public immutable treasury;
    uint256 public immutable minYieldPool;
    uint256 public immutable maxYieldPool;
    uint256 public immutable roundLength;
    uint256 private immutable ticketUnit;

    struct Round {
        uint256[6] totals; // Whole Tickets on each hex.
        uint256 yieldPool; // USDC paid at the draw.
        uint64 openedAt;
        uint64 endsAt;
        uint8 winningHex; // 0 until the round is settled.
        bool settled;
        uint256 paidToWinners;
        uint256 fee;
    }

    /// @notice The newest round. 0 means no round has opened yet.
    uint256 public currentRoundId;
    uint256 public lastSettledRound;

    mapping(uint256 roundId => Round) private rounds;
    mapping(uint256 roundId => mapping(uint256 hexIndex => address[])) private stakers;
    mapping(uint256 roundId => mapping(address => uint256[6])) private stakes;
    mapping(uint256 roundId => mapping(address => uint256)) public wonInRound;
    mapping(address => uint256) public usdcWonOf;

    event RoundOpened(uint256 indexed roundId, uint256 yieldPool, uint256 endsAt);
    event Staked(address indexed player, uint256 indexed roundId, uint8 hexId, uint256 tickets);
    event Settled(
        uint256 indexed roundId, uint8 winningHex, uint256 yieldPool, uint256 paidToWinners, uint256 fee, uint256 winners
    );
    event Won(address indexed player, uint256 indexed roundId, uint256 amount);

    error InvalidTile();
    error ZeroStake();
    error InvalidConfig();

    constructor(
        SmemVault vault_,
        IERC20 usdc_,
        address treasury_,
        uint256 minYieldPool_,
        uint256 maxYieldPool_,
        uint256 roundLength_
    ) {
        if (minYieldPool_ == 0 || maxYieldPool_ < minYieldPool_ || roundLength_ == 0) revert InvalidConfig();
        vault = vault_;
        usdc = usdc_;
        treasury = treasury_;
        minYieldPool = minYieldPool_;
        maxYieldPool = maxYieldPool_;
        roundLength = roundLength_;
        ticketUnit = vault_.TICKET_UNIT();
    }

    // ---------------------------------------------------------------------
    // Play
    // ---------------------------------------------------------------------

    /// @param hexId The hex you pick, from 1 to 6.
    /// @param tickets The number of whole Tickets you stake.
    function stake(uint8 hexId, uint256 tickets) external {
        if (hexId < 1 || hexId > TILES) revert InvalidTile();
        if (tickets == 0) revert ZeroStake();

        // Draw the round that ended, so this stake opens a new one.
        settlePending();

        Round storage r = rounds[currentRoundId];
        if (currentRoundId == 0 || r.settled) {
            currentRoundId++;
            r = rounds[currentRoundId];
            r.openedAt = uint64(block.timestamp);
            r.endsAt = uint64(block.timestamp + roundLength);
            uint256 span = maxYieldPool - minYieldPool + 1;
            r.yieldPool = minYieldPool + (uint256(_seed(currentRoundId, "pool")) % span);
            emit RoundOpened(currentRoundId, r.yieldPool, r.endsAt);
        }

        vault.spendTickets(msg.sender, tickets * ticketUnit);

        uint256 i = hexId - 1;
        if (stakes[currentRoundId][msg.sender][i] == 0) stakers[currentRoundId][i].push(msg.sender);
        stakes[currentRoundId][msg.sender][i] += tickets;
        r.totals[i] += tickets;

        emit Staked(msg.sender, currentRoundId, hexId, tickets);
    }

    /// @notice Draws the current round if it has ended. Anyone can call it.
    function settlePending() public {
        if (hasPending()) _settle(currentRoundId);
    }

    function hasPending() public view returns (bool) {
        Round storage r = rounds[currentRoundId];
        return currentRoundId != 0 && !r.settled && block.timestamp >= r.endsAt;
    }

    // ---------------------------------------------------------------------
    // Views
    // ---------------------------------------------------------------------

    function getRound(uint256 roundId)
        public
        view
        returns (
            uint256[6] memory totals,
            uint256 yieldPool,
            uint64 openedAt,
            uint64 endsAt,
            uint8 winningHex,
            bool settled,
            uint256 paidToWinners,
            uint256 fee
        )
    {
        Round storage r = rounds[roundId];
        return (r.totals, r.yieldPool, r.openedAt, r.endsAt, r.winningHex, r.settled, r.paidToWinners, r.fee);
    }

    function stakesOf(uint256 roundId, address player) external view returns (uint256[6] memory) {
        return stakes[roundId][player];
    }

    /// @notice The player's stakes in the newest round.
    function currentStakesOf(address player) external view returns (uint256[6] memory) {
        return stakes[currentRoundId][player];
    }

    function prizeReserve() external view returns (uint256) {
        return usdc.balanceOf(address(this));
    }

    // ---------------------------------------------------------------------
    // Internal
    // ---------------------------------------------------------------------

    function _settle(uint256 roundId) internal {
        Round storage r = rounds[roundId];
        uint8 winning = uint8(uint256(_seed(roundId, "draw")) % TILES) + 1;
        r.winningHex = winning;
        r.settled = true;
        lastSettledRound = roundId;

        uint256 onHex = r.totals[winning - 1];
        uint256 reserve = usdc.balanceOf(address(this));
        uint256 pool = r.yieldPool > reserve ? reserve : r.yieldPool;
        address[] storage winners = stakers[roundId][winning - 1];

        if (onHex == 0 || pool == 0) {
            // Nobody on the winning hex. The yield pool stays in the game.
            emit Settled(roundId, winning, r.yieldPool, 0, 0, 0);
            return;
        }

        uint256 fee = (pool * FEE_BPS) / 10_000;
        uint256 forWinners = pool - fee;
        r.fee = fee;
        if (fee > 0) usdc.safeTransfer(treasury, fee);

        uint256 paid;
        for (uint256 j = 0; j < winners.length; j++) {
            address player = winners[j];
            uint256 amount = (forWinners * stakes[roundId][player][winning - 1]) / onHex;
            if (amount == 0) continue;
            wonInRound[roundId][player] = amount;
            usdcWonOf[player] += amount;
            paid += amount;
            usdc.safeTransfer(player, amount);
            emit Won(player, roundId, amount);
        }
        r.paidToWinners = paid;
        emit Settled(roundId, winning, r.yieldPool, paid, fee, winners.length);
    }

    function _seed(uint256 roundId, string memory salt) internal view returns (bytes32) {
        return keccak256(abi.encode(block.prevrandao, blockhash(block.number - 1), block.timestamp, roundId, salt));
    }
}
