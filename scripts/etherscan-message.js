const { DefenderRelayProvider, DefenderRelaySigner } = require('@openzeppelin/defender-relay-client/lib/ethers');
const dotenv = require('dotenv');

dotenv.config();

const { RELAYER_API_KEY, RELAYER_API_SECRET } = process.env;

const credentials = { apiKey: RELAYER_API_KEY, apiSecret: RELAYER_API_SECRET };

const provider = new DefenderRelayProvider(credentials);
const signer = new DefenderRelaySigner(credentials, provider, { speed: 'fast' });
const message = '<explorer message>';

const main = async () => {
  const signature = await signer.signMessage(message);
  console.log(signature);
}

main();
