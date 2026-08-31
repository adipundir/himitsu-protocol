# Mainnet qualification runbook

Operator guide for taking Himitsu from zero mainnet footprint to a complete, chain-checkable
STRK20 entry: vault deployed, pot funded, three sessions, epoch 2 closed and posted, three
claims, `strk20.json` filled and pushed.

**Entry freeze: 2026-08-31 23:59 UTC.** The judging hub reads `strk20.json` from the repo
root (re-read every ~30 minutes) and chain-checks every listed transaction: it must exist,
have SUCCEEDED, carry a **pool event**, and carry **our vault** in its events. A pool-only
deposit does not qualify. A register-only call does not qualify. **The three claim
transactions are the qualifiers** — each one is a single pool transaction that fires both a
pool event and the vault's `privacy_invoke`. Everything below exists to produce those three
hashes and the manifest that points at them.

Prerequisite outside this runbook: the registration PR to `starkience/strk20-hackathon`
(`registry.json`) must be merged, or the hub never reads this repo at all.

---

## At a glance

| # | Step | Command / action | Cost (est.) | Time (est.) |
|---|------|------------------|-------------|-------------|
| 0 | Preflight | `.env`, `make doctor`, sncast account import, `app/.env.local` | — | 15–30 min |
| 1 | Deploy vault | `make declare` + `make deploy`, write `deployments/mainnet.json` | ~1–5 STRK gas | 10 min |
| 2 | Fund pot | `make fund TOKEN=<STRK> AMOUNT=<30 STRK raw>` | 30 STRK + gas | 5 min |
| 3 | Three sessions | App shield page: deposit 10 STRK + register, three times | 30 STRK shielded (stays yours) + 3×6 STRK pool fee + gas | 20–30 min |
| 4 | Close epoch 2 | wait 45–60 min (weight skew, see steps 2–3), `make indexer-once`, then direct `epoch-close.ts` run, then `post_root` via sncast | gas only | 60–100 min (wait + index scan) |
| 5 | Vest cliff | wait | — | 5 min (300 s vest) |
| 6 | Three claims | App Withdraw page, one claim per session | 3×6 STRK pool fee | 15 min |
| 7 | Fill + validate manifest | edit `strk20.json`, `make strk20-check`, `make verify-txs` | — | 10 min |
| 8 | Video | 10-shot list below, link into `demo_video` | — | 1–2 h |
| 9 | Push to main | `git push` — push the manifest FIRST, video link can follow | — | 5 min |

**Budget:** keep ~110 STRK liquid in the deployer/operator wallet. Roughly: 30 STRK pot
(comes back to you through the claims, minus fees), 30 STRK deposited (stays in your own
shielded balance), 36 STRK in flat pool fees (6 STRK per pool transaction × 3 deposits +
3 claims), and a few STRK of network gas across declare/deploy/fund/register/post_root.

**Wall clock:** ~3–4.5 hours (the 45–60 min weight wait in step 4 is idle time), plus the
video. Start now; the freeze is hard.

Honest note on what a script cannot do: every pool transaction (deposits and claims) goes
through the Ready wallet extension in a browser — a human clicks Approve and waits ~30 s of
client-side proving per deposit piece and per claim. The sncast steps (declare, deploy,
fund, post_root) are terminal commands. Plan to be at the keyboard for steps 3 and 6.

---

## 0. Preflight

**Repo `.env`** (root, never committed):

```
STARKNET_RPC_URL=https://starknet-mainnet.g.alchemy.com/v2/<YOUR_ALCHEMY_KEY>
STARKLI_ACCOUNT=~/.starkli/himitsu_acct.json
STARKLI_KEYSTORE=~/.starkli/himitsu_key.json
```

Use the Alchemy key, not a public RPC: step 4 scans pool events from block 8,978,970 to the
current head (~14.1M as of 2026-08-30) and public endpoints rate-limit that scan into the
ground.

**Toolchain** — `make doctor` must print `ok` for scarb, snforge, sncast, node, pnpm and
both RPC env checks (the Sepolia one only matters for `NETWORK=sepolia` runs). Pins:
scarb **2.20.1**, starknet-foundry **0.63.0** (`contracts/.tool-versions`). If anything is
missing run `make setup`.

**Account** — mirror of `make wallet-help`. The starkli account is used for setup only;
declare/deploy/fund/post_root go through **sncast** (starkli 0.4.2 cannot declare our
Sierra output; sncast ships from the same release train as scarb and its CASM matches
what sequencers recompute):

```
starkli signer keystore from-key ~/.starkli/himitsu_key.json   # paste deployer private key
starkli account fetch <DEPLOYER_ADDRESS> --rpc $STARKNET_RPC_URL --output ~/.starkli/himitsu_acct.json

# import the SAME account into sncast:
starkli signer keystore inspect-private ~/.starkli/himitsu_key.json --raw   # copy the key
sncast account import --name himitsu_mainnet --address <DEPLOYER_ADDRESS> --type oz \
  --class-hash <ACCOUNT_CLASS_HASH from himitsu_acct.json> --private-key <paste> --url $STARKNET_RPC_URL
```

For the direct (non-make) commands later, export the env in your shell once:

```
set -a; source .env; set +a
```

**App env** — `app/.env.local`:

```
NEXT_PUBLIC_PROVIDER_URL=<YOUR_ALCHEMY_KEY>        # key only, prefixes are hardcoded
NEXT_PUBLIC_VAULT_ADDRESS=0x0                      # fill in after step 1
```

`0x0` disables mainnet actions in the app, so nothing works in the UI until the deploy
address goes in. Also install app deps now: `make app-install`.

**Wallet** — Ready wallet extension, on mainnet, holding the ~110 STRK budget. The wallet
is the only supported wallet (starter-kit constraint, starknet 10.4.0 / get-starknet 6.0.2).

**Constants used throughout:**

| Thing | Value |
|---|---|
| STRK20 pool (mainnet) | `0x040337b1af3c663e86e333bab5a4b28da8d4652a15a69beee2b677776ffe812a` |
| Pool genesis block | `8978970` |
| STRK token (mainnet) | `0x04718f5a0fc34cc1af16a1cdee98ffb20c31f5cd61d6ab07201858f4287c938d` |
| Flat pool fee | 6 STRK per pool transaction (admin-adjustable; re-verify with the pool's `get_fee_amount` if numbers look off) |

---

## 1. Deploy the vault to mainnet

```
make declare SNCAST_ACCOUNT=himitsu_mainnet
```

`NETWORK` defaults to mainnet. Copy the class hash from the output, then:

```
make deploy SNCAST_ACCOUNT=himitsu_mainnet CLASS_HASH=0x<class_hash> OPERATOR=0x<operator_address>
```

`OPERATOR` is the address allowed to call `post_root`. ARCHITECTURE.md's trust model asks
for a multisig/timelock here; for the qualification run under deadline an EOA (the deployer)
is acceptable — record that as a known compromise, do not present it as anything else.

**Record the address.** Create `deployments/mainnet.json`:

```json
{
  "vault": "0x<vault_address>",
  "classHash": "0x<class_hash>",
  "deployTx": "0x<deploy_tx_hash>"
}
```

The shape matters: the Makefile's mainnet branch reads `['vault']` as a **flat string**
(unlike `deployments/sepolia.json`, where it is an object). Every later target — fund,
epoch-close, indexer, post_root, verify-txs — resolves `VAULT` from this file.

Two side effects of creating this file, both intended:

- The `depth-refresh` CI workflow auto-detects it and flips the scheduled depth dashboard
  refresh from Sepolia to mainnet on its next run.
- `make indexer-once` / `make verify-txs` now target the mainnet vault by default.

**Update the app env**: set `NEXT_PUBLIC_VAULT_ADDRESS=0x<vault_address>` in
`app/.env.local`, and set the same variable in the Vercel project settings so the deployed
app (the `demo_url`) works after the next deploy.

Cost: declare is the expensive one (class size); budget up to ~5 STRK for both txs
combined, typically less. Time: a few minutes including confirmations.

---

## 2. Fund the pot

Recommended pot: **30 STRK**. The pot does **not** split equally: each session's weight is
proportional to the blocks between its deposit and the window's end (`toBlock` is
snapshotted when the `make indexer-once` scan *starts*), so earlier sessions earn more.
With three 10-STRK sessions ~10 minutes apart and the scan started **45–60 minutes after
the third deposit** (step 3's wait), the shares flatten to roughly 0.38/0.33/0.28 — worst
claim ~8.5 STRK after the 0.5% reward fee and 0.1 STRK quantization, comfortably above the
6 STRK flat pool fee each claim pays, so no claim in the demo is gas-negative. Skip that
wait and the skew defeats the pot: scanning ~5 minutes after the third deposit lands
roughly 14 / 8.6 / 3.1 STRK, putting the third claim under its own 6 STRK fee. A smaller
pot still qualifies; it just makes the fee math look bad on camera.

```
make fund SNCAST_ACCOUNT=himitsu_mainnet \
  TOKEN=0x04718f5a0fc34cc1af16a1cdee98ffb20c31f5cd61d6ab07201858f4287c938d \
  AMOUNT=30000000000000000000
```

`AMOUNT` is raw base units (18 decimals). This sends two transactions: an ERC-20 `approve`
(the target appends the u256 high word `0` for you) and the vault's `fund`. Funding is a
donation by design — there is no withdrawal path; STRK leaves the pot only through claims
against posted roots.

---

## 3. Three sessions from the app

Run the app locally against mainnet (`make app-dev`, open http://localhost:3000) — or use
the deployed app if the vault env var is already live there. Do sessions and claims from
the **same browser**: secrets are cached per browser, and while wallet-signature recovery
works anywhere, the cached path is the smooth one.

Each session, on the shield page (`/app/shield?d=10`, reachable from the Earn page's
bucket cards):

1. Connect the Ready wallet (mainnet).
2. Deposit **10 STRK** (the smallest standard denomination) and confirm. This is one pool
   transaction: expect **~30 s of proving** in the wallet before it submits, and the flat
   **6 STRK pool fee** on top of the 10 STRK (which lands in your own shielded balance —
   it is not spent).
3. Confirm the **register** transaction the app immediately prompts (a plain vault call,
   ordinary gas). The app saves the session secret in the browser and offers a backup —
   download it.

Do this **three times, sequentially, from the same address** — that is fine: epoch 2 runs
join rule v2 (session aggregation), and each session gets its own commitment. Wait for
each session to show "Shielded and registered." before starting the next.

Record as you go (the video needs this): the deposit tx hash, the pool fee line, and the
proving time. If you want split-plan footage with a real transaction, make one session a
split (e.g. 120 STRK → 1×100 + 2×10; still ONE pool transaction, so still one 6 STRK fee,
~30 s proving per piece) — but note an uneven session skews the pot toward itself, and the
two 10-STRK claims may then land under the 6 STRK claim fee. The equal-sessions path is
the recommended qualification path; shoot the split *plan* UI without submitting it.

After the third session, wait **45–60 minutes** before step 4. The weight formula
multiplies by blocks-since-deposit inside the window, and the window ends at the block
height snapshotted when the `make indexer-once` scan starts — so running it right away
skews the pot hard toward the first session and drops the third claim below the 6 STRK
claim fee (see step 2 for the numbers). The wait also keeps the last deposit from sitting
at the window's end with zero weight.

---

## 4. Close epoch 2 and post the root

### 4a. Index

```
make indexer-once
```

This scans every pool `Deposit` from genesis (8,978,970) to head plus the vault's
`Registered` events, and writes the local event store `epoch-close` reads. On mainnet this
is millions of blocks of `getEvents` paging: expect **10–40 minutes** on an Alchemy key.
Confirm the output mentions your three registrations before proceeding.

### 4b. Why epoch 2, not epoch 1

Mainnet's first epoch is closed as **EPOCH=2**, deliberately, for three reasons:

1. **Epoch ids ≥ 2 activate the current rules.** `JOIN_RULE_V2_FROM_EPOCH = 2` in
   `indexer/src/epoch-close.ts` switches on join rule v2 (session aggregation), the
   enforced 0.5% reward fee, and the earmark output fields (`feeBps`, `feeWithheld`,
   `feeWithheldByBucket`, `earmarksApplied`). An epoch 1 would close under legacy v1 rules
   with none of the incentive-layer evidence in the published file.
2. **It avoids clobbering published history.** `epochs/epoch-1.json` is the published
   Sepolia epoch; a re-run must stay byte-identical, and closing mainnet as epoch 1 would
   overwrite it.
3. **Epoch 2 is the one epoch that legitimately closes without earmarks.** Earmarks come
   from the prior epoch's `feeWithheldByBucket`. For epoch 2 the predecessor is a v1-era
   file (or absent entirely on a fresh network), and the closer knowingly falls back to a
   plain general distribution. For epoch 3 and later, a missing prior file fails closed as
   a misconfiguration. First mainnet epoch = 2 is the intended entry point.

### 4c. Move the Sepolia epoch file aside (required)

`epoch-close` checks the new window against **every** file in `epochs/` and knows nothing
about networks. The Sepolia epoch-1 window is `8978970..14238744` in Sepolia block
numbers; mainnet's head is ~14,104,790 (checked 2026-08-30), so your mainnet deposits sit
numerically **inside** that window and the overlap guard will refuse to close. Move the
file out for the close and restore it after:

```
mv epochs/epoch-1.json /tmp/epoch-1.sepolia.json
```

With it gone, the epoch-2 window defaults to genesis..highest-indexed-block, and the prior
lookup finds no epoch-1 file — which for epoch 2 (and only epoch 2) is the legitimate
no-earmarks case: the close prints a warning and proceeds with a general distribution.

### 4d. Close

`make epoch-close` works but cannot pass vest flags (it would default to a 3600 s vest).
Use the underlying command directly so claims can run five minutes after the root posts —
vest_start defaults to "now", and we pass a **300 s** vest_duration explicitly:

```
cd indexer && pnpm tsx src/epoch-close.ts \
  --epoch 2 \
  --pool 0x040337b1af3c663e86e333bab5a4b28da8d4652a15a69beee2b677776ffe812a \
  --vault 0x<vault_address> \
  --token 0x04718f5a0fc34cc1af16a1cdee98ffb20c31f5cd61d6ab07201858f4287c938d \
  --pot 30000000000000000000 \
  --genesis-block 8978970 \
  --vest-duration 300
cd ..
```

Expected output: `epochs/epoch-2.json` with **3 allocations**, `joinRule: 2`,
`feeBps: 50`, a non-zero `feeWithheld`, `feeWithheldByBucket` attributing it to the `10`
bucket, `earmarksApplied: {}` (nothing to carry — this is the first mainnet epoch), and
`totalAllocated` ≤ the pot. If it errors with "no eligible standard-denomination
registrations", the indexer has not seen your deposits yet — wait, re-run `make
indexer-once`, retry.

Now restore the Sepolia file and sync the app:

```
mv /tmp/epoch-1.sepolia.json epochs/epoch-1.json
make app-epochs
```

`app-epochs` copies both epoch files plus the depth snapshot into `app/public/epochs/` and
rebuilds the manifest — this is how the Withdraw page finds the allocations. Restart
`make app-dev` if it was running.

### 4e. Post the root

**Do not use `make post-root` for this vault.** That target is wired to the legacy Sepolia
deployment's 4-parameter `post_root`. The freshly declared mainnet vault is built from the
current source, whose `post_root` takes **six** parameters and reserves solvency on-chain:
`(epoch_id, token, root, total, vest_start, vest_duration)`. Print the calldata from the
epoch file and invoke directly:

```
python3 -c "import json;e=json.load(open('epochs/epoch-2.json'));print(2, e['token'], e['root'], e['totalAllocated'], e['vestStart'], e['vestDuration'])"

sncast --account himitsu_mainnet invoke \
  -d 0x<vault_address> -f post_root \
  -c 2 <token> <root> <totalAllocated> <vestStart> <vestDuration> \
  --url $STARKNET_RPC_URL
```

`total` is `totalAllocated` (the quantized sum), not the raw pot. The call reverts if
`available[STRK] < total` — i.e. if step 2's funding was smaller than the allocation sum.
A revert burns nothing: fix the cause and post id 2 again. A post that **landed** is
write-once — if a landed epoch 2 turns out wrong, its reservation is spent (its root stays
claimable); the recovery is to re-close the same window as epoch 3 with `--no-prior` (its
predecessor file no longer exists) and post under id 3. Concretely:

1. Note the bad file's `toBlock`, then delete `epochs/epoch-2.json`.
2. Move the restored Sepolia file aside again (`mv epochs/epoch-1.json
   /tmp/epoch-1.sepolia.json`). Step 4d put it back, and the close would otherwise fail
   twice over: the network-blind overlap guard trips on its `8978970..14238744` window,
   and with epoch 1 as the only published file the default `--from-block` becomes
   14,238,745 — past mainnet's head, so `epoch-close` throws `fromBlock > toBlock` before
   anything else.
3. Re-close with the original window explicit, so the epoch-3 file covers the identical
   deposit set: same command as 4d but `--epoch 3 --no-prior --from-block 8978970
   --to-block <noted toBlock>`.
4. Restore the Sepolia file, re-run `make app-epochs`, fund enough to cover the new total,
   and post the root under id 3.

---

## 5. Three claims from the Withdraw page

Wait out the cliff: claims revert with `NOT_VESTED` until block time passes
`vestStart + 300`. Give it ~6–7 minutes after the close (block timestamps lag wall clock).

On the app's **Withdraw** page (`/app/claim`), the three allocations appear automatically
(secrets cached in this browser; on another machine, "recover from wallet" re-derives them
from one free signature). For each one:

1. Click Claim, confirm in the Ready wallet. **~30 s proving**, then one pool transaction:
   an OPEN transfer plus the vault `privacy_invoke` — pool event and vault event in the
   same tx. This is a qualifying transaction.
2. Wait for "Claimed." and **copy the transaction hash**. The reward lands in your
   shielded balance; the flat 6 STRK pool fee applies to this transaction too.

Three claims, three hashes. Sequential is fine; the nullifier is per (epoch, leaf), so
each allocation claims exactly once (`ALREADY_CLAIMED` on a retry means it already
worked — check the first hash before resubmitting anything).

---

## 6. Fill and validate strk20.json

Only the claim hashes go in `transactions`. Deposits touch the pool but not the vault;
registers touch the vault but not the pool; each claim touches both, which is exactly what
the hub's chain-check (and our mirror of it) requires.

```json
{
  "transactions": [
    "0x<claim_tx_1>",
    "0x<claim_tx_2>",
    "0x<claim_tx_3>"
  ],
  "contracts": [
    {
      "name": "HimitsuVault",
      "address": "0x<vault_address>",
      "class_hash": "0x<class_hash>",
      "network": "mainnet"
    }
  ],
  "demo_video": "<link_when_ready>",
  "demo_url": "https://himitsu-protocol.vercel.app"
}
```

(If the hub's own examples show `contracts` as plain address strings, match them — the
non-negotiable part is that the vault address is present.)

Validate before pushing:

```
make strk20-check   # shape + required fields
make verify-txs     # each hash against RPC: exists, SUCCEEDED, pool event, vault event
```

`verify-txs` exits non-zero on any failure or on fewer than three transactions. A hash
that fails here fails the hub's independent check too — fix it now, not after the freeze.

---

## 7. Video — 10 shots, 2 minutes

The `demo_video` field takes a link (hub limit: 3 minutes). Shot list:

1. **Landing page, the thesis.** STRK20 encrypts the inside of the pool; its edges are
   public, and a distinctive amount is linkable by simple number-matching. (~10 s)
2. **Depth dashboard.** The standard buckets, their live depth, thin buckets paying the
   highest multiplier. (~10 s)
3. **Deposit any amount.** Type an arbitrary amount (e.g. 3,742) on the shield page; the
   split plan renders: standard pieces, the non-standard remainder staying inside as
   shielded change. (~15 s)
4. **The fee line.** The 0.5% reward fee on the split card, earmarked to the buckets this
   deposit splits into — demand for privacy funding its own supply. (~10 s)
5. **A real session.** Wallet approve, the ~30 s proving spinner (time-lapse it), the flat
   6 STRK pool fee visible, then "Shielded and registered." (~15 s)
6. **Public by design.** Voyager: the deposit SUCCEEDED with the pool event, the register
   from the same address — the honest public edge. (~10 s)
7. **Epoch close.** Terminal: `epoch-2.json` scrolling past — `feeBps`, `feeWithheld`,
   `feeWithheldByBucket` — then the `post_root` transaction. (~15 s)
8. **Root recompute.** The verify page (or terminal) rebuilding the root from public
   events and matching the on-chain value: the operator cannot cheat quietly. (~10 s)
9. **Claim.** Withdraw page auto-finds the allocation; one wallet confirm, ~30 s proving,
   claim goes through the pool itself. (~15 s)
10. **Landing shielded.** The reward arrives in the shielded balance — destination hidden;
    Voyager shows the claim tx with pool + vault events (the qualifying tx), and close on
    `strk20.json` with the three hashes. (~10 s)

Keep the copy honest on camera: deposits and split patterns are public, claims are
leaf-linkable, only the destination is hidden.

---

## 8. Push to main

The hub reads the repo, so nothing counts until it is on `main`:

```
git add strk20.json deployments/mainnet.json epochs/epoch-2.json app/public/epochs
git commit -m "Mainnet deployment, epoch 2, qualifying claim transactions"
git push origin main
```

Push the manifest **as soon as verify-txs passes** — do not hold it hostage to the video.
Add the `demo_video` link in a follow-up commit before the freeze. Then trigger a Vercel
deploy (with `NEXT_PUBLIC_VAULT_ADDRESS` set) so `demo_url` serves the mainnet epoch and
the working claim page.

Final sweep before 23:59 UTC on Aug 31: `make verify-txs` green, `make strk20-check`
green, `demo_video` non-empty, `demo_url` loads, license file present, everything pushed.
