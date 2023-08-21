import dotenv from 'dotenv';
import { getTxFeeAndCheckBalance, processTx, getVariables } from './utils/misc';
import { utils } from 'ethers';
import * as BatchWorkable from '../solidity/artifacts/contracts/BatchLiquidator.sol/BatchLiquidator.json';

dotenv.config();

const maxChunkSize = 100;

const typeMapping: any = {
  '0x5745544800000000000000000000000000000000000000000000000000000000': 'WETH',
  '0x4f50000000000000000000000000000000000000000000000000000000000000': 'OP',
  '0x5742544300000000000000000000000000000000000000000000000000000000': 'WBTC',
  '0x53544f4e45530000000000000000000000000000000000000000000000000000': 'STN',
  '0x544f54454d000000000000000000000000000000000000000000000000000000': 'TTM',
};

/* ==============================================================/*
                        HELPING SCRIPTS
/*============================================================== */

const emulateTxBatchWithChunks = async (safeIds: any[], geb: any, provider: any) => {
  let decodedAll: any[] = [];
  try {
    // emulate batch with chunks
    for (let i = 0; i < safeIds.length; i += maxChunkSize) {
      const safeIdsChunk = safeIds.slice(i, i + maxChunkSize);
      const inputData = utils.defaultAbiCoder.encode(
        ['address', 'address', 'uint256[]'],
        [geb.contracts.liquidationJob.address, geb.contracts.safeManager.address, safeIdsChunk]
      );
      const contractCreationCode = BatchWorkable.bytecode.concat(inputData.slice(2));
      const returnedData = await provider.call({ data: contractCreationCode });
      const [decoded] = utils.defaultAbiCoder.decode(['tuple(bool,bytes32,address)[]'], returnedData);
      decodedAll = decodedAll.concat(decoded);
    }
  } catch (err) {
    console.log('Failed to emulate batch');
    throw err;
  }
  return decodedAll;
};

const broadcastTx = async (id: any, cType: any, safeHandler: any, proxy: any, txSigner: any, gasUnits: any) => {
  try {
    const cTypeName = typeMapping[cType];
    const tx = await proxy.liquidateSAFE(cTypeName, safeHandler); // it wants cType to be an actial name of token (@hai-on-op/sdk/src/proxy-action.ts:449:44)
    await processTx(tx, txSigner, gasUnits);

    console.log(`Successfully broadcasted: Work Liquidation Id: ${id}`);
  } catch (err) {
    console.log(`Failed to broadcast: Work Liquidation Id: ${id}`);
    throw err;
  }
};

/* ==============================================================/*
                       RUN SCRIPT
/*============================================================== */

export async function run(provider: any, txSigner: any, geb: any, proxy: any): Promise<void> {
  console.log('Running...');

  try {
    // get all open safes
    const openSafeEvents = (await geb.contracts.safeManager.queryFilter(geb.contracts.safeManager.filters.OpenSAFE())) as any;
    const safeIds = openSafeEvents.map((event: any) => event.args[2]);

    // emulate batch
    const decodedAll = await emulateTxBatchWithChunks(safeIds, geb, provider);

    console.log(
      'Successfully emulated batch:',
      decodedAll.reduce((partialSum, a) => partialSum + a[0], 0)
    );

    // execute batch
    for (let i = 0; i < decodedAll.length; i++) {
      const [emulated, cType, safeHandler] = decodedAll[i];
      if (!emulated) continue;

      console.log(`Executing: Work Liquidation Id: ${safeIds[i]}`);

      // estimage gas
      let gasUnits = await geb.contracts.liquidationJob.estimateGas.workLiquidation(cType, safeHandler);
      gasUnits = gasUnits.mul(150).div(100); // add 50% for safety

      // get tx fee and check balance
      await getTxFeeAndCheckBalance(gasUnits, provider, txSigner);

      // broadcast tx
      await broadcastTx(safeIds[i], cType, safeHandler, proxy, txSigner, gasUnits);
    }
  } catch (err) {
    console.log(err);
  }

  // run every 2 minutes
  setTimeout(run, 2 * 60 * 1000, provider, txSigner, geb, proxy);
}

/* ==============================================================/*
                       MAIN SCRIPT
/*============================================================== */

(async function main() {
  const { provider, txSigner, geb, proxy } = await getVariables();
  await run(provider, txSigner, geb, proxy);
})();
