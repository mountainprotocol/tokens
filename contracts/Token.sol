// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.9;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/security/Pausable.sol";
import "@openzeppelin/contracts/utils/math/SafeMath.sol";

// TODO: pause for transfer
// TODO: approve
// TODO: transferFrom
// TODO: Upgrade (Proxy)
// TODO: Permit
// TODO: Lock functions gracetime period

using SafeMath for uint256;

// Author: @mattiascaricato
contract Token is ERC20, Ownable, AccessControl, Pausable {
    using SafeERC20 for IERC20;

    mapping (address => uint256) private _shares;
    mapping(address => bool) private _blacklist;
    uint256 private _rewardMultiplier = 1e18;
    uint256 private _totalShares;

    bytes32 public constant MINTER_ROLE = keccak256("MINTER_ROLE");
    bytes32 public constant BURNER_ROLE = keccak256("BURNER_ROLE");
    bytes32 public constant BLACKLIST_ROLE = keccak256("BLACKLIST_ROLE");
    bytes32 public constant ORACLE_ROLE = keccak256("ORACLE_ROLE");

    event AddressBlacklisted(address indexed addr);
    event AddressUnBlacklisted(address indexed addr);
    event RewardMultiplierUpdated(uint256 indexed addr);

    constructor(string memory name_, string memory symbol_, uint256 initialShares) ERC20(name_, symbol_) {
        _setupRole(DEFAULT_ADMIN_ROLE, _msgSender());
        _mint(_msgSender(), initialShares);
    }

     /**
     * @return the amount of shares that corresponds to `supplyAmount` protocol-controlled token.
     */
    function getSharesBySupply(uint256 supplyAmount) public view returns (uint256) {
        // We use fixed-point arithmetic to avoid precision issues
        return supplyAmount.mul(1e18).div(rewardMultiplier());
    }

    /**
     * @return the amount of tokens that corresponds to `sharesAmount` protocol-controlled shares.
     */
    function getSupplyByShares(uint256 sharesAmount) public view returns (uint256) {
        return sharesAmount.mul(rewardMultiplier()).div(1e18);
    }

    function totalShares() public view returns (uint256) {
        return _totalShares;
    }

    function totalSupply() public view override returns (uint256) {
        // Divided by ie18 because both variables have 18 decimals (ie18^2)
        return getSupplyByShares(_totalShares);
    }

    function sharesOf(address account) public view returns (uint256) {
        return _shares[account];
    }

    function balanceOf(address account) public view override returns (uint256) {
        return getSupplyByShares(sharesOf(account));
    }

    function _mint(address to, uint256 sharesAmount) internal override {
        require(to != address(0), "ERC20: mint to the zero address");

        _beforeTokenTransfer(address(0), to, sharesAmount);

        _totalShares = _totalShares.add(sharesAmount);

        unchecked {
            // Overflow not possible: balance + amount is at most totalSupply + amount, which is checked above.
            _shares[to] = _shares[to].add(sharesAmount);
        }
        emit Transfer(address(0), to, sharesAmount);

        _afterTokenTransfer(address(0), to, sharesAmount);
    }

    function mint(address to, uint256 amount) public onlyRole(MINTER_ROLE) {
        uint256 sharesAmount = getSharesBySupply(amount);
        _mint(to, sharesAmount);
    }

    function _transferShares(address from, address to, uint256 sharesAmount) internal {
        require(from != address(0), "ERC20: transfer from the zero address");
        require(to != address(0), "ERC20: transfer to the zero address");

        _beforeTokenTransfer(from, to, sharesAmount);

        uint256 fromShares = _shares[from];
        require(fromShares >= sharesAmount, "ERC20: transfer amount exceeds balance");
        unchecked {
            _shares[from] = fromShares.sub(sharesAmount);
            // Overflow not possible: the sum of all balances is capped by totalSupply, and the sum is preserved by
            // decrementing then incrementing.
            _shares[to] = _shares[to].add(sharesAmount);
        }

        emit Transfer(from, to, sharesAmount);

        _afterTokenTransfer(from, to, sharesAmount);
    }

    function transfer(address to, uint256 amount) public override returns (bool) {
        address owner = _msgSender();
        uint256 sharesAmount = getSharesBySupply(amount);
        _transferShares(owner, to, sharesAmount);

        return true;
    }

    function _burn(address account, uint256 sharesAmount) internal override {
        require(account != address(0), "ERC20: burn from the zero address");

        _beforeTokenTransfer(account, address(0), sharesAmount);

        uint256 accountShares = sharesOf(account);
        require(accountShares >= sharesAmount, "ERC20: burn amount exceeds balance");
        unchecked {
            _shares[account] = accountShares.sub(sharesAmount);
            // Overflow not possible: amount <= accountBalance <= totalSupply.
            _totalShares = _totalShares.sub(sharesAmount);
        }

        emit Transfer(account, address(0), sharesAmount);

        _afterTokenTransfer(account, address(0), sharesAmount);
    }

    function burn(address from, uint256 amount) public onlyRole(BURNER_ROLE) {
        uint256 sharesAmount = getSharesBySupply(amount);
        _burn(from, sharesAmount);
    }

    function blacklist(address _addr) public onlyRole(BLACKLIST_ROLE) {
        require(!_blacklist[_addr], "Address already blacklisted");
        _blacklist[_addr] = true;
        emit AddressBlacklisted(_addr);
    }

    function unblacklist(address _addr) public onlyRole(BLACKLIST_ROLE) {
        require(_blacklist[_addr], "Address is not blacklisted");
        _blacklist[_addr] = false;
        emit AddressUnBlacklisted(_addr);
    }

    function isBlacklisted(address _addr) public view returns (bool) {
        return _blacklist[_addr];
    }

    function _beforeTokenTransfer(
        address from,
        address to,
        uint256 amount
    ) internal override {
        // Each blacklist check is an SLOAD, which is gas intensive.
        // We only block sender not receiver, so we don't tax every user
        require(!isBlacklisted(from), "Address is blacklisted");
        super._beforeTokenTransfer(from, to, amount);
    }

    function pause() public onlyOwner {
        super._pause();
    }

    function unpause() public onlyOwner {
        super._unpause();
    }

    function rewardMultiplier() public view returns (uint256) {
        return _rewardMultiplier;
    }

    function setRewardMultiplier(uint256 rewardMultiplier_) public onlyRole(ORACLE_ROLE) {
        require(rewardMultiplier_ > 0, "Invalid RewardMultiplier");
        require(rewardMultiplier_ < 50000000000000000, "Invalid RewardMultiplier"); // 5bps

        _rewardMultiplier = _rewardMultiplier.add(rewardMultiplier_);

        emit RewardMultiplierUpdated(_rewardMultiplier);
    }
}
