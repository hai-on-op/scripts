import dotenv from 'dotenv';
import { getTxFeeAndCheckBalance, processTx, getVariables } from './utils/misc';

dotenv.config();
// geb.contracts.accountingJob.callStatic.workAuctionSurplus();

/* ==============================================================/*
                        HELPING SCRIPTS
/*============================================================== */

const emulateTx = async (geb: any) => {
  try {
    await geb.contracts.accountingJob.callStatic.workAuctionSurplus();
    console.log('Successfully emulated');
  } catch (err) {
    throw 'Failed to emulate tx';
  }
};

const broadcastTx = async (proxy: any, txSigner: any, gasUnits: any) => {
  try {
    const tx = await proxy.surplusAuctionStart();
    await processTx(tx, txSigner, gasUnits);
    console.log('Successfully broadcasted');
  } catch (err) {
    console.log('Failed to broadcast tx');
    throw err;
  }
};

/* ==============================================================/*
                        RUN SCRIPT
/*============================================================== */

export async function run(provider: any, txSigner: any, geb: any, proxy: any): Promise<any> {
  console.log('Running...');

  try {
    // emulate tx
    await emulateTx(geb);

    // estimage gas
    let gasUnits = await geb.contracts.accountingJob.estimateGas.workAuctionSurplus();
    gasUnits = gasUnits.mul(150).div(100); // add 50% for safety

    // get tx fee and check balance
    await getTxFeeAndCheckBalance(gasUnits, provider, txSigner);

    // broadcast tx
    await broadcastTx(proxy, txSigner, gasUnits);
  } catch (err) {
    console.log(err);
  }

  // run every 15 minutes
  setTimeout(run, 15 * 60 * 1000, provider, txSigner, geb, proxy);
}

/* ==============================================================/*
                        MAIN SCRIPT
/*============================================================== */

(async function main() {
  const { provider, txSigner, geb, proxy } = await getVariables();
  await run(provider, txSigner, geb, proxy);
})();
