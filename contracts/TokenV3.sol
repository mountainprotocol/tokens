// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.9;

import "@openzeppelin/contracts-upgradeable/token/ERC20/IERC20Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC20/utils/SafeERC20Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/access/AccessControlUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/security/PausableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/math/SafeMathUpgradeable.sol";

// TODO: Permit
// TODO: Check safe methods
// TODO: Lock functions gracetime period

// Author: @mattiascaricato
contract TokenV3 is IERC20Upgradeable, OwnableUpgradeable, AccessControlUpgradeable, PausableUpgradeable {
    using SafeMathUpgradeable for uint256;
    using SafeERC20Upgradeable for IERC20Upgradeable;

    string private _name;
    string private _symbol;
    uint256 private _rewardMultiplier;
    uint256 private _totalShares;

    mapping (address => uint256) private _shares;
    mapping(address => bool) private _blacklist;
    mapping(address => mapping(address => uint256)) private _allowances;

    bytes32 public constant MINTER_ROLE = keccak256("MINTER_ROLE");
    bytes32 public constant BURNER_ROLE = keccak256("BURNER_ROLE");
    bytes32 public constant BLACKLIST_ROLE = keccak256("BLACKLIST_ROLE");
    bytes32 public constant ORACLE_ROLE = keccak256("ORACLE_ROLE");

    event AddressBlacklisted(address indexed addr);
    event AddressUnBlacklisted(address indexed addr);
    event RewardMultiplier(uint256 indexed addr);

    function initialize(string memory name_, string memory symbol_, uint256 initialShares) public initializer {
        _name = name_;
        _symbol = symbol_;
        _rewardMultiplier = 1e18;

        __Ownable_init();
        __AccessControl_init();
        __Pausable_init();

        _setupRole(DEFAULT_ADMIN_ROLE, _msgSender());
        _mint(_msgSender(), initialShares);
    }

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    /**
     * @dev Returns the name of the token.
     */
    function name() public view returns (string memory) {
        return _name;
    }

    /**
     * @dev Returns the symbol of the token, usually a shorter version of the
     * name.
     */
    function symbol() public view returns (string memory) {
        return _symbol;
    }

    /**
     * @dev Returns the number of decimals used to get its user representation.
     * For example, if `decimals` equals `2`, a balance of `505` tokens should
     * be displayed to a user as `5.05` (`505 / 10 ** 2`).
     *
     * Tokens usually opt for a value of 18, imitating the relationship between
     * Ether and Wei. This is the default value returned by ERC20 tokens.
     *
     * NOTE: This information is only used for _display_ purposes: it in
     * no way affects any of the arithmetic of the contract, including
     * {IERC20-balanceOf} and {IERC20-transfer}.
     */
    function decimals() public pure returns (uint8) {
        return 18;
    }

     /**
     * @return the amount of shares that corresponds to `supplyAmount` protocol-controlled tokens.
     */
    function getSharesBySupply(uint256 supplyAmount) public view returns (uint256) {
        // We use fixed-point arithmetic to avoid precision issues
        return supplyAmount.mul(1e18).div(rewardMultiplier());
    }

    /**
     * @return the amount of supply that corresponds to `sharesAmount` protocol-controlled shares.
     */
    function getSupplyByShares(uint256 sharesAmount) public view returns (uint256) {
        return sharesAmount.mul(rewardMultiplier()).div(1e18);
    }

    function totalShares() public view returns (uint256) {
        return _totalShares;
    }

    /**
     * @return the amount of tokens in existence.
     *
     * @dev Always equals to `getSupplyByShares()` since token amount
     * is pegged to the total amount of shares controlled by the protocol.
     */
    function totalSupply() public view returns (uint256) {
        return getSupplyByShares(_totalShares);
    }

    function sharesOf(address account) public view returns (uint256) {
        return _shares[account];
    }

    /**
     * @return the the account balance owned by `account`.
     *
     * @dev Balances are dynamic and equal the `account`'s share in the amount of the
     * total reserves controlled by the protocol. See `sharesOf`.
     */
    function balanceOf(address account) public view returns (uint256) {
        return getSupplyByShares(sharesOf(account));
    }

    function _mint(address to, uint256 sharesAmount) private {
        require(to != address(0), "ERC20: mint to the zero address");

        _beforeTokenTransfer(address(0), to, sharesAmount);

        _totalShares = _totalShares.add(sharesAmount);

        unchecked {
            // Overflow not possible: balance + amount is at most totalSupply + amount, which is checked above.
            _shares[to] = _shares[to].add(sharesAmount);
        }

        _afterTokenTransfer(address(0), to, sharesAmount);
    }

    /**
     * @dev Creates `sharesAmount` and assigns them to `to` account,
     * increasing the total amount of shares not the total supply (directly).
     *
     * Emits a {Transfer} event with `from` set to the zero address.
     *
     * Requirements:
     *
     * - `to` cannot be the zero address.
     * - the contract must not be paused.
     */
    function mint(address to, uint256 amount) public onlyRole(MINTER_ROLE) {
        uint256 sharesAmount = getSharesBySupply(amount);
        _mint(to, sharesAmount);
    }

    function _transferShares(address from, address to, uint256 sharesAmount) private {
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

        _afterTokenTransfer(from, to, sharesAmount);
    }

    function _burn(address account, uint256 sharesAmount) private {
        require(account != address(0), "ERC20: burn from the zero address");

        _beforeTokenTransfer(account, address(0), sharesAmount);

        uint256 accountShares = sharesOf(account);
        require(accountShares >= sharesAmount, "ERC20: burn amount exceeds balance");
        unchecked {
            _shares[account] = accountShares.sub(sharesAmount);
            // Overflow not possible: amount <= accountBalance <= totalSupply.
            _totalShares = _totalShares.sub(sharesAmount);
        }

        _afterTokenTransfer(account, address(0), sharesAmount);
    }

    /**
     * @notice Destroys `sharesAmount` shares from `from` account's holdings,
     * decreasing the total amount of shares not the total supply (directly).
     * @dev This doesn't decrease the token total supply.
     *
     * Requirements:
     *
     * - `from` cannot be the zero address.
     * - `from` must hold at least `sharesAmount` shares.
     * - the contract must not be paused.
     */
    function burn(address from, uint256 amount) public onlyRole(BURNER_ROLE) {
        uint256 sharesAmount = getSharesBySupply(amount);
        _burn(from, sharesAmount);
    }

    /**
     * @dev See {IERC20-transfer}.
     *
     * Requirements:
     *
     * - `to` cannot be the zero address.
     * - the caller must have a balance of at least `amount`.
     */
    function transfer(address to, uint256 amount) public returns (bool) {
        address owner = _msgSender();
        uint256 sharesAmount = getSharesBySupply(amount);
        _transferShares(owner, to, sharesAmount);

        return true;
    }

    function blacklist(address account) public onlyRole(BLACKLIST_ROLE) {
        require(!_blacklist[account], "Address already blacklisted");
        _blacklist[account] = true;
        emit AddressBlacklisted(account);
    }

    function unblacklist(address account) public onlyRole(BLACKLIST_ROLE) {
        require(_blacklist[account], "Address is not blacklisted");
        _blacklist[account] = false;
        emit AddressUnBlacklisted(account);
    }

    function isBlacklisted(address account) public view returns (bool) {
        return _blacklist[account];
    }

    function _beforeTokenTransfer(address from, address to, uint256 amount) private view {
        // Each blacklist check is an SLOAD, which is gas intensive.
        // We only block sender not receiver, so we don't tax every user
        require(!isBlacklisted(from), "Address is blacklisted");
        // Useful for scenarios such as preventing trades until the end of an evaluation
        // period, or having an emergency switch for freezing all token transfers in the
        // event of a large bug.
        require(!paused(), "Transfers not allowed while paused");
    }

    function _afterTokenTransfer(address from, address to, uint256 amount) private {
        emit Transfer(from, to, amount);
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

        emit RewardMultiplier(_rewardMultiplier);
    }

    /**
     * @dev Sets `amount` as the allowance of `spender` over the `owner` s tokens.
     *
     * This private function is equivalent to `approve`, and can be used to
     * e.g. set automatic allowances for certain subsystems, etc.
     *
     * Emits an {Approval} event.
     *
     * Requirements:
     *
     * - `owner` cannot be the zero address.
     * - `spender` cannot be the zero address.
     */
    function _approve(
        address owner,
        address spender,
        uint256 amount
    ) private {
        require(owner != address(0), "ERC20: approve from the zero address");
        require(spender != address(0), "ERC20: approve to the zero address");

        _allowances[owner][spender] = amount;
        emit Approval(owner, spender, amount);
    }

    /**
     * @dev See {IERC20-approve}.
     *
     * NOTE: If `amount` is the maximum `uint256`, the allowance is not updated on
     * `transferFrom`. This is semantically equivalent to an infinite approval.
     *
     * Requirements:
     *
     * - `spender` cannot be the zero address.
     */
    function approve(address spender, uint256 amount) public returns (bool) {
        address owner = _msgSender();
        _approve(owner, spender, amount);

        return true;
    }

    /**
     * @dev See {IERC20-allowance}.
     */
    function allowance(address owner, address spender) public view returns (uint256) {
        return _allowances[owner][spender];
    }

    /**
     * @dev Updates `owner` s allowance for `spender` based on spent `amount`.
     *
     * Does not update the allowance amount in case of infinite allowance.
     * Revert if not enough allowance is available.
     *
     * Might emit an {Approval} event.
     */
    function _spendAllowance(address owner, address spender, uint256 amount) private {
        uint256 currentAllowance = allowance(owner, spender);
        if (currentAllowance != type(uint256).max) {
            require(currentAllowance >= amount, "ERC20: insufficient allowance");
            unchecked {
                _approve(owner, spender, currentAllowance - amount);
            }
        }
    }

    /**
     * @dev See {IERC20-transferFrom}.
     *
     * Emits an {Approval} event indicating the updated allowance. This is not
     * required by the EIP. See the note at the beginning of {ERC20}.
     *
     * Emits an {Approval} event indicating the updated allowance. This is not
     * required by the EIP. This allows applications to reconstruct the allowance
     * for all accounts just by listening to said events.
     *
     * NOTE: Does not update the allowance if the current allowance
     * is the maximum `uint256`.
     *
     * Requirements:
     *
     * - `from` and `to` cannot be the zero address.
     * - `from` must have a balance of at least `amount`.
     * - the caller must have allowance for ``from``'s tokens of at least
     * `amount`.
     */
    function transferFrom(address from, address to, uint256 amount) public returns (bool) {
        address spender = _msgSender();
        uint256 sharesAmount = getSharesBySupply(amount);
        _spendAllowance(from, spender, sharesAmount);
        _transferShares(from, to, sharesAmount);

        return true;
    }

    /**
     * @dev Atomically decreases the allowance granted to `spender` by the caller.
     *
     * This is an alternative to {approve} that can be used as a mitigation for
     * problems described in {IERC20-approve}.
     *
     * Emits an {Approval} event indicating the updated allowance.
     *
     * Requirements:
     *
     * - `spender` cannot be the zero address.
     * - `spender` must have allowance for the caller of at least
     * `subtractedValue`.
     */
    function decreaseAllowance(address spender, uint256 subtractedValue) public returns (bool) {
        address owner = _msgSender();
        uint256 currentAllowance = allowance(owner, spender);
        require(currentAllowance >= subtractedValue, "ERC20: decreased allowance below zero");
        unchecked {
            _approve(owner, spender, currentAllowance - subtractedValue);
        }

        return true;
    }
}
