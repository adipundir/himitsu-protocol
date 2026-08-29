"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { EyeIcon } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
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
import StepFlow from "../../components/ds/StepFlow";
import { Steps } from "../../components/himitsu/Steps";
import { addrSTRK, myFrontendProviders, poolForIndex, STANDARD_DENOMS, vaultForIndex } from "@/utils/constants";
import {
  computeCommitment,
  downloadSecrets,
  parseUnits,
  randomSecret,
  saveSecret,
  toHex,
  waitTx,
  watchForDeposit,
  watchForRegistration,
  type ActionResult,
  type SavedSecret,
} from "../../components/himitsu/lib";

export default function ShieldPage() {
  const myWalletAccount = useStoreWallet((s) => s.myWalletAccount);
  const address = useStoreWallet((s) => s.address);
  const strk20 = useStoreWallet((s) => s.strk20);
  const providerIndex = useFrontendProvider((s) => s.currentFrontendProviderIndex);
  const vault = vaultForIndex(providerIndex);
  const { data } = useDepthSnapshot();
  const ctaRef = useRef<HTMLButtonElement>(null);

  const [picked, setPicked] = useState<PickerValue>(1_000);
  const [customAmount, setCustomAmount] = useState("");

  // Deep link from the dashboard jars: /app/shield?d=<denomination> preselects the bucket.
  // Read after mount (not useSearchParams) so the statically prerendered page hydrates clean.
  useEffect(() => {
    const d = Number(new URLSearchParams(window.location.search).get("d"));
    if ((STANDARD_DENOMS as readonly number[]).includes(d)) setPicked(d as PickerValue);
  }, []);
  const [steps, setSteps] = useState<ActionResult[]>([]);
  const [saved, setSaved] = useState<SavedSecret | null>(null);
  const [vaultConfirmed, setVaultConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [originRect, setOriginRect] = useState<DOMRect | null>(null);

  const amountHuman = picked === "custom" ? Number(customAmount || 0) : picked;
  const buckets = data?.buckets ?? [];
  const isStandard = picked !== "custom";

  const push = (r: ActionResult) => setSteps((s) => [...s.filter((x) => x.label !== r.label), r]);

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
    const secret = randomSecret();
    const commitment = computeCommitment(secret);
    let stage = "Shield";
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
          label: "Shield & Register",
          status: "pending",
          txHash: lastTxHash,
          detail:
            `${baseDetail} This is taking much longer than usual. Check your wallet's own ` +
            `activity/transaction history — if it already shows this ${whatMayHaveLanded}, don't ` +
            `click Shield & Register again; wait for it to confirm or refresh this page instead.`,
        });
      }, 60_000);
    };

    try {
      // ONE multicall for both actions — a user who deposits without registering earns nothing
      // (the top failure mode of the entire product).
      const approveDetail = "Approve, then confirm the deposit + registration in your wallet. Proving takes ~30 s.";
      push({ label: "Shield & Register", status: "pending", detail: approveDetail });
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
      push({ label: "Shield & Register", status: "pending", txHash: dep.transaction_hash, detail: landingDetail });
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
      push({ label: "Shield & Register", status: "pending", txHash: reg.transaction_hash, detail: registerDetail });
      armSlowWarning("registration", registerDetail);
      await waitTx(providerIndex, reg.transaction_hash);
      clearTimeout(slowTimer);
      push({ label: "Shield & Register", status: "ok", txHash: reg.transaction_hash, detail: "Shielded and registered." });

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
      // Label must match the pending pushes above ("Shield & Register") so this replaces the
      // in-flight step instead of leaving it stuck spinning next to a separate error box.
      const detail = (e as Error)?.message ?? "The pool rejected the deposit. Check the token balance and try again.";
      // A tx hash here means something was actually submitted before the failure — the error
      // could be this page losing track of it (a slow/timed-out wait), not the transaction
      // itself failing. Retrying blind risks shielding twice, so say so and leave the hash.
      const caveat = lastTxHash
        ? " A transaction was already submitted — check it above before retrying, so you don't shield twice."
        : "";
      push({ label: "Shield & Register", status: "error", txHash: lastTxHash, detail: `${stage} failed: ${detail}.${caveat}` });
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
      <StepFlow current={saved ? 3 : 1} />
      <div className={styles.intro}>
        <h1>Shield &amp; earn</h1>
        <p className={styles.introSub}>One wallet interaction shields and registers you. Thin buckets pay most.</p>
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
            This wallet doesn&apos;t support private STRK20 actions yet — try{" "}
            <a href="https://www.ready.co/" target="_blank" rel="noreferrer">Ready</a>.
          </AlertDescription>
        </Alert>
      )}
      {address && strk20 === "unregistered" && (
        <Alert className={styles.note}>
          <AlertDescription>
            Your wallet hasn&apos;t enabled private tokens yet — you&apos;ll be prompted to set
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

          {picked === "custom" && amountHuman >= 200 && (
            <SplitSuggestion amount={amountHuman} buckets={buckets} onSwitchToStandard={(d) => setPicked(d as PickerValue)} />
          )}
          {picked === "custom" && amountHuman > 0 && (
            <Alert variant="warning" className={styles.hotNote}>
              <EyeIcon />
              <AlertTitle>Custom amounts are traceable</AlertTitle>
              <AlertDescription>
                An observer who sees {amountHuman.toLocaleString()} go in and {amountHuman.toLocaleString()} come out
                doesn&apos;t need to break any cryptography.
              </AlertDescription>
            </Alert>
          )}

          <div className={styles.ctaGroup}>
            <Button
              ref={ctaRef}
              size="xl"
              className={styles.ctaBar}
              onClick={shieldAndRegister}
              loading={busy}
              // Not gated on "unregistered" — clicking through is exactly what triggers
              // Ready's own first-time viewing-key setup; only a genuinely unsupported wallet
              // is a dead end worth blocking on.
              disabled={!address || vault === "0x0" || amountHuman <= 0 || strk20 === "unsupported"}
            >
              <span>Shield &amp; Register</span>
              <Arrow />
            </Button>
            <p className="caption">A flat 6 STRK pool fee applies on mainnet.</p>
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
