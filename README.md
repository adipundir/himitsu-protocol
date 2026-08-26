# Himitsu Protocol 秘密

**Anonymity mining for the STRK20 pool — get paid to be part of the crowd.**

*STRK20 Private Sprint entry · Starknet mainnet*

---

## The problem

A privacy pool's privacy is not cryptography — it is **crowd size**. When you withdraw
1,000 USDC from the STRK20 pool, an observer's question is: *which of the deposits could
have funded this?* That answer set is your anonymity. The STRK20 docs name the ways it
collapses: **distinctive amounts**, **timing correlation**, and **thin sets**.

The anonymity set is a commons. Your shielded balance protects me; mine protects you;
nobody is paid to provide it. Every privacy app on Starknet — payroll, checkout, OTC,
governance — silently depends on a resource none of them funds.

DeFi solved shared-liquidity bootstrapping with incentives (liquidity mining, Starknet's
own DeFi Spring). Tornado Cash proved the privacy variant works with its 2020–21
Anonymity Mining program — and nothing has replaced it since, on any chain.

## What Himitsu does

Himitsu is an **emissions protocol that pays depositors to deepen the STRK20 anonymity
set**, with two mechanisms Tornado's fixed-denomination design could never express:

1. **Denomination gauges — targeted anonymity subsidies.** STRK20 allows arbitrary
   amounts, which is exactly why distinctive amounts leak. Himitsu rewards deposits at
   standard denominations (100 / 1k / 10k), and each bucket's multiplier is **inversely
   proportional to its current depth**: thin crowds pay more. Incentives flow
   automatically to wherever the anonymity set is weakest.
2. **Private harvesting through the pool itself.** You join the crowd publicly (deposits
   are public by protocol design) and collect rewards **privately**: claims run through
   the pool's `privacy_invoke` into your shielded balance, unlinkable to the address
   that registered.

Sybil-splitting is profitable by design: splitting 10k into ten standard 1k deposits IS
ten indistinguishable entries in the 1k bucket. The "exploit" is the product working.

## How it works

```
fund epoch          anyone tops up a reward pot (per token, per denomination gauge)
      │
shield & register   user deposits a standard denomination into the STRK20 pool (public,
      │             by design), then registers poseidon(TAG, secret) from the same address
      │
accrue              indexer joins public pool-deposit events with registrations, computes
      │             gauge-weighted, linearly-vesting allocations; epoch close posts a
      │             Poseidon merkle root on-chain — anyone can recompute it
      │
claim (private)     reveal the secret + merkle proof via privacy_invoke; the vault
                    credits an OpenNoteDeposit — the reward lands already shielded
```

## Hidden vs. visible (honest accounting)

| Artifact | Visibility |
| --- | --- |
| Deposit into the pool | Public — depositor, token, amount (protocol design; it is the countable entry that deepens the set) |
| Registration commitment | Public hash from the depositing address — adds zero information beyond the already-public deposit |
| Reward allocation | Publicly recomputable from chain data (merkle root on-chain) |
| **Claim** | **Unlinkable to the registering address**; reward amount is a public open note (known reward tiers) |
| Your notes, transfers, balances | Private — standard STRK20 |

**Trust model:** the epoch operator posts the merkle root. Roots are recomputable by
anyone from public data, so the operator can censor but cannot secretly inflate.
**What we cannot measure:** time-in-pool. Withdrawals are unlinkable from deposits —
that is the entire point of STRK20 — so rewards vest linearly from the deposit as an
honest proxy, with cliffs to bound deposit-cycling. Cyclers still thicken observed
entry flow.

## Architecture

- `contracts/` — `HimitsuVault`, a stateful Cairo anonymizer: epochs, gauge accounting,
  Poseidon merkle claims, vesting math, `privacy_invoke` entrypoint (pool-only caller,
  `OpenNoteDeposit` returns)
- `indexer/` — public-edge indexer over pool deposit events + registrations; computes
  gauge weights and the live **k-anonymity depth dashboard** per (token, denomination)
- `app/` — Next.js dapp (Starknet Wallet API): Shield & Earn with denomination presets,
  private claim flow, gauge funding page, depth dashboard

## Status

Sprint day 0. This README is the design commitment; contracts, indexer, and app land
this week. Mainnet transaction hashes, contract addresses, and the demo will be
recorded in [`strk20.json`](./strk20.json) as they come to exist.

## Team

- [adipundir](https://github.com/adipundir)
- [deepakA18](https://github.com/deepakA18)

## License

MIT
