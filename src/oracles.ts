import type {Contract, Event} from 'ethers';
import {providers, Wallet} from 'ethers';
import dotenv from 'dotenv';
import {getEnvVariable} from './utils/misc';

dotenv.config();

/* ==============================================================/*
                          SETUP
/*============================================================== */

// environment variables usage
const provider = new providers.JsonRpcProvider(getEnvVariable('RPC_HTTPS_URI'));
const txSigner = new Wallet(getEnvVariable('TX_SIGNER_PRIVATE_KEY'), provider);

const {oracleJob: job} = Contract;// TODO: declare oracleJob

/**
 * chain = 420 (op goerli)
 * address = 0x140afB8dbdba2F7f47f45f9a4aa3142920BA5a20
 * abi = src/abis/OracleJob.json
 */

// Flag to track if there's a transaction in progress.
// This is used to prevent multiple transactions from being sent at the same time.
const txInProgress: Record<string, boolean> = {};


/* ==============================================================/*
                       MAIN SCRIPT
/*============================================================== */

export async function run(): Promise<void> {
  await Promise.all(
    // TODO: create a list (hardcoded for now) of collateral types ['WETH','OP','WBTC','STONES','TOTEM']
    // CollateralTypes are defined by bytes32('cType') in solidity, they should look like 0x574554480000
    collateralTypes.map(async (event: Event) => {
      await Promise.all(
        /**
         * try oracleJob.updateCollateralPrice(cType)
         * if it works:
         * - tx in progress: true
         * - broadcast
         */
        broadcast
      );
    }),
  );
}


(async () => {
  await run();
})();
