// Script to interact with a deployed contract from hardhat console
const dotenv = require("dotenv");

dotenv.config();


// CHANGE THIS IF NEEDED
const contractName = 'USDM';
const contractAddress = '0x4Dbd756Fd2c7F653BEd8a7B146574DBab0076484';

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


// MT Protocol Team Wallets
const mati = '0xd9dF2f01183eA1738f7C9a5314440f04e4B28b21';
const maki = '0x9E76bc51E4d00c6e8D7F9408E8E53ef486C80591';
const fran = '0x92714591205aB6956a2738a208B074BD8043182D';


// Set roles
const BLACKLIST_ROLE = '0x22435ed027edf5f902dc0093fbc24cdb50c05b5fd5f311b78c67c1cbaff60e13';
const BURNER_ROLE = '0x3c11d16cbaffd01df69ce1c404f6340ee057498f5f00246190ea54220576a848';
const MINTER_ROLE = '0x9f2df0fed2c77648de5860a4cc508cd0818c85b8b8a1ab4ceeef8d981c8956a6';
const ORACLE_ROLE = '0x68e79a7bf1e0bc45d0a330c573bc367f9cf464fd326078812f301165fbda4ef1';
const UPGRADER_ROLE = '0x189ab7a9244df0848122154315af71fe140f3db0fe014031783b0946b8c9d2e3';

await contract.grantRole(BLACKLIST_ROLE, mati);
await contract.grantRole(BURNER_ROLE, mati);
await contract.grantRole(MINTER_ROLE, mati);
await contract.grantRole(ORACLE_ROLE, mati);

// Grant roles to all team members
const teamWallets = [mati, fran, maki];

for (const wallet of teamWallets) {
    await contract.grantRole(BLACKLIST_ROLE, wallet);
    await contract.grantRole(BURNER_ROLE, wallet);
    await contract.grantRole(MINTER_ROLE, wallet);
    await contract.grantRole(ORACLE_ROLE, wallet);
}

// Mint 1337 USDM to each team member
for (const wallet of teamWallets) {
    await contract.mint(wallet, ethers.utils.parseUnits('1337'));
}

// Update rewardmultiplier by 4bps
await contract.addRewardMultiplier(ethers.utils.parseUnits('1.0004'));
