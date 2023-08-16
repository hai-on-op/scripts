import { utils } from 'ethers';
import { providers, Wallet } from 'ethers';
import dotenv from 'dotenv';
import { env } from 'process';
import { checkBalance } from './utils/misc';
import { Geb, BasicActions } from '@hai-on-op/sdk';
import { getProxy } from './utils/misc';

dotenv.config();

/* ==============================================================/*
                          SETUP
/*============================================================== */

// environment variables usage
const provider = new providers.JsonRpcProvider(env.RPC_HTTPS_URI);
const txSigner = new Wallet(env.TX_SIGNER_PRIVATE_KEY as any as string, provider);

const geb = new Geb('optimism-goerli', txSigner);
let proxy: BasicActions;

/* ==============================================================/*
                       MAIN SCRIPT
/*============================================================== */

export async function run(): Promise<any> {
  let tx;
  let gasUnits;
  let gasPrice;
  let txFee;
  // emulate tx
  try {
    console.log(`Emulating: PID Controller`);
    await geb.contracts.oracleJob.callStatic.workUpdateRate();

    gasUnits = await geb.contracts.oracleJob.estimateGas.workUpdateRate();
    gasUnits = gasUnits.mul(15).div(10); // add 50% buffer
    gasPrice = await provider.getGasPrice();
    txFee = gasUnits.mul(gasPrice);
    console.log(`Successfully emulated: PID Controller`);
  } catch (err) {
    console.log(`Unsuccessfull emulation: PID Controller`);
    return;
  }

  // check if we have enough funds for gas
  const signerBalance = await provider.getBalance(txSigner.address);
  try {
    checkBalance(signerBalance, txFee);
  } catch (err) {
    console.log(`Insufficient balance for PID Controller`);
    console.log(`Balance is ${utils.formatUnits(signerBalance, 'ether')}, but tx fee is ${utils.formatUnits(txFee, 'ether')}`);
    return;
  }

  // broadcast tx
  try {
    tx = await proxy.updateRedemptionRate();
    if (!tx) throw new Error('No transaction request!');
    tx.gasLimit = gasUnits;
    const txData = await txSigner.sendTransaction(tx);
    const txReceipt = await txData.wait();

    console.log(`Successfully broadcasted: PID Controller`);
    return txReceipt;
  } catch (err) {
    console.log(`Failed to broadcast: PID Controller`);
    console.log(err);
  }
}

(async function main() {
  console.log('Running...');
  proxy = await getProxy(txSigner, geb);
  await run();
  setTimeout(main, 15 * 1000); // every 15 seconds
})();
