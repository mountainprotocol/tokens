import { ethers, upgrades } from "hardhat";

const main = async () => {
  const [deployer] = await ethers.getSigners();

  console.log(
    "Deployer: %s",
    await deployer.getAddress()
  );

  console.log(
    "Account balance: %s",
    ethers.utils.formatEther((await deployer.getBalance()))
  );

  const Token = await ethers.getContractFactory("Token");
  const token = await upgrades.deployProxy(
    Token,
    ["Mountain Protocol Token", "USDM", ethers.utils.parseUnits("100000000")], // 100M
    { initializer: 'initialize'}
  );
  await token.deployed();

  console.log("Contract address: %s", token.address);
}

const upgrade = async () => {
  const PROXY_ADDRESS = '0xaEb9c93480202c03721bEDE5b04AF4BcDCE2FA3b';
  const TokenV2 = await ethers.getContractFactory("TokenV2");
  console.log('Upgrading contract...', PROXY_ADDRESS);
  await upgrades.upgradeProxy(PROXY_ADDRESS, TokenV2);
  console.log('Contract upgraded');
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
upgrade()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
