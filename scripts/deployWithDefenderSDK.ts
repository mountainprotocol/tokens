import { Defender } from '@openzeppelin/defender-sdk';
import artifact from '../node_modules/@openzeppelin/upgrades-core/artifacts/build-info.json';
import dotenv from 'dotenv';

dotenv.config();

const { OZ_PLATFORM_KEY, OZ_PLATFORM_SECRET } = process.env;
const network = 'polygon-mumbai';
const contractName = 'ERC1967Proxy';
const salt = '1337';
const contractPath = '@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol';
const creds = {
  apiKey: OZ_PLATFORM_KEY,
  apiSecret: OZ_PLATFORM_SECRET,
};

// eslint-disable-next-line @typescript-eslint/no-unused-vars
const deployProxy = async () => {
  const client = new Defender(creds);

  const deployment = await client.deploy.deployContract({
    contractName,
    contractPath,
    network,
    artifactPayload: JSON.stringify(artifact),
    licenseType: 'MIT',
    verifySourceCode: true,
    salt,
    createFactoryAddress: '0xD8Ba6cF1756343D3171b25301bAA0719286f7155',
    // $cast calldata "initialize(string,string,address)" "Mountain Protocol USD" "USDM" 0x313d5B7EfDcd84e8a52D425282B03860e9354d74
    constructorInputs: ['0x7f2f92C4dbDa28d8CD7d046e005F65C0540F331e', '0x077f224a000000000000000000000000000000000000000000000000000000000000006000000000000000000000000000000000000000000000000000000000000000a0000000000000000000000000313d5B7EfDcd84e8a52D425282B03860e9354d7400000000000000000000000000000000000000000000000000000000000000154d6f756e7461696e2050726f746f636f6c20555344000000000000000000000000000000000000000000000000000000000000000000000000000000000000045553444d00000000000000000000000000000000000000000000000000000000'],
  });
  console.log({deployment});

  const deploymentStatus = await client.deploy.getDeployedContract(deployment.deploymentId);
  console.log({deploymentStatus});
};

deployProxy().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
