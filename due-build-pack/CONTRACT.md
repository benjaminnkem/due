# Contract specification

Crate path: `contracts/due`. Name the contract `Due`.

## Types

```
struct Due {
    id: u32,
    recipient: Address,
    token: Address,
    amount: i128,
    deadline: u64,
    reference: BytesN<32>,
    status: Status,
    payer: Option<Address>,
}

enum Status { Open = 0, Paid = 1, Closed = 2 }
```

Instance storage:

- `next_id: u32` starting at 1
- `due(id) -> Due`

Reference shorter than 32 bytes is right-padded with zeros by the client. The contract stores the 32 bytes it is given.

## Errors

```
NotFound = 1
BadAmount = 2
DeadlinePast = 3
NotOpen = 4
WrongAmount = 5
WrongToken = 6
```

Use `#[contracterror]`. Panic only for broken invariants.

## Functions

### open(recipient, token, amount, deadline, reference) -> u32

- `recipient.require_auth()`.
- `amount > 0` or `BadAmount`.
- `deadline > env.ledger().timestamp()` or `DeadlinePast`.
- Assign `next_id`, store due with `status = Open`, `payer = None`, increment `next_id`.
- Emit `DueOpened` with id, recipient, token, amount, deadline, reference.
- Return id.

### pay(payer, id, token, amount)

- `payer.require_auth()`.
- Load due or `NotFound`.
- Status must be `Open` or `NotOpen`.
- `env.ledger().timestamp() <= deadline` or `DeadlinePast`.
- `token == due.token` or `WrongToken`.
- `amount == due.amount` or `WrongAmount`.
- Call SAC `transfer(from: payer, to: due.recipient, amount)`. Do not transfer to the contract.
- Set status `Paid`, set payer, write storage.
- Emit `DuePaid` with id, payer, amount.

The extra `token` and `amount` arguments exist so a wrong attempt fails with Due's error instead of a generic token error. The client builds the 9 USDC attempt by passing amount 9. The contract returns `WrongAmount` before `transfer`.

Authorization: the payer signs the `pay` invocation. Because `transfer` also requires the payer, the same address signs that auth entry. Freighter must be asked for both. See the stellar-sdk guide on authorizing a contract call.

### close(id)

- Anyone. No auth.
- Load due or `NotFound`.
- Status `Open` or `NotOpen`.
- `env.ledger().timestamp() > deadline` or the call fails (use `DeadlinePast` inverted: add `StillOpen = 7` if the deadline has not passed).
- Set `Closed`. Emit `DueClosed` with id.

### get(id) -> Due

Read. Missing id returns `NotFound`.

## Tests

Run against a token registered in the test environment, not live USDC.

1. Open stores an open due and returns 1, then 2.
2. Open rejects zero amount.
3. Open rejects a past deadline.
4. Open requires recipient auth (default test auth).
5. Pay moves the token balance from payer to recipient by the exact amount. Contract balance stays 0.
6. Pay stores the payer and status Paid.
7. Pay rejects a second time with NotOpen.
8. Pay rejects a smaller amount with WrongAmount and does not move tokens.
9. Pay rejects a different token address with WrongToken.
10. Pay rejects after the deadline. Advance ledger time in the test.
11. Close before the deadline fails.
12. Close after the deadline sets Closed.
13. Close on a paid due fails.
14. get on a missing id fails.

## Deploy

```
stellar contract build
stellar contract deploy --network testnet --source due-deployer --wasm target/wasm32v1-none/release/due.wasm
```

Wasm path follows the CLI. If the target triple differs, use the path the build prints. Record contract id and wasm hash in `docs/evidence.md`.

Then, with the two funded accounts:

1. Recipient `open` for 10 USDC, deadline about 48 hours out, reference `invoice 18`.
2. Payer `pay` the exact amount. Save the hash.
3. Payer `pay` with amount 9. Save the hash of the failed transaction, or the simulation error plus a succeeded reject if you emit DueRejected in a non-failing path. Prefer a real failed transaction so Expert shows it. If a failed tx has no useful page, keep the simulation XDR and also a second open due paid correctly so the judge still has a success hash.

Write both links before any UI work.
