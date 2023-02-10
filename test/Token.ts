import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import { expect } from "chai";
import { ethers } from "hardhat";

describe("Token", () => {
  const name = "Mountain Protocol USD Token";
  const symbol = "USDM";
  const totalShares = ethers.utils.parseUnits("1337");

  // We define a fixture to reuse the same setup in every test.
  // We use loadFixture to run this setup once, snapshot that state,
  // and reset Hardhat Network to that snapshopt in every test.
  const deployTokenFixture = async () => {
    // Contracts are deployed using the first signer/account by default
    const [owner, acc1, acc2] = await ethers.getSigners();

    const Token = await ethers.getContractFactory("Token");
    const contract = await Token.deploy(name, symbol, totalShares);

    return { contract, owner, acc1, acc2 };
  }

  describe("Deployment", () => {
    it("should set correct token's name", async () => {
      const { contract } = await loadFixture(deployTokenFixture);

      expect(await contract.name()).to.equal(name);
    });

    it("should set correct token's symbol", async () => {
      const { contract } = await loadFixture(deployTokenFixture);

      expect(await contract.symbol()).to.equal(symbol);
    });

    it("should set correct owner", async () => {
      const { contract, owner } = await loadFixture(deployTokenFixture);

      expect(await contract.owner()).to.equal(owner.address);
    });

    it("should set correct initial total shares", async () => {
      const { contract } = await loadFixture(deployTokenFixture);

      expect(await contract.totalShares()).to.equal(totalShares);
    });

    it("should set correct total supply", async () => {
      const { contract } = await loadFixture(deployTokenFixture);

      // Reward multiplier is not set so totalShares === totalSupply
      expect(await contract.totalSupply()).to.equal(totalShares);
    });

    it("should assign the initial total shares to owner", async () => {
      const { contract, owner } = await loadFixture(deployTokenFixture);

      expect(await contract.sharesOf(owner.address)).to.equal(totalShares);
    });

    it("should return initial balance", async () => {
      const { contract, owner } = await loadFixture(deployTokenFixture);

      expect( await contract.balanceOf(owner.address)).to.equal(totalShares);
    });

    it("should grant admin role to owner", async () => {
      const { contract, owner } = await loadFixture(deployTokenFixture);

      expect(
        await contract.hasRole(await contract.DEFAULT_ADMIN_ROLE(), owner.address)
      ).to.equal(true);
    });
  });

  describe("Transfer", () => {
    it("should transfer tokens from one address to another", async () => {
      const { contract, owner, acc1, acc2 } = await loadFixture(deployTokenFixture);
      const amount = ethers.utils.parseUnits("10");

      await expect(
        contract.transfer(acc1.address, amount)
      ).to.changeTokenBalances(contract, [owner, acc1], [amount.mul(-1), amount]);

      const amount2 = ethers.utils.parseUnits("5");

      await expect(
        contract.connect(acc1).transfer(acc2.address, amount2)
      ).to.changeTokenBalances(contract, [acc1, acc2], [amount2.mul(-1), amount2]);
    });

    it("should fail if transfer amount exceeds balance", async () => {
      const { contract, owner, acc1 } = await loadFixture(deployTokenFixture);

      const balance = await contract.balanceOf(owner.address);

      await expect(
        contract.transfer(acc1.address, balance.add(1))
      ).to.be.revertedWith("ERC20: transfer amount exceeds balance");
    });

    it("should emit Transfer events", async () => {
      const { contract, owner, acc1 } = await loadFixture(deployTokenFixture);

      const to = acc1.address;
      const amount = ethers.utils.parseUnits("1");

      await expect(contract.transfer(to, amount))
        .to.emit(contract, "Transfer")
        .withArgs(owner.address, to, amount);
    });

    it("should fail if transfer to the zero address", async () => {
      const { contract } = await loadFixture(deployTokenFixture);

      const amount = ethers.utils.parseUnits("1");

      await expect(
        contract.transfer(ethers.constants.AddressZero, amount)
      ).to.be.revertedWith("ERC20: transfer to the zero address");
    });

    it("should support supply as argument but transfer shares", async () => {
      const { contract, owner, acc1 } = await loadFixture(deployTokenFixture);
      const ORACLE_ROLE = ethers.utils.keccak256(ethers.utils.toUtf8Bytes('ORACLE_ROLE'));
      const amount = ethers.utils.parseUnits("100");
      const rewardMultiplier = ethers.utils.parseUnits("0.01");
      const totalRewardMultiplier = rewardMultiplier.add(ethers.utils.parseUnits("1"));


      // We use fixed-point arithmetic to avoid precision issues
      const sharesBeforeTransfer = await contract.sharesOf(owner.address);
      const sharesAmount = amount.mul(ethers.utils.parseUnits("1")).div(totalRewardMultiplier);

      await contract.grantRole(ORACLE_ROLE, owner.address);
      await contract.setRewardMultiplier(rewardMultiplier);
      await contract.transfer(acc1.address, amount)

      expect(await contract.sharesOf(acc1.address)).to.equal(sharesAmount);
      expect(await contract.sharesOf(owner.address)).to.equal(sharesBeforeTransfer.sub(sharesAmount));
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

    it("should not set the reward multiplier without oracle role", async () => {
      const { contract, owner } = await loadFixture(deployTokenFixture);
      const ORACLE_ROLE = ethers.utils.keccak256(ethers.utils.toUtf8Bytes('ORACLE_ROLE'));

      await expect(
        contract.setRewardMultiplier(1)
      ).to.be.revertedWith(
        `AccessControl: account ${owner.address.toLowerCase()} is missing role ${ORACLE_ROLE}`
      );
    });

    it("should set the reward multiplier with oracle role", async () => {
      const { contract, owner } = await loadFixture(deployTokenFixture);
      const ORACLE_ROLE = ethers.utils.keccak256(ethers.utils.toUtf8Bytes('ORACLE_ROLE'));

      await contract.grantRole(ORACLE_ROLE, owner.address);

      await expect(
        contract.setRewardMultiplier(1)
      ).to.not.be.revertedWith(
        `AccessControl: account ${owner.address.toLowerCase()} is missing role ${ORACLE_ROLE}`
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

    it("should not unblacklist without blacklist role", async () => {
      const { contract, owner } = await loadFixture(deployTokenFixture);
      const BLACKLIST_ROLE = ethers.utils.keccak256(ethers.utils.toUtf8Bytes('BLACKLIST_ROLE'));

      await expect(
        contract.unblacklist(owner.address)
      ).to.be.revertedWith(
        `AccessControl: account ${owner.address.toLowerCase()} is missing role ${BLACKLIST_ROLE}`
      );
    });

    it("should unblacklist with blacklist role", async () => {
      const { contract, owner } = await loadFixture(deployTokenFixture);
      const BLACKLIST_ROLE = ethers.utils.keccak256(ethers.utils.toUtf8Bytes('BLACKLIST_ROLE'));

      await contract.grantRole(BLACKLIST_ROLE, owner.address);

      await expect(
        contract.unblacklist(owner.address)
      ).to.not.be.revertedWith(
        `AccessControl: account ${owner.address.toLowerCase()} is missing role ${BLACKLIST_ROLE}`
      );
    });

    it("should pause when admin", async () => {
      const { contract } = await loadFixture(deployTokenFixture);

      await expect(
        await contract.pause()
      ).to.not.be.revertedWith(
        "Ownable: caller is not the owner"
      );
    });

    it("should not pause without admin", async () => {
      const { contract, acc1 } = await loadFixture(deployTokenFixture);

      await expect(
        contract.connect(acc1).pause()
      ).to.be.revertedWith(
        "Ownable: caller is not the owner"
      );
    });

    it("should unpause when admin", async () => {
      const { contract } = await loadFixture(deployTokenFixture);

      await contract.pause();

      await expect(
        await contract.unpause()
      ).to.not.be.revertedWith(
        "Ownable: caller is not the owner"
      );
    });

    it("should not unpause without admin", async () => {
      const { contract, acc1 } = await loadFixture(deployTokenFixture);

      await contract.pause();

      await expect(
        contract.connect(acc1).unpause()
      ).to.be.revertedWith(
        "Ownable: caller is not the owner"
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

    it("should allow transfers to addresses blacklisted", async () => {
      // Each blacklist check is an SLOAD, which is gas intensive.
      // We only block sender not receiver, so we don't tax every user
      const { contract, owner, acc1 } = await loadFixture(deployTokenFixture);
      const BLACKLIST_ROLE = ethers.utils.keccak256(ethers.utils.toUtf8Bytes('BLACKLIST_ROLE'));

      await contract.grantRole(BLACKLIST_ROLE, owner.address);
      await contract.blacklist(acc1.address);

      await expect(
        contract.transfer(acc1.address, 1)
      ).to.not.be.revertedWith('Address is blacklisted');
    });

    it("should not add an address already blacklisted", async () => {
      const { contract, owner, acc1 } = await loadFixture(deployTokenFixture);
      const BLACKLIST_ROLE = ethers.utils.keccak256(ethers.utils.toUtf8Bytes('BLACKLIST_ROLE'));

      await contract.grantRole(BLACKLIST_ROLE, owner.address);
      await contract.blacklist(acc1.address);

      await expect(
        contract.blacklist(acc1.address)
      ).to.be.revertedWith("Address already blacklisted");
    });

    it("should not unblacklist an address not blacklisted", async () => {
      const { contract, owner } = await loadFixture(deployTokenFixture);
      const BLACKLIST_ROLE = ethers.utils.keccak256(ethers.utils.toUtf8Bytes('BLACKLIST_ROLE'));

      await contract.grantRole(BLACKLIST_ROLE, owner.address);

      await expect(
        contract.unblacklist(owner.address)
      ).to.be.revertedWith("Address is not blacklisted");
    });
  });

  // describe("Oracle", () => {
  //   it("should update the reward multiplier", async () => {
  //     const { contract, owner } = await loadFixture(deployTokenFixture);

  //     const result = await contract.setRewardMultiplier();
  //   });
  // });

  describe("Reward Multiplier", () => {
    it("should initialize with 1", async () => {
      const { contract } = await loadFixture(deployTokenFixture);

      expect(
        await contract.rewardMultiplier()
      ).to.equal(ethers.utils.parseUnits("1"));
    });

    it("should sum the reward multiplier", async () => {
      const { contract, owner } = await loadFixture(deployTokenFixture);
      const ORACLE_ROLE = ethers.utils.keccak256(ethers.utils.toUtf8Bytes('ORACLE_ROLE'));

      await contract.grantRole(ORACLE_ROLE, owner.address);

      // Daily 20% APR
      const interest = ethers.utils.parseUnits("0.000547945205479452"); // 547945205479452
      const rewardMultiplier = await contract.rewardMultiplier();

      const expected = rewardMultiplier.add(interest);

      await expect(
        contract.setRewardMultiplier(interest)
      ).to.emit(contract, "RewardMultiplierUpdated").withArgs(expected);
    });

    it("should not support reward multiplier below 0", async () => {
      const { contract, owner } = await loadFixture(deployTokenFixture);
      const ORACLE_ROLE = ethers.utils.keccak256(ethers.utils.toUtf8Bytes('ORACLE_ROLE'));

      await contract.grantRole(ORACLE_ROLE, owner.address);

      const interest = ethers.utils.parseUnits("0");

      await expect(
        contract.setRewardMultiplier(interest)
      ).to.be.revertedWith("Invalid RewardMultiplier");
    });

    it("should not support a reward multiplier above 6bps", async () => {
      const { contract, owner } = await loadFixture(deployTokenFixture);
      const ORACLE_ROLE = ethers.utils.keccak256(ethers.utils.toUtf8Bytes('ORACLE_ROLE'));

      await contract.grantRole(ORACLE_ROLE, owner.address);

      const interest = ethers.utils.parseUnits("0.05");

      await expect(
        contract.setRewardMultiplier(interest)
      ).to.be.revertedWith("Invalid RewardMultiplier");
    });

    it("should reflect the dynamic supply", async () => {
      const { contract, owner } = await loadFixture(deployTokenFixture);
      const ORACLE_ROLE = ethers.utils.keccak256(ethers.utils.toUtf8Bytes('ORACLE_ROLE'));
      const interest = ethers.utils.parseUnits("0.01");

      await contract.grantRole(ORACLE_ROLE, owner.address);

      expect(
        await contract.totalSupply()
      ).to.equal(totalShares);

      await contract.setRewardMultiplier(interest);

      const rewardMultiplier = await contract.rewardMultiplier();
      const expected = totalShares.mul(rewardMultiplier).div(ethers.utils.parseUnits("1"));

      expect(
        await contract.totalSupply()
      ).to.equal(expected);
    });
  });

  describe("balance", () => {
    it("should return the amount of dynamic supply and not the amount of shares", async () => {
      const { contract, owner, acc1 } = await loadFixture(deployTokenFixture);
      const MINTER_ROLE = ethers.utils.keccak256(ethers.utils.toUtf8Bytes('MINTER_ROLE'));
      const ORACLE_ROLE = ethers.utils.keccak256(ethers.utils.toUtf8Bytes('ORACLE_ROLE'));
      const tokensAmount = ethers.utils.parseUnits("10");
      const rewardMultiplier = ethers.utils.parseUnits("0.01");
      const totalRewardMultiplier = rewardMultiplier.add(ethers.utils.parseUnits("1"));

      await contract.grantRole(MINTER_ROLE, owner.address);
      await contract.grantRole(ORACLE_ROLE, owner.address);
      await contract.mint(acc1.address, tokensAmount);
      await contract.setRewardMultiplier(rewardMultiplier);

      expect(await contract.balanceOf(acc1.address))
        .to.equal(
          tokensAmount.mul(totalRewardMultiplier).div(ethers.utils.parseUnits("1"))
      );
    });
  });

  describe("shares", () => {
    it("should initialize with zero", async () => {
      const { contract, acc1 } = await loadFixture(deployTokenFixture);

      expect (await contract.balanceOf(acc1.address)).to.equal(0);
      expect (await contract.sharesOf(acc1.address)).to.equal(0);
    });

    it("should not change amount of shares when updating reward multiplier", async () => {
      const { contract, owner, acc1 } = await loadFixture(deployTokenFixture);
      const MINTER_ROLE = ethers.utils.keccak256(ethers.utils.toUtf8Bytes('MINTER_ROLE'));
      const ORACLE_ROLE = ethers.utils.keccak256(ethers.utils.toUtf8Bytes('ORACLE_ROLE'));

      const sharesToMint = ethers.utils.parseUnits("1");

      await contract.grantRole(MINTER_ROLE, owner.address);
      await contract.grantRole(ORACLE_ROLE, owner.address);
      await contract.mint(acc1.address, sharesToMint);

      await contract.setRewardMultiplier(ethers.utils.parseUnits("0.01"));


      expect (await contract.sharesOf(acc1.address)).to.equal(sharesToMint);
    });

    it("should return the amount of shares based on supply", async () => {
      const { contract, owner } = await loadFixture(deployTokenFixture);
      const ORACLE_ROLE = ethers.utils.keccak256(ethers.utils.toUtf8Bytes('ORACLE_ROLE'));
      const amount = ethers.utils.parseUnits("14");
      const rewardMultiplier = ethers.utils.parseUnits("0.01");
      const totalRewardMultiplier = rewardMultiplier.add(ethers.utils.parseUnits("1"));

      await contract.grantRole(ORACLE_ROLE, owner.address);
      await contract.setRewardMultiplier(rewardMultiplier);

      expect(
        await contract.getSharesBySupply(amount)
      ).to.equal(
        // We use fixed-point arithmetic to avoid precision issues
        amount.mul(ethers.utils.parseUnits("1")).div(totalRewardMultiplier)
      );
    });

    it("should return the amount of supply based on shares", async () => {
      const { contract, owner } = await loadFixture(deployTokenFixture);
      const ORACLE_ROLE = ethers.utils.keccak256(ethers.utils.toUtf8Bytes('ORACLE_ROLE'));
      const amount = ethers.utils.parseUnits("14");
      const rewardMultiplier = ethers.utils.parseUnits("0.01");
      const totalRewardMultiplier = rewardMultiplier.add(ethers.utils.parseUnits("1"));

      await contract.grantRole(ORACLE_ROLE, owner.address);
      await contract.setRewardMultiplier(rewardMultiplier);

      expect(
        await contract.getSupplyByShares(amount)
      ).to.equal(
        // We use fixed-point arithmetic to avoid precision issues
        amount.mul(totalRewardMultiplier).div(ethers.utils.parseUnits("1"))
      );
    });
  });

  describe("mint", () => {
    it("should increment total shares when mint", async () => {
      const { contract, owner } = await loadFixture(deployTokenFixture);
      const MINTER_ROLE = ethers.utils.keccak256(ethers.utils.toUtf8Bytes('MINTER_ROLE'));

      await contract.grantRole(MINTER_ROLE, owner.address);

      const totalShares = await contract.totalShares();
      const mintAmount = ethers.utils.parseUnits("1");

      await contract.mint(owner.address, mintAmount);

      expect(
        await contract.totalShares()
      ).to.equal(totalShares.add(mintAmount));
    });

    it("should increment total supply when mint", async () => {
      const { contract, owner } = await loadFixture(deployTokenFixture);
      const MINTER_ROLE = ethers.utils.keccak256(ethers.utils.toUtf8Bytes('MINTER_ROLE'));

      await contract.grantRole(MINTER_ROLE, owner.address);

      const totalSupply = await contract.totalSupply();
      const mintAmount = ethers.utils.parseUnits("1");

      await contract.mint(owner.address, mintAmount);

      expect(
        await contract.totalSupply()
      ).to.equal(totalSupply.add(mintAmount));
    });

    it("should emit transfer event", async () => {
      const { contract, owner } = await loadFixture(deployTokenFixture);
      const MINTER_ROLE = ethers.utils.keccak256(ethers.utils.toUtf8Bytes('MINTER_ROLE'));

      await contract.grantRole(MINTER_ROLE, owner.address);

      const mintAmount = ethers.utils.parseUnits("1");

      await expect(
        contract.mint(owner.address, mintAmount)
      ).to.emit(contract,"Transfer").withArgs(ethers.constants.AddressZero, owner.address, mintAmount);
    });

    it("should mint shares to correct address", async () => {
      const { contract, owner, acc1 } = await loadFixture(deployTokenFixture);
      const MINTER_ROLE = ethers.utils.keccak256(ethers.utils.toUtf8Bytes('MINTER_ROLE'));

      await contract.grantRole(MINTER_ROLE, owner.address);

      const mintAmount = ethers.utils.parseUnits("1");

      await contract.mint(acc1.address, mintAmount)

      expect(
        await contract.sharesOf(acc1.address)
      ).to.equal(mintAmount);
    });

    it("should not allow minting to null adress", async () => {
      const { contract, owner } = await loadFixture(deployTokenFixture);
      const MINTER_ROLE = ethers.utils.keccak256(ethers.utils.toUtf8Bytes('MINTER_ROLE'));

      await contract.grantRole(MINTER_ROLE, owner.address);

      const mintAmount = ethers.utils.parseUnits("1");


      await expect(
        contract.mint(ethers.constants.AddressZero, mintAmount)
      ).to.be.revertedWith("ERC20: mint to the zero address");
    });
  });

  describe("burn", () => {
    it("should decrement account shares when burning", async () => {
      const { contract, owner } = await loadFixture(deployTokenFixture);
      const BURNER_ROLE = ethers.utils.keccak256(ethers.utils.toUtf8Bytes('BURNER_ROLE'));

      await contract.grantRole(BURNER_ROLE, owner.address);

      const accountShares = await contract.sharesOf(owner.address);
      const burnAmount = ethers.utils.parseUnits("1");

      await contract.burn(owner.address, burnAmount)

      expect(
        await contract.sharesOf(owner.address)
      ).to.equal(accountShares.sub(burnAmount));
    });

    it("should decrement total shares quantity when burning", async () => {
      const { contract, owner } = await loadFixture(deployTokenFixture);
      const BURNER_ROLE = ethers.utils.keccak256(ethers.utils.toUtf8Bytes('BURNER_ROLE'));

      await contract.grantRole(BURNER_ROLE, owner.address);

      const totalShares = await contract.totalShares();
      const accountShares = await contract.sharesOf(owner.address);
      const amount = ethers.utils.parseUnits("1");

      await contract.burn(owner.address, amount)

      expect(
        await contract.totalShares()
      ).to.equal(totalShares.sub(amount));
    });

    it("should not allow burning from null address", async () => {
      const { contract, owner } = await loadFixture(deployTokenFixture);
      const BURNER_ROLE = ethers.utils.keccak256(ethers.utils.toUtf8Bytes('BURNER_ROLE'));

      await contract.grantRole(BURNER_ROLE, owner.address);
      const amount = ethers.utils.parseUnits("1");


      await expect(
        contract.burn(ethers.constants.AddressZero, amount)
      ).to.be.revertedWith("ERC20: burn from the zero address");
    });

    it("should not allow burning when amount exceeds balance", async () => {
      const { contract, owner } = await loadFixture(deployTokenFixture);
      const BURNER_ROLE = ethers.utils.keccak256(ethers.utils.toUtf8Bytes('BURNER_ROLE'));

      await contract.grantRole(BURNER_ROLE, owner.address);
      const balance = await contract.balanceOf(owner.address);


      await expect(
        contract.burn(owner.address, balance.add(1))
      ).to.be.revertedWith("ERC20: burn amount exceeds balance");
    });
  });
});
