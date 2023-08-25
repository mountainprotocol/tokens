import { ethers, platform } from 'hardhat';
import dotenv from 'dotenv';

dotenv.config();

const { OWNER_ADDRESS } = process.env;

// eslint-disable-next-line @typescript-eslint/no-unused-vars
const deploy = async () => {
  const USDM = await ethers.getContractFactory('USDM');
  const contract = await platform.deployProxy(USDM, ['Mountain Protocol USD', 'USDM', OWNER_ADDRESS], {
    initializer: 'initialize',
    kind: 'uups',
    salt: '1337',
  });
  await contract.deployed();

  console.log('Contract address: %s', contract.address);
};

// eslint-disable-next-line @typescript-eslint/no-unused-vars
const upgrade = async () => {
  const PROXY_ADDRESS = '';
  const newUSDM = await ethers.getContractFactory('USDM');
  console.log('Upgrading contract... %s', PROXY_ADDRESS);
  const proposal = await platform.proposeUpgrade(PROXY_ADDRESS, newUSDM);

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
