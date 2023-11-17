import { ethers, defender } from 'hardhat';
import dotenv from 'dotenv';

dotenv.config();

const contractName = 'USDM';
const salt = '1337';

// async function deployImpl() {
//   const usdm = await ethers.getContractFactory(contractName);
//   const deployment = await defender.deployContract(usdm, {
//     unsafeAllowDeployContract: true,
//     verifySourceCode: true,
//     salt,
//     createFactoryAddress: '0xD8Ba6cF1756343D3171b25301bAA0719286f7155',
//   });

//   await deployment.waitForDeployment();

//   console.log(
//     `${contractName} deployed to ${deployment.target}`,
//   );
// }

async function deploy() {
  const factory = await ethers.getContractFactory('USDM');

  const deployment = await defender.deployProxy(factory, ['Mountain Protocol USD', 'USDM', '0x313d5B7EfDcd84e8a52D425282B03860e9354d74'], {
    initializer: 'initialize',
    kind: 'uups',
    salt,
    verifySourceCode: true,
    redeployImplementation: 'always',
    createFactoryAddress: '0xD8Ba6cF1756343D3171b25301bAA0719286f7155',
  });

  await deployment.waitForDeployment();

  console.log(
    `${contractName} deployed to ${deployment.target}`,
  );
}


deploy().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
