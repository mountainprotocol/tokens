// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.13;

import "forge-std/Test.sol";
import "../contracts/USDM_1.sol";
import "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";

contract USDMTest is Test {
    USDM_1 public usdm;

    function setUp() public {
        address usdmImpl = address(new USDM_1());
        address proxy = address(
            new ERC1967Proxy(
                usdmImpl,
                abi.encodeWithSelector(
                    bytes4(keccak256("initialize(string,string,address)")),
                    "Mountain Protocol USD",
                    "USDM",
                    address(this)
                )
            )
        );
        usdm = USDM_1(proxy);
        usdm.grantRole(usdm.MINTER_ROLE(), address(this));
        usdm.mint(address(this), 1337 * 1e18);
    }

    function testSharesTokensShares(uint64 sharesOffset, uint64 rewardMultiplierOffset) external {
        uint256 rewardMultiplier = uint256(1 ether) + rewardMultiplierOffset;
        uint256 shares = uint256(1 ether) + sharesOffset;

        vm.assume(shares <= 500 * 1e22); //put any resonable limit here if necessary
        vm.assume(rewardMultiplier >= uint256(1 ether) && rewardMultiplier <= uint256(32 ether)); //put any resonable limit here if necessary

        usdm.setRewardMultiplier(rewardMultiplier);
        uint256 tokens = usdm.convertToTokens(shares);
        uint256 outshares = usdm.convertToShares(tokens);

        assertEq(shares, outshares);
    }

    function testTokensSharesTokens(uint64 tokensOffset, uint64 rewardMultiplierOffset) external {
        uint256 rewardMultiplier = uint256(1 ether) + rewardMultiplierOffset;
        uint256 tokens = uint256(1 ether) + tokensOffset;

        vm.assume(tokens <= 500 * 1e22); //put any resonable limit here if necessary
        vm.assume(rewardMultiplier >= uint256(1 ether) && rewardMultiplier <= uint256(32 ether)); //put any resonable limit here if necessary

        usdm.setRewardMultiplier(rewardMultiplier);
        uint256 shares = usdm.convertToShares(tokens);
        uint256 outtokens = usdm.convertToTokens(shares);
        assertEq(tokens, outtokens);
    }
}
