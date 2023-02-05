// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.9;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/security/Pausable.sol";
import "@openzeppelin/contracts/utils/math/SafeMath.sol";
// import "@chainlink/contracts/src/v0.8/ChainlinkClient.sol";

import "hardhat/console.sol";

// TODO: Permit
// TODO: Upgrade (Proxy)
// TODO: Snapshot?

using SafeMath for uint256;

// Author: @mattiascaricato
contract Token is ERC20, Ownable, AccessControl, Pausable {
    // using Chainlink for Chainlink.Request;

    mapping (address => uint256) private _shares;
    mapping(address => bool) private _blacklist;
    uint256 private _rewardMultipler = 1e18;
    uint256 private _totalShares;
    uint256 private _totalSupply;

    bytes32 public constant MINTER_ROLE = keccak256("MINTER_ROLE");
    bytes32 public constant BURNER_ROLE = keccak256("BURNER_ROLE");
    bytes32 public constant BLACKLIST_ROLE = keccak256("BLACKLIST_ROLE");
    bytes32 public constant ORACLE_ROLE = keccak256("ORACLE_ROLE");

    event AddressBlacklisted(address indexed addr);
    event AddressUnBlacklisted(address indexed addr);
    event RewardMultiplierUpdated(uint256 indexed addr);

    constructor(string memory name_, string memory symbol_, uint256 initialSupply_) ERC20(name_, symbol_) {
        _setupRole(DEFAULT_ADMIN_ROLE, _msgSender());
        _mint(_msgSender(), initialSupply_ * (10 ** uint256(decimals())));

        // Chainlink contract addresses Goerli
        // setChainlinkToken(0x326C977E6efc84E512bB9C30f76E30c160eD06FB);
        // setChainlinkOracle(0xCC79157eb46F5624204f47AB42b3906cAA40eaB7);
    }

    function _beforeTokenTransfer(
        address from,
        address to,
        uint256 amount
    ) internal virtual override {
        require(!_blacklist[from], "Address is blacklisted");
        require(!_blacklist[to], "Address is blacklisted");
        super._beforeTokenTransfer(from, to, amount);
    }

    function mint(address to, uint256 amount) public onlyRole(MINTER_ROLE) {
        require(to != address(0), "ERC20: mint to the zero address");

        _beforeTokenTransfer(address(0), to, amount);

        _totalShares += amount;

        unchecked {
            // Overflow not possible: balance + amount is at most totalSupply + amount, which is checked above.
            _shares[to] += amount;
        }
        emit Transfer(address(0), to, amount);

        _afterTokenTransfer(address(0), to, amount);
    }

    function burn(address from, uint256 amount) public onlyRole(BURNER_ROLE) {
        _burn(from, amount);
    }

    function blacklist(address _addr) public onlyRole(BLACKLIST_ROLE) {
        require(!_blacklist[_addr], "Address already blacklisted");
        _blacklist[_addr] = true;
        emit AddressBlacklisted(_addr);
    }

    function unblacklist(address _addr) public onlyRole(BLACKLIST_ROLE) {
        require(_blacklist[_addr], "Address already unblacklisted");
        _blacklist[_addr] = false;
        emit AddressUnBlacklisted(_addr);
    }

    function isBlacklisted(address _addr) public view returns (bool) {
        return _blacklist[_addr];
    }

    function pause() public virtual onlyOwner {
        super._pause();
    }

    function unpause() public virtual onlyOwner {
        super._unpause();
    }

    // function setRewardMultipler() public returns (bytes32) {
    //     bytes32 jobId = "ca98366cc7314957b8c012c72f05aeeb";
    //     uint256 fee = (1 * LINK_DIVISIBILITY) / 10;

    //     Chainlink.Request memory req = buildChainlinkRequest(
    //         jobId,
    //         owner(),
    //         this.oracleCallback.selector
    //     );

    //     req.add("get", "https://reward-multiplier.free.beeceptor.com/");

    //     return sendChainlinkRequest(req, fee);
    // }

    // function oracleCallback(bytes32 _requestId, uint256 _result) public {
    //     require(
    //         msg.sender == chainlinkOracleAddress(),
    //         "Only the oracle is allowed to call this function"
    //     );

    //     _rewardMultipler = _result;
    // }

    function rewardMultipler() public view returns (uint256) {
        return _rewardMultipler;
    }

    function setRewardMultipler(uint256 rewardMultipler_) public onlyRole(ORACLE_ROLE) {
        require(rewardMultipler_ > 0, "Invalid RewardMultiplier");
        require(rewardMultipler_ < 60000000000000000, "Invalid RewardMultiplier"); // 6bps

        _rewardMultipler = _rewardMultipler.add(rewardMultipler_);

        emit RewardMultiplierUpdated(_rewardMultipler);
    }

    // TODO: Hardhodear rewards multiplier y agregar lógica de units (ex shares), balanceOf, totalUnits, totalSupply, transfer, mint, burn
    // shares: returns the number of shares for an account  balanceOf:balanceofaspecificwallet
    // balanceOf(account) = shares[account] * rewardsMultiplier
    // totalShares: returns total number of shares underlying USDM  totalSupply: returns total supply of USDM
    // totalSupply() = totalShares * rewardsMultiplier

    function totalSupply() public view virtual override returns (uint256) {
        return _totalShares * _rewardMultipler;
    }

    function totalShares() public view virtual returns (uint256) {
        return _totalShares;
    }

    function sharesOf(address account) public view virtual returns (uint256) {
        return _shares[account];
    }

    function balanceOf(address account) public view virtual override returns (uint256) {
        return sharesOf(account) * _rewardMultipler;
    }

}


// Daily 3% APR => 0.00008219178082


// BUY - 100 USDC - APY 100%

// Day 0
// Daily Reward => 0.002739726027
// Reward Multiplier 1
// Shares 100
// balanceOf 100

// Day 1
// Shares 100
// Reward Multiplier 1.002739726027
// balanceOf 100.2739726027

// Day 100
// Shares 100
// Reward Multiplier 1.2739726027
// balanceOf 127.39726027

// Day 200
// Shares 100
// Reward Multiplier 1.5479452054
// balanceOf 154.79452054

// Day 365
// Shares 100
// Reward Multiplier 1.9999999
// balanceOf 199.99999


// Redim at day 100
// Shares 100
// Reward Multiplier 1.2739726027
// balanceOf 127.39726027


// 1 - 100000000000000000
// 1000 - 1000000000000000000000
// *
// 20% APR
// Daily => 0.000547945205479452 - 547945205479452
// Daily => 1.000547945205479452 - 1000547945205479452
// 1000547945205500000

// 5.479452055e35


// 1000000000000000000000 * 1000547945205479452
// 5.4794521e+32
// 5.479452055×10³⁵
// (1000000000000000000000 * 1000547945205479452)/10^18
// (1000000000000000000000 * 1000547945205479452)/1000000000000000000
// (1000000000000000000000n * 1000547945205479452n)/1000000000000000000n
// 1000547945205479452000n


// 1000 * 1.0005479452054794521
// Result: 1,000.5479452054794521 - 1000.547945205479452
// 1000547945205479452000