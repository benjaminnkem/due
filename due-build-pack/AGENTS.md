# Agent operating rules

You are building Due for the Find Your Way hackathon (General Track). The win condition is a deployed testnet contract and two real transaction hashes a judge can open, behind a page that finishes in under two minutes.

## Order of work

1. Contract, tests, testnet deploy.
2. One successful `pay` and one rejected `pay`. Write both hashes into `docs/evidence.md`.
3. Only then build the page against the deployed contract id.
4. Record nothing until the page runs the live flow.
5. Submission copy last.

Do not start the web app before the contract is deployed.

## Hard rules

- Testnet only. Never mainnet. Never ask for a secret that holds real funds.
- No admin, no upgrade, no pause, no rescue, no withdraw. The contract cannot redirect funds after deploy.
- The contract does not hold a balance across transactions. `pay` transfers payer to recipient in that call.
- Amounts are i128 stroops. USDC has 7 decimals. 10 USDC = 100_000_000.
- Token is Circle testnet USDC. Classic asset code `USDC`, issuer `GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5`. Resolve the Stellar Asset Contract address from that asset at the edge. Do not invent a contract id.
- Recipient is fixed when the due is opened.
- Reference on-chain is at most 32 bytes. No names, emails, or invoice PDFs on-chain.
- English UI. Plain words. No "revolutionary", no "seamless", no AI-sounding marketing.
- Honest limits stay in the README. Due does not fix a mistyped recipient. It is not a legal invoice, not an anchor, not audited.

## Out of scope

Username registry, memos as the matching key, fiat cash-out, SEP-24, KYC, mobile app, second token, AI chat, email, accounts database as the source of truth, fee sponsorship, multisig, refunds after a successful pay.

## Definition of done

- `cargo test` passes, including wrong amount, second pay, early close, late pay.
- Contract deployed on testnet. Contract id and wasm hash in `docs/evidence.md`.
- One paid due and one rejected pay, each with a Stellar Expert link.
- Web page on a public URL. Seeded open due visible without a wallet. Pay and reject work with Freighter on testnet.
- README states what is real and what is mocked.
- 90-second demo path written in `docs/DEMO.md`.

## Repo name

`due` — GitHub public repo. Layout in `TECHNICAL_SPEC.md`.
