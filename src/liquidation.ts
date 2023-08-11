import { Bytes, Contract, utils } from 'ethers';
import { providers, Wallet } from 'ethers';
import dotenv from 'dotenv';
import LiquidationJobAbi from './abis/LiquidationJob.json';
import SafeManagerAbi from './abis/SafeManager.json';
import { env } from 'process';
import { checkBalance } from './utils/misc';
import * as BatchWorkable from '../solidity/artifacts/contracts/BatchLiquidator.sol/BatchLiquidator.json';

dotenv.config();

/* ==============================================================/*
                          SETUP
/*============================================================== */

// environment variables usage
const provider = new providers.JsonRpcProvider(env.RPC_HTTPS_URI);
const txSigner = new Wallet(env.TX_SIGNER_PRIVATE_KEY as any as Bytes, provider);

const liquidationJob = new Contract('0xAD038eFce5dE9DBC1acfe2e321Dd8F2D6f16e26b', LiquidationJobAbi, txSigner);
const safeManager = new Contract('0xc0C6e2e5a31896e888eBEF5837Bb70CB3c37D86C', SafeManagerAbi, txSigner);
const maxChunkSize = 100;

const executeTx = async (id: number, cType: any, safeHandler: any) => {
  let tx;
  let gasUnits;
  let gasPrice;
  let txFee;

  // estimate gas
  console.log(`Executing: Work Liquidation Id: ${id}`);

  try {
    gasUnits = await liquidationJob.estimateGas.workLiquidation(cType, safeHandler);
    gasUnits = gasUnits.mul(12).div(10); // add 20% buffer
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
    tx = await liquidationJob.workLiquidation(cType, safeHandler, { gasLimit: gasUnits });
    await tx.wait();
    console.log(`Successfully broadcasted: Work Liquidation Id: ${id}`);
  } catch (err) {
    console.log(`Failed to broadcast: Work Liquidation Id: ${id}`);
    console.log(err);
  }
};

/* ==============================================================/*
                       MAIN SCRIPT
/*============================================================== */

export async function run(): Promise<void> {
  const openSafeEvents = (await safeManager.queryFilter(safeManager.filters.OpenSAFE())) as any;
  const safeIds = openSafeEvents.map((event: any) => event.args[2]);

  // emulate batch with chunks
  let decodedAll: any[] = [];
  for (let i = 0; i < safeIds.length; i += maxChunkSize) {
    const safeIdsChunk = safeIds.slice(i, i + maxChunkSize);
    const inputData = utils.defaultAbiCoder.encode(
      ['address', 'address', 'uint256[]'],
      [liquidationJob.address, safeManager.address, safeIdsChunk]
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
  console.log('Running...');
  await run();
  setTimeout(main, 2 * 60 * 1000); // every 2 minutes
})();
