import { utils } from 'ethers';
import { providers, Wallet } from 'ethers';
import dotenv from 'dotenv';
import { env } from 'process';
import { checkBalance, getProxy } from './utils/misc';
import { Geb, BasicActions } from '@hai-on-op/sdk';

dotenv.config();

/* ==============================================================/*
                          SETUP
/*============================================================== */

// environment variables usage
const provider = new providers.JsonRpcProvider(env.RPC_HTTPS_URI);
const txSigner = new Wallet(env.TX_SIGNER_PRIVATE_KEY as any as string, provider);

const geb = new Geb('optimism-goerli', txSigner);
let proxy: BasicActions;

const collateralTypes: string[] = ['WETH', 'OP', 'WBTC', 'STN', 'TTM'];

const emulateTxBatch = async (collateralTypes: string[]) => {
  return await Promise.all(
    collateralTypes.map(async (cType) => {
      const bytes32CType = geb.tokenList[cType].bytes32String;
      console.log(cType, bytes32CType);
      try {
        await geb.contracts.oracleJob.callStatic.workUpdateCollateralPrice(bytes32CType);
        console.log(`Successfully emulated: ${cType}`);
      } catch (err) {
        console.log(`Failed to emulate: ${cType}`);
        return false;
      }

      return true;
    })
  );
};

const executeTx = async (cType: any) => {
  let tx;
  let gasUnits;
  let gasPrice;
  let txFee;

  // estimate gas
  console.log(`Executing Work: ${cType}`);

  try {
    const bytes32CType = geb.tokenList[cType].bytes32String;
    // NOTE: this gas estimation underestimates the gas required for the tx (missing proxy txs, e.g transfer ERC20 to user)
    gasUnits = await geb.contracts.oracleJob.estimateGas.workUpdateCollateralPrice(bytes32CType);
    gasUnits = gasUnits.mul(15).div(10); // add 50% buffer
    gasPrice = await provider.getGasPrice();
    txFee = gasUnits.mul(gasPrice);
  } catch (err) {
    console.log(`Failed to estimate gas for: ${cType}`);
    return;
  }

  // check if we have enough funds for gas
  const signerBalance = await provider.getBalance(txSigner.address);
  try {
    checkBalance(signerBalance, txFee);
  } catch (err) {
    console.log(`Insufficient balance for: ${cType}`);
    console.log(`Balance is ${utils.formatUnits(signerBalance, 'ether')}, but tx fee is ${utils.formatUnits(txFee, 'ether')}`);
    return;
  }

  // broadcast tx
  try {
    tx = await proxy.updateOraclePrice(cType);
    if (!tx) throw new Error('No transaction request!');

    tx.gasLimit = gasUnits;
    const txData = await txSigner.sendTransaction(tx);
    const txReceipt = await txData.wait();

    console.log(`Successfully broadcasted: ${cType}`);

    return txReceipt;
  } catch (err) {
    console.log(`Failed to broadcast: ${cType}`);
    console.log(err);
  }
};

/* ==============================================================/*
                       MAIN SCRIPT
/*============================================================== */

export async function run(): Promise<void> {
  // emulate batch
  const succeed = await emulateTxBatch(collateralTypes);

  // execute sequentially
  for (let i = 0; i < collateralTypes.length; i++) {
    if (!succeed[i]) continue;

    const cType = collateralTypes[i];
    await executeTx(cType);
  }
}

(async function main() {
  proxy = await getProxy(txSigner, geb);

  console.log('Running...');
  await run();
  setTimeout(main, 15 * 1000); // every 15 seconds
})();
