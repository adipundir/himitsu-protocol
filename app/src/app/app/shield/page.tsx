"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import styles from "./shield.module.css";
import { useStoreWallet } from "../../components/Wallet/walletContext";
import { useFrontendProvider } from "../../components/client/provider/providerContext";
import { useDepthSnapshot } from "../../components/ds/useDepthSnapshot";
import DenominationPicker, { type PickerValue } from "../../components/ds/DenominationPicker";
import SplitSuggestion from "../../components/ds/SplitSuggestion";
import SecretVault from "../../components/ds/SecretVault";
import BucketJarMoment from "../../components/ds/BucketJarMoment";
import VisibilityStrip from "../../components/ds/VisibilityStrip";
import { Steps } from "../../components/himitsu/Steps";
import { addrSTRK, MAX_SPLIT_PIECES, myFrontendProviders, poolForIndex, SPLIT_FEE_BPS, STANDARD_DENOMS, vaultForIndex } from "@/utils/constants";
import {
  computeCommitment,
  downloadSecrets,
  fetchRegisteredCommitments,
  formatUnits,
  getClaimMaster,
  nextSecretIndex,
  parseUnits,
  planSplit,
  saveSecret,
  secretAtIndex,
  toHex,
  waitTx,
  watchForDeposit,
  watchForRegistration,
  type ActionResult,
  type SavedSecret,
  type SplitPlan,
} from "../../components/himitsu/lib";

export default function ShieldPage() {
  const myWalletAccount = useStoreWallet((s) => s.myWalletAccount);
  const address = useStoreWallet((s) => s.address);
  const chain = useStoreWallet((s) => s.chain);
  const strk20 = useStoreWallet((s) => s.strk20);
  const providerIndex = useFrontendProvider((s) => s.currentFrontendProviderIndex);
  const vault = vaultForIndex(providerIndex);
  const { data } = useDepthSnapshot();
  const ctaRef = useRef<HTMLButtonElement>(null);

  const [picked, setPicked] = useState<PickerValue>(1_000);
  const [customAmount, setCustomAmount] = useState("");

  // Deep links: /app/shield?d=<denomination> preselects a bucket (dashboard jars);
  // /app/shield?amount=<n> opens the custom split plan prefilled. Read after mount (not
  // useSearchParams) so the statically prerendered page hydrates clean.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const d = Number(params.get("d"));
    if ((STANDARD_DENOMS as readonly number[]).includes(d)) setPicked(d as PickerValue);
    const amount = params.get("amount");
    if (amount && planSplit(amount)) {
      setPicked("custom");
      setCustomAmount(amount);
    }
  }, []);
  const [steps, setSteps] = useState<ActionResult[]>([]);
  const [saved, setSaved] = useState<SavedSecret | null>(null);
  const [vaultConfirmed, setVaultConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [originRect, setOriginRect] = useState<DOMRect | null>(null);
  // The plan a successful split session executed — drives the per-bucket summary instead of
  // BucketJarMoment (which models exactly one bucket). Null for single-denomination sessions.
  const [splitShielded, setSplitShielded] = useState<SplitPlan | null>(null);

  const amountHuman = picked === "custom" ? Number(customAmount || 0) : picked;
  const buckets = data?.buckets ?? [];
  const isStandard = picked !== "custom";
  const splitPlan = picked === "custom" ? planSplit(customAmount) : null;

  const push = (r: ActionResult) => setSteps((s) => [...s.filter((x) => x.label !== r.label), r]);

  // Wallet-derived secret (lib.ts): one free signature, then poseidon(master, index). Any
  // device that signs the same message recovers every secret, so the browser never has to.
  async function deriveSessionSecret(): Promise<bigint> {
    push({
      label: "Deposit & Register",
      status: "pending",
      detail: "Sign the claim key message in your wallet. It is free, and any device with this wallet can re-derive your secret from it later.",
    });
    const master = await getClaimMaster(myWalletAccount!, address!, chain, vault);
    const registered = await fetchRegisteredCommitments(providerIndex, vault, address!);
    return secretAtIndex(master, nextSecretIndex(master, registered));
  }

  async function shieldAndRegister() {
    if (!myWalletAccount || !address || busy || amountHuman <= 0) return;
    // Captured now, before the button disappears behind SecretVault — the shield moment needs
    // to know where on screen to arc the new dot in from.
    setOriginRect(ctaRef.current?.getBoundingClientRect() ?? null);
    setBusy(true);
    setSteps([]);
    setSaved(null);
    setVaultConfirmed(false);
    const amount = parseUnits(picked === "custom" ? customAmount : String(picked));
    let stage = "Derive";
    // Tracks the most recent submitted tx, if any — a failure after this is set means a real
    // on-chain transaction may be in flight, not just a client-side error, so the catch block
    // below has to say so explicitly rather than silently inviting a duplicate submission.
    let lastTxHash: string | undefined;

    // A wallet call can complete on-chain (visible in the wallet's own activity) without ever
    // resolving the promise back to this page — observed directly, not hypothetical. We can't
    // cancel wallet-side work, and pretending it failed would invite a real duplicate deposit,
    // so this only ever adds a warning to the still-pending step, never fails it.
    let slowTimer: ReturnType<typeof setTimeout> | undefined;
    const armSlowWarning = (whatMayHaveLanded: string, baseDetail: string) => {
      clearTimeout(slowTimer);
      slowTimer = setTimeout(() => {
        push({
          label: "Deposit & Register",
          status: "pending",
          txHash: lastTxHash,
          detail:
            `${baseDetail} This is taking much longer than usual. Check your wallet's own ` +
            `activity or transaction history. If it already shows this ${whatMayHaveLanded}, don't ` +
            `click Deposit & Register again; wait for it to confirm or refresh this page instead.`,
        });
      }, 60_000);
    };

    try {
      const secret = await deriveSessionSecret();
      const commitment = computeCommitment(secret);
      stage = "Shield";
      // ONE multicall for both actions — a user who deposits without registering earns nothing
      // (the top failure mode of the entire product).
      const approveDetail = "Approve, then confirm the deposit + registration in your wallet. Proving takes ~30 s.";
      push({ label: "Deposit & Register", status: "pending", detail: approveDetail });
      armSlowWarning("deposit", approveDetail);
      // Raced against directly watching for the pool's own Deposit event: a wallet can
      // complete this on-chain without ever resolving its own promise back here (observed
      // directly), so whichever settles first — the wallet, or us seeing the real event — wins.
      const depositFromBlock = await myFrontendProviders[providerIndex].getBlockNumber();
      const dep = await Promise.race([
        myWalletAccount.strk20InvokeTransaction([
          { type: "deposit", token: addrSTRK, amount: toHex(amount) },
        ] as never),
        watchForDeposit(providerIndex, poolForIndex(providerIndex), BigInt(address), BigInt(addrSTRK), amount, depositFromBlock),
      ]);
      lastTxHash = dep.transaction_hash;
      const landingDetail = "Waiting for the deposit to land…";
      push({ label: "Deposit & Register", status: "pending", txHash: dep.transaction_hash, detail: landingDetail });
      armSlowWarning("deposit", landingDetail);
      await waitTx(providerIndex, dep.transaction_hash);

      stage = "Register";
      // The deposit landed (waitTx above resolved) — lastTxHash is still that deposit's hash
      // here, which is exactly what's worth telling someone stuck at this next wallet prompt.
      armSlowWarning("registration", "Confirm the registration in your wallet.");
      // Same race as the deposit above, watching for the vault's own Registered event.
      const registerFromBlock = await myFrontendProviders[providerIndex].getBlockNumber();
      const reg = await Promise.race([
        myWalletAccount.execute([
          { contractAddress: vault, entrypoint: "register", calldata: [toHex(commitment)] },
        ]),
        watchForRegistration(providerIndex, vault, commitment, registerFromBlock),
      ]);
      lastTxHash = reg.transaction_hash;
      const registerDetail = "Waiting for registration…";
      push({ label: "Deposit & Register", status: "pending", txHash: reg.transaction_hash, detail: registerDetail });
      armSlowWarning("registration", registerDetail);
      await waitTx(providerIndex, reg.transaction_hash);
      clearTimeout(slowTimer);
      push({ label: "Deposit & Register", status: "ok", txHash: reg.transaction_hash, detail: "Shielded and registered." });

      const entry: SavedSecret = {
        secret: toHex(secret),
        commitment: toHex(commitment),
        token: addrSTRK,
        amount: amount.toString(),
        createdAt: new Date().toISOString(),
      };
      saveSecret(entry);
      setSaved(entry);
    } catch (e) {
      // Label must match the pending pushes above ("Deposit & Register") so this replaces the
      // in-flight step instead of leaving it stuck spinning next to a separate error box.
      const detail = (e as Error)?.message ?? "The pool rejected the deposit. Check the token balance and try again.";
      // A tx hash here means something was actually submitted before the failure — the error
      // could be this page losing track of it (a slow/timed-out wait), not the transaction
      // itself failing. Retrying blind risks shielding twice, so say so and leave the hash.
      const caveat = lastTxHash
        ? " A transaction was already submitted. Check it above before retrying, so you don't shield twice."
        : "";
      push({ label: "Deposit & Register", status: "error", txHash: lastTxHash, detail: `${stage} failed: ${detail}.${caveat}` });
    } finally {
      clearTimeout(slowTimer);
      setBusy(false);
    }
  }

  // The "shield any amount" path: the custom amount goes in as a batch of standard pieces.
  // Mirrors shieldAndRegister's slow-warning + event-watch race machinery (that function
  // stays untouched as the single-denomination path); differences are batching and the
  // interface fee. ONE secret covers the whole batch: the vault keys allocations by
  // commitment, so the saved amount is simply the sum of all pieces.
  async function shieldSplitAndRegister(plan: SplitPlan) {
    // The piece cap is also enforced at the CTA; this guard keeps a stale/raced click from
    // submitting a batch larger than the wallet is known to handle (MAX_SPLIT_PIECES).
    if (!myWalletAccount || !address || busy || plan.pieceCount > MAX_SPLIT_PIECES) return;
    setBusy(true);
    setSteps([]);
    setSaved(null);
    setVaultConfirmed(false);
    setSplitShielded(null);

    let stage = "Derive";
    // Same duplicate-submission discipline as shieldAndRegister: once a tx hash exists, a
    // later failure may just be this page losing track of a real in-flight transaction.
    let lastTxHash: string | undefined;

    let slowTimer: ReturnType<typeof setTimeout> | undefined;
    const armSlowWarning = (whatMayHaveLanded: string, baseDetail: string) => {
      clearTimeout(slowTimer);
      slowTimer = setTimeout(() => {
        push({
          label: "Deposit & Register",
          status: "pending",
          txHash: lastTxHash,
          detail:
            `${baseDetail} This is taking much longer than usual. Check your wallet's own ` +
            `activity or transaction history. If it already shows this ${whatMayHaveLanded}, don't ` +
            `click Deposit & Register again; wait for it to confirm or refresh this page instead.`,
        });
      }, 60_000);
    };

    try {
      const secret = await deriveSessionSecret();
      const commitment = computeCommitment(secret);
      stage = "Shield";
      // Proving time scales with note operations — one piece is ~30 s, so the batch total is
      // the honest number to set expectations with, not the single-deposit path's flat ~30 s.
      const approveDetail =
        `Approve, then confirm the ${plan.pieceCount} pool deposits in your wallet. ` +
        `Proving takes ~30 s per piece (~${Math.ceil((plan.pieceCount * 30) / 60)} min for this batch).`;
      push({ label: "Deposit & Register", status: "pending", detail: approveDetail });
      armSlowWarning("deposit batch", approveDetail);
      const depositFromBlock = await myFrontendProviders[providerIndex].getBlockNumber();
      const dep = await Promise.race([
        // ONE strk20InvokeTransaction carrying every piece, so the flat pool fee applies once.
        myWalletAccount.strk20InvokeTransaction(
          plan.pieces.flatMap((p) =>
            Array.from({ length: p.count }, () => ({ type: "deposit", token: addrSTRK, amount: toHex(p.amount) })),
          ) as never,
        ),
        // All pieces travel in one transaction, so seeing the largest piece's Deposit event
        // (pieces[0] is largest by construction) means the whole batch landed.
        watchForDeposit(providerIndex, poolForIndex(providerIndex), BigInt(address), BigInt(addrSTRK), plan.pieces[0].amount, depositFromBlock),
      ]);
      lastTxHash = dep.transaction_hash;
      const landingDetail = "Waiting for the deposits to land…";
      push({ label: "Deposit & Register", status: "pending", txHash: dep.transaction_hash, detail: landingDetail });
      armSlowWarning("deposit batch", landingDetail);
      await waitTx(providerIndex, dep.transaction_hash);

      stage = "Register";
      armSlowWarning("registration", "Confirm the registration in your wallet.");
      const registerFromBlock = await myFrontendProviders[providerIndex].getBlockNumber();
      const reg = await Promise.race([
        // Register only. The reward fee is not a transaction: the indexer withholds it from
        // the allocation itself (epoch-close.ts REWARD_FEE_BPS), so nothing here can be
        // rejected or stripped to dodge it.
        myWalletAccount.execute([
          { contractAddress: vault, entrypoint: "register", calldata: [toHex(commitment)] },
        ]),
        watchForRegistration(providerIndex, vault, commitment, registerFromBlock),
      ]);
      lastTxHash = reg.transaction_hash;
      const registerDetail = "Waiting for registration…";
      push({ label: "Deposit & Register", status: "pending", txHash: reg.transaction_hash, detail: registerDetail });
      armSlowWarning("registration", registerDetail);
      await waitTx(providerIndex, reg.transaction_hash);
      clearTimeout(slowTimer);
      push({
        label: "Deposit & Register",
        status: "ok",
        txHash: reg.transaction_hash,
        detail: `Shielded ${plan.pieceCount} pieces and registered.`,
      });

      const entry: SavedSecret = {
        secret: toHex(secret),
        commitment: toHex(commitment),
        token: addrSTRK,
        amount: plan.depositTotal.toString(),
        createdAt: new Date().toISOString(),
      };
      saveSecret(entry);
      setSaved(entry);
      setSplitShielded(plan);
    } catch (e) {
      const detail = (e as Error)?.message ?? "The pool rejected the deposit. Check the token balance and try again.";
      const caveat = lastTxHash
        ? " A transaction was already submitted. Check it above before retrying, so you don't shield twice."
        : "";
      push({ label: "Deposit & Register", status: "error", txHash: lastTxHash, detail: `${stage} failed: ${detail}.${caveat}` });
    } finally {
      clearTimeout(slowTimer);
      setBusy(false);
    }
  }

  const shieldedBucket =
    isStandard && data
      ? (buckets.find((b) => b.denomination === picked) ?? {
          token: addrSTRK,
          tokenSymbol: "STRK",
          denomination: picked,
          depth: 0,
          // 3.0 is the real thin-bucket tier (indexer/src/gauge.ts), not an invented teaser rate.
          multiplier: 3,
          heat: 1 as const,
        })
      : null;

  return (
    <div className={styles.shield}>
      <div className={styles.intro}>
        <h1>Deposit</h1>
        <p className={styles.introSub}>Any amount goes in as standard pieces and registers you to earn. Thin buckets pay most.</p>
      </div>

      {!address && (
        <Alert className={styles.note}>
          <AlertDescription>Connect a wallet to shield &amp; earn.</AlertDescription>
        </Alert>
      )}
      {address && vault === "0x0" && (
        <Alert className={styles.note}>
          <AlertDescription>HimitsuVault is not deployed on this network yet.</AlertDescription>
        </Alert>
      )}
      {address && strk20 === "unsupported" && (
        <Alert className={styles.note}>
          <AlertDescription>
            This wallet doesn&apos;t support private STRK20 actions yet. Try{" "}
            <a href="https://www.ready.co/" target="_blank" rel="noreferrer">Ready</a>.
          </AlertDescription>
        </Alert>
      )}
      {address && strk20 === "unregistered" && (
        <Alert className={styles.note}>
          <AlertDescription>
            Your wallet hasn&apos;t enabled private tokens yet. You&apos;ll be prompted to set
            that up (one-time) on your first Shield below.
          </AlertDescription>
        </Alert>
      )}

      {!saved && (
        <>
          <DenominationPicker
            buckets={buckets}
            value={picked}
            onChange={setPicked}
            customAmount={customAmount}
            onCustomAmountChange={setCustomAmount}
            disabled={busy}
          />

          {/* buckets is null until the depth snapshot loads — SplitSuggestion then shows
              "up to 3.0×" instead of a per-row tier it can't actually know. */}
          {picked === "custom" && splitPlan && <SplitSuggestion plan={splitPlan} buckets={data ? buckets : null} />}
          {picked === "custom" && amountHuman > 0 && !splitPlan && (
            <Alert className={styles.note}>
              <AlertDescription>
                The smallest standard piece is 10 STRK. Enter at least 10 to build a split plan.
              </AlertDescription>
            </Alert>
          )}
          {picked === "custom" && splitPlan && splitPlan.pieceCount > MAX_SPLIT_PIECES && (
            <Alert className={styles.note}>
              <AlertDescription>
                This amount splits into {splitPlan.pieceCount} pieces; one session batches at
                most {MAX_SPLIT_PIECES}. Shield it in smaller parts. Rounder amounts need
                fewer pieces.
              </AlertDescription>
            </Alert>
          )}

          <div className={styles.ctaGroup}>
            <Button
              ref={ctaRef}
              size="xl"
              className={styles.ctaBar}
              onClick={() => {
                if (picked !== "custom") return shieldAndRegister();
                if (!splitPlan) return;
                // Exactly one standard piece needs no splitting, so it takes the plain
                // single-deposit path (no batching). This routing changes NOTHING about the
                // fee: the 0.5% reward withholding lives in the published reward math
                // (indexer applyRewardFee, on every rules-v2 commitment) and applies to
                // every path and every interface alike.
                if (splitPlan.pieceCount === 1 && splitPlan.remainder === 0n) return shieldAndRegister();
                return shieldSplitAndRegister(splitPlan);
              }}
              loading={busy}
              // Not gated on "unregistered" — clicking through is exactly what triggers
              // Ready's own first-time viewing-key setup; only a genuinely unsupported wallet
              // is a dead end worth blocking on.
              disabled={!address || vault === "0x0" || amountHuman <= 0 || strk20 === "unsupported" || (picked === "custom" && (!splitPlan || splitPlan.pieceCount > MAX_SPLIT_PIECES))}
            >
              <span>Deposit &amp; Register</span>
              <Arrow />
            </Button>
            <p className="caption">STRK20 charges its own flat 6 STRK fee per pool transaction.</p>
            {/* The custom path discloses this inside SplitSuggestion above; the preset path
                must say it too — the withholding applies identically to both. */}
            {isStandard && (
              <p className="caption">
                Up to {(Number(SPLIT_FEE_BPS) / 100).toFixed(1)}% of the deposit is withheld from
                your reward, never the deposit itself, and earmarked to reward the next depositors
                into this bucket. It is part of the published reward math, the same for every interface.
              </p>
            )}
          </div>

          <Steps steps={steps} providerIndex={providerIndex} />
        </>
      )}

      {saved && !vaultConfirmed && (
        <SecretVault
          secret={saved.secret}
          onDownload={() => downloadSecrets([saved])}
          onContinue={() => setVaultConfirmed(true)}
        />
      )}

      {saved && vaultConfirmed && shieldedBucket && (
        <>
          <BucketJarMoment
            denomination={shieldedBucket.denomination}
            tokenSymbol={shieldedBucket.tokenSymbol}
            depthBefore={shieldedBucket.depth}
            multiplier={shieldedBucket.multiplier}
            heat={shieldedBucket.heat}
            originRect={originRect}
          />
          <p className="caption">
            Next: when this epoch closes, your allocation publishes.{" "}
            <Link href="/app/claim">Claim it with your saved secret →</Link>
          </p>
        </>
      )}

      {/* Split sessions skip BucketJarMoment (it models one bucket) for a plain summary. */}
      {saved && vaultConfirmed && splitShielded && (
        <>
          <div className={styles.splitDone}>
            <p className="body">
              Shielded {formatUnits(BigInt(saved.amount))} STRK as {splitShielded.pieceCount} standard{" "}
              {splitShielded.pieceCount === 1 ? "piece" : "pieces"}, each an ordinary entry in its bucket.
            </p>
            {splitShielded.pieces.map((piece) => (
              <div key={piece.denomination} className={styles.splitDoneRow}>
                <span className="numeral-m">
                  {piece.count} × {piece.denomination.toLocaleString()} STRK
                </span>
                <span className="caption">{formatUnits(piece.amount * BigInt(piece.count))} STRK</span>
              </div>
            ))}
            {splitShielded.remainder > 0n && (
              <p className="caption">{formatUnits(splitShielded.remainder)} STRK stayed in your wallet.</p>
            )}
          </div>
          <p className="caption">
            Next: when this epoch closes, your allocation publishes.{" "}
            <Link href="/app/claim">Claim it with your saved secret →</Link>
          </p>
        </>
      )}

      <VisibilityStrip screen="shield" />
    </div>
  );
}

function Arrow() {
  return (
    <svg viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path d="M3 8h10M9 4l4 4-4 4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
