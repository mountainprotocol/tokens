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
  const PROXY_ADDRESS = '0x3175b3c65202099bc14d3056d0b894b42bbb5087';
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