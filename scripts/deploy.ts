import { ethers, platform } from 'hardhat';

// eslint-disable-next-line @typescript-eslint/no-unused-vars
const deploy = async () => {
  const USDM = await ethers.getContractFactory('USDM');
  const usdm = await platform.deployProxy(USDM, ['Mountain Protocol USD', 'USDM', ethers.utils.parseUnits('0')], {
    initializer: 'initialize',
    kind: 'uups',
  });
  await usdm.deployed();

  console.log('Contract address: %s', usdm.address);
};

// eslint-disable-next-line @typescript-eslint/no-unused-vars
const upgrade = async () => {
  const PROXY_ADDRESS = '0x3B9Fa00beD9A7aB6FC12972CEE3118AC06Fc69a5';
  const newUSDM = await ethers.getContractFactory('USDM');
  console.log('Upgrading contract... %s', PROXY_ADDRESS);
  const proposal = await platform.proposeUpgrade(PROXY_ADDRESS, newUSDM);

  console.log(`Upgrade proposal URL: ${proposal.url}`);
};

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
upgrade()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error);
    process.exit(1);
  });