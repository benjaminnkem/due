# Due

Due is a Stellar invoice that only settles an exact, on-time USDC payment.
Testnet only. Nothing here holds real value.
Not a legal invoice. Not an anchor. Not audited. A due paid to a mistyped recipient still pays that address.

A Soroban contract is the invoice. It fixes the recipient, the asset, the amount and the deadline when the due is opened. Paying it moves testnet USDC from payer to recipient in the same transaction, and only if all of those match. A wrong amount, a wrong asset, a late payment or a second payment is refused before any funds move.

| | |
| --- | --- |
| Network | Stellar testnet |
| Contract | [`CA37U34JBHVRCIAIHWMZKV4BGMOWLA5Z6EJGGBS6MHOTU7L7WXH2YIHF`](https://stellar.expert/explorer/testnet/contract/CA37U34JBHVRCIAIHWMZKV4BGMOWLA5Z6EJGGBS6MHOTU7L7WXH2YIHF) |
| Wasm hash | `58d026b3c867d3583f633a4502c9e31ff0cc2d97133eece49ab2116fc63ded48` |
| Token | Circle testnet USDC, `USDC:GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5` |
| Evidence | [`docs/evidence.md`](docs/evidence.md) |

## The problem

A Stellar payment succeeds even when it is the wrong amount, the wrong asset, or late. The invoice lives in a chat or a PDF, and the chain only knows that some tokens moved.

A tailor finishes a job priced at 50 dollars and asks for 50 USDC, invoice 18. The buyer sends 45, or the right amount in another asset, or pays after the date. The network accepts all three. The tailor cannot match the payment to the invoice, and sorting it out becomes a conversation. Nothing on-chain records what was owed.

Due makes the invoice the thing you pay. The terms live in the contract, so the contract can refuse a payment that does not meet them.

## How it works

```
Recipient                      Due contract                         Payer
    |  open(recipient, token,        |                                |
    |       amount, deadline, ref)   |                                |
    |------------------------------->|  stores the due, emits         |
    |                                |  DueOpened                     |
    |                                |                                |
    |                                |   pay(payer, id, token, amount)|
    |                                |<-------------------------------|
    |                                |  checks status, deadline,      |
    |                                |  token, amount                 |
    |<===== USDC transfer, payer -> recipient, same transaction ======|
    |                                |  marks Paid, stores payer,     |
    |                                |  emits DuePaid                 |
```

1. The recipient opens a due: their address, USDC, an exact amount, a deadline and a short reference.
2. The payer pays that due, not a raw address.
3. If the asset, amount and time match and the due is still open, the contract calls `transfer` on the USDC Stellar Asset Contract. Funds go straight from payer to recipient. The contract never holds a balance.
4. After the deadline anyone can close an unpaid due. Nothing was locked, so nothing is refunded. The record stays: opened, never paid.

## Verified on testnet

Every claim below can be opened on Stellar Expert without trusting this page.

| What | Transaction |
| --- | --- |
| Due opened (10 USDC, `invoice 18`) | [`098b8fc1…c3b9`](https://stellar.expert/explorer/testnet/tx/098b8fc1232104671aa44255afebdb9f38d69235632366180903b6d5cd84c3b9) |
| Paid, 10 USDC, due 1 (CLI) | [`254c65c0…41b4`](https://stellar.expert/explorer/testnet/tx/254c65c0bfb25dd57564b2ac50c34d91f233d1814316aaa6f37627b4746141b4) |
| Paid, 10 USDC, due 3 (web page and Freighter) | [`ed17cf2a…c373`](https://stellar.expert/explorer/testnet/tx/ed17cf2ae6330c20fb4ddf9d74ae552b07f1f7fbe7064d83d4ef3230a239c373) |
| Rejected, 9 USDC against a 10 USDC due, `WrongAmount` | [`98df0db4…eb81`](https://stellar.expert/explorer/testnet/tx/98df0db46ee67e53dad279e574bea57ccfe72593834ac6b8d63f57efc7b2eb81) |

The rejected payment is a real failed transaction on the ledger, not only a simulation error. No USDC moved: the recipient's balance is unchanged by it.

### How a rejected payment gets a hash

A normal client simulates a call first, and a call that the contract refuses fails in simulation and never reaches the ledger, so it has no hash. To make the rejection verifiable, the page's "Try paying 9 USDC" button takes the resource footprint from a simulation of the exact amount, then submits the call with the wrong amount and a matching authorization entry. The contract refuses it before it reaches `transfer`, and the failed transaction is recorded with its own hash. The page reads the transaction's diagnostic events to show the contract's error name.

## The contract

Soroban, Rust, `soroban-sdk` 28. Source in [`contracts/due`](contracts/due/src/lib.rs).

### Functions

| Function | Auth | What it does |
| --- | --- | --- |
| `open(recipient, token, amount, deadline, reference) -> u32` | recipient | Stores a new open due and returns its id. `amount` must be above zero and `deadline` must be in the future. |
| `pay(payer, id, token, amount)` | payer | Transfers `amount` of `token` from payer to the stored recipient, marks the due `Paid` and records the payer. |
| `close(id)` | none | Marks an unpaid due `Closed` once the deadline has passed. |
| `get(id) -> Due` | none | Reads a due. |

`pay` never takes a recipient argument. It reads the one stored when the due was opened. The `token` and `amount` arguments exist so a wrong attempt fails with Due's own error instead of a generic token error.

### Errors

| Code | Name | Raised when |
| --- | --- | --- |
| 1 | `NotFound` | the due id does not exist |
| 2 | `BadAmount` | `open` is called with an amount of zero or less |
| 3 | `DeadlinePast` | `open` has a past deadline, or `pay` arrives after it |
| 4 | `NotOpen` | the due is already paid or closed |
| 5 | `WrongAmount` | `pay` amount differs from the due amount |
| 6 | `WrongToken` | `pay` token differs from the due token |
| 7 | `StillOpen` | `close` is called before the deadline |

### Events

`DueOpened`, `DuePaid` and `DueClosed`, each with the due id as a topic.

### Properties

- **No admin.** There is no owner, upgrade, pause, rescue or withdraw function. Nobody can redirect funds after deploy.
- **No held balance.** `pay` transfers payer to recipient in that call. The contract's balance stays at zero, and a test asserts it.
- **Exact amounts only.** Amounts are `i128` in stroops. USDC has 7 decimals, so 10 USDC is `100_000_000`.
- **Fixed recipient.** The recipient is set when the due is opened and cannot change.
- **On-chain reference is 32 bytes.** No names, emails or invoice files are stored on-chain. A shorter reference is right-padded with zeros by the client.
- **Time is ledger time.** Deadlines compare against `env.ledger().timestamp()`, not a ledger sequence.

## The web app

A single page in [`apps/web`](apps/web). It is a window onto the contract, with no server and no database.

- Reads a due with a simulated `get`, so it loads without a wallet.
- Connects Freighter through Stellar Wallets Kit, and stops with a clear message if the wallet is not on testnet.
- Checks that the recipient has a USDC trustline before it lets you pay.
- Pays the exact amount, attempts a wrong amount, and closes an expired due.
- Shows each attempt with its transaction hash, a Stellar Expert link and a copy button.
- Shows the due given by `?due=<id>`, otherwise the seeded due.

Stack: Next.js, React, TypeScript, Tailwind CSS v4, shadcn/ui on Base UI, `@stellar/stellar-sdk`.

## Try it

Reading a due needs no wallet. Paying needs [Freighter](https://www.freighter.app) on the Test Network and testnet USDC.

1. Install Freighter in a desktop browser and switch it to **Test Network**.
2. Fund the account with [Friendbot](https://friendbot.stellar.org) and add a USDC trustline for the issuer above.
3. Get testnet USDC from the [Circle faucet](https://faucet.circle.com), choosing Stellar.
4. Open the page, connect, and pay the seeded due.
5. Use **Try paying 9 USDC** to watch the contract refuse a wrong amount.

## Run it yourself

Requirements: Node 24 or newer, pnpm 11, Rust with the `wasm32v1-none` target, and the [Stellar CLI](https://developers.stellar.org/docs/tools/cli) (tested with 28.1).

### Contract

```bash
cargo test                      # 14 tests
stellar contract build          # writes target/wasm32v1-none/release/due.wasm

stellar keys generate due-deployer --network testnet --fund
stellar contract deploy --network testnet --source due-deployer \
  --wasm target/wasm32v1-none/release/due.wasm
```

The tests run against the native token contract as the USDC stand-in. They cover opening, a zero amount, a past deadline, recipient auth, exact payment with a zero contract balance, a second payment, a wrong amount, a wrong token, a late payment, early close, close after the deadline, close on a paid due and a missing id.

Resolve the USDC contract address from the classic asset rather than hard-coding it:

```bash
stellar contract id asset --network testnet \
  --asset USDC:GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5
```

### Web app

```bash
pnpm install
cp apps/web/.env.example apps/web/.env.local   # optional, see below
pnpm --filter web dev                          # http://localhost:3000
pnpm --filter web build
```

| Variable | Default | Purpose |
| --- | --- | --- |
| `NEXT_PUBLIC_CONTRACT_ID` | the deployed contract above | Contract the page reads and calls |
| `NEXT_PUBLIC_USDC_ISSUER` | Circle testnet issuer | Used for the trustline check |
| `NEXT_PUBLIC_RPC_URL` | `https://soroban-testnet.stellar.org` | Soroban RPC |
| `NEXT_PUBLIC_HORIZON_URL` | `https://horizon-testnet.stellar.org` | Trustline lookup |
| `NEXT_PUBLIC_NETWORK_PASSPHRASE` | `Test SDF Network ; September 2015` | Wallet and transaction network |
| `NEXT_PUBLIC_SEEDED_DUE_ID` | `2` | Due shown when no `?due=` is given |

All values are public. The page holds no secret.

## Repository layout

```
contracts/due/     Soroban contract and tests
apps/web/          Next.js page
docs/evidence.md   contract id, wasm hash, transaction links
due-build-pack/    the specification this project was built from
```

## What is real and what is not

| | |
| --- | --- |
| Real | The deployed contract, the USDC transfers, every transaction hash above, the RPC reads and the Freighter signing. |
| Test value | The USDC is Circle's testnet token and has no value. The seeded dues and the funded accounts were created for this demo. |
| Not built | A username registry, escrow pool, anchor or cash-out, KYC, fiat rails, a backend, a database, an indexer, refunds, multisig and fee sponsorship. |

## Limits

- Due does not fix a mistyped recipient. The recipient is whatever address opened the due, and a payment to the wrong address is still a payment to that address.
- It does not recover a payment that was already sent to a raw address outside Due.
- It does not hold funds for a dispute, and a paid due cannot be refunded.
- It is not a legal invoice and does not replace one.
- It is not an anchor and does not cash out to a bank or a local currency.
- The contract has not been audited.
- It is testnet only. Do not point it at mainnet or real funds.
- The page reads dues one at a time. It has no list of dues and no history beyond the current session, because events are not indexed.

## Built for

Find Your Way, General Track, on Stellar Passport.
