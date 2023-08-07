import { Bytes, Contract, utils } from 'ethers';
import { providers, Wallet } from 'ethers';
import dotenv from 'dotenv';
import OracleJobAbi from './abis/OracleJob.json';
import { env } from 'process';
import { checkBalance } from './utils/misc';

dotenv.config();

/* ==============================================================/*
                          SETUP
/*============================================================== */

// environment variables usage
const provider = new providers.JsonRpcProvider(env.RPC_HTTPS_URI);
const txSigner = new Wallet(env.TX_SIGNER_PRIVATE_KEY as any as Bytes, provider);

const oracleJob = new Contract('0x3e05f863afa6ACcAE0ED1e535559c881CB3f6b85', OracleJobAbi, txSigner);

// Flag to track if there's a transaction in progress.
// This is used to prevent multiple transactions from being sent at the same time.
let txInProgress: boolean;

/* ==============================================================/*
                       MAIN SCRIPT
/*============================================================== */

export async function run(): Promise<void> {
  if (txInProgress) return;

  let tx;
  let gasUnits;
  let gasPrice;
  let txFee;
  // emulate tx
  try {
    console.log(`Emulating: PID Controller`);
    await oracleJob.callStatic.workUpdateRate();
    txInProgress = true;

    gasUnits = await oracleJob.estimateGas.workUpdateRate();
    gasUnits = gasUnits.mul(12).div(10); // add 20% buffer
    gasPrice = await provider.getGasPrice();
    txFee = gasUnits.mul(gasPrice);
    console.log(`Successfully emulated: PID Controller`);
  } catch (err) {
    txInProgress = false;
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
    txInProgress = false;
    return;
  }

  // broadcast tx
  try {
    tx = await oracleJob.workUpdateRate({ gasLimit: gasUnits });
    // wait for tx to be mined
    await tx.wait();

    console.log(`Successfully broadcasted: PID Controller`);
  } catch (err) {
    console.log(`Failed to broadcast: PID Controller`);
    console.log(err);
  }

  txInProgress = false;
}

(async function main() {
  console.log('Running...');
  await run();
  setTimeout(main, 15 * 1000); // every 15 seconds
})();
