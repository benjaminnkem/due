"use client";

import { StellarWalletsKit } from "@creit.tech/stellar-wallets-kit/sdk";
import { FreighterModule } from "@creit.tech/stellar-wallets-kit/modules/freighter";
import { Networks } from "@stellar/stellar-sdk";
import { NETWORK_PASSPHRASE } from "./config";

let ready = false;
function init() {
  if (ready) return;
  StellarWalletsKit.init({
    modules: [new FreighterModule()],
    network: Networks.TESTNET,
  });
  ready = true;
}

export async function connect(): Promise<string> {
  init();
  const { address } = await StellarWalletsKit.authModal();
  return address;
}

export async function disconnect() {
  init();
  await StellarWalletsKit.disconnect();
}

/** Returns the wallet's network passphrase, or null if it can't be read. */
export async function walletPassphrase(): Promise<string | null> {
  init();
  try {
    const { networkPassphrase } = await StellarWalletsKit.getNetwork();
    return networkPassphrase;
  } catch {
    return null;
  }
}

export async function sign(xdr: string, address: string): Promise<string> {
  init();
  const { signedTxXdr } = await StellarWalletsKit.signTransaction(xdr, {
    networkPassphrase: NETWORK_PASSPHRASE,
    address,
  });
  return signedTxXdr;
}
