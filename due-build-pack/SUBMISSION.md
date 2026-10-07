# Submission checklist

Platform: https://demo.stellarpassport.xyz/hackathons/find-your-way-meridian-hackathon
Track: General Track only. University Track requires current enrollment at a university in Chile.

## Form

- Project name: Due
- Track: General
- One paragraph: the copy at the bottom of `PRD.md`
- Public GitHub repo
- Live demo URL
- Demo video, 90 seconds, English, recorded on the live page
- Contract id
- How it uses Stellar: a Soroban contract is the invoice. Paying it calls the Stellar Asset Contract for testnet USDC and transfers payer to recipient in the same transaction. Wrong amount, wrong token, and late payment revert. Hashes are on Stellar Expert.

## evidence.md shape

```
Contract: C...
Wasm hash: ...
Network: testnet
Opened: https://stellar.expert/explorer/testnet/tx/...
Paid 10 USDC: https://stellar.expert/explorer/testnet/tx/...
Rejected 9 USDC: https://stellar.expert/explorer/testnet/tx/...
Demo: https://...
```

## README first lines

Due is a Stellar invoice that only settles an exact, on-time USDC payment.
Testnet only. The demo key holds no value.
Not a legal invoice. Not an anchor. Not audited. A due paid to a mistyped recipient still pays that address.

## Video

1. The tailor example in one sentence.
2. Open the page. Show the 10 USDC due.
3. Pay. Wait for the hash. Open Expert.
4. Pay 9. Show WrongAmount.
5. End on: the contract is the invoice. No freeze, no admin.

## Do not claim

Mainnet, fiat payout, audited contracts, legal enforcement, recovery of payments sent outside Due.
