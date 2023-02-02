import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";
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

      expect(
        await contract.totalSupply()
      ).to.equal(ethers.utils.parseUnits(totalSupply.toString()));
    });

    it("should assign the total supply of tokens to the owner", async () => {
      const { contract, owner } = await loadFixture(deployTokenFixture);

      expect(
        ethers.utils.parseUnits(totalSupply.toString())
      ).to.equal(await contract.balanceOf(owner.address));
    });

    it("should grant admin role to owner", async () => {
      const { contract, owner } = await loadFixture(deployTokenFixture);

      expect(
        await contract.hasRole(await contract.DEFAULT_ADMIN_ROLE(), owner.address)
      ).to.equal(true);
    });
  });

  describe("TXs", () => {
    it("should transfer tokens between accounts", async () => {
      const { contract, owner, acc1, acc2 } = await loadFixture(deployTokenFixture);


      // Transfer 10 tokens from owner to acc1
      expect(
        await contract.transfer(acc1.address, 10)
      ).to.changeTokenBalances(contract, [owner, acc1], [-10, 10]);

      // Transfer 5 tokens from acc1 to acc2
      // We use .connect(signer) to send a transaction from another account
      expect(
        await contract.connect(acc1).transfer(acc2.address, 5)
      ).to.changeTokenBalances(contract, [acc1, acc2], [-5, 5]);
    });

    it("should fail if sender doesn't have enough tokens", async () => {
      const { contract, owner, acc1, acc2 } = await loadFixture(deployTokenFixture);
      const initialAcc2Balance = await contract.balanceOf(acc2.address);

      // Transfer 1 token from acc1 to acc2
      // We use .connect(signer) to send a transaction from another account
      await expect(
        contract.connect(acc1).transfer(acc2.address, 1)
      ).to.be.revertedWith("ERC20: transfer amount exceeds balance");

      // Acc2 balance shouldn't have changed.
      expect(await contract.balanceOf(acc2.address)).to.equal(
        initialAcc2Balance
      );
    });

    it("should emit Transfer events", async () => {
      const { contract, owner, acc1 } = await loadFixture(deployTokenFixture);

      expect(await contract.transfer(acc1.address, 1))
        .to.emit(contract, "Transfer")
        .withArgs(owner.address, acc1.address, 1);
    });
  });

  describe("Access Control", () => {
    it("should not mint without minter role", async () => {
      const { contract, acc1 } = await loadFixture(deployTokenFixture);
      const MINTER_ROLE = ethers.utils.keccak256(ethers.utils.toUtf8Bytes('MINTER_ROLE'));

      await expect(
        contract.connect(acc1).mint(acc1.address, 1000)
      ).to.be.revertedWith(
        `AccessControl: account ${acc1.address.toLowerCase()} is missing role ${MINTER_ROLE}`
      );
    });

    it("should mint with minter role", async () => {
      const { contract, acc1 } = await loadFixture(deployTokenFixture);
      const MINTER_ROLE = ethers.utils.keccak256(ethers.utils.toUtf8Bytes('MINTER_ROLE'));

      await contract.grantRole(MINTER_ROLE, acc1.address);

      await expect(
        contract.connect(acc1).mint(acc1.address, 100)
      ).to.not.be.revertedWith(
        `AccessControl: account ${acc1.address.toLowerCase()} is missing role ${MINTER_ROLE}`
      );
    });

    it("should not burn without burner role", async () => {
      const { contract, acc1 } = await loadFixture(deployTokenFixture);
      const BURNER_ROLE = ethers.utils.keccak256(ethers.utils.toUtf8Bytes('BURNER_ROLE'));

      await expect(
        contract.connect(acc1).burn(acc1.address, 1000)
      ).to.be.revertedWith(
        `AccessControl: account ${acc1.address.toLowerCase()} is missing role ${BURNER_ROLE}`
      );
    });

    it("should burn with burner role", async () => {
      const { contract, owner } = await loadFixture(deployTokenFixture);
      const BURNER_ROLE = ethers.utils.keccak256(ethers.utils.toUtf8Bytes('BURNER_ROLE'));
      
      await contract.grantRole(BURNER_ROLE, owner.address);

      await expect(
        contract.burn(owner.address, 1)
      ).to.not.be.revertedWith(
        `AccessControl: account ${owner.address.toLowerCase()} is missing role ${BURNER_ROLE}`
      );
    });

    it("should not blacklist without blacklist role", async () => {
      const { contract, owner } = await loadFixture(deployTokenFixture);
      const BLACKLIST_ROLE = ethers.utils.keccak256(ethers.utils.toUtf8Bytes('BLACKLIST_ROLE'));

      await expect(
        contract.blacklist(owner.address)
      ).to.be.revertedWith(
        `AccessControl: account ${owner.address.toLowerCase()} is missing role ${BLACKLIST_ROLE}`
      );
    });

    it("should blacklist with blacklist role", async () => {
      const { contract, owner } = await loadFixture(deployTokenFixture);
      const BLACKLIST_ROLE = ethers.utils.keccak256(ethers.utils.toUtf8Bytes('BLACKLIST_ROLE'));
      
      await contract.grantRole(BLACKLIST_ROLE, owner.address);

      await expect(
        contract.blacklist(owner.address)
      ).to.not.be.revertedWith(
        `AccessControl: account ${owner.address.toLowerCase()} is missing role ${BLACKLIST_ROLE}`
      );
    });
  });

  describe("Blacklist", () => {
    it("should add address to the blacklist", async () => {
      const { contract, owner, acc1 } = await loadFixture(deployTokenFixture);
      const BLACKLIST_ROLE = ethers.utils.keccak256(ethers.utils.toUtf8Bytes('BLACKLIST_ROLE'));
      
      await contract.grantRole(BLACKLIST_ROLE, owner.address);
      await contract.blacklist(acc1.address);

      expect(
        await contract.isBlacklisted(acc1.address)
      ).to.equal(true);
    });

    it("should remove an address from the blacklist", async () => {
      const { contract, owner, acc1 } = await loadFixture(deployTokenFixture);
      const BLACKLIST_ROLE = ethers.utils.keccak256(ethers.utils.toUtf8Bytes('BLACKLIST_ROLE'));

      await contract.grantRole(BLACKLIST_ROLE, owner.address);
      await contract.blacklist(acc1.address);
      await contract.unblacklist(acc1.address);

      expect(
        await contract.isBlacklisted(acc1.address)
      ).to.equal(false);
    });

    it("should not transfer when from address is blacklisted", async () => {
      const { contract, owner, acc1 } = await loadFixture(deployTokenFixture);
      const BLACKLIST_ROLE = ethers.utils.keccak256(ethers.utils.toUtf8Bytes('BLACKLIST_ROLE'));

      await contract.grantRole(BLACKLIST_ROLE, owner.address);
      await contract.blacklist(owner.address);

      await expect(
        contract.transfer(acc1.address, 1)
      ).to.be.revertedWith('Address is blacklisted');
    });

    it("should not transfer when to address is blacklisted", async () => {
      const { contract, owner, acc1 } = await loadFixture(deployTokenFixture);
      const BLACKLIST_ROLE = ethers.utils.keccak256(ethers.utils.toUtf8Bytes('BLACKLIST_ROLE'));

      await contract.grantRole(BLACKLIST_ROLE, owner.address);
      await contract.blacklist(acc1.address);

      await expect(
        contract.transfer(acc1.address, 1)
      ).to.be.revertedWith('Address is blacklisted');
    });
  });

  describe("Pausable", () => {
    it("should pause when admin", async () => {
      const { contract, owner } = await loadFixture(deployTokenFixture);

      await expect(
        contract.pause()
      ).to.emit(contract, "Paused").withArgs(owner.address);
    });

    it("should not pause without admin", async () => {
      const { contract, acc1 } = await loadFixture(deployTokenFixture);

      await expect(
        contract.connect(acc1).pause()
      ).to.be.revertedWith(
        "Ownable: caller is not the owner"
      );
    });
  });
});