import { Bytes, Contract, utils } from 'ethers';
import { providers, Wallet } from 'ethers';
import dotenv from 'dotenv';
import OracleJobAbi from './abis/OracleJob.json';
import { env } from 'process';

dotenv.config();

/* ==============================================================/*
                          SETUP
/*============================================================== */

// environment variables usage
const provider = new providers.JsonRpcProvider(env.RPC_HTTPS_URI);
const txSigner = new Wallet(env.TX_SIGNER_PRIVATE_KEY as any as Bytes, provider);

const oracleJob = new Contract('0xCC81b8E22Bc48133125BDa642C452EC6A52853C8', OracleJobAbi, txSigner);

const collateralTypes: string[] = [
  utils.formatBytes32String('WETH'), // WETH
  utils.formatBytes32String('OP'), // OP
  utils.formatBytes32String('WBTC'), // WBTC
  utils.formatBytes32String('STONES'), // STONES
  utils.formatBytes32String('TOTEM'), // TOTEM
];

// Flag to track if there's a transaction in progress.
// This is used to prevent multiple transactions from being sent at the same time.
let txInProgress: boolean;

/* ==============================================================/*
                       MAIN SCRIPT
/*============================================================== */

export async function run(): Promise<void> {
  await Promise.all(
    collateralTypes.map(async (cType: string) => {
      if (txInProgress) return;

      let tx;
      let gasUnits;
      let gasPrice;
      let txFee;
      // emulate tx
      try {
        console.log(`Emulating: ${cType}`);
        await oracleJob.callStatic.workUpdateCollateralPrice(cType);
        txInProgress = true;

        gasUnits = await oracleJob.estimateGas.workUpdateCollateralPrice(cType);
        gasUnits = gasUnits.mul(12).div(10); // add 20% buffer
        gasPrice = await provider.getGasPrice();
        txFee = gasUnits.mul(gasPrice);
        console.log(`Successfully emulated: ${cType}`);
      } catch (err) {
        txInProgress = false;
        console.log(`Unsuccessfull emulation: ${cType}`);
        return;
      }

      // check if we have enough funds for gas
      const signerBalance = await provider.getBalance(txSigner.address);
      if (signerBalance.lt(txFee)) {
        console.log(`Insufficient balance for ${cType}`);
        console.log(`Balance is ${utils.formatUnits(signerBalance, 'ether')}, but tx fee is ${utils.formatUnits(txFee, 'ether')}`);
        txInProgress = false;
        return;
      }
      // broadcast tx
      try {
        tx = await oracleJob.workUpdateCollateralPrice(cType, { gasLimit: gasUnits });
        // wait for tx to be mined
        await tx.wait();

        console.log(`Successfully broadcasted: ${cType}`);
      } catch (err) {
        console.log(`Failed to broadcast: ${cType}`);
        console.log(err);
      }

      txInProgress = false;
    })
  );
}

(async function main() {
  console.log('Running...');
  await run();
  setTimeout(main, 15 * 1000); // every 15 seconds
})();
