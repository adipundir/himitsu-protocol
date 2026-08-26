# Implementation Plan

> Freeze: **31 Aug 2026, 23:59 UTC**. Scoring: integration 30 · mainnet 30 · innovation 25 · docs 15.
> Every phase ends with an acceptance check. `make <target>` names refer to the Makefile.

## Phase 0 — Toolchain & scaffolding (Day 1 morning)

- [ ] `make setup` — installs scarb 2.17.0 + snforge 0.59.0 (starkup) and starkli; verifies versions.
- [ ] `.env` from `.env.example` with the Alchemy key (never committed).
- [ ] `contracts/` scaffold: `scarb new`, Scarb.toml per ARCHITECTURE.md (git dep on
      `privacy` tag `PRIVACY-0.14.3-RC.5`; if resolution misbehaves, fall back to a local
      `OpenNoteDeposit` struct — positional Serde makes it equivalent; the starter kit ships this way).
- **Accept:** `make contracts-build` compiles an empty contract.

## Phase 1 — HimitsuVault (Day 1)

- [ ] Storage, events, constructor `(pool, operator)`.
- [ ] `fund`, `register` (dedupe + events), `post_root` (operator-only, write-once).
- [ ] Poseidon helpers: `commitment = h(REG_TAG, secret)`, `leaf = h(LEAF_TAG, commitment, token, total)`,
      sorted-pair merkle verify.
- [ ] `privacy_invoke(epoch_id, secret, token, total, proof, note_id)`: caller assert →
      merkle verify → linear vesting → `claimed` ledger → `approve(pool, payout)` →
      `[OpenNoteDeposit{...}].span()`. `note_id` last.
- [ ] snforge tests (the scoreable proof of correctness):
      caller-not-pool reverts · bad proof reverts · vesting math at 0%/50%/100% ·
      double-claim yields only the newly-vested delta · zero-payout reverts ·
      pool-pull simulation (approve visible to caller) · **test vectors exported** for
      TS parity (commitment, leaf, 4-leaf root).
- **Accept:** `make contracts-test` green; test-vector JSON written to `epochs/vectors.json`.

## Phase 2 — Indexer & epoch pipeline (Day 2 morning)

- [ ] `indexer/`: `starknet_getEvents` over the pool from block 8978970 —
      filter `keys=[["0x9149d2123147c5f43d258257fef0b7b969db78269369ebcf5ebb9eef8592f2"]]`,
      decode `keys=[sel, user_addr, token] / data=[amount]`, paginate by continuation_token
      (Lava caps ~81k blocks/call). Same pass for the vault's `Registered` events.
- [ ] Deposit↔registration join: same address, deposit ≤ register block, nearest unconsumed.
- [ ] Gauge math per ARCHITECTURE.md table; epoch allocation = pro-rata of the pot.
- [ ] Merkle build with `@scure/starknet` poseidon — **parity-checked against
      `epochs/vectors.json` from snforge** (hard gate: if TS root ≠ Cairo root, stop and fix).
- [ ] Output `epochs/epoch-N.json`: leaves, proofs, root, params — committed (public recompute evidence).
- [ ] Depth dashboard data: deposits per (token, bucket) over time.
- **Accept:** `make epoch-close EPOCH=0` produces a root the Cairo tests accept.

## Phase 3 — Mainnet deployment (Day 2 afternoon)

- [ ] starkli account + keystore (`make wallet-help` prints the two commands).
- [ ] `make declare && make deploy` → address into `deployments/mainnet.json` + `strk20.json.contracts`.
- [ ] `make fund TOKEN=STRK AMOUNT=…` seeds epoch 1's pot (small; pot ≠ demo requirement).
- [ ] Budget: each pool tx pays a **flat 4 STRK pool fee** + gas; keep ≥ 50 STRK on the deployer/wallet.
- **Accept:** vault on Voyager, `Funded` event visible, `post_root` for a rehearsal epoch succeeds.

## Phase 4 — App (Day 2–3)

Base: starter kit (already vendored in scratchpad) — keep `SelectWallet`, contexts,
`submit()` plumbing, pins exactly (`starknet@10.4.0`, get-starknet 6.0.2); delete demo
tabs/decor; add the `supportedWalletApi ≥ 0.10.3` gate. **Ready wallet only** today.

- [ ] **Earn:** preset denominations → `strk20InvokeTransaction([{type:"deposit",…}])`
      (two wallet prompts: approve, deposit — label both) → auto `register(commitment)`
      via plain `execute()` → secret to localStorage **+ mandatory download** (try/catch,
      page must work with storage blocked).
- [ ] **Claim:** load secret → fetch proof from `epochs/epoch-N.json` → actions:
      `[{type:"transfer", token, amount:"OPEN", recipient:user}, {type:"invoke", contract:vault,
      calldata:[epoch_id, secret, token, total, …proof, "${openNoteIds[0]}"]}]`.
      Placeholders are **literal strings — never hex-normalize**. Dry-run with
      `strk20PrepareInvoke(actions, true)` first. Verify via receipt: vault `Claimed` event.
- [ ] **Fund** page (plain ERC-20 approve + `fund`). **Depth** dashboard from indexer data.
- [ ] Deploy to Vercel; set the repo **Website field** (auto demo detection).
- **Accept:** full flow on mainnet through Ready with small amounts.

## Phase 5 — The scored transactions (Day 3)

The checker requires: exists, SUCCEEDED, touched the pool, **and ran through our
contract**. Claims satisfy all four; deposits only three. So:

- [ ] 2× shield at standard denominations + register (extra evidence, not counted on).
- [ ] Close epoch 1, `post_root`, wait out vesting cliff (set short for the sprint).
- [ ] **≥ 3 claim transactions** through `privacy_invoke` (different registrations/buckets).
- [ ] Hashes → `strk20.json.transactions`; `make verify-txs` re-checks each against RPC
      (exists, SUCCEEDED, pool events present, vault `Claimed` emitted) — our own Doom-style
      self-verification, also a judge artifact.
- **Accept:** `make verify-txs` prints 3/3 PASS.

## Phase 6 — Docs & video (Day 4)

- [ ] README final: mechanism, honest hidden-vs-visible, trust model, run-it-yourself.
- [ ] 3-minute video: thesis (20s) → shield+register (40s) → dashboard depth tick (30s) →
      private claim landing shielded (60s) → recompute-the-root honesty beat (30s).
      Link → `strk20.json.demo_video`.
- [ ] Buffer for re-recording; **freeze is 23:59 UTC** — everything merged to `main` before.

## Risk register

| Risk | Mitigation |
|---|---|
| `privacy` git-dep resolution quirks | Local `OpenNoteDeposit` struct fallback (kit-proven) |
| TS/Cairo poseidon mismatch | Phase 1 exports vectors; Phase 2 hard-gates on parity |
| Ready wallet friction on invoke actions | Kit's echo flow proves the exact action shape; rehearse with 1-STRK amounts first |
| Proving latency (~29 s/tx) + 4 STRK/tx fees | Schedule tx session in one sitting with buffer; ≥ 50 STRK float |
| Thin pool activity → boring dashboard | Our own standard-denomination deposits are honest seed data; dashboard shows the mechanism regardless |
| Epoch operator = us (trust) | Disclosed in ARCHITECTURE.md; `epochs/*.json` committed so anyone recomputes |
