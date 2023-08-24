import { expect } from 'chai';
import { ethers, upgrades } from 'hardhat';
import { Contract, BigNumber, constants } from 'ethers';
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { loadFixture, time } from '@nomicfoundation/hardhat-network-helpers';
import { TypedDataDomain, TypedDataField } from '@ethersproject/abstract-signer';
import { parseUnits, keccak256, toUtf8Bytes, defaultAbiCoder, id, splitSignature } from 'ethers/lib/utils';

const { AddressZero, MaxUint256 } = constants;

const roles = {
  MINTER: keccak256(toUtf8Bytes('MINTER_ROLE')),
  BURNER: keccak256(toUtf8Bytes('BURNER_ROLE')),
  BLOCKLIST: keccak256(toUtf8Bytes('BLOCKLIST_ROLE')),
  ORACLE: keccak256(toUtf8Bytes('ORACLE_ROLE')),
  UPGRADE: keccak256(toUtf8Bytes('UPGRADE_ROLE')),
  PAUSE: keccak256(toUtf8Bytes('PAUSE_ROLE')),
  DEFAULT_ADMIN_ROLE: ethers.constants.HashZero,
};

describe('USDM', () => {
  const name = 'Mountain Protocol USD';
  const symbol = 'USDM';
  const totalShares = parseUnits('1337');

  // We define a fixture to reuse the same setup in every test.
  // We use loadFixture to run this setup once, snapshot that state,
  // and reset Hardhat Network to that snapshopt in every test.
  const deployUSDMFixture = async () => {
    // Contracts are deployed using the first signer/account by default
    const [owner, acc1, acc2] = await ethers.getSigners();

    const USDM = await ethers.getContractFactory('USDM');
    const contract = await upgrades.deployProxy(USDM, [name, symbol, totalShares, owner.address], { initializer: 'initialize' });

    return { contract, owner, acc1, acc2 };
  };

  describe('Deployment', () => {
    it('has a name', async () => {
      const { contract } = await loadFixture(deployUSDMFixture);

      expect(await contract.name()).to.equal(name);
    });

    it('has a symbol', async () => {
      const { contract } = await loadFixture(deployUSDMFixture);

      expect(await contract.symbol()).to.equal(symbol);
    });

    it('has 18 decimals', async () => {
      const { contract } = await loadFixture(deployUSDMFixture);

      expect(await contract.decimals()).to.be.equal(18);
    });

    it('grants admin role to the address passed', async () => {
      const { contract, owner } = await loadFixture(deployUSDMFixture);

      expect(await contract.hasRole(await contract.DEFAULT_ADMIN_ROLE(), owner.address)).to.equal(true);
    });

    it('returns the total shares', async () => {
      const { contract } = await loadFixture(deployUSDMFixture);

      expect(await contract.totalShares()).to.equal(totalShares);
    });

    it('returns the total supply', async () => {
      const { contract } = await loadFixture(deployUSDMFixture);

      // Reward multiplier is not set so totalShares === totalSupply
      expect(await contract.totalSupply()).to.equal(totalShares);
    });

    it('assigns the initial total shares to deployer', async () => {
      const { contract, owner } = await loadFixture(deployUSDMFixture);

      expect(await contract.sharesOf(owner.address)).to.equal(totalShares);
    });

    it('assigns the initial balance to the deployer', async () => {
      const { contract, owner } = await loadFixture(deployUSDMFixture);

      expect(await contract.balanceOf(owner.address)).to.equal(totalShares);
    });

    it('sets initial reward multiplier to 100%', async () => {
      const { contract } = await loadFixture(deployUSDMFixture);

      expect(await contract.rewardMultiplier()).to.equal(parseUnits('1')); // 1 equals to 100%
    });

    it('fails if initialize is called again after initialization', async () => {
      const { contract, owner } = await loadFixture(deployUSDMFixture);

      await expect(contract.initialize(name, symbol, totalShares, owner.address)).to.be.revertedWith(
        'Initializable: contract is already initialized',
      );
    });
  });

  describe('Transfer', () => {
    it('transfers tokens from one account to another', async () => {
      const { contract, owner, acc1, acc2 } = await loadFixture(deployUSDMFixture);
      const amount = parseUnits('10');

      await expect(contract.transfer(acc1.address, amount)).to.changeTokenBalances(
        contract,
        [owner, acc1],
        [amount.mul(-1), amount],
      );

      const amount2 = parseUnits('5');

      await expect(contract.connect(acc1).transfer(acc2.address, amount2)).to.changeTokenBalances(
        contract,
        [acc1, acc2],
        [amount2.mul(-1), amount2],
      );
    });

    it('reverts when transfer amount exceeds balance', async () => {
      const { contract, owner, acc1 } = await loadFixture(deployUSDMFixture);

      const balance = await contract.balanceOf(owner.address);

      await expect(contract.transfer(acc1.address, balance.add(1)))
        .to.be.revertedWithCustomError(contract, 'ERC20InsufficientBalance')
        .withArgs(owner.address, balance, balance.add(1));
    });

    it('emits a transfer events', async () => {
      const { contract, owner, acc1 } = await loadFixture(deployUSDMFixture);

      const to = acc1.address;
      const amount = parseUnits('1');

      await expect(contract.transfer(to, amount)).to.emit(contract, 'Transfer').withArgs(owner.address, to, amount);
    });

    it('reverts when transfer from the zero address', async () => {
      const { contract, owner } = await loadFixture(deployUSDMFixture);
      const signerZero = await ethers.getImpersonatedSigner(AddressZero);

      // Fund the zero address to pay for the transaction
      await owner.sendTransaction({
        to: signerZero.address,
        value: parseUnits('1'), // Send 1 ETH
      });

      await expect(contract.connect(signerZero).transfer(signerZero.address, 1))
        .to.be.revertedWithCustomError(contract, 'ERC20InvalidSender')
        .withArgs(AddressZero);
    });

    it('reverts when transfer to the zero address', async () => {
      const { contract } = await loadFixture(deployUSDMFixture);

      const amount = parseUnits('1');

      await expect(contract.transfer(AddressZero, amount))
        .to.be.revertedWithCustomError(contract, 'ERC20InvalidReceiver')
        .withArgs(AddressZero);
    });

    it('takes tokens amount as argument but transfers shares', async () => {
      const { contract, owner, acc1 } = await loadFixture(deployUSDMFixture);
      const amount = parseUnits('100');
      const rewardMultiplier = parseUnits('1.0001'); // 1bps
      const sharesBeforeTransfer = await contract.sharesOf(owner.address);
      const sharesAmount = amount.mul(parseUnits('1')).div(rewardMultiplier);

      await contract.grantRole(roles.ORACLE, owner.address);
      await contract.setRewardMultiplier(rewardMultiplier);
      await contract.transfer(acc1.address, amount);

      expect(await contract.sharesOf(acc1.address)).to.equal(sharesAmount);
      expect(await contract.sharesOf(owner.address)).to.equal(sharesBeforeTransfer.sub(sharesAmount));
    });
  });

  describe('Access Control', () => {
    it('does not mint without minter role', async () => {
      const { contract, acc1 } = await loadFixture(deployUSDMFixture);

      await expect(contract.connect(acc1).mint(acc1.address, 1000)).to.be.revertedWith(
        `AccessControl: account ${acc1.address.toLowerCase()} is missing role ${roles.MINTER}`,
      );
    });

    it('mints with minter role', async () => {
      const { contract, acc1 } = await loadFixture(deployUSDMFixture);

      await contract.grantRole(roles.MINTER, acc1.address);

      await expect(contract.connect(acc1).mint(acc1.address, 100)).to.not.be.revertedWith(
        `AccessControl: account ${acc1.address.toLowerCase()} is missing role ${roles.MINTER}`,
      );
    });

    it('does not burn without burner role', async () => {
      const { contract, acc1 } = await loadFixture(deployUSDMFixture);

      await expect(contract.connect(acc1).burn(acc1.address, 1000)).to.be.revertedWith(
        `AccessControl: account ${acc1.address.toLowerCase()} is missing role ${roles.BURNER}`,
      );
    });

    it('burns with burner role', async () => {
      const { contract, owner } = await loadFixture(deployUSDMFixture);

      await contract.grantRole(roles.BURNER, owner.address);

      await expect(contract.burn(owner.address, 1)).to.not.be.revertedWith(
        `AccessControl: account ${owner.address.toLowerCase()} is missing role ${roles.BURNER}`,
      );
    });

    it('does not set the reward multiplier without admin role', async () => {
      const { contract, acc1 } = await loadFixture(deployUSDMFixture);

      await expect(contract.connect(acc1).setRewardMultiplier(1)).to.be.revertedWith(
        `AccessControl: account ${acc1.address.toLowerCase()} is missing role ${roles.DEFAULT_ADMIN_ROLE}`,
      );
    });

    it('updates the reward multiplier with oracle role', async () => {
      const { contract, owner } = await loadFixture(deployUSDMFixture);

      await contract.grantRole(roles.ORACLE, owner.address);

      await expect(contract.setRewardMultiplier(1)).to.not.be.revertedWith(
        `AccessControl: account ${owner.address.toLowerCase()} is missing role ${roles.ORACLE}`,
      );
    });

    it('does not add a reward multiplier without oracle role', async () => {
      const { contract, owner } = await loadFixture(deployUSDMFixture);

      await expect(contract.addRewardMultiplier(1)).to.be.revertedWith(
        `AccessControl: account ${owner.address.toLowerCase()} is missing role ${roles.ORACLE}`,
      );
    });

    it('adds a reward multiplier with oracle role', async () => {
      const { contract, owner } = await loadFixture(deployUSDMFixture);

      await contract.grantRole(roles.ORACLE, owner.address);

      await expect(contract.addRewardMultiplier(1)).to.not.be.revertedWith(
        `AccessControl: account ${owner.address.toLowerCase()} is missing role ${roles.ORACLE}`,
      );
    });

    it('does not block without blocklist role', async () => {
      const { contract, owner } = await loadFixture(deployUSDMFixture);

      await expect(contract.blockAccounts([owner.address])).to.be.revertedWith(
        `AccessControl: account ${owner.address.toLowerCase()} is missing role ${roles.BLOCKLIST}`,
      );
    });

    it('blocks with blocklist role', async () => {
      const { contract, owner } = await loadFixture(deployUSDMFixture);

      await contract.grantRole(roles.BLOCKLIST, owner.address);

      await expect(contract.blockAccounts([owner.address])).to.not.be.revertedWith(
        `AccessControl: account ${owner.address.toLowerCase()} is missing role ${roles.BLOCKLIST}`,
      );
    });

    it('does not unblock without blocklist role', async () => {
      const { contract, owner } = await loadFixture(deployUSDMFixture);

      await expect(contract.unblockAccounts([owner.address])).to.be.revertedWith(
        `AccessControl: account ${owner.address.toLowerCase()} is missing role ${roles.BLOCKLIST}`,
      );
    });

    it('unblocks with blocklist role', async () => {
      const { contract, owner } = await loadFixture(deployUSDMFixture);

      await contract.grantRole(roles.BLOCKLIST, owner.address);

      await expect(contract.unblockAccounts([owner.address])).to.not.be.revertedWith(
        `AccessControl: account ${owner.address.toLowerCase()} is missing role ${roles.BLOCKLIST}`,
      );
    });

    it('pauses when pause role', async () => {
      const { contract, owner } = await loadFixture(deployUSDMFixture);

      await contract.grantRole(roles.PAUSE, owner.address);

      await expect(await contract.pause()).to.not.be.revertedWith(
        `AccessControl: account ${owner.address.toLowerCase()} is missing role ${roles.PAUSE}`,
      );
    });

    it('does not pause without pause role', async () => {
      const { contract, acc1 } = await loadFixture(deployUSDMFixture);

      await expect(contract.connect(acc1).pause()).to.be.revertedWith(
        `AccessControl: account ${acc1.address.toLowerCase()} is missing role ${roles.PAUSE}`,
      );
    });

    it('unpauses when pause role', async () => {
      const { contract, owner } = await loadFixture(deployUSDMFixture);

      await contract.grantRole(roles.PAUSE, owner.address);

      await contract.pause();

      await expect(await contract.unpause()).to.not.be.revertedWith(
        `AccessControl: account ${owner.address.toLowerCase()} is missing role ${roles.PAUSE}`,
      );
    });

    it('does not unpause without pause role', async () => {
      const { contract, owner, acc1 } = await loadFixture(deployUSDMFixture);

      await contract.grantRole(roles.PAUSE, owner.address);
      await contract.pause();

      await expect(contract.connect(acc1).unpause()).to.be.revertedWith(
        `AccessControl: account ${acc1.address.toLowerCase()} is missing role ${roles.PAUSE}`,
      );
    });

    it('does not upgrade without upgrade role', async () => {
      const { contract, acc1 } = await loadFixture(deployUSDMFixture);

      await expect(contract.connect(acc1).upgradeTo(AddressZero)).to.be.revertedWith(
        `AccessControl: account ${acc1.address.toLowerCase()} is missing role ${roles.UPGRADE}`,
      );
    });

    it('upgrades with upgrade role', async () => {
      const { contract, acc1 } = await loadFixture(deployUSDMFixture);

      await contract.grantRole(roles.UPGRADE, acc1.address);

      await expect(contract.connect(acc1).upgradeTo(AddressZero)).to.not.be.revertedWith(
        `AccessControl: account ${acc1.address.toLowerCase()} is missing role ${roles.UPGRADE}`,
      );
    });
  });

  describe('Blocklist', () => {
    it('blocks an account', async () => {
      const { contract, owner, acc1 } = await loadFixture(deployUSDMFixture);

      await contract.grantRole(roles.BLOCKLIST, owner.address);
      await contract.blockAccounts([acc1.address]);

      expect(await contract.isBlocked(acc1.address)).to.equal(true);
    });

    it('blocks multiples accounts', async () => {
      const { contract, owner, acc1, acc2 } = await loadFixture(deployUSDMFixture);

      await contract.grantRole(roles.BLOCKLIST, owner.address);
      await contract.blockAccounts([acc1.address, acc2.address]);

      const result = await Promise.all([contract.isBlocked(acc1.address), contract.isBlocked(acc2.address)]);

      expect(result.every(Boolean)).to.equal(true);
    });

    it('unblocks an account', async () => {
      const { contract, owner, acc1 } = await loadFixture(deployUSDMFixture);

      await contract.grantRole(roles.BLOCKLIST, owner.address);
      await contract.blockAccounts([acc1.address]);
      await contract.unblockAccounts([acc1.address]);

      expect(await contract.isBlocked(acc1.address)).to.equal(false);
    });

    it('unblocks multiples accounts', async () => {
      const { contract, owner, acc1, acc2 } = await loadFixture(deployUSDMFixture);

      await contract.grantRole(roles.BLOCKLIST, owner.address);
      await contract.blockAccounts([acc1.address, acc2.address]);
      await contract.unblockAccounts([acc1.address, acc2.address]);

      const result = await Promise.all([contract.isBlocked(acc1.address), contract.isBlocked(acc2.address)]);

      expect(result.every(value => value === false)).to.equal(true);
    });

    it('reverts when transfering from a blocked account', async () => {
      const { contract, owner, acc1 } = await loadFixture(deployUSDMFixture);

      await contract.grantRole(roles.BLOCKLIST, owner.address);
      await contract.blockAccounts([owner.address]);

      await expect(contract.transfer(acc1.address, 1))
        .to.be.revertedWithCustomError(contract, 'USDMBlockedSender')
        .withArgs(owner.address);
    });

    it('allows transfers to blocked accounts', async () => {
      // We only block sender not receiver, so we don't tax every user
      const { contract, owner, acc1 } = await loadFixture(deployUSDMFixture);

      await contract.grantRole(roles.BLOCKLIST, owner.address);
      await contract.blockAccounts([acc1.address]);

      await expect(contract.transfer(acc1.address, 1)).to.not.be.revertedWithCustomError(contract, 'USDMBlockedSender');
    });

    it('reverts when blocking an account already blocked', async () => {
      const { contract, owner, acc1 } = await loadFixture(deployUSDMFixture);

      await contract.grantRole(roles.BLOCKLIST, owner.address);
      await contract.blockAccounts([acc1.address]);

      await expect(contract.blockAccounts([acc1.address]))
        .to.be.revertedWithCustomError(contract, 'USDMInvalidBlockedAccount')
        .withArgs(acc1.address);
    });

    it('reverts when unblocking an account not blocked', async () => {
      const { contract, owner } = await loadFixture(deployUSDMFixture);

      await contract.grantRole(roles.BLOCKLIST, owner.address);

      await expect(contract.unblockAccounts([owner.address]))
        .to.be.revertedWithCustomError(contract, 'USDMInvalidBlockedAccount')
        .withArgs(owner.address);
    });

    it('reverts when blocking a repeated accounts', async () => {
      const { contract, owner, acc1, acc2 } = await loadFixture(deployUSDMFixture);

      await contract.grantRole(roles.BLOCKLIST, owner.address);

      await expect(contract.blockAccounts([acc1.address, acc2.address, acc2.address]))
        .to.be.revertedWithCustomError(contract, 'USDMInvalidBlockedAccount')
        .withArgs(acc2.address);
    });

    it('reverts when unblocking repeated accounts', async () => {
      const { contract, owner, acc1, acc2 } = await loadFixture(deployUSDMFixture);

      await contract.grantRole(roles.BLOCKLIST, owner.address);
      await contract.blockAccounts([acc1.address, acc2.address]);

      await expect(contract.unblockAccounts([acc1.address, acc2.address, acc2.address]))
        .to.be.revertedWithCustomError(contract, 'USDMInvalidBlockedAccount')
        .withArgs(acc2.address);
    });
  });

  describe('Pause', () => {
    it('allows minting when unpaused', async () => {
      const { contract, owner, acc1 } = await loadFixture(deployUSDMFixture);
      const tokensAmount = parseUnits('10');

      await contract.grantRole(roles.MINTER, owner.address);
      await contract.grantRole(roles.PAUSE, owner.address);
      await contract.pause();
      await contract.unpause();

      await expect(contract.mint(acc1.address, tokensAmount)).to.not.be.revertedWithCustomError(
        contract,
        'USDMPausedTransfers',
      );
    });

    it('does not allow minting when paused', async () => {
      const { contract, owner } = await loadFixture(deployUSDMFixture);
      const tokensAmount = parseUnits('10');

      await contract.grantRole(roles.MINTER, owner.address);
      await contract.grantRole(roles.PAUSE, owner.address);
      await contract.pause();

      await expect(contract.mint(owner.address, tokensAmount)).to.be.revertedWithCustomError(
        contract,
        'USDMPausedTransfers',
      );
    });

    it('allows burning when unpaused', async () => {
      const { contract, owner } = await loadFixture(deployUSDMFixture);
      const tokensAmount = parseUnits('10');

      await contract.grantRole(roles.BURNER, owner.address);
      await contract.grantRole(roles.PAUSE, owner.address);
      await contract.pause();
      await contract.unpause();

      await expect(contract.burn(owner.address, tokensAmount)).to.not.be.revertedWithCustomError(
        contract,
        'USDMPausedTransfers',
      );
    });

    it('does not allow burning when paused', async () => {
      const { contract, owner } = await loadFixture(deployUSDMFixture);
      const tokensAmount = parseUnits('10');

      await contract.grantRole(roles.BURNER, owner.address);
      await contract.grantRole(roles.PAUSE, owner.address);
      await contract.pause();

      await expect(contract.burn(owner.address, tokensAmount)).to.be.revertedWithCustomError(
        contract,
        'USDMPausedTransfers',
      );
    });

    it('allows transfers when unpaused', async () => {
      const { contract, owner, acc1 } = await loadFixture(deployUSDMFixture);
      const tokensAmount = parseUnits('10');

      await contract.grantRole(roles.PAUSE, owner.address);
      await contract.pause();
      await contract.unpause();

      await expect(contract.transfer(acc1.address, tokensAmount)).to.not.be.revertedWithCustomError(
        contract,
        'USDMPausedTransfers',
      );
    });

    it('does not allow transfers when paused', async () => {
      const { contract, owner, acc1 } = await loadFixture(deployUSDMFixture);
      const tokensAmount = parseUnits('10');

      await contract.grantRole(roles.PAUSE, owner.address);
      await contract.pause();

      await expect(contract.transfer(acc1.address, tokensAmount)).to.be.revertedWithCustomError(
        contract,
        'USDMPausedTransfers',
      );
    });
  });

  describe('Reward Multiplier', () => {
    // Error should always fall 7 orders of magnitud below than one cent of a dollar (1 GWEI)
    // Inaccuracy stems from using fixed-point arithmetic and Solidity's 18-decimal support
    // resulting in periodic number approximations during divisions
    const expectEqualWithError = (actual: BigNumber, expected: BigNumber, error = '0.000000001') => {
      expect(actual).to.be.closeTo(expected, parseUnits(error));
    };

    it('does not support adding a reward multiplier lower than zero', async () => {
      const { contract, owner } = await loadFixture(deployUSDMFixture);

      await contract.grantRole(roles.ORACLE, owner.address);

      await expect(contract.addRewardMultiplier(0))
        .to.be.revertedWithCustomError(contract, 'USDMInvalidRewardMultiplier')
        .withArgs(0);
    });

    it('adds a reward multiplier and emits event with the new value', async () => {
      const { contract, owner } = await loadFixture(deployUSDMFixture);

      await contract.grantRole(roles.ORACLE, owner.address);

      const rewardMultiplierIncrement = parseUnits('0.0001');
      const rewardMultiplier = await contract.rewardMultiplier();
      const expected = rewardMultiplier.add(rewardMultiplierIncrement);

      await expect(contract.addRewardMultiplier(rewardMultiplierIncrement))
        .to.emit(contract, 'RewardMultiplier')
        .withArgs(expected);

      expect(await contract.rewardMultiplier()).to.equal(expected);
    });

    it('sets the reward multiplier', async () => {
      const { contract, owner } = await loadFixture(deployUSDMFixture);

      await contract.grantRole(roles.ORACLE, owner.address);

      const rewardMultiplier = parseUnits('1.0001');

      await expect(contract.setRewardMultiplier(rewardMultiplier))
        .to.emit(contract, 'RewardMultiplier')
        .withArgs(rewardMultiplier);

      expect(await contract.rewardMultiplier()).to.equal(rewardMultiplier);
    });

    it('does not support setting a reward multiplier below one', async () => {
      const { contract, owner } = await loadFixture(deployUSDMFixture);

      await contract.grantRole(roles.ORACLE, owner.address);

      const rewardMultiplier = parseUnits('0.99999'); // 1 equals to 100%

      await expect(contract.setRewardMultiplier(rewardMultiplier))
        .to.be.revertedWithCustomError(contract, 'USDMInvalidRewardMultiplier')
        .withArgs(rewardMultiplier);
    });

    it('updates the total supply according to the new reward multiplier', async () => {
      const { contract, owner } = await loadFixture(deployUSDMFixture);
      const rewardMultiplier = parseUnits('1.0001');

      await contract.grantRole(roles.ORACLE, owner.address);

      expect(await contract.totalSupply()).to.equal(totalShares);

      await contract.setRewardMultiplier(rewardMultiplier);

      const expected = totalShares.mul(rewardMultiplier).div(parseUnits('1'));

      expect(await contract.totalSupply()).to.equal(expected);
    });

    it('mints by tokens amount not by shares', async () => {
      const { contract, owner, acc1 } = await loadFixture(deployUSDMFixture);
      const rewardMultiplierIncrement = parseUnits('0.0004'); // 4bps

      await contract.grantRole(roles.ORACLE, owner.address);
      await contract.grantRole(roles.MINTER, owner.address);

      const amount = parseUnits('1000'); // 1k USDM

      await contract.mint(acc1.address, amount); // Mint 1k
      await contract.addRewardMultiplier(rewardMultiplierIncrement);

      const expected = amount.mul(rewardMultiplierIncrement).div(parseUnits('1')).add(amount);

      expectEqualWithError(await contract.balanceOf(acc1.address), expected);
    });

    it('mints accurately over an extended period', async () => {
      const { contract, owner, acc1 } = await loadFixture(deployUSDMFixture);

      await contract.grantRole(roles.ORACLE, owner.address);
      await contract.grantRole(roles.MINTER, owner.address);

      // Absurd worst case scenario is used to test the decimal accuracy of the contract
      // Mint 1 USDM and set 4bps as reward multiplier everyday for 5 years
      const rewardMultiplierIncrement = parseUnits('0.001'); // 10bps
      const amount = parseUnits('1'); // 1 USDM
      const DAYS_IN_FIVE_YEARS = 365 * 5; // 5 years

      for (let i = 0; i < DAYS_IN_FIVE_YEARS; i++) {
        await contract.mint(acc1.address, amount); // Mint 1 USDM
        await contract.addRewardMultiplier(rewardMultiplierIncrement);
      }

      // Expected is calculated as follows:
      let expected = BigNumber.from(0);
      let rewardMultiplier = parseUnits('1');

      for (let i = 0; i < DAYS_IN_FIVE_YEARS; i++) {
        const prevRewardMultiplier = rewardMultiplier;
        const newRewardMultiplier = rewardMultiplier.add(rewardMultiplierIncrement);

        expected = expected.add(amount).mul(newRewardMultiplier).div(prevRewardMultiplier);
        rewardMultiplier = newRewardMultiplier;
      }

      expectEqualWithError(await contract.balanceOf(acc1.address), expected);
    });
  });

  describe('Balance', () => {
    it('returns the amount of tokens, not shares', async () => {
      const { contract, owner, acc1 } = await loadFixture(deployUSDMFixture);
      const tokensAmount = parseUnits('10');
      const rewardMultiplier = parseUnits('1.0001');

      await contract.grantRole(roles.MINTER, owner.address);
      await contract.grantRole(roles.ORACLE, owner.address);
      await contract.mint(acc1.address, tokensAmount);
      await contract.setRewardMultiplier(rewardMultiplier);

      expect(await contract.balanceOf(acc1.address)).to.equal(tokensAmount.mul(rewardMultiplier).div(parseUnits('1')));
    });
  });

  describe('Shares', () => {
    it('has zero balance and shares for new accounts', async () => {
      const { contract, acc1 } = await loadFixture(deployUSDMFixture);

      expect(await contract.balanceOf(acc1.address)).to.equal(0);
      expect(await contract.sharesOf(acc1.address)).to.equal(0);
    });

    it('does not change amount of shares when updating the reward multiplier', async () => {
      const { contract, owner, acc1 } = await loadFixture(deployUSDMFixture);

      const sharesAmount = parseUnits('1');

      await contract.grantRole(roles.MINTER, owner.address);
      await contract.grantRole(roles.ORACLE, owner.address);
      await contract.mint(acc1.address, sharesAmount);

      await contract.setRewardMultiplier(parseUnits('1.0001'));

      expect(await contract.sharesOf(acc1.address)).to.equal(sharesAmount);
    });

    it('returns the amount of shares based on tokens', async () => {
      const { contract, owner } = await loadFixture(deployUSDMFixture);
      const amount = parseUnits('14');
      const rewardMultiplier = parseUnits('1.0001');

      await contract.grantRole(roles.ORACLE, owner.address);
      await contract.setRewardMultiplier(rewardMultiplier);

      expect(await contract.convertToShares(amount)).to.equal(
        // We use fixed-point arithmetic to avoid precision issues
        amount.mul(parseUnits('1')).div(rewardMultiplier),
      );
    });

    it('returns the amount of tokens based on shares', async () => {
      const { contract, owner } = await loadFixture(deployUSDMFixture);
      const shares = parseUnits('14');
      const rewardMultiplier = parseUnits('1.0001');

      await contract.grantRole(roles.ORACLE, owner.address);
      await contract.setRewardMultiplier(rewardMultiplier);

      expect(await contract.convertToTokens(shares)).to.equal(
        // We use fixed-point arithmetic to avoid precision issues
        shares.mul(rewardMultiplier).div(parseUnits('1')),
      );
    });
  });

  describe('Mint', () => {
    it('increments total shares', async () => {
      const { contract, owner } = await loadFixture(deployUSDMFixture);

      await contract.grantRole(roles.MINTER, owner.address);

      const totalShares = await contract.totalShares();
      const amount = parseUnits('1');

      await contract.mint(owner.address, amount);

      expect(await contract.totalShares()).to.equal(totalShares.add(amount));
    });

    it('increments total supply', async () => {
      const { contract, owner } = await loadFixture(deployUSDMFixture);

      await contract.grantRole(roles.MINTER, owner.address);

      const totalSupply = await contract.totalSupply();
      const amount = parseUnits('1');

      await contract.mint(owner.address, amount);

      expect(await contract.totalSupply()).to.equal(totalSupply.add(amount));
    });

    it('emits a transfer event', async () => {
      const { contract, owner } = await loadFixture(deployUSDMFixture);

      await contract.grantRole(roles.MINTER, owner.address);

      const amount = parseUnits('1');

      await expect(contract.mint(owner.address, amount))
        .to.emit(contract, 'Transfer')
        .withArgs(AddressZero, owner.address, amount);
    });

    it('emits a transfer event with amount of tokens not shares', async () => {
      const { contract, owner } = await loadFixture(deployUSDMFixture);

      await contract.grantRole(roles.MINTER, owner.address);
      await contract.grantRole(roles.ORACLE, owner.address);

      const amount = parseUnits('1000');

      await contract.addRewardMultiplier(parseUnits('0.0001')); // 1bps

      await expect(contract.mint(owner.address, amount))
        .to.emit(contract, 'Transfer')
        .withArgs(AddressZero, owner.address, amount);
    });

    it('mints shares to correct address', async () => {
      const { contract, owner, acc1 } = await loadFixture(deployUSDMFixture);

      await contract.grantRole(roles.MINTER, owner.address);

      const amount = parseUnits('1');

      await contract.mint(acc1.address, amount);

      expect(await contract.sharesOf(acc1.address)).to.equal(amount);
    });

    it('does not allow minting to null address', async () => {
      const { contract, owner } = await loadFixture(deployUSDMFixture);

      await contract.grantRole(roles.MINTER, owner.address);

      const amount = parseUnits('1');

      await expect(contract.mint(AddressZero, amount))
        .to.be.revertedWithCustomError(contract, 'USDMInvalidMintReceiver')
        .withArgs(AddressZero);
    });
  });

  describe('Burn', () => {
    it('decrements account shares', async () => {
      const { contract, owner } = await loadFixture(deployUSDMFixture);

      await contract.grantRole(roles.BURNER, owner.address);

      const accountShares = await contract.sharesOf(owner.address);
      const burnAmount = 1;

      await contract.burn(owner.address, burnAmount);

      expect(await contract.sharesOf(owner.address)).to.equal(accountShares.sub(burnAmount));
    });

    it('decrements total shares quantity', async () => {
      const { contract, owner } = await loadFixture(deployUSDMFixture);

      await contract.grantRole(roles.BURNER, owner.address);

      const totalShares = await contract.totalShares();
      const amount = 1;

      await contract.burn(owner.address, amount);

      expect(await contract.totalShares()).to.equal(totalShares.sub(amount));
    });

    it('does not allow burning from null address', async () => {
      const { contract, owner } = await loadFixture(deployUSDMFixture);

      await contract.grantRole(roles.BURNER, owner.address);

      await expect(contract.burn(AddressZero, 1))
        .to.be.revertedWithCustomError(contract, 'USDMInvalidBurnSender')
        .withArgs(AddressZero);
    });

    it('does not allow burning when amount exceeds balance', async () => {
      const { contract, owner } = await loadFixture(deployUSDMFixture);

      await contract.grantRole(roles.BURNER, owner.address);
      const balance = await contract.balanceOf(owner.address);

      await expect(contract.burn(owner.address, balance.add(1)))
        .to.be.revertedWithCustomError(contract, 'USDMInsufficientBurnBalance')
        .withArgs(owner.address, balance, balance.add(1));
    });

    it('emits a transfer events', async () => {
      const { contract, owner } = await loadFixture(deployUSDMFixture);
      const amount = 1;

      await contract.grantRole(roles.BURNER, owner.address);
      await contract.burn(owner.address, amount);

      await expect(contract.burn(owner.address, amount))
        .to.emit(contract, 'Transfer')
        .withArgs(owner.address, AddressZero, amount);
    });

    it('emits a transfer event with amount of tokens not shares', async () => {
      const { contract, owner } = await loadFixture(deployUSDMFixture);

      await contract.grantRole(roles.BURNER, owner.address);
      await contract.grantRole(roles.ORACLE, owner.address);

      const amount = parseUnits('1000');

      await contract.addRewardMultiplier(parseUnits('0.0001')); // 1bps

      await expect(contract.burn(owner.address, amount))
        .to.emit(contract, 'Transfer')
        .withArgs(owner.address, AddressZero, amount);
    });
  });

  describe('Approve', () => {
    it('reverts when owner is the zero address', async () => {
      const { contract, owner } = await loadFixture(deployUSDMFixture);
      const signerZero = await ethers.getImpersonatedSigner(AddressZero);

      // Fund the zero address to pay for the transaction
      await owner.sendTransaction({
        to: signerZero.address,
        value: parseUnits('1'), // Send 1 ETH
      });

      await expect(contract.connect(signerZero).approve(AddressZero, 1))
        .to.revertedWithCustomError(contract, 'ERC20InvalidApprover')
        .withArgs(AddressZero);
    });

    it('reverts when spender is the zero address', async () => {
      const { contract } = await loadFixture(deployUSDMFixture);

      await expect(contract.approve(AddressZero, 1))
        .to.revertedWithCustomError(contract, 'ERC20InvalidSpender')
        .withArgs(AddressZero);
    });

    it('emits an approval event', async () => {
      const { contract, owner, acc1 } = await loadFixture(deployUSDMFixture);
      const amount = 1;

      await expect(contract.approve(acc1.address, amount))
        .to.emit(contract, 'Approval')
        .withArgs(owner.address, acc1.address, amount);
    });

    it('approves the request amount', async () => {
      const { contract, owner, acc1 } = await loadFixture(deployUSDMFixture);
      const amount = 1;

      await contract.approve(acc1.address, amount);

      expect(await contract.allowance(owner.address, acc1.address)).to.equal(amount);
    });

    it('approves the request amount and replace the previous one', async () => {
      const { contract, owner, acc1 } = await loadFixture(deployUSDMFixture);
      const amount = 1;

      await contract.approve(acc1.address, amount + 1);
      await contract.approve(acc1.address, amount);

      expect(await contract.allowance(owner.address, acc1.address)).to.equal(amount);
    });
  });

  describe('Increase Allowance', () => {
    it('approves the requested amount', async () => {
      const { contract, owner, acc1 } = await loadFixture(deployUSDMFixture);
      const amount = 1;

      await contract.increaseAllowance(acc1.address, amount);

      await expect(await contract.allowance(owner.address, acc1.address)).to.equal(amount);
    });

    it('increases the spender allowance adding the requested amount', async () => {
      const { contract, owner, acc1 } = await loadFixture(deployUSDMFixture);
      const amount = 1;

      await contract.approve(acc1.address, amount);
      await contract.increaseAllowance(acc1.address, amount);

      await expect(await contract.allowance(owner.address, acc1.address)).to.equal(amount * 2);
    });

    it('emits an approval event', async () => {
      const { contract, owner, acc1 } = await loadFixture(deployUSDMFixture);
      const amount = 1;

      await expect(await contract.increaseAllowance(acc1.address, amount))
        .to.emit(contract, 'Approval')
        .withArgs(owner.address, acc1.address, amount);
    });

    it('reverts when spender is the zero address', async () => {
      const { contract } = await loadFixture(deployUSDMFixture);
      const amount = 1;

      await expect(contract.increaseAllowance(AddressZero, amount))
        .to.be.revertedWithCustomError(contract, 'ERC20InvalidSpender')
        .withArgs(AddressZero);
    });
  });

  describe('Decrease Allowance', () => {
    it('reverts when there was no approved amount before decreasing', async () => {
      const { contract, acc1 } = await loadFixture(deployUSDMFixture);

      await expect(contract.decreaseAllowance(acc1.address, 1))
        .to.be.revertedWithCustomError(contract, 'ERC20InsufficientAllowance')
        .withArgs(acc1.address, 0, 1);
    });

    it('decreases the spender allowance substracting the requested amount', async () => {
      const { contract, owner, acc1 } = await loadFixture(deployUSDMFixture);
      const spender = acc1.address;
      const amount = 2;
      const subtractedAmount = 1;

      await contract.approve(spender, amount);
      await contract.decreaseAllowance(spender, subtractedAmount);

      expect(await contract.allowance(owner.address, spender)).to.be.equal(amount - subtractedAmount);
    });

    it('sets allowance to zero when all allowance is removed', async () => {
      const { contract, owner, acc1 } = await loadFixture(deployUSDMFixture);
      const spender = acc1.address;
      const amount = 1;
      const subtractedAmount = 1;

      await contract.approve(spender, amount);
      await contract.decreaseAllowance(spender, subtractedAmount);

      expect(await contract.allowance(owner.address, spender)).to.be.equal(0);
    });

    it('reverts when more than the allowance is substracted', async () => {
      const { contract, acc1 } = await loadFixture(deployUSDMFixture);
      const spender = acc1.address;
      const amount = 1;

      await contract.approve(spender, amount);

      await expect(contract.decreaseAllowance(spender, amount + 1))
        .to.be.revertedWithCustomError(contract, 'ERC20InsufficientAllowance')
        .withArgs(spender, amount, amount + 1);
    });

    it('emits an approval event', async () => {
      const { contract, owner, acc1 } = await loadFixture(deployUSDMFixture);
      const spender = acc1.address;
      const amount = 2;
      const subtractedAmount = 1;

      await contract.approve(spender, amount);

      await expect(await contract.decreaseAllowance(spender, subtractedAmount))
        .to.emit(contract, 'Approval')
        .withArgs(owner.address, spender, amount - subtractedAmount);
    });
  });

  describe('Transfer From', () => {
    it('does not update allowance amount in case of infinite allowance', async () => {
      const { contract, owner, acc1 } = await loadFixture(deployUSDMFixture);
      const from = owner.address;
      const to = acc1.address;

      await contract.approve(to, MaxUint256);

      await expect(contract.connect(acc1).transferFrom(from, to, 1)).to.not.emit(contract, 'Approval');

      expect(await contract.allowance(from, to)).to.be.equal(MaxUint256);
    });

    it('transfers the requested amount when has enough allowance', async () => {
      const { contract, owner, acc1 } = await loadFixture(deployUSDMFixture);
      const from = owner.address;
      const to = acc1.address;
      const amount = 1;

      await contract.approve(to, amount);

      await expect(contract.connect(acc1).transferFrom(from, to, amount)).to.changeTokenBalances(
        contract,
        [from, to],
        [-amount, amount],
      );
    });

    it('decreses the spender allowance', async () => {
      const { contract, owner, acc1 } = await loadFixture(deployUSDMFixture);
      const from = owner.address;
      const to = acc1.address;

      await contract.approve(to, 2);
      await contract.connect(acc1).transferFrom(from, to, 1);

      expect(await contract.allowance(from, to)).to.be.equal(1);
    });

    it('reverts when insufficient allowance', async () => {
      const { contract, owner, acc1 } = await loadFixture(deployUSDMFixture);
      const from = owner.address;
      const to = acc1.address;
      const amount = 1;

      await contract.approve(to, amount);

      await expect(contract.connect(acc1).transferFrom(from, to, amount + 1))
        .to.be.revertedWithCustomError(contract, 'ERC20InsufficientAllowance')
        .withArgs(to, amount, amount + 1);
    });

    it('emits a transfer event', async () => {
      const { contract, owner, acc1 } = await loadFixture(deployUSDMFixture);
      const from = owner.address;
      const to = acc1.address;
      const amount = 1;

      await contract.approve(to, amount);

      await expect(contract.connect(acc1).transferFrom(from, to, amount))
        .to.emit(contract, 'Transfer')
        .withArgs(from, to, amount);
    });

    it('emits an approval event', async () => {
      const { contract, owner, acc1 } = await loadFixture(deployUSDMFixture);
      const from = owner.address;
      const to = acc1.address;
      const amount = 1;

      await contract.approve(to, amount);

      await expect(contract.connect(acc1).transferFrom(from, to, amount))
        .to.emit(contract, 'Approval')
        .withArgs(from, to, amount - 1);
    });

    it('reverts when enough allowance but not have enough balance', async () => {
      const { contract, owner, acc1 } = await loadFixture(deployUSDMFixture);
      const from = owner.address;
      const to = acc1.address;
      const amount = await contract.balanceOf(from);

      await contract.approve(to, amount.add(1));

      await expect(contract.connect(acc1).transferFrom(from, to, amount.add(1)))
        .to.be.revertedWithCustomError(contract, 'ERC20InsufficientBalance')
        .withArgs(from, amount, amount.add(1));
    });

    it('decreases allowance by amount of tokens, not by shares', async () => {
      const { contract, owner, acc1 } = await loadFixture(deployUSDMFixture);
      const from = owner.address;
      const to = acc1.address;
      const amount = parseUnits('1');

      await contract.grantRole(roles.ORACLE, owner.address);
      await contract.addRewardMultiplier(parseUnits('0.0004')); // 4bps
      await contract.approve(to, amount);
      await contract.connect(acc1).transferFrom(from, to, amount);

      expect(await contract.allowance(from, to)).to.equal(0);
    });
  });

  describe('Permit', () => {
    const buildData = async (
      contract: Contract,
      owner: SignerWithAddress,
      spender: SignerWithAddress,
      value: number,
      nonce: number,
      deadline: number | BigNumber,
    ) => {
      const domain = {
        name: await contract.name(),
        version: '1',
        chainId: (await contract.provider.getNetwork()).chainId,
        verifyingContract: contract.address,
      };

      const types = {
        Permit: [
          { name: 'owner', type: 'address' },
          { name: 'spender', type: 'address' },
          { name: 'value', type: 'uint256' },
          { name: 'nonce', type: 'uint256' },
          { name: 'deadline', type: 'uint256' },
        ],
      };

      const message: Message = {
        owner: owner.address,
        spender: spender.address,
        value,
        nonce,
        deadline,
      };

      return { domain, types, message };
    };

    interface Message {
      owner: string;
      spender: string;
      value: number;
      nonce: number;
      deadline: number | BigNumber;
    }

    const signTypedData = async (
      signer: SignerWithAddress,
      domain: TypedDataDomain,
      types: Record<string, Array<TypedDataField>>,
      message: Message,
    ) => {
      const signature = await signer._signTypedData(domain, types, message);

      return splitSignature(signature);
    };

    it('initializes nonce at 0', async () => {
      const { contract, acc1 } = await loadFixture(deployUSDMFixture);
      expect(await contract.nonces(acc1.address)).to.equal(0);
    });

    it('returns the correct domain separator', async () => {
      const { contract } = await loadFixture(deployUSDMFixture);
      const chainId = (await contract.provider.getNetwork()).chainId;

      const expected = keccak256(
        defaultAbiCoder.encode(
          ['bytes32', 'bytes32', 'bytes32', 'uint256', 'address'],
          [
            id('EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)'),
            id(await contract.name()),
            id('1'),
            chainId,
            contract.address,
          ],
        ),
      );
      expect(await contract.DOMAIN_SEPARATOR()).to.equal(expected);
    });

    it('accepts owner signature', async () => {
      const { contract, owner, acc1: spender } = await loadFixture(deployUSDMFixture);
      const value = 100;
      const nonce = await contract.nonces(owner.address);
      const deadline = MaxUint256;

      const { domain, types, message } = await buildData(contract, owner, spender, value, nonce, deadline);
      const { v, r, s } = await signTypedData(owner, domain, types, message);

      await expect(contract.permit(owner.address, spender.address, value, deadline, v, r, s))
        .to.emit(contract, 'Approval')
        .withArgs(owner.address, spender.address, value);
      expect(await contract.nonces(owner.address)).to.equal(1);
      expect(await contract.allowance(owner.address, spender.address)).to.equal(value);
    });

    it('reverts reused signature', async () => {
      const { contract, owner, acc1: spender } = await loadFixture(deployUSDMFixture);
      const value = 100;
      const nonce = await contract.nonces(owner.address);
      const deadline = MaxUint256;

      const { domain, types, message } = await buildData(contract, owner, spender, value, nonce, deadline);
      const { v, r, s } = await signTypedData(owner, domain, types, message);

      await contract.permit(owner.address, spender.address, value, deadline, v, r, s);

      await expect(contract.permit(owner.address, spender.address, value, deadline, v, r, s))
        .to.be.revertedWithCustomError(contract, 'ERC2612InvalidSignature')
        .withArgs(owner.address, spender.address);
    });

    it('reverts other signature', async () => {
      const { contract, owner, acc1: spender, acc2: otherAcc } = await loadFixture(deployUSDMFixture);
      const value = 100;
      const nonce = await contract.nonces(owner.address);
      const deadline = MaxUint256;

      const { domain, types, message } = await buildData(contract, owner, spender, value, nonce, deadline);
      const { v, r, s } = await signTypedData(otherAcc, domain, types, message);

      await expect(contract.permit(owner.address, spender.address, value, deadline, v, r, s))
        .to.be.revertedWithCustomError(contract, 'ERC2612InvalidSignature')
        .withArgs(owner.address, spender.address);
    });

    it('reverts expired permit', async () => {
      const { contract, owner, acc1: spender } = await loadFixture(deployUSDMFixture);
      const value = 100;
      const nonce = await contract.nonces(owner.address);
      const deadline = await time.latest();

      // Advance time by one hour and mine a new block
      await time.increase(3600);

      // Set the timestamp of the next block but don't mine a new block
      // New block timestamp needs larger than current, so we need to add 1
      const blockTimestamp = (await time.latest()) + 1;
      await time.setNextBlockTimestamp(blockTimestamp);

      const { domain, types, message } = await buildData(contract, owner, spender, value, nonce, deadline);
      const { v, r, s } = await signTypedData(owner, domain, types, message);

      await expect(contract.permit(owner.address, spender.address, value, deadline, v, r, s))
        .to.be.revertedWithCustomError(contract, 'ERC2612ExpiredDeadline')
        .withArgs(deadline, blockTimestamp);
    });
  });
});
