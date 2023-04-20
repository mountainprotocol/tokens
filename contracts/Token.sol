// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.9;

import "@openzeppelin/contracts-upgradeable/token/ERC20/IERC20Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/access/AccessControlUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/security/PausableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/math/SafeMathUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/CountersUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/cryptography/EIP712Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC20/extensions/draft-IERC20PermitUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/cryptography/ECDSAUpgradeable.sol";

// TODO: Upgrade Time lock

// @author: @mattiascaricato
contract USDM is IERC20Upgradeable, OwnableUpgradeable, AccessControlUpgradeable, PausableUpgradeable, UUPSUpgradeable, IERC20PermitUpgradeable, EIP712Upgradeable {
    using SafeMathUpgradeable for uint256;
    using CountersUpgradeable for CountersUpgradeable.Counter;

    string private _name;
    string private _symbol;
    uint256 private _totalShares;
    uint256 private constant BASE = 1e18;
    uint256 public rewardMultiplier;

    mapping (address => uint256) private _shares;
    mapping(address => bool) private _blacklist;
    mapping(address => mapping(address => uint256)) private _allowances;
    mapping(address => CountersUpgradeable.Counter) private _nonces;

    // solhint-disable-next-line var-name-mixedcase
    bytes32 private constant _PERMIT_TYPEHASH =
        keccak256("Permit(address owner,address spender,uint256 value,uint256 nonce,uint256 deadline)");

    bytes32 public constant MINTER_ROLE = keccak256("MINTER_ROLE");
    bytes32 public constant BURNER_ROLE = keccak256("BURNER_ROLE");
    bytes32 public constant BLACKLIST_ROLE = keccak256("BLACKLIST_ROLE");
    bytes32 public constant ORACLE_ROLE = keccak256("ORACLE_ROLE");
    bytes32 public constant UPGRADER_ROLE = keccak256("UPGRADER_ROLE");

    event AccountBlacklisted(address indexed addr);
    event AccountUnblacklisted(address indexed addr);
    event RewardMultiplier(uint256 indexed addr);

    /**
     * @notice Initializes the contract
     * @param name_ The name of the token
     * @param symbol_ The symbol of the token
     * @param initialShares The initial amount of shares for the contract creator
     */
    function initialize(string memory name_, string memory symbol_, uint256 initialShares) external initializer {
        _name = name_;
        _symbol = symbol_;
        rewardMultiplier = BASE;

        __Ownable_init();
        __AccessControl_init();
        __Pausable_init();
        __UUPSUpgradeable_init();
        __EIP712_init(name_, "1");

        _setupRole(DEFAULT_ADMIN_ROLE, _msgSender());
        _mint(_msgSender(), initialShares);
    }

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    /**
     * @notice Ensures that only accounts with the UPGRADER_ROLE can upgrade the contract
     */
    function _authorizeUpgrade(address) internal override onlyRole(UPGRADER_ROLE) {}

    /**
     * @notice Returns the name of the token
     * @return A string representing the token's name
     */
    function name() external view returns (string memory) {
        return _name;
    }

    /**
     * @notice Returns the symbol of the token
     * @return A string representing the token's symbol
     */
    function symbol() external view returns (string memory) {
        return _symbol;
    }

    /**
     * @notice Returns the number of decimals the token uses
     * @dev This value is only used for _display_ purposes: it in
     * no way affects any of the arithmetic of the contract, including
     * {IERC20-balanceOf} and {IERC20-transfer}.
     * @return The number of decimals (18)
     */
    function decimals() external pure returns (uint8) {
        return 18;
    }

    /**
     * @notice Converts an amount of tokens to shares
     * @param amount The amount of tokens to convert
     * @return The equivalent amount of shares
     */
    function amountToShares(uint256 amount) public view returns (uint256) {
        return amount.mul(BASE).div(rewardMultiplier);
    }

    /**
     * @notice Converts an amount of shares to tokens
     * @param shares The amount of shares to convert
     * @return The equivalent amount of tokens
     */
    function sharesToAmount(uint256 shares) public view returns (uint256) {
        return shares.mul(rewardMultiplier).div(BASE);
    }

    /**
     * @notice Returns the total amount of shares
     * @return The total amount of shares
     */
    function totalShares() external view returns (uint256) {
        return _totalShares;
    }

    /**
     * @notice Returns the total supply of tokens
     * @return The total supply of tokens
     */
    function totalSupply() external view returns (uint256) {
        return sharesToAmount(_totalShares);
    }

    /**
     * @notice Returns the amount of shares owned by the account
     * @param account The account to check
     * @return The amount of shares owned by the account
     */
    function sharesOf(address account) public view returns (uint256) {
        return _shares[account];
    }

    /**
     * @notice Returns the balance of the specified address
     * @dev Balances are dynamic and equal the `account`'s share in the amount of the
     * total reserves controlled by the protocol. See `sharesOf`.
     * @param account The address to query the balance of
     * @return The balance of the specified address
     */
    function balanceOf(address account) external view returns (uint256) {
        return sharesToAmount(sharesOf(account));
    }

    /**
     * @notice Mints a specified number of shares to the given address.
     * @dev This is an internal function.
     * @param to The address to which shares will be minted.
     * @param shares The number of shares to mint.
     */
    function _mint(address to, uint256 shares) private {
        require(to != address(0), "ERC20: mint to the zero address");

        _beforeTokenTransfer(address(0), to, shares);

        _totalShares = _totalShares.add(shares);

        unchecked {
            // Overflow not possible: balance + amount is at most totalSupply + amount, which is checked above.
            _shares[to] = _shares[to].add(shares);
        }

        _afterTokenTransfer(address(0), to, shares);
    }

    /**
     * @notice Mints new tokens to the specified address
     * @dev Creates `shares` and assigns them to `to` account,
     * increasing the total amount of shares not the total supply (directly).
     *
     * Emits a {Transfer} event with `from` set to the zero address.
     *
     * Requirements:
     *
     * - Only users with MINTER_ROLE can call this function.
     * - `to` cannot be the zero address.
     * - the contract must not be paused.
     * @param to The address to mint the tokens to
     * @param amount The amount of tokens to mint
     */
    function mint(address to, uint256 amount) external onlyRole(MINTER_ROLE) {
        uint256 shares = amountToShares(amount);
        _mint(to, shares);
    }

    /**
     * @notice Transfers a specified number of tokens from one address to another.
     * @dev This is an internal function.
     * @param from The address from which shares will be transferred.
     * @param to The address to which shares will be transferred.
     * @param amount The number of tokens to transfer.
     */
    function _transfer(address from, address to, uint256 amount) private {
        require(from != address(0), "ERC20: transfer from the zero address");
        require(to != address(0), "ERC20: transfer to the zero address");

        _beforeTokenTransfer(from, to, amount);

        uint256 shares = amountToShares(amount);
        uint256 fromShares = _shares[from];
        require(fromShares >= shares, "ERC20: transfer amount exceeds balance");
        unchecked {
            _shares[from] = fromShares.sub(shares);
            // Overflow not possible: the sum of all balances is capped by totalSupply, and the sum is preserved by
            // decrementing then incrementing.
            _shares[to] = _shares[to].add(shares);
        }

        _afterTokenTransfer(from, to, amount);
    }

    /**
     * @notice Burns a specified number of shares from the given address.
     * @dev This is an internal function.
     * @param account The address from which shares will be burned.
     * @param shares The number of shares to burn.
     */
    function _burn(address account, uint256 shares) private {
        require(account != address(0), "ERC20: burn from the zero address");

        _beforeTokenTransfer(account, address(0), shares);

        uint256 accountShares = sharesOf(account);
        require(accountShares >= shares, "ERC20: burn amount exceeds balance");
        unchecked {
            _shares[account] = accountShares.sub(shares);
            // Overflow not possible: amount <= accountBalance <= totalSupply.
            _totalShares = _totalShares.sub(shares);
        }

        _afterTokenTransfer(account, address(0), shares);
    }

    /**
     * @notice Burns a specified amount of tokens from the given address.
     * @dev This function can only be called by an account with the BURNER_ROLE.
     * It converts the token amount to shares and burns the shares.
     *
     * Emits a {Transfer} event with `to` set to the zero address.
     *
     * * Requirements:
     *
     * - Only users with BURNER_ROLE can call this function.
     * - `from` cannot be the zero address.
     * - `from` must hold at least `shares` shares.
     * - the contract must not be paused.
     * @param from The address from which tokens will be burned.
     * @param amount The amount of tokens to burn.
     */
    function burn(address from, uint256 amount) external onlyRole(BURNER_ROLE) {
        uint256 shares = amountToShares(amount);
        _burn(from, shares);
    }

    /**
     * @notice Transfers a specified number of tokens from the caller's address to the recipient.
     * @dev This function converts the token amount to shares and calls the _transferShares function.
     * Requirements:
     *
     * - `to` cannot be the zero address.
     * - the caller must have a balance of at least `amount`.
     * @param to The address to which tokens will be transferred.
     * @param amount The number of tokens to transfer.
     * @return A boolean value indicating whether the operation succeeded.
     */
    function transfer(address to, uint256 amount) external returns (bool) {
        address owner = _msgSender();
        _transfer(owner, to, amount);

        return true;
    }

    /**
     * @notice Blacklists the specified address
     * @param account The address to blacklist
     */
    function _blacklistAccount(address account) internal {
        require(!_blacklist[account], "Address already blacklisted");
        _blacklist[account] = true;
        emit AccountBlacklisted(account);
    }

    /**
     * @notice Removes the specified address from the blacklist
     * @param account The address to remove from the blacklist
     */
    function _unblacklistAccount(address account) internal {
        require(_blacklist[account], "Address is not blacklisted");
        _blacklist[account] = false;
        emit AccountUnblacklisted(account);
    }

    /**
     * @notice Blacklists multiple accounts at once
     * @dev This function can only be called by an account with the BLACKLIST_ROLE
     * @param addresses An array of addresses to be blacklisted
     */
    function blacklistAccounts(address[] calldata addresses) external onlyRole(BLACKLIST_ROLE) {
        for (uint256 i = 0; i < addresses.length; i++) {
            _blacklistAccount(addresses[i]);
        }
    }

    /**
     * @notice Removes multiple accounts from the blacklist at once
     * @dev This function can only be called by an account with the BLACKLIST_ROLE
     * @param addresses An array of addresses to be removed from the blacklist
     */
    function unblacklistAccounts(address[] calldata addresses) external onlyRole(BLACKLIST_ROLE) {
        for (uint256 i = 0; i < addresses.length; i++) {
            _unblacklistAccount(addresses[i]);
        }
    }

    /**
     * @notice Checks if the specified address is blacklisted
     * @param account The address to check
     * @return A boolean value indicating whether the address is blacklisted
     */
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

    /**
     * @notice Pauses token transfers and other operations.
     * @dev Only the contract owner can call this function. Inherits the _pause function from @openzeppelin/PausableUpgradeable contract.
     */
    function pause() external onlyOwner {
        super._pause();
    }

    /**
     * @notice Unpauses token transfers and other operations.
     * @dev Only the contract owner can call this function. Inherits the _unpause function from @openzeppelin/PausableUpgradeable contract.
     */
    function unpause() external onlyOwner {
        super._unpause();
    }

    /**
     * @notice Adds a new reward multiplier to the existing reward multiplier.
     * @dev Only users with ORACLE_ROLE can call this function.
     * @param _rewardMultiplier The new reward multiplier to be added.
     */
    function addRewardMultiplier(uint256 _rewardMultiplier) external onlyRole(ORACLE_ROLE) {
        // TODO: change addrewardmultiplier to setrewardmultiplier
        require(_rewardMultiplier > 0, "Invalid RewardMultiplier");
        require(_rewardMultiplier < 0.0005 ether, "Invalid RewardMultiplier"); // 5bps

        rewardMultiplier = rewardMultiplier.add(_rewardMultiplier);

        emit RewardMultiplier(rewardMultiplier);
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
    function approve(address spender, uint256 amount) external returns (bool) {
        address owner = _msgSender();
        _approve(owner, spender, amount);

        return true;
    }

    /**
     * @notice Returns the remaining amount of tokens that `spender` is allowed to spend on behalf of `owner`.
     * @dev See {IERC20-allowance}.
     * @param owner The address of the token owner.
     * @param spender The address of the spender.
     * @return The remaining allowance of the spender on behalf of the owner.
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
    function transferFrom(address from, address to, uint256 amount) external returns (bool) {
        address spender = _msgSender();
        _spendAllowance(from, spender, amount);
        _transfer(from, to, amount);

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
    function decreaseAllowance(address spender, uint256 subtractedValue) external returns (bool) {
        address owner = _msgSender();
        uint256 currentAllowance = allowance(owner, spender);
        require(currentAllowance >= subtractedValue, "ERC20: decreased allowance below zero");
        unchecked {
            _approve(owner, spender, currentAllowance - subtractedValue);
        }

        return true;
    }

    /**
     * @notice Returns the EIP-712 DOMAIN_SEPARATOR.
     * @return A bytes32 value representing the EIP-712 DOMAIN_SEPARATOR.
     */
    function DOMAIN_SEPARATOR() external view returns (bytes32) {
        return _domainSeparatorV4();
    }

    /**
     * @notice Returns the current nonce for the given owner address.
     * @param owner The address whose nonce is to be retrieved.
     * @return The current nonce as a uint256 value.
     */
    function nonces(address owner) external view returns (uint256) {
        return _nonces[owner].current();
    }

    /**
     * @notice Increments and returns the current nonce for a given owner address.
     * @dev This is an internal function.
     * @param owner The address whose nonce is to be incremented.
     */
    function _useNonce(address owner) internal returns (uint256 current) {
        CountersUpgradeable.Counter storage nonce = _nonces[owner];
        current = nonce.current();
        nonce.increment();
    }

    /**
     * @notice Allows an owner to approve a spender with a one-time signature, bypassing the need for a transaction.
     * @dev Uses the EIP-2612 standard.
     * @param owner The address of the token owner.
     * @param spender The address of the spender.
     * @param value The amount of tokens to be approved.
     * @param deadline The expiration time of the signature, specified as a Unix timestamp.
     * @param v The recovery byte of the signature.
     * @param r The first 32 bytes of the signature.
     * @param s The second 32 bytes of the signature.
     */
    function permit(
        address owner,
        address spender,
        uint256 value,
        uint256 deadline,
        uint8 v,
        bytes32 r,
        bytes32 s
    ) external {
        require(block.timestamp <= deadline, "ERC20Permit: expired deadline");

        bytes32 structHash = keccak256(abi.encode(_PERMIT_TYPEHASH, owner, spender, value, _useNonce(owner), deadline));

        bytes32 hash = _hashTypedDataV4(structHash);

        address signer = ECDSAUpgradeable.recover(hash, v, r, s);
        require(signer == owner, "ERC20Permit: invalid signature");

        _approve(owner, spender, value);
    }
}
