import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import { anyValue } from "@nomicfoundation/hardhat-chai-matchers/withArgs";
import { expect } from "chai";
import { ethers } from "hardhat";

describe("Token", () => {
  // We define a fixture to reuse the same setup in every test.
  // We use loadFixture to run this setup once, snapshot that state,
  // and reset Hardhat Network to that snapshopt in every test.
  const deployTokenFixture = async (name: string, symbol: string) => {
    // Contracts are deployed using the first signer/account by default
    const [owner, otherAccount] = await ethers.getSigners();

    const Token = await ethers.getContractFactory("Token");
    const contract = await Token.deploy(name, symbol);

    return { contract, owner, otherAccount };
  }

  describe("Deployment", () => {
    it("should set the correct token's name", async () => {
      const name = "Mountain Protocol USD Token";
      const { contract } = await deployTokenFixture(name, "")

      expect(await contract.name()).to.equal(name);
    });

    it("should set the correct token's symbol", async () => {
      const symbol = "USDM";
      const { contract } = await deployTokenFixture("", symbol)

      expect(await contract.symbol()).to.equal(symbol);
    });
  });
});