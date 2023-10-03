// SPDX-License-Identifier: MIT
pragma solidity 0.8.18;

import {PausableUpgradeable} from "@openzeppelin/contracts-upgradeable/security/PausableUpgradeable.sol";
import {AccessControlUpgradeable} from "@openzeppelin/contracts-upgradeable/access/AccessControlUpgradeable.sol";
import {UUPSUpgradeable} from "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import {ERC4626Upgradeable} from "@openzeppelin/contracts-upgradeable/token/ERC20/extensions/ERC4626Upgradeable.sol";
import {IERC20MetadataUpgradeable} from "@openzeppelin/contracts-upgradeable/token/ERC20/extensions/ERC4626Upgradeable.sol";
import {CountersUpgradeable} from "@openzeppelin/contracts-upgradeable/utils/CountersUpgradeable.sol";
import {IERC20PermitUpgradeable} from "@openzeppelin/contracts-upgradeable/token/ERC20/extensions/IERC20PermitUpgradeable.sol";
import {EIP712Upgradeable} from "@openzeppelin/contracts-upgradeable/utils/cryptography/EIP712Upgradeable.sol";
import {ECDSAUpgradeable} from "@openzeppelin/contracts-upgradeable/utils/cryptography/ECDSAUpgradeable.sol";

interface IUSDM is IERC20MetadataUpgradeable {
    function isBlocked(address) external view returns (bool);

    function paused() external view returns (bool);
}

/**
 * @title Wrapped Mountain Protocol USDM
 * @custom:security-contact security@mountainprotocol.com
 */
contract wUSDM is
    PausableUpgradeable,
    AccessControlUpgradeable,
    UUPSUpgradeable,
    ERC4626Upgradeable,
    IERC20PermitUpgradeable,
    EIP712Upgradeable
{
    using CountersUpgradeable for CountersUpgradeable.Counter;

    // for permit()
    mapping(address => CountersUpgradeable.Counter) private _nonces;
    // solhint-disable-next-line var-name-mixedcase
    bytes32 private constant _PERMIT_TYPEHASH =
        keccak256("Permit(address owner,address spender,uint256 value,uint256 nonce,uint256 deadline)");

    // for our access control
    bytes32 public constant PAUSE_ROLE = keccak256("PAUSE_ROLE");
    bytes32 public constant UPGRADE_ROLE = keccak256("UPGRADE_ROLE");

    IUSDM public USDM;

    // ERC2612 Errors
    error ERC2612ExpiredDeadline(uint256 deadline, uint256 blockTimestamp);
    error ERC2612InvalidSignature(address owner, address spender);

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    /**
     * @notice Initializes the ERC-4626 USDM wrapper
     * @param _USDM address of the USDM token to wrap
     */
    function initialize(IUSDM _USDM, address owner) external initializer {
        USDM = _USDM;
        // TODO: should we move to initialize in case we want to change name and symbol?
        __ERC20_init("Wrapped Mountain Protocol USD", "wUSDM");
        __ERC4626_init(_USDM);

        __AccessControl_init();
        __Pausable_init();
        __UUPSUpgradeable_init();
        __EIP712_init("Wrapped Mountain Protocol USD", "1");

        _grantRole(DEFAULT_ADMIN_ROLE, owner);
    }

    /**
     * @notice We override paused to use the underlying paused state as well
     */
    function paused() public view override returns (bool) {
        return USDM.paused() || super.paused();
    }

    function pause() external onlyRole(PAUSE_ROLE) {
        _pause();
    }

    function unpause() external onlyRole(PAUSE_ROLE) {
        _unpause();
    }

    function _beforeTokenTransfer(address from, address to, uint256 amount) internal override {
        require(!USDM.isBlocked(from));
        require(!paused());

        super._beforeTokenTransfer(from, to, amount);
    }

    function _authorizeUpgrade(address newImplementation) internal override onlyRole(UPGRADE_ROLE) {}

    /**
     * @dev See {IERC20PermitUpgradeable-permit}.
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
        if (block.timestamp > deadline) {
            revert ERC2612ExpiredDeadline(deadline, block.timestamp);
        }

        bytes32 structHash = keccak256(abi.encode(_PERMIT_TYPEHASH, owner, spender, value, _useNonce(owner), deadline));
        bytes32 hash = _hashTypedDataV4(structHash);
        address signer = ECDSAUpgradeable.recover(hash, v, r, s);

        if (signer != owner) {
            revert ERC2612InvalidSignature(owner, spender);
        }

        _approve(owner, spender, value);
    }

    /**
     * @dev See {IERC20PermitUpgradeable-nonces}.
     */
    function nonces(address owner) public view returns (uint256) {
        return _nonces[owner].current();
    }

    /**
     * @dev See {IERC20PermitUpgradeable-DOMAIN_SEPARATOR}.
     */
    // solhint-disable-next-line func-name-mixedcase
    function DOMAIN_SEPARATOR() external view returns (bytes32) {
        return _domainSeparatorV4();
    }

    /**
     * @dev "Consume a nonce": return the current value and increment.
     *
     * _Available since v4.1._
     */
    function _useNonce(address owner) internal returns (uint256 current) {
        CountersUpgradeable.Counter storage nonce = _nonces[owner];
        current = nonce.current();
        nonce.increment();
    }
}
