import { ethers, platform } from 'hardhat';
import dotenv from 'dotenv';

dotenv.config();

const { OWNER_ADDRESS, USDM_ADDRESS, PROXY_ADDRESS } = process.env;
// const contractName = 'USDM';
const contractName = 'wUSDM';
// const initializeArgs = ['Mountain Protocol USD', 'USDM', OWNER_ADDRESS];
const initializerArgs = [USDM_ADDRESS, OWNER_ADDRESS];
const salt = '1337';

// eslint-disable-next-line @typescript-eslint/no-unused-vars
const deploy = async () => {
  const USDM = await ethers.getContractFactory(contractName);
  const contract = await platform.deployProxy(USDM, initializerArgs, {
    initializer: 'initialize',
    kind: 'uups',
    salt,
  });

  await contract.deployed();

  console.log('Contract address: %s', contract.address);
};

// eslint-disable-next-line @typescript-eslint/no-unused-vars
const upgrade = async () => {
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
