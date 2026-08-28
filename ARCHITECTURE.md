# Himitsu Protocol — Architecture

> Anonymity mining for the STRK20 pool. This document is the design of record: every
> protocol fact in it was verified against Starknet mainnet, the `starknet-privacy`
> monorepo (tag `PRIVACY-0.14.3-RC.5`), or the STRK20 starter kit on 27 Aug 2026.

## System overview

```
                                  fund(token, amount)            anyone / sponsors
                                        │
             register(commitment)       ▼
 depositor ──────────────────────► HimitsuVault (Cairo, mainnet)
     │                             │  · reward pots (ERC-20 balances)
     │ deposit (via Ready wallet)  │  · Registered / Funded / RootPosted / Claimed events
     ▼                             │  · privacy_invoke: merkle claim → OpenNoteDeposit
 STRK20 pool ──────────────────────┘         ▲
 0x040337b1af…812a                           │ pool calls helper via selector!("privacy_invoke")
     │  public edges only                    │
     ▼                                       │
 Indexer (TS) ── epoch close ── merkle root ─┘
     │   · getEvents: Deposit sel 0x9149d2123147c5f43d258257fef0b7b969db78269369ebcf5ebb9eef8592f2
     │   · joins pool deposits with vault registrations
     │   · gauge-weighted, vesting allocations → epochs/epoch-N.json (leaves + proofs)
     ▼
 Next.js app ── Earn (shield presets + register) · Claim (private) · Fund · Depth dashboard
```

## The mechanism

1. **Fund.** Anyone tops up a reward pot in the vault (plain `transfer_from`).
2. **Shield & register.** A user deposits a **standard denomination** (100 / 1k / 10k)
   into the STRK20 pool through their wallet (public by protocol design), then calls
   `register(commitment)` on the vault from the same address, where
   `commitment = poseidon(REG_TAG, secret)`. The secret stays client-side.
3. **Accrue.** The indexer joins public pool `Deposit` events with `Registered` events
   (same address, deposit before registration, nearest-unconsumed match), computes
   **gauge-weighted** allocations per epoch, and the operator posts a Poseidon merkle
   root on-chain. Anyone can recompute the root from public data.
4. **Claim (private).** The user claims through the pool itself:
   `strk20InvokeTransaction([{transfer amount:"OPEN"}, {invoke vault, calldata:[…]}])`.
   The vault verifies the merkle proof + secret preimage, checks the vest cliff and
   nullifier, approves the pool for the full allocation, and returns an
   `OpenNoteDeposit` — the reward lands directly in the claimer's shielded balance.

## Gauges — targeted anonymity subsidies

A withdrawal of a distinctive amount is linkable; a withdrawal of 1,000 hides among all
1,000-deposits. So the unit we pay for is **depth per (token, denomination) bucket**,
and multipliers are depth-tiered so thin buckets pay more:

| Bucket depth (epoch window) | Multiplier |
|---|---|
| < 25 deposits  | 3.0× |
| < 100 | 2.0× |
| < 400 | 1.5× |
| ≥ 400 | 1.2× |
| non-standard amount | 1.0× |

`weight = amount × multiplier × fraction-of-epoch-since-deposit` ·
`reward_i = pot × weight_i / Σ weights`. Splitting a large deposit into standard-size
pieces raises your weight **and** the bucket's depth — sybil behavior is the desired
behavior.

## HimitsuVault contract

Package `himitsu_vault` (Cairo, edition 2024_07). Stateful anonymizer in the escrow
pattern: pool address pinned at construction, caller-asserted on claims.

**Storage**
- `pool: ContractAddress`, `operator: ContractAddress`
- `epochs: Map<u64, Epoch { token, root, total, vest_start, vest_duration }>` (write-once)
- `available: Map<ContractAddress, u128>` — funded, not-yet-committed budget per token
- `pot_remaining: Map<u64, u128>` — an epoch's reserved budget, debited on each claim
- `registered: Map<(ContractAddress, felt252), bool>` — dedupe keyed by **(caller, commitment)**
- `nullifiers: Map<(u64, felt252), bool>` — an allocation is claimable exactly once per epoch

**Entrypoints**
- `fund(token, amount)` — anyone; `transfer_from(caller → vault)`; adds to `available[token]`.
- `register(commitment)` — dedupes per `(caller, commitment)` so nobody can burn a victim's
  commitment by front-running the (public) value; emits `Registered { caller, commitment }`.
- `post_root(epoch_id, token, root, total, vest_start, vest_duration)` — operator only,
  write-once. **Reserves solvency on-chain:** asserts `available[token] ≥ total`, moves `total`
  into `pot_remaining[epoch_id]`. An epoch can never be committed for more than was funded.
- `privacy_invoke(epoch_id, secret, token, total, proof: Span<felt252>, note_id) -> Span<OpenNoteDeposit>`
  1. `assert(get_caller_address() == pool, 'CALLER_NOT_PRIVACY')`
  2. `assert epoch posted and epoch.token == token`
  3. `leaf = poseidon(LEAF_TAG, poseidon(REG_TAG, secret), token, total)`; verify sorted-pair
     Poseidon merkle path against `epochs[epoch_id].root`
  4. **Cliff:** `assert now ≥ vest_start + vest_duration` (`'NOT_VESTED'`)
  5. **Nullifier:** `assert !nullifiers[(epoch_id, leaf)]`; set it (`'ALREADY_CLAIMED'`)
  6. debit `pot_remaining[epoch_id] -= total`
  7. `erc20.approve(pool, total)` — approve, never transfer; the pool pulls
  8. return `[OpenNoteDeposit { note_id, token, amount: total }].span()`; emit `Claimed`

**Why cliff + nullifier, not linear partial claims.** The `secret` travels in *public*
`privacy_invoke` calldata (STRK20 hides the note operations, not the invoke calldata). A linear
scheme with partial claims would leave an unclaimed remainder after the first claim — and anyone
who read the now-public secret could sweep that remainder into their own note. An all-or-nothing
claim at the vest cliff, gated by a per-`(epoch, leaf)` nullifier, closes that window: there is
never a remainder, and the secret is worthless the instant it is used. This matches the safety
profile of StarkWare's own escrow example (`claimed: bool`). The residual mempool front-running
consideration is identical to that example's and low on today's Starknet; the robust fix is a ZK
membership proof + owner binding (Roadmap). `note_id` is the **last** parameter so the wallet's
`"${openNoteIds[0]}"` placeholder sits at the calldata tail. All hashing is
`core::poseidon::poseidon_hash_span` with tags (`'HIMITSU_REG_TAG:V1'`, `'HIMITSU_LEAF_TAG:V1'`).

## Verified protocol facts this design depends on

| Fact | Value | Source |
|---|---|---|
| Pool (mainnet) | `0x040337b1af3c663e86e333bab5a4b28da8d4652a15a69beee2b677776ffe812a`, deployed block **8978970** | RPC |
| `Deposit` event | selector `0x9149d2123147c5f43d258257fef0b7b969db78269369ebcf5ebb9eef8592f2`; `keys=[sel, user_addr, token]`, `data=[amount:u128]` | RPC, class ABI |
| Helper call | pool → `call_contract_syscall(helper, selector!("privacy_invoke"), calldata)`; calldata deserializes positionally into the signature; return must deserialize as `Span<OpenNoteDeposit>` | monorepo `privacy.cairo` / `utils.cairo` |
| `OpenNoteDeposit` | `{ note_id: felt252, token: ContractAddress, amount: u128 }` | `privacy::objects` |
| Toolchain | scarb **2.17.0**, snforge **0.59.0** at tag `PRIVACY-0.14.3-RC.5`; `privacy` used as a **git dependency** (not on scarbs.xyz); fallback: declare the struct locally (Serde is positional — the starter kit's helper does exactly this) | monorepo |
| Wallet API | `starknet@10.4.0` (hard pin), get-starknet `6.0.2`, types `0.10.3`; **Ready wallet only** today; `"OPEN"`, `"${poolAddress}"`, `"${openNoteIds[N]}"` are literal strings the wallet substitutes | starter kit source |
| Pool fee | flat **4 STRK per pool transaction** (mainnet, `get_fee_amount`) | pool views |
| Note maturity | 10 blocks; proofs anchored at `currentBlock − 10`; proving ≈ 29 s | STRK20 docs |

## What is hidden, what is not

| Step | Visibility |
|---|---|
| Pool deposit | Public: depositor, token, amount — by protocol design; it is the countable entry |
| `register` | Public call from the depositing address; adds nothing beyond the deposit |
| Allocations / roots | Publicly recomputable; roots on-chain |
| **Claim** | Submitted through the pool (relayer, not the user), but the vault's `Claimed { epoch_id, leaf, token, payout }` event is public. Since `leaf` ties back through the commitment to the public `Registered` event, an observer **can** link a claim to the registering (depositing) address. What stays hidden is only the **destination**: the open note's owner. "Join publicly, spend privately," not "claim anonymously." |
| Reward afterwards | Standard STRK20 private balance |

**Trust model.** The operator posts roots. Roots are recomputable by anyone from public
events, so the operator can censor but cannot secretly inflate. **Over-allocation is now
impossible on-chain**, not just discouraged: `post_root` reserves budget out of funded
`available`, so an epoch can never commit more than was funded, and each claim debits
`pot_remaining`. **Known limits, stated plainly:**
time-in-pool is unprovable (withdrawals are unlinkable — that is the protocol working),
so vesting-from-deposit is the proxy; leaf↔registration linkage is public, so a claim
shows *whose allocation* was paid, not *where it went* — full claim unlinkability needs
a ZK membership proof (Semaphore-style) and is roadmap, not v1.

## Repository layout

```
contracts/   himitsu_vault package (Scarb + snforge)
indexer/     TS: pool event ingestion, gauge math, merkle build, epoch data out
app/         Next.js (starter-kit base): Earn · Claim · Fund · Depth dashboard
epochs/      published epoch data (leaves, proofs, roots) — the recompute evidence
scripts/     export_vectors.py (Cairo↔TS parity vectors); declare/deploy, epoch close,
             and tx verification are Makefile targets (see `make help`)
```
