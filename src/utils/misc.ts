export const checkBalance = (signerBalance: any, txFee: any) => {
  if (signerBalance.lt(txFee)) {
    throw Error(`Insufficient balance`);
  }
  return signerBalance;
};

export const getProxy = async (txSigner: any, geb: any) => {
  let proxy;
  try {
    console.log('Getting proxy...');
    proxy = await geb.getProxyAction(txSigner.address);
  } catch (error: string | any) {
    console.log('Deploying new proxy...');
    await geb.deployProxy();

    proxy = await geb.getProxyAction(txSigner.address);
  }
  return proxy;
};
