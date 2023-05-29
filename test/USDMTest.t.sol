// SPDX-License-Identifier: MIT
pragma solidity 0.8.18;

import {Test} from "forge-std/Test.sol";
// import {console} from "forge-std/console.sol";
import {ERC1967Proxy} from "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";

import "../contracts/USDM.sol";

contract UUPSProxy is ERC1967Proxy {
    constructor(address _implementation, bytes memory _data) ERC1967Proxy(_implementation, _data) {}
}

contract Handler {
    USDM public usdm;

    constructor(USDM _usdm) {
        usdm = _usdm;
    }
}

contract USDMInvariants is Test {
    USDM implementation;
    UUPSProxy proxy;
    USDM usdm;
    Handler handler;

    function setUp() public {
        // deploy implementation contract
        implementation = new USDM();

        // deploy proxy contract and point it to implementation
        proxy = new UUPSProxy(address(implementation), "");

        // wrap in ABI to support easier calls
        usdm = USDM(address(proxy));

        usdm.initialize("Mountain Protocol USD", "USDM", 0);

        // Grant minter role
        usdm.grantRole(keccak256("MINTER_ROLE"), address(this));
        // Grant burner role
        usdm.grantRole(keccak256("BURNER_ROLE"), address(this));
        // Grant oracle role
        usdm.grantRole(keccak256("ORACLE_ROLE"), address(this));

        handler = new Handler(usdm);

        // targetContract(address(handler));
        // targetContract(address(implementation));
    }

    function test_minting(uint256 amountToMint) external {
        amountToMint = bound(amountToMint, 1e18, 1e28);

        uint256 sharesBefore = usdm.sharesOf(address(this));

        usdm.mint(address(this), amountToMint);

        uint256 sharesAfter = usdm.sharesOf(address(this));

        assertLt(sharesBefore, sharesAfter);
    }

    function test_burning(uint256 amountToBurn) external {
        amountToBurn = bound(amountToBurn, 1e18, 1e28);

        usdm.mint(address(this), amountToBurn);

        vm.expectRevert();

        usdm.burn(address(this), amountToBurn + 1);

        uint256 sharesBefore = usdm.sharesOf(address(this));

        usdm.burn(address(this), amountToBurn);

        uint256 sharesAfter = usdm.sharesOf(address(this));

        assertGt(sharesBefore, sharesAfter);
    }

    function test_transfering(uint256 amount, address to) external {
        amount = bound(amount, 0, 1e28);
        vm.assume(to != address(0));

        usdm.mint(address(this), amount);

        uint256 sharesBeforeFrom = usdm.sharesOf(address(this));
        uint256 sharesBeforeTo = usdm.sharesOf(to);

        usdm.transfer(to, amount);

        uint256 sharesAfterFrom = usdm.sharesOf(address(this));
        uint256 sharesAfterTo = usdm.sharesOf(to);

        assertGe(sharesBeforeFrom, sharesAfterFrom);
        assertLe(sharesBeforeTo, sharesAfterTo);
    }

    // totalSupply should be ge than totalShares [invariant]
    function invariant_totalSupplyGeTotalShares() public {
        assertGe(usdm.totalSupply(), usdm.totalShares());
    }

    // totalSupply should be gt than totalShares when rewardMultiplier is > 1 [invariant]
    function test_totalSupplyGtTotalSharesWhenRewardMultiplier(uint256 yield, address to, uint256 amount) public {
        yield = bound(yield, 3e11, 66e14); // 0.00003% - 0.66%
        amount = bound(amount, 1e21, 1e28); // 1k - 10B
        vm.assume(to != address(0));

        usdm.addRewardMultiplier(yield);
        usdm.mint(to, amount);

        assertGt(usdm.totalSupply(), usdm.totalShares());
    }

    // transfer shouldn't change totalSupply
    function test_transferDoesntChangeTotalSupply(uint256 amount, address to) external {
        vm.assume(amount < 1e28);
        vm.assume(to != address(0));

        usdm.mint(address(this), amount);

        uint256 totalSupplyBefore = usdm.totalSupply();

        usdm.transfer(to, amount);

        uint256 totalSupplyAfter = usdm.totalSupply();

        assertEq(totalSupplyBefore, totalSupplyAfter);
    }

    // Sum of all shares should be equal to totalShares [invariant]
    // balance of address zero should be always zero [invariant]
    // only mint and burn should change totalShares [invariant] !!!
    // an address can only transfer at max its own balance and its allowances [invariant] !!!
}
