"use client";
import { useRef, useState } from "react";
import { EyeIcon, InfoIcon } from "lucide-react";
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
import { addrSTRK, E18, vaultForIndex } from "@/utils/constants";
import {
  computeCommitment,
  downloadSecrets,
  randomSecret,
  saveSecret,
  toHex,
  waitTx,
  type ActionResult,
  type SavedSecret,
} from "../../components/himitsu/lib";

export default function ShieldPage() {
  const myWalletAccount = useStoreWallet((s) => s.myWalletAccount);
  const address = useStoreWallet((s) => s.address);
  const providerIndex = useFrontendProvider((s) => s.currentFrontendProviderIndex);
  const vault = vaultForIndex(providerIndex);
  const { data } = useDepthSnapshot();
  const ctaRef = useRef<HTMLButtonElement>(null);

  const [picked, setPicked] = useState<PickerValue>(1_000);
  const [customAmount, setCustomAmount] = useState("");
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
    if (!myWalletAccount || busy || amountHuman <= 0) return;
    // Captured now, before the button disappears behind SecretVault — the shield moment needs
    // to know where on screen to arc the new dot in from.
    setOriginRect(ctaRef.current?.getBoundingClientRect() ?? null);
    setBusy(true);
    setSteps([]);
    setSaved(null);
    setVaultConfirmed(false);
    const amount = BigInt(amountHuman) * E18;
    const secret = randomSecret();
    const commitment = computeCommitment(secret);
    let stage = "Shield";
    try {
      // ONE multicall for both actions — a user who deposits without registering earns nothing
      // (the top failure mode of the entire product).
      push({
        label: "Shield & Register",
        status: "pending",
        detail: "Approve, then confirm the deposit + registration in your wallet. Proving takes ~30 s.",
      });
      const dep = await myWalletAccount.strk20InvokeTransaction([
        { type: "deposit", token: addrSTRK, amount: toHex(amount) },
      ] as never);
      push({ label: "Shield & Register", status: "pending", txHash: dep.transaction_hash, detail: "Waiting for the deposit to land…" });
      await waitTx(providerIndex, dep.transaction_hash);

      stage = "Register";
      const reg = await myWalletAccount.execute([
        { contractAddress: vault, entrypoint: "register", calldata: [toHex(commitment)] },
      ]);
      await waitTx(providerIndex, reg.transaction_hash);
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
      push({ label: stage, status: "error", detail: (e as Error)?.message ?? "The pool rejected the deposit. Check the token balance and try again." });
    } finally {
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
          multiplier: 8,
          heat: 1 as const,
        })
      : null;

  return (
    <div className={styles.shield}>
      <StepFlow current={saved ? 3 : 1} />
      <div className={styles.intro}>
        <h1>Shield &amp; earn</h1>
        <p className="body">One wallet interaction shields and registers you — thin buckets pay most.</p>
      </div>

      {!address && (
        <Alert variant="info">
          <EyeIcon />
          <AlertDescription>Connect a wallet to start earning.</AlertDescription>
        </Alert>
      )}
      {address && vault === "0x0" && (
        <Alert variant="default">
          <InfoIcon />
          <AlertDescription>HimitsuVault is not deployed on this network yet.</AlertDescription>
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
            <Alert variant="warning">
              <EyeIcon />
              <AlertTitle>Custom amounts are traceable</AlertTitle>
              <AlertDescription>
                An observer who sees {amountHuman.toLocaleString()} go in and {amountHuman.toLocaleString()} come out
                doesn&apos;t need to break any cryptography.
              </AlertDescription>
            </Alert>
          )}

          <Button
            ref={ctaRef}
            size="lg"
            onClick={shieldAndRegister}
            loading={busy}
            disabled={!address || vault === "0x0" || amountHuman <= 0}
          >
            Shield &amp; Register
          </Button>
          <p className="caption">Public by design — a flat 4 STRK pool fee applies on mainnet.</p>

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
        <BucketJarMoment
          denomination={shieldedBucket.denomination}
          tokenSymbol={shieldedBucket.tokenSymbol}
          depthBefore={shieldedBucket.depth}
          heat={shieldedBucket.heat}
          originRect={originRect}
        />
      )}

      <VisibilityStrip screen="shield" />
    </div>
  );
}
