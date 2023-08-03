import { Bytes, Contract, utils } from 'ethers';
import { providers, Wallet } from 'ethers';
import dotenv from 'dotenv';
import AccountingEngineAbi from './abis/AccountingEngine.json';
import AccountingJobAbi from './abis/AccountingJob.json';
import { env } from 'process';
import { checkBalance } from './utils/misc';

dotenv.config();

/* ==============================================================/*
                          SETUP
/*============================================================== */

// environment variables usage
const provider = new providers.JsonRpcProvider(env.RPC_HTTPS_URI);
const txSigner = new Wallet(env.TX_SIGNER_PRIVATE_KEY as any as Bytes, provider);

const accountingEngine = new Contract('0xE26EE6aD8eb35360D61052457AB696cf09acE962', AccountingEngineAbi, txSigner);
const accountingJob = new Contract('0x31b48F4e4610a8f0BcAec5Af3E414688FB3320a4', AccountingJobAbi, txSigner);

const timeout = 5 * 1000 * 60; // 15 minutes

let startBlock = 0;

const executeTx = async (timestamp: any) => {
  let tx;
  let gasUnits;
  let gasPrice;
  let txFee;

  // try to execute locally
  try {
    // emutale tx
    console.log(`Emulating: Pop Debt ${timestamp}`);
    await accountingJob.callStatic.workPopDebtFromQueue(timestamp);
    gasUnits = await accountingJob.estimateGas.workPopDebtFromQueue(timestamp);
    gasUnits = gasUnits.mul(12).div(10); // add 20% buffer
    gasPrice = await provider.getGasPrice();
    txFee = gasUnits.mul(gasPrice);
    console.log(`Successfully emulated: Pop Debt ${timestamp}`);
  } catch (e) {
    console.log(`Unsuccessfull emulation: Pop Debt ${timestamp}`);
    console.log(e);
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
    tx = await accountingJob.workPopDebtFromQueue(timestamp, { gasLimit: gasUnits });
    await tx.wait();
    console.log(`Successfully broadcasted: Pop Debt ${timestamp}`);
  } catch (err) {
    console.log(`Failed to broadcast: Pop Debt ${timestamp}`);
    console.log(err);
  }
};

// find unpoped push events
const getUnsolvedEvents = async () => {
  const pushEvents = (await accountingEngine.queryFilter(accountingEngine.filters.PushDebtToQueue())) as any;
  const popEvents = (await accountingEngine.queryFilter(accountingEngine.filters.PopDebtFromQueue())) as any;

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
  await Promise.all(
    events.map(async (event: any) => {
      console.log(`Processing historical event: ${event.args[0]}`);
      await executeTx(event.args[0]);
    })
  );

  // check events afrer run

  const eventsAfter = await getUnsolvedEvents();
  console.log(`Still unsolved events: ${eventsAfter.length}`);

  if (eventsAfter.length === 0) return startBlock;

  return lastEventBlock;
}

(async function main() {
  console.log('Running...');
  startBlock = await run(startBlock); // start scan from next block
  setTimeout(main, timeout); // every timeout ms
})();
