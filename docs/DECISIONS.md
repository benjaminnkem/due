# Decisions

Choices made where the build pack did not say, or where reality differed from it.

## The web app lives in `apps/web`, not `web/`

The repository was scaffolded with Turborepo, which uses `apps/*` and `packages/*`. The build pack's layout names `web/`. Keeping `apps/web` leaves the pnpm workspace and Turborepo tasks working without changes. The contract is at `contracts/due` as specified.

## A rejected payment is submitted, not only simulated

A call the contract refuses fails in simulation and never reaches the ledger, so it has no transaction hash. The build pack prefers a real failed transaction on Stellar Expert. The page's wrong-amount button simulates the exact amount to get the resource footprint, then submits the same call with the wrong amount and a matching source-account authorization entry. The contract returns `WrongAmount` before it reaches `transfer`, and the failed transaction is recorded.

A first version omitted the authorization entry and failed with an auth error instead of `WrongAmount`. The page now reads the failed transaction's diagnostic events and shows the real error name, and it only says the contract refused the call when the error is one of Due's own.

## The page falls back to the deployed contract

`apps/web/lib/config.ts` defaults to the deployed contract id, the Circle testnet issuer and the public RPC and Horizon URLs. Every value is public and can be overridden with `NEXT_PUBLIC_*` variables. The build therefore succeeds without any environment set, which keeps the Vercel project free of configuration.

## Only the Freighter module is loaded

The build pack says Freighter first. Loading the kit's default module set pulls in WalletConnect and many other wallets, which adds weight and optional native packages for no benefit to the judge path. Only `FreighterModule` is registered.

## Dependency pins for tooling

- `@babel/core` and `@babel/preset-typescript` are pinned to 8.0.1 in `apps/web`. The shared ESLint config uses Babel 8, and the shadcn CLI brought in a Babel 7 preset that was picked up first and broke linting.
- `pnpm-workspace.yaml` sets `allowBuilds: false` for `@reown/appkit`, `bufferutil`, `secp256k1` and `utf-8-validate`. They are optional native or wallet-connect dependencies of the wallet kit, none of them are needed for Freighter, and pnpm refuses to install while they are undecided.
- `tsconfig.json` uses `paths` without `baseUrl`, because TypeScript 7 removed `baseUrl`.

## Styling

Tailwind CSS v4 with shadcn/ui on Base UI (style `base-nova`), as requested, with light mode only. Three directions were prototyped in `design/` (a carbon-copy invoice pad, an engineering drawing sheet, and a mobile-first slip) and the slip was chosen: a deep-green hero with the amount as the largest thing on the page, a yellow pay button, and three checks (asset, amount, time) that tick when a due is paid. Type is Bricolage Grotesque for display and Hanken Grotesk for text. The page uses shadcn's Alert, Button and Skeleton. The other direction files stay in `design/` for reference and are not deployed.

## Seeded dues

Due 1 and due 3 were paid during testing and hold the success transactions. Due 2 is the page's seeded due, with a deadline of 21 October 2026. Due 4 was opened with a short deadline so the Close button can be shown on an expired due. Dues 5 to 8 (`invoice 22` to `invoice 25`, 10 USDC each, deadline about 28 October 2026) were opened on 7 October as spares for the demo recording and for judges. Open a due by `?due=<id>`.

## The demo payer key is not published

The build pack allows publishing a testnet payer key so a judge can pay in one click. That key has not been published. The README tells a judge how to fund their own Freighter account instead. This can change if a one-click path is wanted.

## Contract events use `#[contractevent]`

The first version used `env.events().publish`, which is deprecated in soroban-sdk 28. The three events are declared with `#[contractevent]`, with the due id as a topic. `DueRejected` is not emitted: a refused call reverts, so an event would not be kept.

## Brand assets are hand-drawn SVG

The mark is a "D" with a check inside, for a payment that matched. `logo.svg` is the full mark. `favicon.svg` has a bolder, larger glyph so it stays legible at 16 and 32 pixels. `favicon.ico`, `apple-icon.png` and the Open Graph and Twitter images are rendered from these files and from `docs/assets/cover.html` with headless Chrome, and live in `apps/web/app` so Next.js serves them by convention. The cover shows a real paid due and the real rejected attempt hash from `docs/evidence.md`.
