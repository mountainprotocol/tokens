import { ethers, upgrades } from "hardhat";

const deploy = async () => {
  const [deployer] = await ethers.getSigners();

  console.log(
    "Deployer: %s",
    await deployer.getAddress()
  );

  console.log(
    "Account balance: %s",
    ethers.utils.formatEther((await deployer.getBalance()))
  );

  const Token = await ethers.getContractFactory("TokenV4");
  const token = await upgrades.deployProxy(
    Token,
    ["Mountain Protocol Token", "USDM", ethers.utils.parseUnits("100000000")], // 100M
    { initializer: "initialize", kind: "uups" }
  );
  await token.deployed();

  console.log("Contract address: %s", token.address);
}

const upgrade = async () => {
  const PROXY_ADDRESS = "0x6816EEe1d41B103988799F2e7ABA0521E56C2679";
  const newContract = await ethers.getContractFactory("TokenV3");
  console.log("Upgrading contract... %s", PROXY_ADDRESS);
  // It's no necessary to specify proxy's kind since it's inferred from the proxy address
  await upgrades.upgradeProxy(PROXY_ADDRESS, newContract);
  console.log("Contract upgraded");
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
deploy()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
