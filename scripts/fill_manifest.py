#!/usr/bin/env python3
"""Fill strk20.json without hand-editing the file the judges read.

    python3 scripts/fill_manifest.py --vault 0x… --class-hash 0x… 0xtx1 0xtx2 0xtx3
    python3 scripts/fill_manifest.py --add 0xtx4 0xtx5          # append more qualifying txs
    python3 scripts/fill_manifest.py --video https://…          # set the demo video link

Positional tx hashes REPLACE the transactions list (the qualification set); --add appends and
dedupes instead. demo_url is never touched. Always run `make strk20-check && make verify-txs`
after (qualify.sh does).
"""

import argparse
import json
import sys

p = argparse.ArgumentParser()
p.add_argument("txs", nargs="*", help="qualifying tx hashes (replace the list)")
p.add_argument("--add", nargs="+", default=[], help="tx hashes to append instead of replace")
p.add_argument("--vault", help="vault address for contracts[]")
p.add_argument("--class-hash", help="vault class hash for contracts[]")
p.add_argument("--video", help="demo_video link")
args = p.parse_args()

for tx in args.txs + args.add:
    if not (tx.startswith("0x") and len(tx) >= 10):
        sys.exit(f"not a tx hash: {tx}")

with open("strk20.json") as f:
    d = json.load(f)

if args.txs:
    d["transactions"] = args.txs
if args.add:
    d["transactions"] = list(dict.fromkeys(d.get("transactions", []) + args.add))
if args.vault:
    d["contracts"] = [
        {
            "name": "HimitsuVault",
            "address": args.vault,
            "class_hash": args.class_hash or "",
            "network": "mainnet",
        }
    ]
if args.video:
    d["demo_video"] = args.video

with open("strk20.json", "w") as f:
    json.dump(d, f, indent=2)
    f.write("\n")

print(
    f"strk20.json: {len(d['transactions'])} txs, {len(d['contracts'])} contracts, "
    f"video {'set' if d['demo_video'] else 'EMPTY'}, demo_url {d['demo_url']}"
)
