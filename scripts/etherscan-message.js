// Instructions
// 1. Install @openzeppelin/defender-relay-client/lib/ethers
// 2. Create relayer API Key pair
// 3. Replace values
// 4. Replace message
// 4. Run script (node etherscan-message.js)

const { DefenderRelayProvider, DefenderRelaySigner } = require('@openzeppelin/defender-relay-client/lib/ethers');
const dotenv = require('dotenv');

dotenv.config();

const { RELAYER_API_KEY, RELAYER_API_SECRET } = process.env;

const credentials = { apiKey: RELAYER_API_KEY, apiSecret: RELAYER_API_SECRET };

const provider = new DefenderRelayProvider(credentials);
const signer = new DefenderRelaySigner(credentials, provider, { speed: 'fast' });
const message = '[arbiscan.io 21/11/2023 22:02:35] I, hereby verify that I am the owner/creator of the address [0x59D9356E565Ab3A36dD77763Fc0d87fEaf85508C]';

const main = async () => {
  const signature = await signer.signMessage(message);
  console.log(signature);
}

main();
