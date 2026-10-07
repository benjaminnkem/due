# Build plan

Dates are 2026. Submit on 11 October. Do not wait for the 12th.

## 6 October — humans, not agents

- Create a Stellar Passport account and join Find Your Way. Creating the account is not registration.
- Create the team (1–5).
- Project sentence: Due is a Stellar invoice that only settles an exact, on-time USDC payment, and proves it.

Agents start after the repo exists.

## 7 October — contract

- Scaffold `contracts/due` with soroban-sdk 28.
- Implement `CONTRACT.md`.
- `cargo test` green on all 14 cases.
- Deploy to testnet.
- Fund recipient and payer. Trustline USDC. Faucet USDC.
- Open the seeded due. Pay 10. Reject 9.
- Fill `docs/evidence.md`.

Stop if deploy fails. Do not design the page around a contract that is not live.

## 8 October — page

- Implement `WEB_APP.md` against `NEXT_PUBLIC_CONTRACT_ID`.
- Seeded due loads without a wallet.
- Exact pay and wrong-amount pay both work from Freighter.
- Deploy the page. Put the URL in the README.

## 9 October — demo

- Write `docs/DEMO.md` as a 90-second script: problem in one sentence, pay, hash on screen, reject, stop.
- Human records that script from the live page. Not slides.

## 10 October — break it

- Fresh browser, testnet Freighter, mobile width.
- Empty contract read, rejected wallet, wrong network.
- Fix only what a judge will hit.

## 11 October — submit

Use `SUBMISSION.md`. Repo public. Page up. Video linked. Contract id in the form.

## If time runs out

Cut in this order: new-due form, close button on the page, custom fonts, event indexer. Do not cut the seeded pay, the wrong-amount reject, the Expert links, or the honest README.
