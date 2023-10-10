// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.13;

import "forge-std/Test.sol";
import "../contracts/USDM_2.sol";
import "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";

contract USDMTest is Test {

    USDM_2 public usdm;
    string public path = "output.txt";


    function setUp() public {
        address usdmImpl = address(new USDM_2());
        address proxy = address(new ERC1967Proxy(
            usdmImpl, 
            abi.encodeWithSelector(
                bytes4(keccak256("initialize(string,string,address)")), 
                "Mountain Protocol USD", 
                "USDM", 
                address(this)
            )
        ));
        usdm = USDM_2(proxy);
        usdm.grantRole(usdm.MINTER_ROLE(), address(this));
        usdm.mint(address(this), 1337*1e18);
    }

    function testTransferBalance(uint256 amount, uint64 rewardMultiplierOffset) external {
        uint256 rewardMultiplier = uint256(1 ether) + rewardMultiplierOffset;

        uint256 balance = usdm.balanceOf(address(this));

        vm.assume(amount <= balance); //put any resonable limit here if necessary
        vm.assume(rewardMultiplier >= uint256(1 ether) && rewardMultiplier <= uint256(32 ether)); //put any resonable limit here if necessary
        usdm.setRewardMultiplier(rewardMultiplier);

        usdm.transfer(address(1), amount);

        uint256 balanceOf1 = usdm.balanceOf(address(1));

        assertGe(balanceOf1, amount);
    }
}
