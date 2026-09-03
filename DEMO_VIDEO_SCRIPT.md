# Demo video script

Word-for-word narration for the hub's `demo_video` (3-minute limit; this reads at ~2:25).
Shot numbers match MAINNET_RUNBOOK.md section 7. Record 1080p with OBS or QuickTime,
time-lapse the two ~30 s proving spinners, upload unlisted to YouTube, then:

    python3 scripts/fill_manifest.py --video '<link>'
    make strk20-check && git commit -am "demo video" && git push origin main

Keep the copy honest on camera: deposits and split patterns are public, claims are
leaf-linkable, only the destination is hidden. Never say "untraceable".

---

**1. Landing page** (~10 s)
"This is Himitsu. STRK20 encrypts everything inside Starknet's privacy pool, but the edges
are public. Deposit 444.44 STRK, withdraw the same number later, and anyone can link the
two. No cryptography broken, just number matching."

**2. Earn page, the buckets** (~10 s)
"Himitsu splits every deposit into standard denominations. These are the buckets, live from
chain data. Thin buckets pay the highest reward multiplier, because a crowd only protects
you if it exists."

**3. Shield page, type an arbitrary amount** (~15 s)
"Type any amount. 3,742 becomes standard pieces: three thousands, seven hundreds, four
tens. The remainder stays inside as shielded change. Each piece is indistinguishable from
every other deposit in its bucket."

**4. The fee caption on the split card** (~10 s)
"The reward fee is half a percent, taken only from rewards, never from your deposit. It is
earmarked to the exact buckets you joined, paying the next depositors into your own crowd.
Demand for privacy funds its own supply."

**5. A real mainnet session, wallet approve + proving spinner** (~15 s)
"A real mainnet session. One wallet approval, about thirty seconds of client-side proving,
and the flat six STRK pool fee. Shielded and registered."

**6. Voyager: the deposit tx and the register tx** (~10 s)
"The public edge, on Voyager: the deposit succeeded with a pool event, and the register
call from the same address. Deposits are public by design. We never claim otherwise."

**7. Terminal: epoch-2.json, then the post_root tx** (~15 s)
"Epoch close. Everything here is computed from public chain events: allocations by gauge
weight, the reward fee withheld, and the per-bucket earmarks for next epoch."

**8. Root recompute matching on-chain** (~10 s)
"Anyone can recompute the merkle root from public events and match it on-chain. The
operator cannot quietly cheat."

**9. Withdraw page, one claim end to end** (~15 s)
"Claiming. The allocation is found automatically from a wallet-derived secret, no files to
keep. One approval, thirty seconds of proving, and the claim goes through the pool itself,
firing the vault inside the same transaction."

**10. Shielded balance + strk20.json with the hashes** (~10 s)
"The reward lands in the shielded balance. Destination hidden. That claim is a qualifying
transaction: pool event and our contract, one hash. Himitsu: any amount in, standard
crowds, funded cover."
