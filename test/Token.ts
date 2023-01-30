import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import { anyValue } from "@nomicfoundation/hardhat-chai-matchers/withArgs";
import { expect } from "chai";
import { ethers } from "hardhat";

describe("Token", () => {
  // We define a fixture to reuse the same setup in every test.
  // We use loadFixture to run this setup once, snapshot that state,
  // and reset Hardhat Network to that snapshopt in every test.
  const deployTokenFixture = async (name: string, symbol: string, totalSupply: number) => {
    // Contracts are deployed using the first signer/account by default
    const [owner, otherAccount] = await ethers.getSigners();

    const Token = await ethers.getContractFactory("Token");
    const contract = await Token.deploy(name, symbol, totalSupply);

    return { contract, owner, otherAccount };
  }

  describe("Deployment", () => {
    it("should set the correct token's name", async () => {
      const name = "Mountain Protocol USD Token";
      const { contract } = await deployTokenFixture(name, "", 0);

      expect(await contract.name()).to.equal(name);
    });

    it("should set the correct token's symbol", async () => {
      const symbol = "USDM";
      const { contract } = await deployTokenFixture("", symbol, 0);

      expect(await contract.symbol()).to.equal(symbol);
    });

    it("should set the correct owner", async () => {
      const { contract, owner } = await deployTokenFixture("", "", 0);

      expect(await contract.owner()).to.equal(owner.address);
    });

    it("should set the correct total supply", async () => {
      const totalSupply = 1337;
      const { contract } = await deployTokenFixture("", "", totalSupply)

      expect(await contract.totalSupply()).to.equal(totalSupply);
    });

    it("Deployment should assign the total supply of tokens to the owner", async () => {

    });
  });
});