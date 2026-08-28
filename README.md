# Himitsu Protocol 秘密

**Anonymity mining for the STRK20 pool. Privacy that pays.**

*A third-party incentive layer for the STRK20 privacy pool · Starknet mainnet*

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
own DeFi Spring). The privacy variant has precedent — Tornado Cash ran "anonymity mining"
(2020–21) and Namada ships live shielded-set rewards today — which is the point: the
mechanism is wanted. What's new here is the packaging (see below), and that no such
incentive layer exists on Starknet's STRK20 pool.

## What Himitsu does

Himitsu is an **emissions protocol that pays depositors to deepen the STRK20 anonymity
set**. Unlike its protocol-native, own-token predecessors, it is a **third-party, tokenless
incentive layer** on someone else's pool, funded with exogenous STRK — built around two
mechanisms that only make sense on a variable-amount pool like STRK20:

1. **Denomination gauges — targeted anonymity subsidies.** STRK20 allows arbitrary
   amounts, which is exactly why distinctive amounts leak. Himitsu rewards deposits at
   standard denominations (100 / 1k / 10k), and each bucket's multiplier is **inversely
   proportional to its current depth**: thin crowds pay more. Incentives flow
   automatically to wherever the anonymity set is weakest.
2. **Rewards land shielded.** You join the crowd publicly (deposits are public by
   protocol design) and collect through the pool's `privacy_invoke`, so the payout arrives
   as a shielded note that never touches your public balance. Honest scope: the claim
   itself is public and reveals *which* allocation was paid (linkable to the registering
   address); what stays private is where the reward moves next. Full claim unlinkability
   needs a ZK membership proof — see Roadmap.

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
      │             gauge-weighted allocations behind a vest cliff; epoch close posts a
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
| **Claim** | Public and **linkable to the registering address** (the `Claimed` event's leaf ties back to the public `Registered` event); what stays hidden is only the **destination** — the open note's owner. "Join publicly, spend privately," not "claim anonymously" |
| Your notes, transfers, balances | Private — standard STRK20 |

**Trust model:** the epoch operator posts the merkle root. Roots are recomputable by
anyone from public data, so the operator can censor but cannot secretly inflate.
**What we cannot measure:** time-in-pool. Withdrawals are unlinkable from deposits —
that is the entire point of STRK20 — so rewards sit behind a **vest cliff** from epoch
close as an honest proxy, and each claim is all-or-nothing at the cliff, gated by a
per-`(epoch, leaf)` nullifier. (Not linear partial claims: the claim secret travels in
public calldata, and a claimable remainder would be sweepable by anyone who read it —
see ARCHITECTURE.md.) Cyclers still thicken observed entry flow.

## Architecture

- `contracts/` — `HimitsuVault`, a stateful Cairo anonymizer: epochs, gauge accounting,
  Poseidon merkle claims, vesting math, `privacy_invoke` entrypoint (pool-only caller,
  `OpenNoteDeposit` returns)
- `indexer/` — public-edge indexer over pool deposit events + registrations; computes
  gauge weights and the live **k-anonymity depth dashboard** per (token, denomination)
- `app/` — Next.js dapp (Starknet Wallet API): Shield & Earn with denomination presets,
  private claim flow, gauge funding page, depth dashboard

## Status

Built and tested end-to-end: `HimitsuVault` (Cairo, 17/17 snforge tests, including
Cairo↔TS Poseidon parity vectors), the indexer/epoch pipeline (24/24 unit tests), and
the Next.js dapp (clean production build). A Sepolia light-pass deployment
([`deployments/sepolia.json`](./deployments/sepolia.json)) exercised declare, deploy,
`fund`, `register`, and `post_root` against live RPC. Mainnet contract addresses,
the pool transaction hashes, and the demo links are recorded in
[`strk20.json`](./strk20.json) and [`deployments/`](./deployments/) as they land.

## Run / verify it yourself

Every check is a `make` target (run `make help` for the full list):

```bash
make doctor          # check toolchain (scarb 2.20.1, snforge/sncast 0.63.0, node, pnpm) + env
make contracts-test  # 17 snforge tests; also regenerates epochs/vectors.json parity vectors
cd indexer && pnpm install && pnpm test   # 24 unit tests (gauge, merkle, poseidon, join, depth)
make verify-txs      # re-verify every strk20.json tx against mainnet RPC:
                     #   exists, SUCCEEDED, emitted pool + vault events
make epoch-close EPOCH=1 TOKEN=0x… POT=…  # recompute an epoch's allocations + merkle root
                     #   from public chain data — compare with the on-chain root
make app-install && make app-dev          # run the dapp locally (http://localhost:3000)
```

`STARKNET_RPC_URL` (`.env`, see `.env.example`) defaults matter only for the on-chain
targets; the indexer and `verify-txs` fall back to the public lava RPC.

## Team

- [adipundir](https://github.com/adipundir)
- [deepakA18](https://github.com/deepakA18)

## License

MIT
