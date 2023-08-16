import { utils } from 'ethers';
import { providers, Wallet } from 'ethers';
import dotenv from 'dotenv';
import { env } from 'process';
import { checkBalance, getProxy } from './utils/misc';
import * as BatchWorkable from '../solidity/artifacts/contracts/BatchLiquidator.sol/BatchLiquidator.json';
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

const maxChunkSize = 100;

const typeMapping: any = {
  '0x5745544800000000000000000000000000000000000000000000000000000000': 'WETH',
  '0x4f50000000000000000000000000000000000000000000000000000000000000': 'OP',
  '0x5742544300000000000000000000000000000000000000000000000000000000': 'WBTC',
  '0x53544f4e45530000000000000000000000000000000000000000000000000000': 'STN',
  '0x544f54454d000000000000000000000000000000000000000000000000000000': 'TTM',
};

const executeTx = async (id: number, cType: any, safeHandler: any) => {
  let tx;
  let gasUnits;
  let gasPrice;
  let txFee;

  // estimate gas
  console.log(`Executing: Work Liquidation Id: ${id}`);

  try {
    gasUnits = await geb.contracts.liquidationJob.estimateGas.workLiquidation(cType, safeHandler);
    gasUnits = gasUnits.mul(15).div(10); // add 50% buffer
    gasPrice = await provider.getGasPrice();
    txFee = gasUnits.mul(gasPrice);
  } catch (e) {
    console.log(`Failed to estimate gas for Work Liquidation Id: ${id}`);
    console.log(e);
    return;
  }

  // check if we have enough funds for gas
  const signerBalance = await provider.getBalance(txSigner.address);
  try {
    checkBalance(signerBalance, txFee);
  } catch (e) {
    console.log(`Insufficient balance for Work Liquidation Id: ${id}`);
    console.log(`Balance is ${utils.formatUnits(signerBalance, 'ether')}, but tx fee is ${utils.formatUnits(txFee, 'ether')}`);
    return;
  }

  // broadcast tx
  try {
    const cTypeName = typeMapping[cType];
    tx = await proxy.liquidateSAFE(cTypeName, safeHandler); // it wants cType to be an actial name of token (@hai-on-op/sdk/src/proxy-action.ts:449:44)
    if (!tx) throw new Error('No transaction request!');

    tx.gasLimit = gasUnits;
    const txData = await txSigner.sendTransaction(tx);
    const txReceipt = await txData.wait();

    console.log(`Successfully broadcasted: Work Liquidation Id: ${id}`);

    return txReceipt;
  } catch (err) {
    console.log(`Failed to broadcast: Work Liquidation Id: ${id}`);
    console.log(err);
  }
};

/* ==============================================================/*
                       MAIN SCRIPT
/*============================================================== */

export async function run(): Promise<void> {
  const openSafeEvents = (await geb.contracts.safeManager.queryFilter(geb.contracts.safeManager.filters.OpenSAFE())) as any;
  const safeIds = openSafeEvents.map((event: any) => event.args[2]);

  // emulate batch with chunks
  let decodedAll: any[] = [];
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
  // execute batch
  for (let i = 0; i < decodedAll.length; i++) {
    const [emulated, cType, safeHandler] = decodedAll[i];
    if (!emulated) continue;

    await executeTx(safeIds[i], cType, safeHandler);
  }
}

(async function main() {
  proxy = await getProxy(txSigner, geb);

  console.log('Running...');
  await run();
  setTimeout(main, 2 * 60 * 1000); // every 2 minutes
})();
