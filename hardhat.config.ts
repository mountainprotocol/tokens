import { HardhatUserConfig } from 'hardhat/config';
import '@nomicfoundation/hardhat-toolbox';
import '@nomicfoundation/hardhat-chai-matchers';
import '@openzeppelin/hardhat-upgrades';
import dotenv from 'dotenv';

dotenv.config();

const {
  NODE_ENV,
  REPORT_GAS,
  ETHERSCAN_API_KEY,
  COIN_MARKETCAP_API_KEY,
  ALCHEMY_MAINNET_API_KEY,
  ALCHEMY_GOERLI_API_KEY,
  ALCHEMY_SEPOLIA_API_KEY,
  OZ_PLATFORM_KEY,
  OZ_PLATFORM_SECRET,
  GOERLI_PRIVATE_KEY,
  ALCHEMY_BASE_API_KEY,
  ALCHEMY_OPTIMISM_API_KEY,
  ALCHEMY_ARBITRUM_API_KEY,
  ALCHEMY_POLYGON_API_KEY,
  ALCHEMY_POLYGON_ZK_API_KEY,
  ALCHEMY_POLYGON_MUMBAI_API_KEY,
  ALCHEMY_BASE_GOERLI_API_KEY,
  ALCHEMY_OPTIMISM_GOERLI_API_KEY,
  ALCHEMY_ARBITRUM_GOERLI_API_KEY,
  QUICKNODE_GNOSIS_MAINNET_API_KEY,
} = process.env;

const isTestEnv = NODE_ENV === 'test';
const gasReport = REPORT_GAS === 'true';

const testConfig: HardhatUserConfig = {
  defaultNetwork: 'hardhat',
  networks: {
    hardhat: {},
  },
};

const gasReporterConfig = {
  enabled: REPORT_GAS === 'true',
  coinmarketcap: COIN_MARKETCAP_API_KEY,
  gasPrice: 20,
};

const etherscanConfig = {
  apiKey: ETHERSCAN_API_KEY,
};

const config: HardhatUserConfig = {
  solidity: {
    version: '0.8.18',
    settings: {
      optimizer: {
        enabled: true,
        runs: 200,
      },
    },
  },
  defender: {
    apiKey: OZ_PLATFORM_KEY as string,
    apiSecret: OZ_PLATFORM_SECRET as string,
  },
  etherscan: ETHERSCAN_API_KEY ? etherscanConfig : {},
  defaultNetwork: 'hardhat',
  networks: {
    goerli: {
      url: `https://eth-goerli.alchemyapi.io/v2/${ALCHEMY_GOERLI_API_KEY}`,
      chainId: 5,
      // Only add account if the PK is provided
      ...(GOERLI_PRIVATE_KEY ? { accounts: [GOERLI_PRIVATE_KEY] } : {}),
    },
    sepolia: {
      url: `https://eth-goerli.alchemyapi.io/v2/${ALCHEMY_SEPOLIA_API_KEY}`,
      chainId: 11155111,
      // Only add account if the PK is provided
      // ...(SEPOLIA_PRIVATE_KEY ? { accounts: [SEPOLIA_PRIVATE_KEY] } : {}),
    },
    mainnet: {
      url: `https://eth-mainnet.g.alchemy.com/v2/${ALCHEMY_MAINNET_API_KEY}`,
      chainId: 1,
      // Only add account if the PK is provided
      // ...(MAINNET_PRIVATE_KEY ? { accounts: [MAINNET_PRIVATE_KEY] } : {}),
    },
    hardhat: {
      chainId: 1337, // We set 1337 to make interacting with MetaMask simpler
    },
    base: {
      url: `https://base-mainnet.g.alchemy.com/v2/${ALCHEMY_BASE_API_KEY}`,
      chainId: 8453,
    },
    baseGoerli: {
      url: `https://base-goerli.g.alchemy.com/v2/${ALCHEMY_BASE_GOERLI_API_KEY}`,
      chainId: 84531,
    },
    optimism: {
      url: `https://opt-mainnet.g.alchemy.com/v2/${ALCHEMY_OPTIMISM_API_KEY}`,
      chainId: 10,
    },
    arbitrum: {
      url: `https://arb-mainnet.g.alchemy.com/v2/${ALCHEMY_ARBITRUM_API_KEY}`,
      chainId: 42161,
    },
    polygon: {
      url: `https://polygon-mainnet.g.alchemy.com/v2/${ALCHEMY_POLYGON_API_KEY}`,
      chainId: 137,
    },
    polygonzk: {
      url: `https://polygonzkevm-mainnet.g.alchemy.com/v2/${ALCHEMY_POLYGON_ZK_API_KEY}`,
      chainId: 137,
    },
    polygonMumbai: {
      url: `https://polygon-mumbai.g.alchemy.com/v2/${ALCHEMY_POLYGON_MUMBAI_API_KEY}`,
      chainId: 80001,
    },
    optimismGoerli: {
      url: `https://optimism-goerli.infura.io/v3/${ALCHEMY_OPTIMISM_GOERLI_API_KEY}`,
      chainId: 420,
    },
    arbitrumGoerli: {
      url: `https://arbitrum-goerli.infura.io/v3/${ALCHEMY_ARBITRUM_GOERLI_API_KEY}`,
      chainId: 421613,
    },
    gnosis: {
      url: `https://lingering-hardworking-waterfall.xdai.quiknode.pro/${QUICKNODE_GNOSIS_MAINNET_API_KEY}/`,
      chainId: 100,
    },
  },
  gasReporter: gasReport ? gasReporterConfig : {},
  mocha: {
    timeout: 120000,
  },
};

export default isTestEnv
  ? {
      ...config,
      ...testConfig,
    }
  : config;
