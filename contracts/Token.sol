// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.9;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/security/Pausable.sol";
import "@openzeppelin/contracts/utils/math/SafeMath.sol";
// import "@chainlink/contracts/src/v0.8/ChainlinkClient.sol";
// import "hardhat/console.sol";

// TODO: Permit
// TODO: Upgrade (Proxy)
// TODO: Snapshot
// TODO: Live Oracle

using SafeMath for uint256;

// Author: @mattiascaricato
contract Token is ERC20, Ownable, AccessControl, Pausable {
    // using Chainlink for Chainlink.Request;
    using SafeERC20 for IERC20;

    mapping (address => uint256) private _shares;
    mapping(address => bool) private _blacklist;
    uint256 private _rewardMultiplier = 1e18;
    uint256 private _totalShares;
    uint256 private _totalSupply;

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

        // Chainlink contract addresses Goerli
        // setChainlinkToken(0x326C977E6efc84E512bB9C30f76E30c160eD06FB);
        // setChainlinkOracle(0xCC79157eb46F5624204f47AB42b3906cAA40eaB7);
    }

    function totalSupply() public view override returns (uint256) {
        return _totalShares * _rewardMultiplier / 1e18;
    }

    function totalShares() public view returns (uint256) {
        return _totalShares;
    }

    function sharesOf(address account) public view returns (uint256) {
        return _shares[account];
    }

    function balanceOf(address account) public view override returns (uint256) {
        return sharesOf(account) * _rewardMultiplier / 1e18;
    }

    function _mint(address to, uint256 amount) internal override {
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

    function mint(address to, uint256 amount) public onlyRole(MINTER_ROLE) {
        _mint(to, amount);
    }

    function _transfer(address from, address to, uint256 sharesAmount) internal override {
        require(from != address(0), "ERC20: transfer from the zero address");
        require(to != address(0), "ERC20: transfer to the zero address");

        _beforeTokenTransfer(from, to, sharesAmount);

        uint256 fromShares = _shares[from];
        require(fromShares >= sharesAmount, "ERC20: transfer amount exceeds balance");
        unchecked {
            _shares[from] = fromShares - sharesAmount;
            // Overflow not possible: the sum of all balances is capped by totalSupply, and the sum is preserved by
            // decrementing then incrementing.
            _shares[to] += sharesAmount;
        }

        emit Transfer(from, to, sharesAmount);

        _afterTokenTransfer(from, to, sharesAmount);
    }

    function transfer(address to, uint256 amount) public override returns (bool) {
        address owner = _msgSender();
        _transfer(owner, to, amount);
        return true;
    }

    function _burn(address account, uint256 amount) internal override {
        require(account != address(0), "ERC20: burn from the zero address");

        _beforeTokenTransfer(account, address(0), amount);

        uint256 accountShares = sharesOf(account);
        require(accountShares >= amount, "ERC20: burn amount exceeds balance");
        unchecked {
            _shares[account] = accountShares - amount;
            // Overflow not possible: amount <= accountBalance <= totalSupply.
            _totalShares -= amount;
        }

        emit Transfer(account, address(0), amount);

        _afterTokenTransfer(account, address(0), amount);
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

    function _beforeTokenTransfer(
        address from,
        address to,
        uint256 amount
    ) internal override {
        require(!isBlacklisted(from), "Address is blacklisted");
        require(!isBlacklisted(to), "Address is blacklisted");
        super._beforeTokenTransfer(from, to, amount);
    }

    function pause() public onlyOwner {
        super._pause();
    }

    function unpause() public onlyOwner {
        super._unpause();
    }

    // function setRewardMultiplier() public returns (bytes32) {
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

    //     _rewardMultiplier = _result;
    // }

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
