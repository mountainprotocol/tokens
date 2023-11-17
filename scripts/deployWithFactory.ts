import { ethers, defender } from 'hardhat';
import dotenv from 'dotenv';

dotenv.config();

const { SALT_MAINNET, SALT_TESTNET } = process.env;
const contractName = 'USDM';

async function deployMainnet() {
  const factory = await ethers.getContractFactory(contractName);

  const deployment = await defender.deployProxy(factory, ['Mountain Protocol USD', 'USDM', '0x313d5B7EfDcd84e8a52D425282B03860e9354d74'], {
    initializer: 'initialize',
    kind: 'uups',
    salt: SALT_MAINNET,
    verifySourceCode: true,
    redeployImplementation: 'always',
    createFactoryAddress: '0xD8Ba6cF1756343D3171b25301bAA0719286f7155',
  });

  await deployment.waitForDeployment();

  console.log(
    `${contractName} deployed to ${deployment.target}`,
  );
}

async function deployTestnet() {
  const factory = await ethers.getContractFactory(contractName);

  const deployment = await defender.deployProxy(factory, ['Mountain Protocol USD', 'USDM', '0xd9dF2f01183eA1738f7C9a5314440f04e4B28b21'], {
    initializer: 'initialize',
    kind: 'uups',
    salt: SALT_TESTNET,
    verifySourceCode: true,
    redeployImplementation: 'always',
    createFactoryAddress: '0xD8Ba6cF1756343D3171b25301bAA0719286f7155',
  });

  await deployment.waitForDeployment();

  console.log(
    `${contractName} deployed to ${deployment.target}`,
  );
}


deployMainnet().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
