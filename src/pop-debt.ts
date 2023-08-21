import dotenv from 'dotenv';
import { getTxFeeAndCheckBalance, processTx, getVariables } from './utils/misc';

dotenv.config();

/* ==============================================================/*
                        HELPING SCRIPTS
/*============================================================== */

const emulateTxBatch = async (events: any[], geb: any) => {
  return await Promise.all(
    events.map(async (event) => {
      const timestamp = event.args[0];
      try {
        await geb.contracts.accountingJob.callStatic.workPopDebtFromQueue(timestamp);
        console.log(`Successfully emulated:`, timestamp.toString());
      } catch (e) {
        console.log(`Unsuccessfull emulation:`, timestamp.toString());
        return false;
      }
      return true;
    })
  );
};

const broadcastTx = async (timestamp: any, proxy: any, txSigner: any, gasUnits: any) => {
  try {
    const tx = await proxy.popDebtFromQueue(timestamp);
    await processTx(tx, txSigner, gasUnits);

    console.log(`Successfully broadcasted: Pop Debt ${timestamp}`);
  } catch (err) {
    console.log(`Failed to broadcast: Pop Debt ${timestamp}`);
    throw err;
  }
};

// find unpoped push events
const getUnsolvedEvents = async (geb: any) => {
  const pushEvents = (await geb.contracts.accountingEngine.queryFilter(geb.contracts.accountingEngine.filters.PushDebtToQueue())) as any;
  const popEvents = (await geb.contracts.accountingEngine.queryFilter(geb.contracts.accountingEngine.filters.PopDebtFromQueue())) as any;

  const popTimestamps = popEvents.map((event: any) => event.args[0].toString());
  const events = pushEvents.filter((pushEvent: any) => !popTimestamps.includes(pushEvent.args[0].toString()));
  return events;
};

/* ==============================================================/*
                       RUN SCRIPT
/*============================================================== */

export async function run(provider: any, txSigner: any, geb: any, proxy: any) {
  console.log('Running...');

  // process historical events
  const events = await getUnsolvedEvents(geb);
  console.log(`Found unsolved events: ${events.length}`);

  // emulate batch
  const succeed = await emulateTxBatch(events, geb);

  // process succeed events
  for (let i = 0; i < events.length; i++) {
    if (!succeed[i]) continue;

    const timestamp = events[i].args[0];

    // estimate gas
    let gasUnits = await geb.contracts.accountingJob.estimateGas.workPopDebtFromQueue(timestamp);
    gasUnits = gasUnits.mul(20).div(10); // add 100% buffer

    // get tx fee and check balance
    await getTxFeeAndCheckBalance(gasUnits, provider, txSigner);

    // broadcast tx
    await broadcastTx(timestamp, proxy, txSigner, gasUnits);
  }

  // check events afrer run
  const eventsAfter = await getUnsolvedEvents(geb);
  console.log(`Still unsolved events: ${eventsAfter.length}`);

  // run every 15 minutes
  setTimeout(run, 15 * 1000 * 60, provider, txSigner, geb, proxy);
}

/* ==============================================================/*
                       MAIN SCRIPT
/*============================================================== */

(async function main() {
  const { provider, txSigner, geb, proxy } = await getVariables();
  await run(provider, txSigner, geb, proxy);
})();
