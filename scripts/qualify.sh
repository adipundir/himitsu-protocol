#!/usr/bin/env bash
# One supervised command for the whole mainnet qualification (MAINNET_RUNBOOK.md, steps 0-9).
#
#   ./scripts/qualify.sh
#
# Resumable: every step reads its "already done?" answer from chain state (the vault's own
# events, via indexer/src/ops.ts) or from committed artifacts, so re-running after a failure
# or a Ctrl+C skips straight to the first unfinished step. The two steps a script cannot do
# remain yours: approving pool transactions in the Ready wallet (deposits, claims) and
# recording the video. The script tells you exactly when, then watches the chain until your
# clicks land.
#
# Knobs (env vars): SNCAST_ACCOUNT (default himitsu_mainnet), POT_STRK (default 30),
# WAIT_MINUTES (default 45; the weight-skew wait from runbook step 3 - only shorten it if
# you accept the skewed pot math documented there).

set -euo pipefail

export PATH="$HOME/.asdf/shims:$HOME/.starkli/bin:$HOME/.local/bin:$PATH"
cd "$(dirname "$0")/.."
REPO="$PWD"

ACCT="${SNCAST_ACCOUNT:-himitsu_mainnet}"
POT_STRK="${POT_STRK:-30}"
WAIT_MINUTES="${WAIT_MINUTES:-45}"
POOL=0x040337b1af3c663e86e333bab5a4b28da8d4652a15a69beee2b677776ffe812a
STRK=0x04718f5a0fc34cc1af16a1cdee98ffb20c31f5cd61d6ab07201858f4287c938d
ACCOUNTS_FILE="$HOME/.starknet_accounts/starknet_open_zeppelin_accounts.json"

say()  { printf '\n\033[1;36m== %s\033[0m\n' "$*"; }
note() { printf '\033[0;33m   %s\033[0m\n' "$*"; }
die()  { printf '\033[0;31mSTOP: %s\033[0m\n' "$*" >&2; exit 1; }
confirm() { read -r -p "$1 [y/N] " a; [ "${a:-n}" = y ] || [ "${a:-n}" = Y ]; }

ops() { (cd "$REPO/indexer" && pnpm --silent tsx src/ops.ts "$@" --rpc "$STARKNET_RPC_URL"); }
jqpy() { python3 -c "import json,sys;d=json.load(sys.stdin);print(d$1)"; }

countdown() { # countdown <minutes> <label>
  local m=$1
  while [ "$m" -gt 0 ]; do printf '\r   %s: %d min remaining ' "$2" "$m"; sleep 60; m=$((m-1)); done
  printf '\r   %s: done.                    \n' "$2"
}

# ---------- step 0: preflight ----------
say "Preflight"
[ -f .env ] || die ".env missing. Create it with your Alchemy key (public RPCs cannot take the
      indexing scan - Sepolia public RPCs are dead entirely as of Sep 2026):
        STARKNET_RPC_URL=https://starknet-mainnet.g.alchemy.com/v2/<KEY>"
set -a; source .env; set +a
[ -n "${STARKNET_RPC_URL:-}" ] || die "STARKNET_RPC_URL empty in .env"

for t in scarb snforge sncast node pnpm python3; do
  command -v "$t" >/dev/null || die "missing tool: $t (run: make setup)"
done

[ -f "$ACCOUNTS_FILE" ] || die "no sncast accounts file. Import your deployer first:
$(make -s wallet-help)"
DEPLOYER=$(python3 - "$ACCT" <<'PY'
import json, os, sys
accts = json.load(open(os.path.expanduser("~/.starknet_accounts/starknet_open_zeppelin_accounts.json")))
for net, names in accts.items():
    if sys.argv[1] in names:
        print(names[sys.argv[1]]["address"]); break
PY
)
[ -n "$DEPLOYER" ] || die "account '$ACCT' not found in $ACCOUNTS_FILE. Import it (make wallet-help) or set SNCAST_ACCOUNT."
note "account: $ACCT ($DEPLOYER)"

BAL=$(ops balance --token=$STRK --address="$DEPLOYER" | jqpy "['tokens']")
note "deployer STRK balance: $BAL"
python3 -c "import sys; sys.exit(0 if float('$BAL') >= 100 else 1)" || {
  note "runbook budget is ~110 STRK liquid (pot + deposits + pool fees + gas)."
  confirm "Balance is below 100 STRK. Continue anyway?" || exit 1
}

# ---------- step 1: declare + deploy ----------
if [ -f deployments/mainnet.json ]; then
  VAULT=$(jqpy "['vault']" < deployments/mainnet.json)
  say "Vault already deployed: $VAULT"
else
  say "Declare HimitsuVault (gas: up to ~5 STRK for declare+deploy)"
  DECLARE_LOG=$(mktemp)
  make declare SNCAST_ACCOUNT="$ACCT" 2>&1 | tee "$DECLARE_LOG" || true
  CLASS_HASH=$(grep -ioE '(class.hash[^0-9a-fx]*)(0x[0-9a-f]+)' "$DECLARE_LOG" | grep -oE '0x[0-9a-f]+' | tail -1)
  # "Class with hash 0x… is already declared" (a fine outcome on re-runs) doesn't match the
  # labeled form above; any ~63-hex-digit value in the output is the class hash.
  [ -n "$CLASS_HASH" ] || CLASS_HASH=$(grep -oE '0x[0-9a-f]{50,66}' "$DECLARE_LOG" | tail -1)
  [ -n "$CLASS_HASH" ] || read -r -p "Could not parse class hash - paste it: " CLASS_HASH
  note "class hash: $CLASS_HASH"

  say "Deploy (operator = deployer EOA; recorded as the known trust-model compromise)"
  DEPLOY_LOG=$(mktemp)
  make deploy SNCAST_ACCOUNT="$ACCT" CLASS_HASH="$CLASS_HASH" OPERATOR="$DEPLOYER" 2>&1 | tee "$DEPLOY_LOG"
  VAULT=$(grep -ioE '(contract.address[^0-9a-fx]*)(0x[0-9a-f]+)' "$DEPLOY_LOG" | grep -oE '0x[0-9a-f]+' | tail -1)
  DEPLOY_TX=$(grep -ioE '(transaction.hash[^0-9a-fx]*)(0x[0-9a-f]+)' "$DEPLOY_LOG" | grep -oE '0x[0-9a-f]+' | tail -1)
  [ -n "$VAULT" ] || read -r -p "Could not parse vault address - paste it: " VAULT
  [ -n "$DEPLOY_TX" ] || read -r -p "Paste the deploy tx hash: " DEPLOY_TX

  python3 - "$VAULT" "$CLASS_HASH" "$DEPLOY_TX" <<'PY'
import json, sys
json.dump({"vault": sys.argv[1], "classHash": sys.argv[2], "deployTx": sys.argv[3]},
          open("deployments/mainnet.json", "w"), indent=2)
PY
  say "Wrote deployments/mainnet.json"
fi

# app env: point the local app at the vault
touch app/.env.local
grep -q "^NEXT_PUBLIC_VAULT_ADDRESS=" app/.env.local \
  && sed -i '' "s|^NEXT_PUBLIC_VAULT_ADDRESS=.*|NEXT_PUBLIC_VAULT_ADDRESS=$VAULT|" app/.env.local \
  || echo "NEXT_PUBLIC_VAULT_ADDRESS=$VAULT" >> app/.env.local
grep -q "^NEXT_PUBLIC_PROVIDER_URL=" app/.env.local \
  || note "app/.env.local has no NEXT_PUBLIC_PROVIDER_URL (Alchemy key) - add it before make app-dev."
note "Also set NEXT_PUBLIC_VAULT_ADDRESS=$VAULT in Vercel project settings + redeploy, so demo_url works."

DEPLOY_TX=$(jqpy "['deployTx']" < deployments/mainnet.json)
FROM_BLOCK=$(ops block-of --tx="$DEPLOY_TX" | jqpy "['block']")
[ "$FROM_BLOCK" != "None" ] || die "deploy tx not yet in a block; wait a minute and re-run."
STATUS=$(ops status --vault="$VAULT" --from-block="$FROM_BLOCK")
note "chain state: $STATUS"

# ---------- step 2: fund the pot ----------
if [ "$(echo "$STATUS" | jqpy "['funded']")" -gt 0 ]; then
  say "Pot already funded"
else
  say "Fund the pot: $POT_STRK STRK (approve + fund; a donation - only claims take it out)"
  AMOUNT=$(python3 -c "print($POT_STRK * 10**18)")
  make fund SNCAST_ACCOUNT="$ACCT" TOKEN=$STRK AMOUNT="$AMOUNT"
fi

# ---------- step 3: three sessions (your wallet) ----------
REG=$(echo "$STATUS" | jqpy "['registered']")
if [ "$REG" -ge 3 ]; then
  say "Already $REG sessions registered"
  confirm "Has the ${WAIT_MINUTES}-minute weight wait after the third deposit already passed?" \
    || countdown "$WAIT_MINUTES" "weight wait (pot-skew defense, runbook step 3)"
else
  say "Your part: three deposit sessions from the app"
  note "Run 'make app-dev' in another terminal, open http://localhost:3000/app/shield?d=10"
  note "Ready wallet on MAINNET. Per session: deposit 10 STRK (one pool tx, ~30 s proving,"
  note "6 STRK flat pool fee) then confirm the register tx. Wait for 'Shielded and registered.'"
  note "Do it three times. I'm watching the chain - no need to tell me."
  while [ "$REG" -lt 3 ]; do
    sleep 30
    REG=$(ops status --vault="$VAULT" --from-block="$FROM_BLOCK" | jqpy "['registered']")
    printf '\r   registered sessions on-chain: %s/3 ' "$REG"
  done
  echo
  say "All three sessions registered"
  countdown "$WAIT_MINUTES" "weight wait (pot-skew defense, runbook step 3)"
fi

# ---------- step 4: index + close epoch 2 + post root ----------
ROOTS=$(ops status --vault="$VAULT" --from-block="$FROM_BLOCK" | jqpy "['rootsPosted']")
if [ ! -f epochs/epoch-2.json ]; then
  say "Index mainnet pool events (10-40 min on an Alchemy key - go get coffee)"
  make indexer-once

  say "Close epoch 2 (join rule v2, 0.5% reward fee, 300 s vest)"
  [ -f epochs/epoch-1.json ] && mv epochs/epoch-1.json /tmp/epoch-1.sepolia.json
  trap '[ -f /tmp/epoch-1.sepolia.json ] && mv /tmp/epoch-1.sepolia.json epochs/epoch-1.json' EXIT
  (cd indexer && pnpm tsx src/epoch-close.ts \
    --epoch 2 --pool $POOL --vault "$VAULT" --token $STRK \
    --pot "$(python3 -c "print($POT_STRK * 10**18)")" \
    --genesis-block 8978970 --vest-duration 300)
  mv /tmp/epoch-1.sepolia.json epochs/epoch-1.json
  trap - EXIT
  make app-epochs
  note "epoch-2.json written; restart make app-dev if it was running (it serves the epoch files)."
else
  say "epochs/epoch-2.json already exists"
fi

if [ "$ROOTS" -gt 0 ]; then
  say "Root already posted"
else
  say "Post the epoch-2 root (6-param post_root, reserves solvency on-chain)"
  CALLDATA=$(python3 -c "import json;e=json.load(open('epochs/epoch-2.json'));print(2, e['token'], e['root'], e['totalAllocated'], e['vestStart'], e['vestDuration'])")
  note "calldata: $CALLDATA"
  # shellcheck disable=SC2086
  sncast --account "$ACCT" invoke -d "$VAULT" -f post_root -c $CALLDATA --url "$STARKNET_RPC_URL"
  say "Root posted. Vest cliff is 300 s; waiting 7 min (block timestamps lag wall clock)."
  countdown 7 "vest cliff"
fi

# ---------- step 5: three claims (your wallet) ----------
CLAIMED=$(ops status --vault="$VAULT" --from-block="$FROM_BLOCK" | jqpy "['claimed']")
if [ "$CLAIMED" -lt 3 ]; then
  say "Your part: three claims from the Withdraw page"
  note "Same browser as the deposits: http://localhost:3000/app/claim - the three allocations"
  note "appear automatically. Claim each (~30 s proving, 6 STRK pool fee, reward lands shielded)."
  note "NOT_VESTED means wait a few more minutes; ALREADY_CLAIMED means it already worked."
  while [ "$CLAIMED" -lt 3 ]; do
    sleep 30
    CLAIMED=$(ops status --vault="$VAULT" --from-block="$FROM_BLOCK" | jqpy "['claimed']")
    printf '\r   claims on-chain: %s/3 ' "$CLAIMED"
  done
  echo
fi
say "Claims complete - collecting hashes from the vault's Claimed events"
CLAIM_TXS=$(ops status --vault="$VAULT" --from-block="$FROM_BLOCK" | python3 -c "import json,sys;print(' '.join(json.load(sys.stdin)['claimTxs'][:3]))")
note "qualifying txs: $CLAIM_TXS"

# ---------- step 6: manifest + validation ----------
say "Fill strk20.json and validate"
CLASS_HASH=$(jqpy "['classHash']" < deployments/mainnet.json)
# shellcheck disable=SC2086
python3 scripts/fill_manifest.py --vault "$VAULT" --class-hash "$CLASS_HASH" $CLAIM_TXS
make strk20-check
make verify-txs

# ---------- step 7: push ----------
say "verify-txs is green. The hub only sees what's on origin/main."
if confirm "Commit and push the manifest + deployment + epoch now?"; then
  git add strk20.json deployments/mainnet.json epochs/epoch-2.json app/public/epochs
  git commit -m "Mainnet deployment, epoch 2, qualifying claim transactions"
  git pull --rebase origin main
  git push origin main
  say "Pushed. The hub re-reads within ~30 minutes."
else
  note "Not pushed. Push before the freeze or none of this counts."
fi

say "Remaining by hand: record the video (DEMO_VIDEO_SCRIPT.md), then:
   python3 scripts/fill_manifest.py --video '<link>' && git commit -am 'demo video' && git push"
