import { NetworkName } from '@helios-lang/tx-utils';

const getNetwork = (apiKey: string): NetworkName => {
  const network = apiKey.substring(0, 7);

  if (network !== 'mainnet' && network !== 'preview' && network !== 'preprod') {
    throw new Error(`Unknown network ${network}`);
  }

  return network;
};

export { getNetwork };
