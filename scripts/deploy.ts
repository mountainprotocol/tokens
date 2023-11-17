import { ethers, defender, upgrades } from 'hardhat';
import dotenv from 'dotenv';

dotenv.config();

const { OWNER_ADDRESS, USDM_ADDRESS, PROXY_ADDRESS } = process.env;
const contractName = 'USDM';
// const contractName = 'wUSDM';
const initializeArgs = ['Mountain Protocol USD', 'USDM', OWNER_ADDRESS];
// const initializeArgs = [USDM_ADDRESS, OWNER_ADDRESS];
const salt = '1337test';
// const salt = '1337w';

// eslint-disable-next-line @typescript-eslint/no-unused-vars
const deploy = async () => {
  const contractFactory = await ethers.getContractFactory(contractName);
  const contract = await upgrades.deployProxy(contractFactory, initializeArgs, {
    initializer: 'initialize',
    kind: 'uups',
    salt,
    verifySourceCode: true,
    useDefenderDeploy: true,
    redeployImplementation: 'onchange',
    createFactoryAddress: '0xD8Ba6cF1756343D3171b25301bAA0719286f7155',
  });

  await contract.deployed();

  console.log('Contract address: %s', contract.address);
};

// Upgrade with terminal
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const upgrade = async () => {
  console.log('Upgrading contract... %s', PROXY_ADDRESS);

  const newContract = await ethers.getContractFactory(contractName);
  await upgrades.upgradeProxy(PROXY_ADDRESS, newContract, {
    useDefenderDeploy: true,
    verifySourceCode: true,
    salt: salt,
  });

  console.log('Contract upgraded');
};

// OpenZeppelin Platform Upgrade
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const upgradeWithOZPlatform = async () => {
  const newContract = await ethers.getContractFactory(contractName);
  const proposal = await defender.proposeUpgrade(PROXY_ADDRESS, newContract, {
    salt,
  });

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
