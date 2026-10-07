# Due — agent build pack

Due is a Stellar invoice. A Soroban contract settles a payment only when the asset, the amount, and the deadline all match, then forwards USDC from payer to recipient in the same transaction. The page is a window onto that contract.

This folder is the source of truth for coding agents. Read in this order:

1. `AGENTS.md` — rules, non-goals, definition of done
2. `PRD.md` — problem, users, scope, demo, success
3. `TECHNICAL_SPEC.md` — architecture and stack
4. `CONTRACT.md` — the contract to implement
5. `WEB_APP.md` — the single page
6. `BUILD_PLAN.md` — day-by-day order
7. `SUBMISSION.md` — what the hackathon form needs

Do not invent a second product. Do not add a username registry, escrow pool, anchor, chatbot, or admin key. If a decision is not in these files, pick the smaller option and record it in `docs/DECISIONS.md` inside the repo you create.

Hackathon: Find Your Way, General Track, on Stellar Passport.
Page: https://demo.stellarpassport.xyz/hackathons/find-your-way-meridian-hackathon
Submit inside that platform on 11 October 2026. The live page deadline is 12 October 2026, 11:59 PM. Do not use the older Tellus blog date of 5 October.
