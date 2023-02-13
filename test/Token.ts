import { expect } from "chai";
import { ethers } from "hardhat";
import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";

const { AddressZero } = ethers.constants
const toBaseUnit = (value: number) => ethers.utils.parseUnits(value.toString());

const roles = {
  MINTER: ethers.utils.keccak256(ethers.utils.toUtf8Bytes('MINTER_ROLE')),
  BURNER: ethers.utils.keccak256(ethers.utils.toUtf8Bytes('BURNER_ROLE')),
  BLACKLIST: ethers.utils.keccak256(ethers.utils.toUtf8Bytes('BLACKLIST_ROLE')),
  ORACLE: ethers.utils.keccak256(ethers.utils.toUtf8Bytes('ORACLE_ROLE')),
}

describe("Token", () => {
  const name = "Mountain Protocol USD Token";
  const symbol = "USDM";
  const totalShares = toBaseUnit(1337);

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
    it("has a name", async () => {
      const { contract } = await loadFixture(deployTokenFixture);

      expect(await contract.name()).to.equal(name);
    });

    it("has a symbol", async () => {
      const { contract } = await loadFixture(deployTokenFixture);

      expect(await contract.symbol()).to.equal(symbol);
    });

    it("has 18 decimals", async () => {
      const { contract } = await loadFixture(deployTokenFixture);

      expect(await contract.decimals()).to.be.equal(18);
    });

    it("has the right owner", async () => {
      const { contract, owner } = await loadFixture(deployTokenFixture);

      expect(await contract.owner()).to.equal(owner.address);
    });

    it("returns the total shares", async () => {
      const { contract } = await loadFixture(deployTokenFixture);

      expect(await contract.totalShares()).to.equal(totalShares);
    });

    it("returns the total supply", async () => {
      const { contract } = await loadFixture(deployTokenFixture);

      // Reward multiplier is not set so totalShares === totalSupply
      expect(await contract.totalSupply()).to.equal(totalShares);
    });

    it("assigns the initial total shares to owner", async () => {
      const { contract, owner } = await loadFixture(deployTokenFixture);

      expect(await contract.sharesOf(owner.address)).to.equal(totalShares);
    });

    it("assigns the initial balance to the owner", async () => {
      const { contract, owner } = await loadFixture(deployTokenFixture);

      expect( await contract.balanceOf(owner.address)).to.equal(totalShares);
    });

    it("grants admin role to owner", async () => {
      const { contract, owner } = await loadFixture(deployTokenFixture);

      expect(
        await contract.hasRole(await contract.DEFAULT_ADMIN_ROLE(), owner.address)
      ).to.equal(true);
    });
  });

  describe("Transfer", () => {
    it("transfers tokens from one account to another", async () => {
      const { contract, owner, acc1, acc2 } = await loadFixture(deployTokenFixture);
      const amount = toBaseUnit(10);

      await expect(
        contract.transfer(acc1.address, amount)
      ).to.changeTokenBalances(contract, [owner, acc1], [amount.mul(-1), amount]);

      const amount2 = toBaseUnit(5);

      await expect(
        contract.connect(acc1).transfer(acc2.address, amount2)
      ).to.changeTokenBalances(contract, [acc1, acc2], [amount2.mul(-1), amount2]);
    });

    it("fails if transfer amount exceeds balance", async () => {
      const { contract, owner, acc1 } = await loadFixture(deployTokenFixture);

      const balance = await contract.balanceOf(owner.address);

      await expect(
        contract.transfer(acc1.address, balance.add(1))
      ).to.be.revertedWith("ERC20: transfer amount exceeds balance");
    });

    it("emits a transfer events", async () => {
      const { contract, owner, acc1 } = await loadFixture(deployTokenFixture);

      const to = acc1.address;
      const amount = toBaseUnit(1);

      await expect(contract.transfer(to, amount))
        .to.emit(contract, "Transfer")
        .withArgs(owner.address, to, amount);
    });

    it("fails if transfer to the zero address", async () => {
      const { contract } = await loadFixture(deployTokenFixture);

      const amount = toBaseUnit(1);

      await expect(
        contract.transfer(AddressZero, amount)
      ).to.be.revertedWith("ERC20: transfer to the zero address");
    });

    it("takes supply amount as argument but transfers shares", async () => {
      const { contract, owner, acc1 } = await loadFixture(deployTokenFixture);
      const amount = toBaseUnit(100);
      const rewardMultiplier = toBaseUnit(0.01);
      const totalRewardMultiplier = rewardMultiplier.add(toBaseUnit(1));


      // We use fixed-point arithmetic to avoid precision issues
      const sharesBeforeTransfer = await contract.sharesOf(owner.address);
      const sharesAmount = amount.mul(toBaseUnit(1)).div(totalRewardMultiplier);

      await contract.grantRole(roles.ORACLE, owner.address);
      await contract.setRewardMultiplier(rewardMultiplier);
      await contract.transfer(acc1.address, amount)

      expect(await contract.sharesOf(acc1.address)).to.equal(sharesAmount);
      expect(await contract.sharesOf(owner.address)).to.equal(sharesBeforeTransfer.sub(sharesAmount));
    });
  });

  describe("Access Control", () => {
    it("does not mint without minter role", async () => {
      const { contract, acc1 } = await loadFixture(deployTokenFixture);

      await expect(
        contract.connect(acc1).mint(acc1.address, 1000)
      ).to.be.revertedWith(
        `AccessControl: account ${acc1.address.toLowerCase()} is missing role ${roles.MINTER}`
      );
    });

    it("mints with minter role", async () => {
      const { contract, acc1 } = await loadFixture(deployTokenFixture);

      await contract.grantRole(roles.MINTER, acc1.address);

      await expect(
        contract.connect(acc1).mint(acc1.address, 100)
      ).to.not.be.revertedWith(
        `AccessControl: account ${acc1.address.toLowerCase()} is missing role ${roles.MINTER}`
      );
    });

    it("does not burn without burner role", async () => {
      const { contract, acc1 } = await loadFixture(deployTokenFixture);

      await expect(
        contract.connect(acc1).burn(acc1.address, 1000)
      ).to.be.revertedWith(
        `AccessControl: account ${acc1.address.toLowerCase()} is missing role ${roles.BURNER}`
      );
    });

    it("burns with burner role", async () => {
      const { contract, owner } = await loadFixture(deployTokenFixture);

      await contract.grantRole(roles.BURNER, owner.address);

      await expect(
        contract.burn(owner.address, 1)
      ).to.not.be.revertedWith(
        `AccessControl: account ${owner.address.toLowerCase()} is missing role ${roles.BURNER}`
      );
    });

    it("does not set the reward multiplier without oracle role", async () => {
      const { contract, owner } = await loadFixture(deployTokenFixture);

      await expect(
        contract.setRewardMultiplier(1)
      ).to.be.revertedWith(
        `AccessControl: account ${owner.address.toLowerCase()} is missing role ${roles.ORACLE}`
      );
    });

    it("updates the reward multiplier with oracle role", async () => {
      const { contract, owner } = await loadFixture(deployTokenFixture);

      await contract.grantRole(roles.ORACLE, owner.address);

      await expect(
        contract.setRewardMultiplier(1)
      ).to.not.be.revertedWith(
        `AccessControl: account ${owner.address.toLowerCase()} is missing role ${roles.ORACLE}`
      );
    });

    it("does not blacklist without blacklist role", async () => {
      const { contract, owner } = await loadFixture(deployTokenFixture);

      await expect(
        contract.blacklist(owner.address)
      ).to.be.revertedWith(
        `AccessControl: account ${owner.address.toLowerCase()} is missing role ${roles.BLACKLIST}`
      );
    });

    it("blacklists with blacklist role", async () => {
      const { contract, owner } = await loadFixture(deployTokenFixture);

      await contract.grantRole(roles.BLACKLIST, owner.address);

      await expect(
        contract.blacklist(owner.address)
      ).to.not.be.revertedWith(
        `AccessControl: account ${owner.address.toLowerCase()} is missing role ${roles.BLACKLIST}`
      );
    });

    it("does not unblacklist without blacklist role", async () => {
      const { contract, owner } = await loadFixture(deployTokenFixture);

      await expect(
        contract.unblacklist(owner.address)
      ).to.be.revertedWith(
        `AccessControl: account ${owner.address.toLowerCase()} is missing role ${roles.BLACKLIST}`
      );
    });

    it("should unblacklist with blacklist role", async () => {
      const { contract, owner } = await loadFixture(deployTokenFixture);

      await contract.grantRole(roles.BLACKLIST, owner.address);

      await expect(
        contract.unblacklist(owner.address)
      ).to.not.be.revertedWith(
        `AccessControl: account ${owner.address.toLowerCase()} is missing role ${roles.BLACKLIST}`
      );
    });

    it("pauses when admin", async () => {
      const { contract } = await loadFixture(deployTokenFixture);

      await expect(
        await contract.pause()
      ).to.not.be.revertedWith(
        "Ownable: caller is not the owner"
      );
    });

    it("does not pause without admin", async () => {
      const { contract, acc1 } = await loadFixture(deployTokenFixture);

      await expect(
        contract.connect(acc1).pause()
      ).to.be.revertedWith(
        "Ownable: caller is not the owner"
      );
    });

    it("unpauses when admin", async () => {
      const { contract } = await loadFixture(deployTokenFixture);

      await contract.pause();

      await expect(
        await contract.unpause()
      ).to.not.be.revertedWith(
        "Ownable: caller is not the owner"
      );
    });

    it("does not unpause without admin", async () => {
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
    it("blacklists an account", async () => {
      const { contract, owner, acc1 } = await loadFixture(deployTokenFixture);

      await contract.grantRole(roles.BLACKLIST, owner.address);
      await contract.blacklist(acc1.address);

      expect(
        await contract.isBlacklisted(acc1.address)
      ).to.equal(true);
    });

    it("unblacklists an account", async () => {
      const { contract, owner, acc1 } = await loadFixture(deployTokenFixture);

      await contract.grantRole(roles.BLACKLIST, owner.address);
      await contract.blacklist(acc1.address);
      await contract.unblacklist(acc1.address);

      expect(
        await contract.isBlacklisted(acc1.address)
      ).to.equal(false);
    });

    it("does not transfer when from address is blacklisted", async () => {
      const { contract, owner, acc1 } = await loadFixture(deployTokenFixture);

      await contract.grantRole(roles.BLACKLIST, owner.address);
      await contract.blacklist(owner.address);

      await expect(
        contract.transfer(acc1.address, 1)
      ).to.be.revertedWith('Address is blacklisted');
    });

    it("allows transfers to addresses blacklisted", async () => {
      // Each blacklist check is an SLOAD, which is gas intensive.
      // We only block sender not receiver, so we don't tax every user
      const { contract, owner, acc1 } = await loadFixture(deployTokenFixture);

      await contract.grantRole(roles.BLACKLIST, owner.address);
      await contract.blacklist(acc1.address);

      await expect(
        contract.transfer(acc1.address, 1)
      ).to.not.be.revertedWith('Address is blacklisted');
    });

    it("does not add an address already blacklisted", async () => {
      const { contract, owner, acc1 } = await loadFixture(deployTokenFixture);

      await contract.grantRole(roles.BLACKLIST, owner.address);
      await contract.blacklist(acc1.address);

      await expect(
        contract.blacklist(acc1.address)
      ).to.be.revertedWith("Address already blacklisted");
    });

    it("does not unblacklist an address not blacklisted", async () => {
      const { contract, owner } = await loadFixture(deployTokenFixture);

      await contract.grantRole(roles.BLACKLIST, owner.address);

      await expect(
        contract.unblacklist(owner.address)
      ).to.be.revertedWith("Address is not blacklisted");
    });
  });

  describe("Pause", () => {
    it("allows minting when unpaused", async () => {
      const { contract, owner, acc1 } = await loadFixture(deployTokenFixture);
      const tokensAmount = toBaseUnit(10);

      await contract.grantRole(roles.MINTER, owner.address);

      await expect(
        contract.mint(acc1.address, tokensAmount)
      ).to.not.be.revertedWith("Transfers not allowed while paused")
    });

    it("does not allow minting when paused", async () => {
      const { contract, owner } = await loadFixture(deployTokenFixture);
      const tokensAmount = toBaseUnit(10);

      await contract.grantRole(roles.MINTER, owner.address);
      await contract.pause();

      await expect(
        contract.mint(owner.address, tokensAmount)
      ).to.be.revertedWith("Transfers not allowed while paused")
    });

    it("allows burning when unpaused", async () => {
      const { contract, owner } = await loadFixture(deployTokenFixture);
      const tokensAmount = toBaseUnit(10);

      await contract.grantRole(roles.BURNER, owner.address);

      await expect(
        contract.burn(owner.address, tokensAmount)
      ).to.not.be.revertedWith("Transfers not allowed while paused")
    });

    it("does not allow burning when paused", async () => {
      const { contract, owner } = await loadFixture(deployTokenFixture);
      const tokensAmount = toBaseUnit(10);

      await contract.grantRole(roles.BURNER, owner.address);
      await contract.pause();

      await expect(
        contract.burn(owner.address, tokensAmount)
      ).to.be.revertedWith("Transfers not allowed while paused")
    });

    it("allows transfers when unpaused", async () => {
      const { contract, acc1 } = await loadFixture(deployTokenFixture);
      const tokensAmount = toBaseUnit(10);

      await expect(
        contract.transfer(acc1.address, tokensAmount)
      ).to.not.be.revertedWith("Transfers not allowed while paused")
    });

    it("does not allow transfers when paused", async () => {
      const { contract, acc1 } = await loadFixture(deployTokenFixture);
      const tokensAmount = toBaseUnit(10);

      await contract.pause();

      await expect(
        contract.transfer(acc1.address, tokensAmount)
      ).to.be.revertedWith("Transfers not allowed while paused")
    });
  });

  describe("Reward Multiplier", () => {
    it("initializes the reward multiplier with 100%", async () => {
      const { contract } = await loadFixture(deployTokenFixture);

      expect(
        await contract.rewardMultiplier()
      ).to.equal(toBaseUnit(1));
    });

    it("sums on top of the initial the reward multiplier", async () => {
      const { contract, owner } = await loadFixture(deployTokenFixture);

      await contract.grantRole(roles.ORACLE, owner.address);

      const interest = toBaseUnit(0.000547945205479452); // Daily 20% APR
      const rewardMultiplier = await contract.rewardMultiplier();

      const expected = rewardMultiplier.add(interest);
      await contract.setRewardMultiplier(interest)

      expect(
        await contract.rewardMultiplier()
      ).to.equal(expected);
    });

    it("emits a reward multiplier reward multiplier", async () => {
      const { contract, owner } = await loadFixture(deployTokenFixture);

      await contract.grantRole(roles.ORACLE, owner.address);

      const rewardMultiplier = await contract.rewardMultiplier();
      const value = 1;

      await expect(
        contract.setRewardMultiplier(value)
      ).to.emit(contract, "RewardMultiplier").withArgs(rewardMultiplier.add(value));
    });

    it("does not support reward multiplier below 0", async () => {
      const { contract, owner } = await loadFixture(deployTokenFixture);

      await contract.grantRole(roles.ORACLE, owner.address);

      const interest = toBaseUnit(0);

      await expect(
        contract.setRewardMultiplier(interest)
      ).to.be.revertedWith("Invalid RewardMultiplier");
    });

    it("does not support a reward multiplier above 6bps", async () => {
      const { contract, owner } = await loadFixture(deployTokenFixture);

      await contract.grantRole(roles.ORACLE, owner.address);

      const interest = toBaseUnit(0.05);

      await expect(
        contract.setRewardMultiplier(interest)
      ).to.be.revertedWith("Invalid RewardMultiplier");
    });

    it("returns the dynamic supply", async () => {
      const { contract, owner } = await loadFixture(deployTokenFixture);
      const interest = toBaseUnit(0.01);

      await contract.grantRole(roles.ORACLE, owner.address);

      expect(
        await contract.totalSupply()
      ).to.equal(totalShares);

      await contract.setRewardMultiplier(interest);

      const rewardMultiplier = await contract.rewardMultiplier();
      const expected = totalShares.mul(rewardMultiplier).div(toBaseUnit(1));

      expect(
        await contract.totalSupply()
      ).to.equal(expected);
    });
  });

  describe("Balance", () => {
    it("returns the amount of dynamic supply and not the amount of shares", async () => {
      const { contract, owner, acc1 } = await loadFixture(deployTokenFixture);
      const tokensAmount = toBaseUnit(10);
      const rewardMultiplier = toBaseUnit(0.01);
      const totalRewardMultiplier = rewardMultiplier.add(toBaseUnit(1));

      await contract.grantRole(roles.MINTER, owner.address);
      await contract.grantRole(roles.ORACLE, owner.address);
      await contract.mint(acc1.address, tokensAmount);
      await contract.setRewardMultiplier(rewardMultiplier);

      expect(await contract.balanceOf(acc1.address))
        .to.equal(
          tokensAmount.mul(totalRewardMultiplier).div(toBaseUnit(1))
      );
    });
  });

  describe("Shares", () => {
    it("has zero balance and shares for new accounts", async () => {
      const { contract, acc1 } = await loadFixture(deployTokenFixture);

      expect (await contract.balanceOf(acc1.address)).to.equal(0);
      expect (await contract.sharesOf(acc1.address)).to.equal(0);
    });

    it("does not change amount of shares when updating reward multiplier", async () => {
      const { contract, owner, acc1 } = await loadFixture(deployTokenFixture);

      const sharesToMint = toBaseUnit(1);

      await contract.grantRole(roles.MINTER, owner.address);
      await contract.grantRole(roles.ORACLE, owner.address);
      await contract.mint(acc1.address, sharesToMint);

      await contract.setRewardMultiplier(toBaseUnit(0.01));


      expect (await contract.sharesOf(acc1.address)).to.equal(sharesToMint);
    });

    it("returns the amount of shares based on supply", async () => {
      const { contract, owner } = await loadFixture(deployTokenFixture);
      const amount = toBaseUnit(14);
      const rewardMultiplier = toBaseUnit(0.01);
      const totalRewardMultiplier = rewardMultiplier.add(toBaseUnit(1));

      await contract.grantRole(roles.ORACLE, owner.address);
      await contract.setRewardMultiplier(rewardMultiplier);

      expect(
        await contract.getSharesBySupply(amount)
      ).to.equal(
        // We use fixed-point arithmetic to avoid precision issues
        amount.mul(toBaseUnit(1)).div(totalRewardMultiplier)
      );
    });

    it("returns the amount of supply based on shares", async () => {
      const { contract, owner } = await loadFixture(deployTokenFixture);
      const amount = toBaseUnit(14);
      const rewardMultiplier = toBaseUnit(0.01);
      const totalRewardMultiplier = rewardMultiplier.add(toBaseUnit(1));

      await contract.grantRole(roles.ORACLE, owner.address);
      await contract.setRewardMultiplier(rewardMultiplier);

      expect(
        await contract.getSupplyByShares(amount)
      ).to.equal(
        // We use fixed-point arithmetic to avoid precision issues
        amount.mul(totalRewardMultiplier).div(toBaseUnit(1))
      );
    });
  });

  describe("Mint", () => {
    it("increments total shares when mint", async () => {
      const { contract, owner } = await loadFixture(deployTokenFixture);

      await contract.grantRole(roles.MINTER, owner.address);

      const totalShares = await contract.totalShares();
      const mintAmount = toBaseUnit(1);

      await contract.mint(owner.address, mintAmount);

      expect(
        await contract.totalShares()
      ).to.equal(totalShares.add(mintAmount));
    });

    it("increments total supply when mint", async () => {
      const { contract, owner } = await loadFixture(deployTokenFixture);

      await contract.grantRole(roles.MINTER, owner.address);

      const totalSupply = await contract.totalSupply();
      const mintAmount = toBaseUnit(1);

      await contract.mint(owner.address, mintAmount);

      expect(
        await contract.totalSupply()
      ).to.equal(totalSupply.add(mintAmount));
    });

    it("emits a transfer event", async () => {
      const { contract, owner } = await loadFixture(deployTokenFixture);

      await contract.grantRole(roles.MINTER, owner.address);

      const mintAmount = toBaseUnit(1);

      await expect(
        contract.mint(owner.address, mintAmount)
      ).to.emit(contract,"Transfer").withArgs(AddressZero, owner.address, mintAmount);
    });

    it("mints shares to correct address", async () => {
      const { contract, owner, acc1 } = await loadFixture(deployTokenFixture);

      await contract.grantRole(roles.MINTER, owner.address);

      const mintAmount = toBaseUnit(1);

      await contract.mint(acc1.address, mintAmount)

      expect(
        await contract.sharesOf(acc1.address)
      ).to.equal(mintAmount);
    });

    it("does not allow minting to null adress", async () => {
      const { contract, owner } = await loadFixture(deployTokenFixture);

      await contract.grantRole(roles.MINTER, owner.address);

      const mintAmount = toBaseUnit(1);


      await expect(
        contract.mint(AddressZero, mintAmount)
      ).to.be.revertedWith("ERC20: mint to the zero address");
    });
  });

  describe("Burn", () => {
    it("decrements account shares when burning", async () => {
      const { contract, owner } = await loadFixture(deployTokenFixture);

      await contract.grantRole(roles.BURNER, owner.address);

      const accountShares = await contract.sharesOf(owner.address);
      const burnAmount = 1;

      await contract.burn(owner.address, burnAmount)

      expect(
        await contract.sharesOf(owner.address)
      ).to.equal(accountShares.sub(burnAmount));
    });

    it("decrements total shares quantity when burning", async () => {
      const { contract, owner } = await loadFixture(deployTokenFixture);

      await contract.grantRole(roles.BURNER, owner.address);

      const totalShares = await contract.totalShares();
      const amount = 1;

      await contract.burn(owner.address, amount)

      expect(
        await contract.totalShares()
      ).to.equal(totalShares.sub(amount));
    });

    it("does not allow burning from null address", async () => {
      const { contract, owner } = await loadFixture(deployTokenFixture);

      await contract.grantRole(roles.BURNER, owner.address);

      await expect(
        contract.burn(AddressZero, 1)
      ).to.be.revertedWith("ERC20: burn from the zero address");
    });

    it("does not allow burning when amount exceeds balance", async () => {
      const { contract, owner } = await loadFixture(deployTokenFixture);

      await contract.grantRole(roles.BURNER, owner.address);
      const balance = await contract.balanceOf(owner.address);

      await expect(
        contract.burn(owner.address, balance.add(1))
      ).to.be.revertedWith("ERC20: burn amount exceeds balance");
    });

    it("emits a transfer events", async () => {
      const { contract, owner } = await loadFixture(deployTokenFixture);
      const amount = 1;

      await contract.grantRole(roles.BURNER, owner.address);
      await contract.burn(owner.address, amount)

      await expect(
        contract.burn(owner.address, amount)
      ).to.emit(contract, "Transfer").withArgs(owner.address, AddressZero, amount);
    });
  });

  describe("Approve", () => {
    it("fails when spender is the zero address", async () => {
      const { contract, owner } = await loadFixture(deployTokenFixture);

      await expect (
        contract.approve(AddressZero, 1)
      ).to.revertedWith("ERC20: approve to the zero address");
    });

    it("emits an approval event", async () => {
      const { contract, owner, acc1 } = await loadFixture(deployTokenFixture);
      const amount = 1;

      await expect (
        contract.approve(acc1.address, amount)
      ).to.emit(contract, "Approval").withArgs(owner.address, acc1.address, amount);
    });

    it("approves the request amount", async () => {
      const { contract, owner, acc1 } = await loadFixture(deployTokenFixture);
      const amount = 1;

      await contract.approve(acc1.address, amount);

      expect (
        await contract.allowance(owner.address, acc1.address)
      ).to.equal(amount);
    });

    it("approves the request amount and replace the previous one", async () => {
      const { contract, owner, acc1 } = await loadFixture(deployTokenFixture);
      const amount = 1;

      await contract.approve(acc1.address, amount + 1);
      await contract.approve(acc1.address, amount);

      expect (
        await contract.allowance(owner.address, acc1.address)
      ).to.equal(amount);
    });
  });

  describe("Decrease Allowance", () => {
    it("fails if decreased allowance is below zero", async () => {
      const { contract, acc1 } = await loadFixture(deployTokenFixture);

      await expect(
        contract.decreaseAllowance(acc1.address, 1)
      ).to.be.revertedWith("ERC20: decreased allowance below zero");
    });

    it("decreases the allowance", async () => {
      const { contract, owner, acc1 } = await loadFixture(deployTokenFixture);
      const amount = 2;
      const subtractedValue = 1;

      await contract.approve(acc1.address, amount);
      await contract.decreaseAllowance(acc1.address, subtractedValue);

      expect(
        await contract.allowance(owner.address, acc1.address)
      ).to.be.equal(amount - subtractedValue);
    });

    it("emits an approval event", async () => {
      const { contract, owner, acc1 } = await loadFixture(deployTokenFixture);
      const amount = 2;
      const subtractedValue = 1;

      await contract.approve(acc1.address, amount);

      await expect(
        await contract.decreaseAllowance(acc1.address, subtractedValue)
      ).to.emit(contract, "Approval").withArgs(owner.address, acc1.address, amount - subtractedValue);
    });
  });

  describe("Transfer From", () => {
    it("does not update allowance amount in case of infinite allowance", async () => {
      const { contract, owner, acc1 } = await loadFixture(deployTokenFixture);
      const from = owner.address;
      const to = acc1.address;
      const { MaxUint256 } = ethers.constants;

      await contract.approve(to, MaxUint256);


      await expect(
        contract.connect(acc1).transferFrom(from, to, 1)
      ).to.not.emit(contract, "Approval");

      expect(await contract.allowance(from, to)).to.be.equal(MaxUint256);
    });

    it("transfers the requested amount when has enough allowance", async () => {
      const { contract, owner, acc1 } = await loadFixture(deployTokenFixture);
      const from = owner.address;
      const to = acc1.address;
      const amount = 1;

      await contract.approve(to, amount);

      await expect(
        contract.connect(acc1).transferFrom(from, to, amount)
      ).to.changeTokenBalances(contract, [from, to], [-amount, amount]);
    });

    it("decreses the spender allowance", async () => {
      const { contract, owner, acc1 } = await loadFixture(deployTokenFixture);
      const from = owner.address;
      const to = acc1.address;

      await contract.approve(to, 2);
      await contract.connect(acc1).transferFrom(from, to, 1);

      expect(await contract.allowance(from, to)).to.be.equal(1);
    });

    it("reverts when insufficient allowance", async () => {
      const { contract, owner, acc1 } = await loadFixture(deployTokenFixture);
      const from = owner.address;
      const to = acc1.address;
      const amount = 1;

      await contract.approve(to, amount);

      await expect(
        contract.connect(acc1).transferFrom(from, to, amount + 1)
      ).to.be.revertedWith("ERC20: insufficient allowance");
    });

    it("emits a transfer event", async () => {
      const { contract, owner, acc1 } = await loadFixture(deployTokenFixture);
      const from = owner.address;
      const to = acc1.address;
      const amount = 1;

      await contract.approve(to, amount);

      await expect(
        contract.connect(acc1).transferFrom(from, to, amount)
      ).to.emit(contract, "Transfer").withArgs(from, to, amount);
    });

    it("emits an approval event", async () => {
      const { contract, owner, acc1 } = await loadFixture(deployTokenFixture);
      const from = owner.address;
      const to = acc1.address;
      const amount = 1;

      await contract.approve(to, amount);

      await expect(
        contract.connect(acc1).transferFrom(from, to, amount)
      ).to.emit(contract, "Approval").withArgs(from, to, amount - 1);
    });

    it("reverts when owner does not have enough blanace", async () => {
      const { contract, owner, acc1 } = await loadFixture(deployTokenFixture);
      const from = owner.address;
      const to = acc1.address;
      const amount = await contract.balanceOf(from);

      await contract.approve(to, amount);
      await contract.transfer(to, 1);

      await expect(
        contract.connect(acc1).transferFrom(from, to, amount)
      ).to.revertedWith("ERC20: transfer amount exceeds balance");
    });
  });
});
