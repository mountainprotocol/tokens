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

describe('wUSDM', () => {
  const name = 'Wrapped Mountain Protocol USD';
  const symbol = 'wUSDM';
  const totalUSDMShares = parseUnits('1337');

  // We define a fixture to reuse the same setup in every test.
  // We use loadFixture to run this setup once, snapshot that state,
  // and reset Hardhat Network to that snapshopt in every test.
  const deployFixture = async () => {
    // Contracts are deployed using the first signer/account by default
    const [owner, acc1, acc2] = await ethers.getSigners();

    const USDM = await ethers.getContractFactory('USDM');
    const USDMContract = await upgrades.deployProxy(USDM, ['USDM-n', 'USDM-s', owner.address], {
      initializer: 'initialize',
    });

    await USDMContract.grantRole(roles.MINTER, owner.address);
    await USDMContract.grantRole(roles.ORACLE, owner.address);
    await USDMContract.grantRole(roles.PAUSE, owner.address);
    await USDMContract.grantRole(roles.BLOCKLIST, owner.address);
    await USDMContract.mint(owner.address, totalUSDMShares);

    const wUSDM = await ethers.getContractFactory('wUSDM');
    const wUSDMContract = await upgrades.deployProxy(wUSDM, [USDMContract.address, owner.address], {
      initializer: 'initialize',
    });

    await wUSDMContract.grantRole(roles.PAUSE, owner.address);
    await wUSDMContract.grantRole(roles.UPGRADE, owner.address);

    return { wUSDMContract, USDMContract, owner, acc1, acc2 };
  };

  describe('Deployment', () => {
    it('has a name', async () => {
      const { wUSDMContract } = await loadFixture(deployFixture);

      expect(await wUSDMContract.name()).to.equal(name);
    });

    it('has a symbol', async () => {
      const { wUSDMContract } = await loadFixture(deployFixture);

      expect(await wUSDMContract.symbol()).to.equal(symbol);
    });

    it('has an asset', async () => {
      const { wUSDMContract, USDMContract } = await loadFixture(deployFixture);

      expect(await wUSDMContract.asset()).to.equal(USDMContract.address);
    });

    it('has a totalAssets', async () => {
      const { wUSDMContract } = await loadFixture(deployFixture);

      expect(await wUSDMContract.totalAssets()).to.equal(0);
    });

    it('has a maxDeposit', async () => {
      const { wUSDMContract, acc1 } = await loadFixture(deployFixture);

      expect(await wUSDMContract.maxDeposit(acc1.address)).to.equal(MaxUint256);
    });

    it('has a maxMint', async () => {
      const { wUSDMContract, acc1 } = await loadFixture(deployFixture);

      expect(await wUSDMContract.maxMint(acc1.address)).to.equal(MaxUint256);
    });

    it('has 18 decimals', async () => {
      const { wUSDMContract } = await loadFixture(deployFixture);

      expect(await wUSDMContract.decimals()).to.be.equal(18);
    });

    it('grants admin role to the address passed to the initializer', async () => {
      const { wUSDMContract, owner } = await loadFixture(deployFixture);

      expect(await wUSDMContract.hasRole(await wUSDMContract.DEFAULT_ADMIN_ROLE(), owner.address)).to.equal(true);
    });

    it('fails if initialize is called again after initialization', async () => {
      const { wUSDMContract, USDMContract, owner } = await loadFixture(deployFixture);

      await expect(wUSDMContract.initialize(USDMContract.address, owner.address)).to.be.revertedWith(
        'Initializable: contract is already initialized',
      );
    });
  });

  describe('Access control', () => {
    it('pauses when pause role', async () => {
      const { wUSDMContract, owner } = await loadFixture(deployFixture);

      await expect(await wUSDMContract.pause()).to.not.be.revertedWith(
        `AccessControl: account ${owner.address.toLowerCase()} is missing role ${roles.PAUSE}`,
      );
    });

    it('does not pause without pause role', async () => {
      const { wUSDMContract, acc1 } = await loadFixture(deployFixture);

      await expect(wUSDMContract.connect(acc1).pause()).to.be.revertedWith(
        `AccessControl: account ${acc1.address.toLowerCase()} is missing role ${roles.PAUSE}`,
      );
    });

    it('unpauses when pause role', async () => {
      const { wUSDMContract, owner } = await loadFixture(deployFixture);

      await wUSDMContract.connect(owner).pause();

      await expect(await wUSDMContract.unpause()).to.not.be.revertedWith(
        `AccessControl: account ${owner.address.toLowerCase()} is missing role ${roles.PAUSE}`,
      );
    });

    it('does not unpause without pause role', async () => {
      const { wUSDMContract, owner, acc1 } = await loadFixture(deployFixture);

      await wUSDMContract.connect(owner).pause();

      await expect(wUSDMContract.connect(acc1).unpause()).to.be.revertedWith(
        `AccessControl: account ${acc1.address.toLowerCase()} is missing role ${roles.PAUSE}`,
      );
    });

    it('does not upgrade without upgrade role', async () => {
      const { wUSDMContract, acc1 } = await loadFixture(deployFixture);

      await expect(wUSDMContract.connect(acc1).upgradeTo(AddressZero)).to.be.revertedWith(
        `AccessControl: account ${acc1.address.toLowerCase()} is missing role ${roles.UPGRADE}`,
      );
    });

    it('upgrades with upgrade role', async () => {
      const { wUSDMContract, acc1 } = await loadFixture(deployFixture);

      await wUSDMContract.grantRole(roles.UPGRADE, acc1.address);

      await expect(wUSDMContract.connect(acc1).upgradeTo(AddressZero)).to.not.be.revertedWith(
        `AccessControl: account ${acc1.address.toLowerCase()} is missing role ${roles.UPGRADE}`,
      );
    });
  });

  describe('Pause status should follow USDM pause status', () => {
    it('should be paused when USDM is paused', async () => {
      const { wUSDMContract, USDMContract, owner } = await loadFixture(deployFixture);

      expect(await wUSDMContract.paused()).to.equal(false);
      await USDMContract.connect(owner).pause();
      expect(await wUSDMContract.paused()).to.equal(true);
    });
  });

  describe('Accrue value', () => {
    // Error should always fall 7 orders of magnitud below than one cent of a dollar (1 GWEI)
    // Inaccuracy stems from using fixed-point arithmetic and Solidity's 18-decimal support
    // resulting in periodic number approximations during divisions
    const expectEqualWithError = (actual: BigNumber, expected: BigNumber, error = '0.000000001') => {
      expect(actual).to.be.closeTo(expected, parseUnits(error));
    };

    it('can accrue value without rebasing', async () => {
      const { wUSDMContract, USDMContract, owner } = await loadFixture(deployFixture);
      const initialBalance = await USDMContract.balanceOf(owner.address);

      await USDMContract.connect(owner).approve(wUSDMContract.address, MaxUint256);
      await wUSDMContract.connect(owner).deposit(initialBalance, owner.address);

      expect(await USDMContract.balanceOf(owner.address)).to.be.equal(0);
      expect(await wUSDMContract.balanceOf(owner.address)).to.be.equal(initialBalance);

      const rewardMultiplier = parseUnits('1.0001');
      const expectedIncrement = initialBalance.mul(rewardMultiplier).div(parseUnits('1'));

      await USDMContract.connect(owner).setRewardMultiplier(rewardMultiplier);

      expect(await wUSDMContract.balanceOf(owner.address)).to.be.equal(initialBalance);
      expect(await wUSDMContract.totalAssets()).to.be.equal(expectedIncrement);
      expect(await USDMContract.balanceOf(wUSDMContract.address)).to.be.equal(expectedIncrement);

      await wUSDMContract
        .connect(owner)
        .redeem(await wUSDMContract.balanceOf(owner.address), owner.address, owner.address);

      expectEqualWithError(await USDMContract.balanceOf(owner.address), expectedIncrement);
    });
  });

  describe('Transfer between users', () => {
    it('can transfer wUSDM and someone else redeem', async () => {
      const { wUSDMContract, USDMContract, owner, acc1 } = await loadFixture(deployFixture);

      await USDMContract.connect(owner).approve(wUSDMContract.address, MaxUint256);
      await wUSDMContract.connect(owner).deposit(parseUnits('2'), owner.address);
      await wUSDMContract.connect(owner).transfer(acc1.address, parseUnits('1'));

      expect(await wUSDMContract.totalAssets()).to.be.equal(parseUnits('2'));
      expect(await wUSDMContract.balanceOf(acc1.address)).to.be.equal(parseUnits('1'));
      expect(await wUSDMContract.maxWithdraw(acc1.address)).to.be.equal(parseUnits('1'));

      await wUSDMContract.connect(acc1).withdraw(parseUnits('1'), acc1.address, acc1.address);

      expect(await USDMContract.balanceOf(acc1.address)).to.be.equal(parseUnits('1'));
    });

    it('should not transfer on a USDM pause', async () => {
      const { wUSDMContract, USDMContract, owner, acc1 } = await loadFixture(deployFixture);

      await USDMContract.connect(owner).approve(wUSDMContract.address, MaxUint256);
      await wUSDMContract.connect(owner).deposit(parseUnits('2'), owner.address);
      await USDMContract.connect(owner).pause();

      await expect(wUSDMContract.connect(owner).transfer(acc1.address, parseUnits('2'))).to.be.revertedWithCustomError(
        wUSDMContract,
        'wUSDMPausedTransfers',
      );

      await USDMContract.connect(owner).unpause();

      await expect(wUSDMContract.connect(owner).transfer(acc1.address, parseUnits('2'))).not.to.be.reverted;
    });

    it('should not transfer if blocked', async () => {
      const { wUSDMContract, USDMContract, owner, acc1, acc2 } = await loadFixture(deployFixture);

      await USDMContract.connect(owner).approve(wUSDMContract.address, MaxUint256);
      await wUSDMContract.connect(owner).deposit(parseUnits('2'), owner.address);
      await wUSDMContract.connect(owner).transfer(acc1.address, parseUnits('2'));
      await USDMContract.connect(owner).blockAccounts([acc1.address]);

      await expect(wUSDMContract.connect(acc1).transfer(acc2.address, parseUnits('2'))).to.be.revertedWithCustomError(
        wUSDMContract,
        'wUSDMBlockedSender',
      );

      await USDMContract.connect(owner).unblockAccounts([acc1.address]);

      await expect(wUSDMContract.connect(acc1).transfer(acc1.address, parseUnits('2'))).not.to.be.reverted;
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
      const { wUSDMContract, acc1 } = await loadFixture(deployFixture);

      expect(await wUSDMContract.nonces(acc1.address)).to.equal(0);
    });

    it('returns the correct domain separator', async () => {
      const { wUSDMContract } = await loadFixture(deployFixture);
      const chainId = (await wUSDMContract.provider.getNetwork()).chainId;

      const expected = keccak256(
        defaultAbiCoder.encode(
          ['bytes32', 'bytes32', 'bytes32', 'uint256', 'address'],
          [
            id('EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)'),
            id(await wUSDMContract.name()),
            id('1'),
            chainId,
            wUSDMContract.address,
          ],
        ),
      );

      expect(await wUSDMContract.DOMAIN_SEPARATOR()).to.equal(expected);
    });

    it('accepts owner signature', async () => {
      const { wUSDMContract, owner, acc1: spender } = await loadFixture(deployFixture);
      const value = 100;
      const nonce = await wUSDMContract.nonces(owner.address);
      const deadline = MaxUint256;

      const { domain, types, message } = await buildData(wUSDMContract, owner, spender, value, nonce, deadline);
      const { v, r, s } = await signTypedData(owner, domain, types, message);

      await expect(wUSDMContract.permit(owner.address, spender.address, value, deadline, v, r, s))
        .to.emit(wUSDMContract, 'Approval')
        .withArgs(owner.address, spender.address, value);
      expect(await wUSDMContract.nonces(owner.address)).to.equal(1);
      expect(await wUSDMContract.allowance(owner.address, spender.address)).to.equal(value);
    });

    it('reverts reused signature', async () => {
      const { wUSDMContract, owner, acc1: spender } = await loadFixture(deployFixture);
      const value = 100;
      const nonce = await wUSDMContract.nonces(owner.address);
      const deadline = MaxUint256;

      const { domain, types, message } = await buildData(wUSDMContract, owner, spender, value, nonce, deadline);
      const { v, r, s } = await signTypedData(owner, domain, types, message);

      await wUSDMContract.permit(owner.address, spender.address, value, deadline, v, r, s);

      await expect(wUSDMContract.permit(owner.address, spender.address, value, deadline, v, r, s))
        .to.be.revertedWithCustomError(wUSDMContract, 'ERC2612InvalidSignature')
        .withArgs(owner.address, spender.address);
    });

    it('reverts other signature', async () => {
      const { wUSDMContract, owner, acc1: spender, acc2: otherAcc } = await loadFixture(deployFixture);
      const value = 100;
      const nonce = await wUSDMContract.nonces(owner.address);
      const deadline = MaxUint256;

      const { domain, types, message } = await buildData(wUSDMContract, owner, spender, value, nonce, deadline);
      const { v, r, s } = await signTypedData(otherAcc, domain, types, message);

      await expect(wUSDMContract.permit(owner.address, spender.address, value, deadline, v, r, s))
        .to.be.revertedWithCustomError(wUSDMContract, 'ERC2612InvalidSignature')
        .withArgs(owner.address, spender.address);
    });

    it('reverts expired permit', async () => {
      const { wUSDMContract, owner, acc1: spender } = await loadFixture(deployFixture);
      const value = 100;
      const nonce = await wUSDMContract.nonces(owner.address);
      const deadline = await time.latest();

      // Advance time by one hour and mine a new block
      await time.increase(3600);

      // Set the timestamp of the next block but don't mine a new block
      // New block timestamp needs larger than current, so we need to add 1
      const blockTimestamp = (await time.latest()) + 1;
      await time.setNextBlockTimestamp(blockTimestamp);

      const { domain, types, message } = await buildData(wUSDMContract, owner, spender, value, nonce, deadline);
      const { v, r, s } = await signTypedData(owner, domain, types, message);

      await expect(wUSDMContract.permit(owner.address, spender.address, value, deadline, v, r, s))
        .to.be.revertedWithCustomError(wUSDMContract, 'ERC2612ExpiredDeadline')
        .withArgs(deadline, blockTimestamp);
    });
  });
});
