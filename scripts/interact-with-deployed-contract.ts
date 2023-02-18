// Script to interact with a deployed contract from hardhat console
const dotenv = require("dotenv");

dotenv.config();


// CHANGE THIS IF NEEDED
const contractName = 'TokenV2';
const contractAddress = '0x6816EEe1d41B103988799F2e7ABA0521E56C2679';

// Create a node provider
const network = 'goerli';
const apiKey = process.env.ALCHEMY_GOERLI_API_KEY;
const provider = new ethers.providers.AlchemyProvider(network, apiKey);


// Create a wallet connected attached to the previous node provider
const pk = process.env.GOERLI_PRIVATE_KEY;
const signer = new ethers.Wallet(pk, provider);

// Get deployed contract to interact with
const contract = await ethers.getContractAt(contractName, contractAddress, signer);

// // Low-level way for doing the same
// // Get contract factory
// const contractFactory = await ethers.getContractFactory(contractName, signer);
// // Attach contract with the deployed one
// const contract = contractFactory.attach(contractAddress);


// Interact with any public method
await contract.rewardMultiplier();
