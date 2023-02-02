// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.9;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
// Uncomment this line to use console.log
// import "hardhat/console.sol";

// Author: @pridegsu
contract Token is ERC20, AccessControl {
    mapping(address => bool) internal _blacklist;

    event AddressBlacklisted(address indexed addr);
    event AddressUnBlacklisted(address indexed addr);

    bytes32 public constant MINTER_ROLE = keccak256("MINTER_ROLE");
    bytes32 public constant BURNER_ROLE = keccak256("BURNER_ROLE");
    // bytes32 public constant PAUSER_ROLE = keccak256("PAUSER_ROLE");
    bytes32 public constant BLACKLIST_ROLE = keccak256("BLACKLIST_ROLE");
    
    constructor(string memory name_, string memory symbol_, uint256 initialSupply_) ERC20(name_, symbol_) {
        _setupRole(DEFAULT_ADMIN_ROLE, msg.sender);
        _mint(msg.sender, initialSupply_ * (10 ** uint256(decimals())));
    }

    function mint(address to, uint256 amount) public onlyRole(MINTER_ROLE) {
        _mint(to, amount);
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

    // Wipes the balance of a frozen address, burning the tokens and setting the approval to zero
    // function wipeBlacklistAddress() {}
}