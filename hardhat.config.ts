import { HardhatUserConfig } from "hardhat/config";
import "@nomicfoundation/hardhat-toolbox";
import "@nomiclabs/hardhat-solhint";
import "@nomicfoundation/hardhat-chai-matchers";
import "@openzeppelin/hardhat-upgrades";
import "hardhat-gas-reporter";
import dotenv from "dotenv";

dotenv.config();

const { ETHERSCAN_API_KEY, ALCHEMY_GOERLI_API_KEY, GOERLI_PRIVATE_KEY, REPORT_GAS, COIN_MARKETCAP_API_KEY } = process.env;
// const { ETHERSCAN_API_KEY, ALCHEMY_GOERLI_API_KEY, GOERLI_PRIVATE_KEY, ALCHEMY_MAINNET_API_KEY, MAINNET_PRIVATE_KEY } = process.env;

if (!ETHERSCAN_API_KEY || !ALCHEMY_GOERLI_API_KEY || !GOERLI_PRIVATE_KEY || !REPORT_GAS || !COIN_MARKETCAP_API_KEY) {
  console.error('Env variables are not configured');
  process.exit(1);
}

const config: HardhatUserConfig = {
  solidity: {
    version: "0.8.17",
    settings: {
      optimizer: {
        enabled: true,
        runs: 200
      },
    },
  },
  etherscan: {
    apiKey: ETHERSCAN_API_KEY,
  },
  defaultNetwork: 'hardhat',
  // defaultNetwork: 'goerli',
  networks: {
    goerli: {
      url: `https://eth-goerli.alchemyapi.io/v2/${ALCHEMY_GOERLI_API_KEY}`,
      accounts: [GOERLI_PRIVATE_KEY],
    },
    // mainnet: {
    //   url: `https://eth-mainnet.g.alchemy.com/v2/${ALCHEMY_MAINNET_API_KEY}`,
    //   accounts: [MAINNET_PRIVATE_KEY],
    // },
    hardhat: {
      chainId: 1337 // We set 1337 to make interacting with MetaMask simpler
    }
  },
  gasReporter: {
    enabled: REPORT_GAS === 'true',
    coinmarketcap: COIN_MARKETCAP_API_KEY,
    gasPrice: 20
  }
};

export default config;
