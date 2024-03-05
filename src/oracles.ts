import dotenv from 'dotenv';
import { getTxFeeAndCheckBalance, processTx, getVariables } from './utils/misc';

dotenv.config();

const sepoliacollateralTypes: string[] = ['WETH', 'OP', 'WBTC', 'STN', 'TTM'];
const mainnetCollateralTypes: string[] = ['WETH', 'OP', 'WSTETH'];

const collateralTypes = process.env.NETWORK === 'optimism-sepolia' ? sepoliacollateralTypes : mainnetCollateralTypes;

/* ==============================================================/*
                        HELPING SCRIPTS
/*============================================================== */

const emulateTxBatch = async (collateralTypes: string[], geb: any) => {
  return await Promise.all(
    collateralTypes.map(async (cType) => {
      const bytes32CType = geb.tokenList[cType].bytes32String;
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

const broadcastTx = async (cType: any, proxy: any, txSigner: any, gasUnits: any) => {
  try {
    const tx = await proxy.updateOraclePrice(cType);
    await processTx(tx, txSigner, gasUnits);

    console.log(`Successfully broadcasted: ${cType}`);
  } catch (err) {
    console.log(`Failed to broadcast: ${cType}`);
    throw err;
  }
};

/* ==============================================================/*
                       RUN SCRIPT
/*============================================================== */

export async function run(provider: any, txSigner: any, geb: any, proxy: any): Promise<void> {
  console.log('Running...');
  try {
    // emulate batch
    const succeed = await emulateTxBatch(collateralTypes, geb);

    // execute sequentially
    for (let i = 0; i < collateralTypes.length; i++) {
      if (!succeed[i]) continue;

      // get bytes32CType
      const cType = collateralTypes[i];
      const bytes32CType = geb.tokenList[cType].bytes32String;

      // estimage gas
      let gasUnits = await geb.contracts.oracleJob.estimateGas.workUpdateCollateralPrice(bytes32CType);
      gasUnits = gasUnits.mul(15).div(10); // add 50% buffer

      // get tx fee and check balance
      await getTxFeeAndCheckBalance(gasUnits, provider, txSigner);

      // broadcast tx
      await broadcastTx(cType, proxy, txSigner, gasUnits);
    }
  } catch (err) {
    console.log(err);
  }

  // run every 15 seconds
  setTimeout(run, 15 * 1000, provider, txSigner, geb, proxy);
}

/* ==============================================================/*
                       MAIN SCRIPT
/*============================================================== */

(async function main() {
  const { provider, txSigner, geb, proxy } = await getVariables();
  await run(provider, txSigner, geb, proxy);
})();
