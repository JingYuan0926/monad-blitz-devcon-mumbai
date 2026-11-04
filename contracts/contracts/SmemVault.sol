// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/// @title SmemVault
/// @notice Users deposit USDC and earn Tickets over time. Games spend Tickets and award Prize Points.
/// @dev Games can only change Tickets and Prize Points. No game and no owner can move a user's USDC.
///      Only the depositor can withdraw their principal.
contract SmemVault is Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    /// @notice Tickets use 18 decimals. 1e18 is one Ticket.
    uint256 public constant TICKET_UNIT = 1e18;

    IERC20 public immutable usdc;
    uint256 private immutable usdcUnit;

    /// @notice Ticket units that 1 whole USDC earns in 1 hour.
    uint256 public immutable ticketsPerUsdcPerHour;

    uint256 public totalPrincipal;

    mapping(address => uint256) public principalOf;
    mapping(address => uint256) private settledTickets;
    mapping(address => uint256) public lastAccrualAt;

    mapping(address => bool) public isGame;

    /// @notice Prize Points per UTC day. They decide each player's share of that day's prize pool.
    mapping(uint256 day => mapping(address => uint256)) public pointsOf;
    mapping(uint256 day => uint256) public totalPointsOf;
    mapping(address => uint256) public lifetimePointsOf;

    event Deposited(address indexed user, uint256 amount);
    event Withdrawn(address indexed user, uint256 amount);
    event TicketsSpent(address indexed user, address indexed game, uint256 amount);
    event PointsAwarded(address indexed user, address indexed game, uint256 indexed day, uint256 points);
    event GameSet(address indexed game, bool allowed);

    error ZeroAmount();
    error InsufficientPrincipal();
    error InsufficientTickets();
    error NotGame();

    modifier onlyGame() {
        if (!isGame[msg.sender]) revert NotGame();
        _;
    }

    constructor(IERC20 usdc_, uint8 usdcDecimals_, uint256 ticketsPerUsdcPerHour_, address owner_)
        Ownable(owner_)
    {
        usdc = usdc_;
        usdcUnit = 10 ** usdcDecimals_;
        ticketsPerUsdcPerHour = ticketsPerUsdcPerHour_;
    }

    // ---------------------------------------------------------------------
    // Savings
    // ---------------------------------------------------------------------

    function deposit(uint256 amount) external nonReentrant {
        if (amount == 0) revert ZeroAmount();
        _accrue(msg.sender);
        usdc.safeTransferFrom(msg.sender, address(this), amount);
        principalOf[msg.sender] += amount;
        totalPrincipal += amount;
        emit Deposited(msg.sender, amount);
    }

    function withdraw(uint256 amount) external nonReentrant {
        if (amount == 0) revert ZeroAmount();
        if (principalOf[msg.sender] < amount) revert InsufficientPrincipal();
        _accrue(msg.sender);
        principalOf[msg.sender] -= amount;
        totalPrincipal -= amount;
        usdc.safeTransfer(msg.sender, amount);
        emit Withdrawn(msg.sender, amount);
    }

    // ---------------------------------------------------------------------
    // Tickets
    // ---------------------------------------------------------------------

    /// @notice Tickets the user holds now, including Tickets earned since the last update.
    function ticketsOf(address user) public view returns (uint256) {
        return settledTickets[user] + _pendingTickets(user);
    }

    /// @notice Ticket units the user earns each second at the current deposit.
    function ticketRateOf(address user) external view returns (uint256) {
        return (principalOf[user] * ticketsPerUsdcPerHour) / (usdcUnit * 1 hours);
    }

    function spendTickets(address user, uint256 amount) external onlyGame {
        if (amount == 0) revert ZeroAmount();
        _accrue(user);
        if (settledTickets[user] < amount) revert InsufficientTickets();
        settledTickets[user] -= amount;
        emit TicketsSpent(user, msg.sender, amount);
    }

    // ---------------------------------------------------------------------
    // Prize Points
    // ---------------------------------------------------------------------

    function awardPoints(address user, uint256 points) external onlyGame {
        if (points == 0) return;
        uint256 day = currentDay();
        pointsOf[day][user] += points;
        totalPointsOf[day] += points;
        lifetimePointsOf[user] += points;
        emit PointsAwarded(user, msg.sender, day, points);
    }

    function currentDay() public view returns (uint256) {
        return block.timestamp / 1 days;
    }

    // ---------------------------------------------------------------------
    // Admin
    // ---------------------------------------------------------------------

    function setGame(address game, bool allowed) external onlyOwner {
        isGame[game] = allowed;
        emit GameSet(game, allowed);
    }

    // ---------------------------------------------------------------------
    // Internal
    // ---------------------------------------------------------------------

    function _pendingTickets(address user) internal view returns (uint256) {
        uint256 last = lastAccrualAt[user];
        if (last == 0) return 0;
        uint256 elapsed = block.timestamp - last;
        return (principalOf[user] * elapsed * ticketsPerUsdcPerHour) / (usdcUnit * 1 hours);
    }

    function _accrue(address user) internal {
        settledTickets[user] += _pendingTickets(user);
        lastAccrualAt[user] = block.timestamp;
    }
}
