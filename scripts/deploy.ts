import { ethers } from "hardhat";

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
  const token = await Token.deploy(
    "Mountain Protocol Token POC",
    "USD-POC",
    1_000_000,
  );
  await token.deployed();

  console.log("Contract address: %s", token.address);
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });