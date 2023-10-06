import { ethers, platform, upgrades } from 'hardhat';
import dotenv from 'dotenv';

dotenv.config();

const { OWNER_ADDRESS, USDM_ADDRESS, PROXY_ADDRESS } = process.env;
// const contractName = 'USDM';
const contractName = 'wUSDM';
// const initializeArgs = ['Mountain Protocol USD', 'USDM', OWNER_ADDRESS];
const initializerArgs = [USDM_ADDRESS, OWNER_ADDRESS];
// const salt = '1337';
const salt = '1337w';

// Deploy with terminal
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const deploy = async () => {
  const [deployer] = await ethers.getSigners();

  console.log('Deployer: %s', await deployer.getAddress());
  console.log('Account balance: %s', ethers.utils.formatEther(await deployer.getBalance()));

  const contractFactory = await ethers.getContractFactory(contractName);
  const contract = await upgrades.deployProxy(contractFactory, initializerArgs, {
    initializer: 'initialize',
    kind: 'uups',
    salt,
    verifySourceCode: true,
  });

  await contract.deployed();

  console.log('Contract address: %s', contract.address);
};

// Upgrade with terminal
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const upgrade = async () => {
  console.log('Upgrading contract... %s', PROXY_ADDRESS);

  const newContract = await ethers.getContractFactory(contractName);
  await upgrades.upgradeProxy(PROXY_ADDRESS, newContract);

  console.log('Contract upgraded');
};

// OpenZeppelin Platform Deploy
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const deployWithOZPlatform = async () => {
  const contractFactory = await ethers.getContractFactory(contractName);
  const contract = await platform.deployProxy(contractFactory, initializerArgs, {
    initializer: 'initialize',
    kind: 'uups',
    salt,
  });

  await contract.deployed();

  console.log('Contract address: %s', contract.address);
};

// OpenZeppelin Platform Upgrade
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const upgradeWithOZPlatform = async () => {
  const newContract = await ethers.getContractFactory(contractName);
  const proposal = await platform.proposeUpgrade(PROXY_ADDRESS, newContract);

  console.log('Upgrading contract... %s', PROXY_ADDRESS);
  console.log(`Upgrade proposal URL: ${proposal.url}`);
};

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
deploy()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error);
    process.exit(1);
  });
