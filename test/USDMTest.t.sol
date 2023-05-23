// SPDX-License-Identifier: MIT
pragma solidity 0.8.18;

import {Test} from "forge-std/Test.sol";
import {console} from "forge-std/console.sol";
import {ERC1967Proxy} from "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";

import "../contracts/USDM.sol";

contract UUPSProxy is ERC1967Proxy {
    constructor(address _implementation, bytes memory _data)
        ERC1967Proxy(_implementation, _data)
    {}
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

        handler = new Handler(usdm);

        // targetContract(address(handler));
        // targetContract(address(implementation));
    }

    function invariant_totalSupply() public {
        assertEq(usdm.balanceOf(address(this)), usdm.totalSupply());
    }

    function invariant_totalShares() public {
        assertEq(usdm.sharesOf(address(this)), usdm.totalShares());
    }

    function invariant_totalShares_totalSupply() public {
        assertEq(usdm.totalSupply(), usdm.totalShares());
    }
}
