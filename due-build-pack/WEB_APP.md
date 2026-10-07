# Web app specification

One public page. No accounts, no dashboard product, no marketing site with five routes.

## Stack

Next.js and TypeScript in `web/`. Wallet via `@creit.tech/stellar-wallets-kit` with Freighter. Contract calls via `@stellar/stellar-sdk`. Environment:

```
NEXT_PUBLIC_CONTRACT_ID=
NEXT_PUBLIC_USDC_ISSUER=GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5
NEXT_PUBLIC_RPC_URL=https://soroban-testnet.stellar.org
NEXT_PUBLIC_NETWORK_PASSPHRASE=Test SDF Network ; September 2015
NEXT_PUBLIC_SEEDED_DUE_ID=
```

## States the page must show

- Wallet disconnected.
- Wallet on the wrong network. Stop. Tell them to switch to testnet.
- Seeded due loaded from `get`. Show amount, recipient (short address), deadline, reference, status.
- Paying: button disabled, "waiting for the wallet", then "waiting for the ledger".
- Paid: status, payer, Expert link.
- Rejected attempt: the error name `WrongAmount` and the Expert link if a tx was submitted.
- Expired open due: Close button.

## Actions

- Connect Freighter.
- Pay exact. Builds `pay(payer, id, token, due.amount)`.
- Pay 9 USDC. Builds `pay` with amount `90_000_000` against a 10 USDC due. Expect `WrongAmount`.
- Close, only if open and past deadline.
- Copy hash. Link to Stellar Expert.

Open a new due is optional. If included, a form with amount, deadline, and reference. Recipient is the connected wallet. Token is the resolved USDC SAC. Not required for the judge path.

## Trustline

Before pay, read the recipient trustline on Horizon. If missing, show "Recipient has no USDC trustline" and do not send. The seeded recipient must already have one.

## Visual

Plain, dense, readable. Off-white background, near-black text, one accent. No purple gradient template, no stock crypto hero. The due is the page. Contract id in the footer, linked to Expert.

Mobile width must not overflow. The judge may open the link on a phone.

## Copy

Title: Due.
Line under it: A Stellar invoice that only settles an exact, on-time payment.
Limits, visible, not in a footer only: Testnet USDC. Not a legal invoice. A wrong recipient address still gets paid.

## Deploy

Vercel or any static host. Public URL required for submission. Build must succeed with the contract id set.
