import { ethers, upgrades } from 'hardhat';

const deploy = async () => {
  const [deployer] = await ethers.getSigners();

  console.log('Deployer: %s', await deployer.getAddress());

  console.log('Account balance: %s', ethers.utils.formatEther(await deployer.getBalance()));

  const USDM = await ethers.getContractFactory('USDM');
  const usdm = await upgrades.deployProxy(USDM, ['Mountain Protocol USD', 'USDM', ethers.utils.parseUnits('1')], {
    initializer: 'initialize',
    kind: 'uups',
  });
  await usdm.deployed();

  console.log('Contract address: %s', usdm.address);
};

// eslint-disable-next-line @typescript-eslint/no-unused-vars
const upgrade = async () => {
  const PROXY_ADDRESS = '0xe31Cf614fC1C5d3781d9E09bdb2e04134CDebb89';
  const newContract = await ethers.getContractFactory('USDM');
  console.log('Upgrading contract... %s', PROXY_ADDRESS);
  // It's no necessary to specify proxy's kind since it's inferred from the proxy address
  await upgrades.upgradeProxy(PROXY_ADDRESS, newContract);
  console.log('Contract upgraded');
};

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
deploy()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error);
    process.exit(1);
  });
