export const checkBalance = (signerBalance: any, txFee: any) => {
  if (signerBalance.lt(txFee)) {
    throw Error(`Insufficient balance`);
  }
  return signerBalance;
};
