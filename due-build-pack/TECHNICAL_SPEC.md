# Technical specification

## Architecture

```
Freighter (testnet)
    |
    v
Next.js page  --simulate / send-->  Stellar RPC (testnet)
    |                                    |
    |                                    v
    +-- read get() and events ----- Soroban contract Due
                                         |
                                         +-- SEP-41 transfer --> USDC SAC
```

No application server. No database as the source of truth. The page can cache event reads in memory. Evidence must match the chain.

## Stack

- Contract: Rust, soroban-sdk 28. Build with `stellar contract build` from stellar-cli 25.2.0 or newer. A plain cargo wasm build fails on that SDK.
- Tests: `cargo test` in the Soroban test environment, using the native token contract as the USDC stand-in.
- Web: Next.js, React, TypeScript. Current stable is fine. Do not block on a specific minor version.
- Wallet: Stellar Wallets Kit, Freighter first. Hardcode testnet passphrase `Test SDF Network ; September 2015`.
- Chain reads: Stellar RPC for simulations and sends. Horizon is optional for trustline checks.
- Explorer links: `https://stellar.expert/explorer/testnet/tx/<hash>` and `https://stellar.expert/explorer/testnet/contract/<id>`.

## Token

Classic testnet USDC:

- Code: `USDC`
- Issuer: `GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5`
- Decimals: 7

Resolve the SAC contract id from that asset with the Stellar SDK (`new Asset('USDC', issuer).contractId(Networks.TESTNET)` or the current equivalent). Pass that address into `open` for the demo. The contract stores the token address on the due and calls `transfer` on it. It does not embed Circle's address.

Recipient must have a trustline before they can receive. The open flow checks Horizon and, if missing, offers the change-trust transaction. Do not hide this.

## Accounts

Two testnet accounts, created with `stellar keys generate` or Friendbot.

- Recipient: USDC trustline, opens the seeded due.
- Payer: Friendbot XLM, Circle testnet faucet USDC, at least 20 USDC so the judge can pay 10 and still attempt 9.

Secrets stay in `.env.local`, gitignored. The README may publish the payer secret as a testnet demo key if the page needs a one-click path. First line of the README says it holds no value.

## Repo layout

```
due/
  contracts/due/          Rust contract
  web/                    Next.js app
  docs/evidence.md        contract id, wasm hash, tx hashes
  docs/DEMO.md            90-second script
  docs/DECISIONS.md       only if an agent had to choose
  README.md
  .env.example
```

## Environments

| Name | Value |
| --- | --- |
| Network | Stellar testnet |
| Passphrase | Test SDF Network ; September 2015 |
| RPC | https://soroban-testnet.stellar.org |
| Horizon | https://horizon-testnet.stellar.org |
| Friendbot | https://friendbot.stellar.org |
| USDC issuer | GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5 |

If the public RPC rate-limits, use the SDF testnet RPC the CLI is already configured for. Do not switch networks.

## Security

- `require_auth` on the recipient in `open` and on the payer in `pay`.
- `pay` never accepts a recipient argument. It reads the stored one.
- No constructor admin. Deployer has no retained role.
- Integer amounts only. Reject zero.
- Deadline is a ledger timestamp (`env.ledger().timestamp()`), not a ledger sequence.

## Observability

Events are the public record. Names: `DueOpened`, `DuePaid`, `DueRejected` only if you emit on the explicit wrong-amount path before returning the error, `DueClosed`. The page must still work if it only polls `get`.
