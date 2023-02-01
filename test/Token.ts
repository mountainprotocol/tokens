import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import { anyValue } from "@nomicfoundation/hardhat-chai-matchers/withArgs";
import { expect } from "chai";
import { ethers } from "hardhat";

describe("Token", () => {
  const name = "Mountain Protocol USD Token";
  const symbol = "USDM";
  const totalSupply = 1337;

  // We define a fixture to reuse the same setup in every test.
  // We use loadFixture to run this setup once, snapshot that state,
  // and reset Hardhat Network to that snapshopt in every test.
  const deployTokenFixture = async () => {
    // Contracts are deployed using the first signer/account by default
    const [owner, acc1, acc2] = await ethers.getSigners();

    const Token = await ethers.getContractFactory("Token");
    const contract = await Token.deploy(name, symbol, totalSupply);

    return { contract, owner, acc1, acc2 };
  }

  describe("Deployment", () => {
    it("should set the correct token's name", async () => {
      const { contract } = await loadFixture(deployTokenFixture);

      expect(await contract.name()).to.equal(name);
    });

    it("should set the correct token's symbol", async () => {
      const { contract } = await loadFixture(deployTokenFixture);

      expect(await contract.symbol()).to.equal(symbol);
    });

    it("should set the correct owner", async () => {
      const { contract, owner } = await loadFixture(deployTokenFixture);

      expect(await contract.owner()).to.equal(owner.address);
    });

    it("should set the correct total supply", async () => {
      const { contract } = await loadFixture(deployTokenFixture);

      expect(await contract.totalSupply()).to.equal(totalSupply);
    });

    it("should assign the total supply of tokens to the owner", async () => {
      const { contract, owner } = await loadFixture(deployTokenFixture);

      expect(totalSupply).to.equal(await contract.balanceOf(owner.address));
    });
  });

  describe("TXs", () => {
    it("should transfer tokens between accounts", async () => {
      const { contract, owner, acc1, acc2 } = await loadFixture(deployTokenFixture);


      // Transfer 10 tokens from owner to acc1
      await expect(
        contract.transfer(acc1.address, 10)
      ).to.changeTokenBalances(contract, [owner, acc1], [-10, 10]);

      // Transfer 5 tokens from acc1 to acc2
      // We use .connect(signer) to send a transaction from another account
      await expect(
        contract.connect(acc1).transfer(acc2.address, 5)
      ).to.changeTokenBalances(contract, [acc1, acc2], [-5, 5]);
    });

    it("should fail if sender doesn't have enough tokens", async () => {
      const { contract, owner, acc1, acc2 } = await loadFixture(deployTokenFixture);
      const initialAcc2Balance = await contract.balanceOf(acc2.address);

      // Transfer 1 token from acc1 to acc2
      // We use .connect(signer) to send a transaction from another account
      await expect(
        contract.connect(acc1).transfer(acc2.address, 1)
      ).to.be.revertedWith("Not enough tokens");

      // Acc2 balance shouldn't have changed.
      expect(await contract.balanceOf(acc2.address)).to.equal(
        initialAcc2Balance
      );
    });

    it("should emit Transfer events", async () => {
      const { contract, owner, acc1 } = await loadFixture(deployTokenFixture);

      await expect(contract.transfer(acc1.address, 1))
        .to.emit(contract, "Transfer")
        .withArgs(owner.address, acc1.address, 1);
    });
  });
});