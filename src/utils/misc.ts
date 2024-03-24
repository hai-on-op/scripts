import { env } from 'process';
import { Geb, BasicActions } from '@hai-on-op/sdk';
import { providers, Wallet } from 'ethers';

export const checkBalance = (signerBalance: any, txFee: any) => {
  if (signerBalance.lt(txFee)) {
    throw Error(`Insufficient balance`);
  }
  return signerBalance;
};

export const getTxFeeAndCheckBalance = async (gasUnits: any, provider: any, txSigner: any) => {
  const gasPrice = await provider.getGasPrice();

  const txFee = gasUnits.mul(gasPrice);

  const signerBalance = await provider.getBalance(txSigner.address);
  if (signerBalance.lt(txFee)) {
    throw Error(`Insufficient balance`);
  }
};

export const processTx = async (tx: any, txSigner: any, gasUnits: any) => {
  if (!tx) throw new Error('No transaction request!');

  tx.gasLimit = gasUnits;
  tx.maxPriorityFeePerGas = 1;
  const txData = await txSigner.sendTransaction(tx);
  await txData.wait();
};

export const getVariables = async () => {
  const network = env.NETWORK || 'optimism-sepolia';
  const provider = new providers.JsonRpcProvider(env.RPC_HTTPS_URI);
  const txSigner = new Wallet(env.TX_SIGNER_PRIVATE_KEY as any as string, provider);
  const geb = new Geb(network as any, txSigner);
  const proxy: BasicActions = await getProxy(txSigner, geb);
  return { provider, txSigner, geb, proxy };
};

export const getProxy = async (txSigner: any, geb: any) => {
  let proxy;
  try {
    console.log('Getting proxy...');
    proxy = await geb.getProxyAction(txSigner.address);
  } catch (error: string | any) {
    console.log('Deploying new proxy...');
    await geb.deployProxy();

    proxy = await geb.getProxyAction(txSigner.address);
  }
  return proxy;
};
