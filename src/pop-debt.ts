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

const timeout = 5 * 1000 * 60; // 15 minutes

let startBlock = 0;

const emulateTxBatch = async (events: any[]) => {
  return await Promise.all(
    events.map(async (event) => {
      const timestamp = event.args[0];
      try {
        await geb.contracts.accountingJob.callStatic.workPopDebtFromQueue(timestamp);
        console.log(`Successfully emulated: Pop Debt ${timestamp}`);
      } catch (e) {
        console.log(`Unsuccessfull emulation: Pop Debt ${timestamp}`);
        console.log(e);
        return false;
      }
      return true;
    })
  );
};

const executeTx = async (timestamp: any) => {
  let tx;
  let gasUnits;
  let gasPrice;
  let txFee;

  // estimage gas
  console.log(`Executing: Pop Debt: ${timestamp}`);
  try {
    gasUnits = await geb.contracts.accountingJob.estimateGas.workPopDebtFromQueue(timestamp);
    gasUnits = gasUnits.mul(20).div(10); // add 100% buffer
    gasPrice = await provider.getGasPrice();
    txFee = gasUnits.mul(gasPrice);
  } catch (err) {
    console.log(`Failed to estimate gas for: ${timestamp}`);
    return;
  }

  // check if we have enough funds for gas
  const signerBalance = await provider.getBalance(txSigner.address);
  try {
    checkBalance(signerBalance, txFee);
  } catch (e) {
    console.log(`Insufficient balance for Pop Debt ${timestamp}`);
    console.log(`Balance is ${utils.formatUnits(signerBalance, 'ether')}, but tx fee is ${utils.formatUnits(txFee, 'ether')}`);
    return;
  }

  // broadcast tx
  try {
    tx = await proxy.popDebtFromQueue(timestamp);
    if (!tx) throw new Error('No transaction request!');

    tx.gasLimit = gasUnits;
    const txData = await txSigner.sendTransaction(tx);
    const txReceipt = await txData.wait();

    console.log(`Successfully broadcasted: Pop Debt ${timestamp}`);
    return txReceipt;
  } catch (err) {
    console.log(`Failed to broadcast: Pop Debt ${timestamp}`);
    console.log(err);
  }
};

// find unpoped push events
const getUnsolvedEvents = async () => {
  const pushEvents = (await geb.contracts.accountingEngine.queryFilter(geb.contracts.accountingEngine.filters.PushDebtToQueue())) as any;
  const popEvents = (await geb.contracts.accountingEngine.queryFilter(geb.contracts.accountingEngine.filters.PopDebtFromQueue())) as any;

  const popTimestamps = popEvents.map((event: any) => event.args[0].toString());
  const events = pushEvents.filter((pushEvent: any) => !popTimestamps.includes(pushEvent.args[0].toString()));
  return events;
};

/* ==============================================================/*
                       MAIN SCRIPT
/*============================================================== */

export async function run(startBlock: number): Promise<number> {
  // process historical events
  console.log(`Fetching historical events from block: ${startBlock}`);
  const events = await getUnsolvedEvents();
  console.log(`Found unsolved events: ${events.length}`);

  if (events.length === 0) return startBlock;

  const lastEventBlock = events[events.length - 1].blockNumber;

  // emulate batch
  const succeed = await emulateTxBatch(events);

  // broadcasting
  for (let i = 0; i < events.length; i++) {
    if (!succeed[i]) continue;

    const event = events[i];
    await executeTx(event.args[0]);
  }

  // check events afrer run
  const eventsAfter = await getUnsolvedEvents();
  console.log(`Still unsolved events: ${eventsAfter.length}`);

  if (eventsAfter.length === 0) return startBlock;

  return lastEventBlock;
}

(async function main() {
  console.log('Running...');
  proxy = await getProxy(txSigner, geb);
  startBlock = await run(startBlock); // start scan from next block
  setTimeout(main, timeout); // every timeout ms
})();
