# Due — product requirements

## One sentence

Due is a Stellar invoice that only settles an exact, on-time USDC payment, and proves it.

## Problem

A Stellar payment succeeds even when it is the wrong amount, the wrong asset, or late. The invoice lives in a chat or a PDF. The chain only knows that some tokens moved.

Real case. A tailor finishes a job priced at 50 dollars. They send a Stellar address and ask for 50 USDC with invoice 18 in the note. The buyer sends 45, or sends the right amount in another asset, or pays after the date. The network accepts it. The tailor cannot match it. Sorting it out is a chat. If the same mistake is made against an exchange that requires a memo, the money sits in a support queue. Nothing on-chain records what was owed.

Nearby hackathon entries do not close this. XReceipt signs a receipt after the money has moved. Push matches a memo off-chain and does not escrow. SylarPay makes an address human and still accepts whatever is sent to that name.

## Users

- Recipient: freelancer, supplier, clinic, or anyone owed a fixed USDC amount by a date.
- Payer: the person who must pay that exact amount.
- Judge: opens the demo, pays once, watches a reject, clicks a hash. No signup, no faucet.

## What Due does

1. Recipient opens a due: their address, USDC, exact amount, deadline, short reference.
2. Payer pays that due, not a raw address.
3. If asset, amount, and time match, and the due is still open, USDC moves from payer to recipient in one transaction. The due is marked paid. The payer is stored.
4. Wrong amount, wrong token, late payment, or a second pay is rejected. Funds do not move.
5. After the deadline, anyone can close an unpaid due. Nothing was locked, so nothing is refunded. The record remains: opened, never paid.
6. A page shows the due and links every transaction to Stellar Expert.

## What Due does not do

- Recover a payment already sent to a raw address.
- Stop a recipient who types their own address wrong.
- Cash out to naira, pesos, or a bank.
- Hold funds for a dispute.
- Replace an invoice legally.

## Demo the judge runs

Under two minutes, on testnet.

1. A due is already open: 10 USDC, expiring tomorrow, to a named recipient.
2. Pay it from a funded testnet wallet. The page shows the hash. The hash opens on Stellar Expert and shows the transfer.
3. Try to pay 9 USDC. The contract returns WrongAmount. That failed attempt is on the page.
4. An already expired unpaid due can be closed.

The demo wallet may be a published testnet key with no real value. Say that in the first line of the README.

## Success for this hackathon

Judged on technical execution, meaningful use of Stellar, originality, potential impact, user experience, and presentation.

Due wins the room if a judge can verify both hashes without trusting the page, the contract has no admin path to the funds, and the README is honest about limits. Passport registration and the team are human steps. Agents do not create the Stellar Passport account.

## Copy for the submission form

Due is a Stellar invoice that only settles an exact, on-time USDC payment, and proves it. A Soroban contract opens a due for a fixed recipient, asset, amount, and deadline. Paying it transfers testnet USDC from payer to recipient in the same transaction. The wrong amount, the wrong asset, a late payment, or a second payment is rejected before funds move. Anyone can close an unpaid due after the deadline. The page links every claim to a Stellar Expert transaction. Testnet only. Not a legal invoice. Not audited.
