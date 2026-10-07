# Demo script (90 seconds)

Record this on the live page: https://due-seven-beryl.vercel.app

## Before recording

- Freighter installed in a desktop browser, set to **Test Network**, with an account that has XLM, a USDC trustline and at least 20 USDC.
- The seeded due (due 2) is still open. Check the page shows **Open** and 10 USDC. If someone paid it, open `?due=<id>` for another open due, or ask for new ones to be opened.
- The wallet is already connected, so the recording does not show the connect popup.
- A second tab is ready on Stellar Expert (testnet).

## Script

**0:00 — The problem, one sentence (page open on the due).**

"A tailor is owed 50 dollars. On Stellar, a payment still goes through if you send 45, or the wrong coin, or you pay late. The invoice is in a chat, and the chain only saw tokens move."

**0:15 — The due.**

"Due makes the invoice the thing you pay. This due is 10 testnet USDC, to this recipient, open until the date shown. The terms live in the contract."

**0:25 — Pay the exact amount.**

Click **Pay 10 USDC**. Approve in Freighter. Wait for the status to change to Paid and for the hash to appear under "This session".

"That is one transaction. USDC went from the payer to the recipient, and the contract kept nothing."

**0:50 — Show the proof.**

Click the hash. Stellar Expert opens. Point at the USDC transfer and the `DuePaid` event.

**1:00 — The wrong amount.**

Go back to the page and open a due that is still open (due 2 if you paid a spare, otherwise another id). Click **Try paying 9 USDC**. Approve in Freighter. Wait for the badge to read `WrongAmount`.

"Now I try to pay 9. The contract refuses. Nothing moves. The failed transaction has its own hash, so anyone can check it."

**1:20 — Close.**

"Due does not fix a wrong address. It fixes the amount, the asset and the time. The contract is the invoice. No admin, no freeze. Testnet only."

## Notes

- Paying the exact amount uses up a due. Do the exact payment on one due and the wrong-amount attempt on another, or do the wrong-amount attempt first on the same due and then pay it.
- The wrong-amount attempt does not spend the due or any USDC, apart from the network fee.
- The page shows `WrongAmount` only after the failed transaction is read back from the ledger, so allow a few seconds.
- If the Freighter popup is slow, cut the wait in editing. Do not speed up the hash or the badge.
