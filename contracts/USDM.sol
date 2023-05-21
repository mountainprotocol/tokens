// SPDX-License-Identifier: MIT
pragma solidity 0.8.18;

import { IERC20Upgradeable } from "@openzeppelin/contracts-upgradeable/token/ERC20/IERC20Upgradeable.sol";
import { AccessControlUpgradeable } from "@openzeppelin/contracts-upgradeable/access/AccessControlUpgradeable.sol";
import { PausableUpgradeable } from "@openzeppelin/contracts-upgradeable/security/PausableUpgradeable.sol";
import { UUPSUpgradeable } from "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import { CountersUpgradeable } from "@openzeppelin/contracts-upgradeable/utils/CountersUpgradeable.sol";
import { EIP712Upgradeable } from "@openzeppelin/contracts-upgradeable/utils/cryptography/EIP712Upgradeable.sol";
import { IERC20PermitUpgradeable} from "@openzeppelin/contracts-upgradeable/token/ERC20/extensions/draft-IERC20PermitUpgradeable.sol";
import { ECDSAUpgradeable} from "@openzeppelin/contracts-upgradeable/utils/cryptography/ECDSAUpgradeable.sol";

contract USDM is
    IERC20Upgradeable,
    AccessControlUpgradeable,
    PausableUpgradeable,
    UUPSUpgradeable,
    IERC20PermitUpgradeable,
    EIP712Upgradeable
{
    using CountersUpgradeable for CountersUpgradeable.Counter;

    string private _name;
    string private _symbol;
    uint256 private _totalShares;
    uint256 private constant _BASE = 1e18;
    /**
     * @dev rewardMultiplier represents a coefficient used in reward calculation logic.
     * The value is represented with 18 decimal places for precision.
     */
    uint256 public rewardMultiplier;

    mapping(address => uint256) private _shares;
    mapping(address => bool) private _blocklist;
    mapping(address => mapping(address => uint256)) private _allowances;
    mapping(address => CountersUpgradeable.Counter) private _nonces;

    // solhint-disable-next-line var-name-mixedcase
    bytes32 private constant _PERMIT_TYPEHASH =
        keccak256("Permit(address owner,address spender,uint256 value,uint256 nonce,uint256 deadline)");

    bytes32 public constant MINTER_ROLE = keccak256("MINTER_ROLE");
    bytes32 public constant BURNER_ROLE = keccak256("BURNER_ROLE");
    bytes32 public constant BLOCKLIST_ROLE = keccak256("BLOCKLIST_ROLE");
    bytes32 public constant ORACLE_ROLE = keccak256("ORACLE_ROLE");
    bytes32 public constant UPGRADE_ROLE = keccak256("UPGRADE_ROLE");
    bytes32 public constant PAUSE_ROLE = keccak256("PAUSE_ROLE");

    event AccountBlocklisted(address indexed addr);
    event AccountUnblocklisted(address indexed addr);
    event RewardMultiplier(uint256 indexed value);

    /**
     * @notice Initializes the contract.
     * @param name_ The name of the token.
     * @param symbol_ The symbol of the token.
     * @param initialSupply The initial amount of tokens for the contract creator.
     */
    function initialize(string memory name_, string memory symbol_, uint256 initialSupply) external initializer {
        _name = name_;
        _symbol = symbol_;
        _setRewardMultiplier(_BASE);

        __AccessControl_init();
        __Pausable_init();
        __UUPSUpgradeable_init();
        __EIP712_init(name_, "1");

        _setupRole(DEFAULT_ADMIN_ROLE, _msgSender());
        _mint(_msgSender(), initialSupply);
    }

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    /**
     * @dev Ensures that only accounts with UPGRADE_ROLE can upgrade the contract.
     */
    function _authorizeUpgrade(address) internal override onlyRole(UPGRADE_ROLE) {}

    /**
     * @notice Returns the name of the token.
     * @return A string representing the token's name.
     */
    function name() external view returns (string memory) {
        return _name;
    }

    /**
     * @notice Returns the symbol of the token.
     * @return A string representing the token's symbol.
     */
    function symbol() external view returns (string memory) {
        return _symbol;
    }

    /**
     * @notice Returns the number of decimals the token uses.
     * @dev This value is only used for _display_ purposes: it in
     * no way affects any of the arithmetic of the contract, including.
     * {IERC20-balanceOf} and {IERC20-transfer}.
     * @return The number of decimals (18)
     */
    function decimals() external pure returns (uint8) {
        return 18;
    }

    /**
     * @notice Converts an amount of tokens to shares.
     * @param amount The amount of tokens to convert.
     * @return The equivalent amount of shares.
     */
    function convertToShares(uint256 amount) public view returns (uint256) {
        return (amount * _BASE) / rewardMultiplier;
    }

    /**
     * @notice Converts an amount of shares to tokens.
     * @param shares The amount of shares to convert.
     * @return The equivalent amount of tokens.
     */
    function convertToAmount(uint256 shares) public view returns (uint256) {
        return (shares * rewardMultiplier) / _BASE;
    }

    /**
     * @notice Returns the total amount of shares.
     * @return The total amount of shares.
     */
    function totalShares() external view returns (uint256) {
        return _totalShares;
    }

    /**
     * @notice Returns the total supply of tokens.
     * @return The total supply of tokens.
     */
    function totalSupply() external view returns (uint256) {
        return convertToAmount(_totalShares);
    }

    /**
     * @notice Returns the amount of shares owned by the account.
     * @param account The account to check.
     * @return The amount of shares owned by the account.
     */
    function sharesOf(address account) public view returns (uint256) {
        return _shares[account];
    }

    /**
     * @notice Returns the balance of the specified address.
     * @dev Balances are dynamic and equal the `account`'s share in the amount of the
     * total reserves controlled by the protocol. See `sharesOf`.
     * @param account The address to query the balance of.
     * @return The balance of the specified address.
     */
    function balanceOf(address account) external view returns (uint256) {
        return convertToAmount(sharesOf(account));
    }

    /**
     * @dev Internal function that mints a specified number of tokens to the given address.
     * Creates `amount` tokens and assigns them to `account`, increasing
     * the total supply.
     *
     * Emits a {Transfer} event with `from` set to the zero address.
     *
     * Requirements:
     *
     * - Only users with MINTER_ROLE can call this function.
     * - `account` cannot be the zero address.
     * @param to The address to which tokens will be minted.
     * @param amount The number of tokens to mint.
     */
    function _mint(address to, uint256 amount) private {
        require(to != address(0), "ERC20: mint to the zero address");

        _beforeTokenTransfer(address(0), to, amount);

        uint256 shares = convertToShares(amount);
        _totalShares += shares;

        unchecked {
            // Overflow not possible: shares + shares amount is at most totalShares + shares amount
            // which is checked above.
            _shares[to] += shares;
        }

        _afterTokenTransfer(address(0), to, amount);
    }

    /**
     * @notice Creates new tokens to the specified address.
     * @dev See {_mint}.
     * @param to The address to mint the tokens to.
     * @param amount The amount of tokens to mint.
     */
    function mint(address to, uint256 amount) external onlyRole(MINTER_ROLE) {
        _mint(to, amount);
    }

    /**
     * @dev Burns `amount` tokens from `account`, reducing the total supply.
     *
     * Emits a {Transfer} event with `to` set to the zero address.
     *
     * Requirements:
     *
     * - Only users with BURNER_ROLE can call this function.
     * - The contract must not be paused.
     * @param account The address from which tokens will be burned.
     * @param amount The amount of tokens to burn.
     */
    function _burn(address account, uint256 amount) private {
        require(account != address(0), "ERC20: burn from the zero address");

        _beforeTokenTransfer(account, address(0), amount);

        uint256 shares = convertToShares(amount);

        uint256 accountShares = sharesOf(account);
        require(accountShares >= shares, "ERC20: burn amount exceeds balance");
        unchecked {
            _shares[account] = accountShares - shares;
            // Overflow not possible: amount <= accountShares <= totalShares.
            _totalShares -= shares;
        }

        _afterTokenTransfer(account, address(0), amount);
    }

    /**
     * @notice Destroys a specified amount of tokens from the given address.
     * @dev See {_burn}.
     * @param from The address from which tokens will be burned.
     * @param amount The amount of tokens to burn.
     */
    function burn(address from, uint256 amount) external onlyRole(BURNER_ROLE) {
        _burn(from, amount);
    }

    /**
     * @dev Hook that is called before any transfer of tokens. This includes
     * minting and burning.
     *
     * Calling conditions:
     *
     * - when `from` and `to` are both non-zero, `amount` of ``from``'s tokens
     * will be transferred to `to`.
     * - when `from` is zero, `amount` tokens will be minted for `to`.
     * - when `to` is zero, `amount` of ``from``'s tokens will be burned.
     * - `from` and `to` are never both zero.
     */
    function _beforeTokenTransfer(address from, address /* to */, uint256 /* amount */) private view {
        // Each blocklist check is an SLOAD, which is gas intensive.
        // We only block sender not receiver, so we don't tax every user
        require(!isBlocklisted(from), "Address is blocklisted");
        // Useful for scenarios such as preventing trades until the end of an evaluation
        // period, or having an emergency switch for freezing all token transfers in the
        // event of a large bug.
        require(!paused(), "Transfers not allowed while paused");
    }

    /**
     * @dev Hook that is called after any transfer of tokens. This includes
     * minting and burning.
     *
     * Calling conditions:
     *
     * - when `from` and `to` are both non-zero, `amount` of ``from``'s tokens
     * has been transferred to `to`.
     * - when `from` is zero, `amount` tokens have been minted for `to`.
     * - when `to` is zero, `amount` of ``from``'s tokens have been burned.
     * - `from` and `to` are never both zero.
     */
    function _afterTokenTransfer(address from, address to, uint256 amount) private {
        emit Transfer(from, to, amount);
    }

    /**
     * @dev Internal function that transfers a specified number of tokens from one address to another.
     * Emits a {Transfer} event.
     *
     * Requirements:
     *
     * - `to` cannot be the zero address.
     * - the caller must have a balance of at least `amount`.
     * @param from The address from which tokens will be transferred.
     * @param to The address to which tokens will be transferred.
     * @param amount The number of tokens to transfer.
     */
    function _transfer(address from, address to, uint256 amount) private {
        require(from != address(0), "ERC20: transfer from the zero address");
        require(to != address(0), "ERC20: transfer to the zero address");

        _beforeTokenTransfer(from, to, amount);

        uint256 shares = convertToShares(amount);
        uint256 fromShares = _shares[from];
        require(fromShares >= shares, "ERC20: transfer amount exceeds balance");
        unchecked {
            _shares[from] = fromShares - shares;
            // Overflow not possible: the sum of all shares is capped by totalShares, and the sum is preserved by
            // decrementing then incrementing.
            _shares[to] += shares;
        }

        _afterTokenTransfer(from, to, amount);
    }

    /**
     * @notice Transfers a specified number of tokens from the caller's address to the recipient.
     * @dev See {_transfer}.
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
     * @dev Internal function that blocklists the specified address.
     * @param account The address to blocklist.
     */
    function _blocklistAccount(address account) private {
        require(!_blocklist[account], "Address already blocklisted");
        _blocklist[account] = true;
        emit AccountBlocklisted(account);
    }

    /**
     * @dev Internal function that removes the specified address from the blocklist.
     * @param account The address to remove from the blocklist.
     */
    function _unblocklistAccount(address account) private {
        require(_blocklist[account], "Address is not blocklisted");
        _blocklist[account] = false;
        emit AccountUnblocklisted(account);
    }

    /**
     * @notice Blocklists multiple accounts at once.
     * @dev This function can only be called by an account with BLOCKLIST_ROLE.
     * @param addresses An array of addresses to be blocklisted.
     */
    function blocklistAccounts(address[] calldata addresses) external onlyRole(BLOCKLIST_ROLE) {
        for (uint256 i = 0; i < addresses.length; i++) {
            _blocklistAccount(addresses[i]);
        }
    }

    /**
     * @notice Removes multiple accounts from the blocklist at once.
     * @dev This function can only be called by an account with BLOCKLIST_ROLE.
     * @param addresses An array of addresses to be removed from the blocklist.
     */
    function unblocklistAccounts(address[] calldata addresses) external onlyRole(BLOCKLIST_ROLE) {
        for (uint256 i = 0; i < addresses.length; i++) {
            _unblocklistAccount(addresses[i]);
        }
    }

    /**
     * @notice Checks if the specified address is blocklisted.
     * @param account The address to check.
     * @return A boolean value indicating whether the address is blocklisted.
     */
    function isBlocklisted(address account) public view returns (bool) {
        return _blocklist[account];
    }

    /**
     * @notice Pauses token transfers and other operations.
     * @dev This function can only be called by an account with PAUSE_ROLE.
     * @dev Inherits the _pause function from @openzeppelin/PausableUpgradeable contract.
     */
    function pause() external onlyRole(PAUSE_ROLE) {
        super._pause();
    }

    /**
     * @notice Unpauses token transfers and other operations.
     * @dev This function can only be called by an account with PAUSE_ROLE.
     * @dev Inherits the _unpause function from @openzeppelin/PausableUpgradeable contract.
     */
    function unpause() external onlyRole(PAUSE_ROLE) {
        super._unpause();
    }

    /**
     * @dev Internal function to set the reward multiplier.
     * @param _rewardMultiplier The new reward multiplier.
     */
    function _setRewardMultiplier(uint256 _rewardMultiplier) private {
        require(_rewardMultiplier >= 1 ether, "Invalid reward multiplier");
        rewardMultiplier = _rewardMultiplier;

        emit RewardMultiplier(rewardMultiplier);
    }

    /**
     * @notice Sets the reward multiplier.
     * @dev This function can only be called by an account with ORACLE_ROLE.
     * @param _rewardMultiplier The new reward multiplier.
     */
    function setRewardMultiplier(uint256 _rewardMultiplier) external onlyRole(ORACLE_ROLE) {
        _setRewardMultiplier(_rewardMultiplier);
    }

    /**
     * @notice Adds the given amount to the current reward multiplier.
     * @dev This function can only be called by an account with ORACLE_ROLE.
     * @param _rewardMultiplier The new reward multiplier.
     */
    function addRewardMultiplier(uint256 _rewardMultiplier) external onlyRole(ORACLE_ROLE) {
        require(_rewardMultiplier > 0, "Invalid reward multiplier");

        _setRewardMultiplier(rewardMultiplier + _rewardMultiplier);
    }

    /**
     * @dev Internal function to set `amount` as the allowance of `spender` over the `owner`s tokens.
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
    function _approve(address owner, address spender, uint256 amount) private {
        require(owner != address(0), "ERC20: approve from the zero address");
        require(spender != address(0), "ERC20: approve to the zero address");

        _allowances[owner][spender] = amount;
        emit Approval(owner, spender, amount);
    }

    /**
     * @notice Approves an allowance for a spender.
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
     * @notice Moves tokens from an address to another one using the allowance mechanism.
     * @dev See {IERC20-transferFrom}.
     *
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
     * @param from The address from which tokens will be transferred.
     * @param to The address to which tokens will be transferred.
     * @param amount The number of tokens to transfer.
     */
    function transferFrom(address from, address to, uint256 amount) external returns (bool) {
        address spender = _msgSender();
        _spendAllowance(from, spender, amount);
        _transfer(from, to, amount);

        return true;
    }

    /**
     * @notice Increases the allowance granted to spender by the caller.
     * @dev Atomically increases the allowance granted to `spender` by the caller.
     *
     * This is an alternative to {approve} that can be used as a mitigation for
     * problems described in {IERC20-approve}.
     *
     * Emits an {Approval} event indicating the updated allowance.
     *
     * Requirements:
     *
     * - `spender` cannot be the zero address.
     * @param spender The address which will spend the funds.
     * @param addedValue The amount of tokens to increase the allowance by.
     */
    function increaseAllowance(address spender, uint256 addedValue) external returns (bool) {
        address owner = _msgSender();
        _approve(owner, spender, allowance(owner, spender) + addedValue);
        return true;
    }

    /**
     * @notice Decreases the allowance granted to spender by the caller.
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
     * @param spender The address which will spend the funds.
     * @param subtractedValue The amount of tokens to decrease the allowance by.
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
     * @dev Internal function that increments and returns the current nonce for a given owner address.
     * @param owner The address whose nonce is to be incremented.
     */
    function _useNonce(address owner) private returns (uint256 current) {
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

    /**
     * @dev This empty reserved space is put in place to allow future versions to add new
     * variables without shifting down storage in the inheritance chain.
     * See https://docs.openzeppelin.com/contracts/4.x/upgradeable#storage_gaps
     */
    uint256[50] private __gap;
}
