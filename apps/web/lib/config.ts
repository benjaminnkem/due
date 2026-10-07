// Public testnet values. Override with NEXT_PUBLIC_* env vars.
export const CONTRACT_ID =
  process.env.NEXT_PUBLIC_CONTRACT_ID ||
  "CA37U34JBHVRCIAIHWMZKV4BGMOWLA5Z6EJGGBS6MHOTU7L7WXH2YIHF";
export const USDC_ISSUER =
  process.env.NEXT_PUBLIC_USDC_ISSUER ||
  "GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5";
export const RPC_URL =
  process.env.NEXT_PUBLIC_RPC_URL || "https://soroban-testnet.stellar.org";
export const HORIZON_URL =
  process.env.NEXT_PUBLIC_HORIZON_URL || "https://horizon-testnet.stellar.org";
export const NETWORK_PASSPHRASE =
  process.env.NEXT_PUBLIC_NETWORK_PASSPHRASE || "Test SDF Network ; September 2015";
export const SEEDED_DUE_ID = Number(process.env.NEXT_PUBLIC_SEEDED_DUE_ID || "2");

export const EXPERT = "https://stellar.expert/explorer/testnet";
export const txUrl = (hash: string) => `${EXPERT}/tx/${hash}`;
export const contractUrl = (id: string) => `${EXPERT}/contract/${id}`;
export const accountUrl = (id: string) => `${EXPERT}/account/${id}`;
