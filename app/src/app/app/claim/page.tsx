"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { InfoIcon, KeyRoundIcon, TriangleAlertIcon } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group";
import { Label } from "@/components/ui/label";
import styles from "./claim.module.css";
import { useStoreWallet } from "../../components/Wallet/walletContext";
import { useFrontendProvider } from "../../components/client/provider/providerContext";
import { vaultForIndex } from "@/utils/constants";
import { computeCommitment, loadSecrets, toHex, waitTx, type ActionResult } from "../../components/himitsu/lib";
import { Steps } from "../../components/himitsu/Steps";
import StepFlow from "../../components/ds/StepFlow";
import CliffCountdown from "../../components/ds/CliffCountdown";
import NorenTransition from "../../components/ds/NorenTransition";
import VisibilityStrip from "../../components/ds/VisibilityStrip";

interface EpochAllocation {
  commitment: string;
  total: string;
  leaf: string;
  proof: string[];
}
interface EpochFile {
  epoch: number;
  token: string;
  vestStart: number;
  vestDuration: number;
  root: string;
  allocations: EpochAllocation[];
}
interface Found {
  epoch: EpochFile;
  alloc: EpochAllocation;
}

const FORTY_EIGHT_HOURS = 48 * 3600;

function fmt(raw: bigint): string {
  const whole = raw / 10n ** 18n;
  const frac = ((raw % 10n ** 18n) * 100n) / 10n ** 18n;
  return `${whole}.${frac.toString().padStart(2, "0")}`;
}

export default function ClaimPage() {
  const myWalletAccount = useStoreWallet((s) => s.myWalletAccount);
  const address = useStoreWallet((s) => s.address);
  const providerIndex = useFrontendProvider((s) => s.currentFrontendProviderIndex);
  const vault = vaultForIndex(providerIndex);

  const [secret, setSecret] = useState("");
  const [epochs, setEpochs] = useState<EpochFile[]>([]);
  const [found, setFound] = useState<Found[]>([]);
  const [steps, setSteps] = useState<ActionResult[]>([]);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");
  const [claimedAmount, setClaimedAmount] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const manifest = (await (await fetch("/epochs/manifest.json")).json()) as { epochs: number[] };
        const files = await Promise.all(
          manifest.epochs.map(async (n) => (await fetch(`/epochs/epoch-${n}.json`)).json() as Promise<EpochFile>),
        );
        setEpochs(files);
      } catch {
        setEpochs([]);
      }
    })();
  }, []);

  function lookup(s: string) {
    setNote("");
    setFound([]);
    setClaimedAmount(null);
    let sec: bigint;
    try {
      sec = BigInt(s.trim());
    } catch {
      setNote("Secret must be a 0x… hex value.");
      return;
    }
    const commitment = computeCommitment(sec);
    const hits: Found[] = [];
    for (const ep of epochs) {
      const alloc = ep.allocations.find((a) => BigInt(a.commitment) === commitment);
      if (alloc) hits.push({ epoch: ep, alloc });
    }
    setFound(hits);
    if (!hits.length) setNote("No allocation found for this secret in any published epoch (epochs publish after each close).");
  }

  async function claim(f: Found) {
    if (!myWalletAccount || busy) return;
    setBusy(true);
    setSteps([]);
    try {
      const proof = f.alloc.proof.map((p) => toHex(p));
      // "OPEN" / "${openNoteIds[0]}" are literal placeholder strings the wallet substitutes —
      // never hex-normalize them.
      const actions = [
        { type: "transfer", token: f.epoch.token, amount: "OPEN", recipient: address },
        {
          type: "invoke",
          contract: vault,
          calldata: [
            toHex(f.epoch.epoch),
            toHex(BigInt(secret.trim())),
            toHex(f.epoch.token),
            toHex(f.alloc.total),
            toHex(proof.length),
            ...proof,
            "${openNoteIds[0]}",
          ],
        },
      ];
      setSteps([{ label: "Claim", status: "pending", detail: "Confirm in your wallet. Proving takes ~30 s; the reward lands directly in your shielded balance." }]);
      const tx = await myWalletAccount.strk20InvokeTransaction(actions as never);
      setSteps([{ label: "Claim", status: "pending", txHash: tx.transaction_hash, detail: "Waiting for inclusion…" }]);
      await waitTx(providerIndex, tx.transaction_hash);
      setSteps([{ label: "Claim", status: "ok", txHash: tx.transaction_hash, detail: "Claimed." }]);
      setClaimedAmount(fmt(BigInt(f.alloc.total)));
    } catch (e) {
      setSteps([{ label: "Claim", status: "error", detail: (e as Error)?.message ?? "Registration didn't land. Your deposit is in — resume registering to earn on it." }]);
    } finally {
      setBusy(false);
    }
  }

  const savedSecrets = typeof window === "undefined" ? [] : loadSecrets();
  const now = Math.floor(Date.now() / 1000);
  const cliffSoon = found.some((f) => {
    const remaining = f.epoch.vestStart + f.epoch.vestDuration - now;
    return remaining > 0 && remaining < FORTY_EIGHT_HOURS;
  });

  if (claimedAmount) {
    return (
      <div className={styles.claim}>
        <NorenTransition amount={claimedAmount} />
        <VisibilityStrip screen="claim" />
      </div>
    );
  }

  return (
    <div className={styles.claim}>
      <StepFlow current={found.length && found.every((f) => now >= f.epoch.vestStart + f.epoch.vestDuration) ? 4 : found.length ? 3 : 1} />

      <div className={styles.intro}>
        <h1>Claim</h1>
        <p className="body">Lands in a shielded note — never your public balance.</p>
      </div>

      {!address && (
        <Alert variant="info">
          <InfoIcon />
          <AlertDescription>Connect a wallet to claim rewards.</AlertDescription>
        </Alert>
      )}

      {cliffSoon && (
        <Alert variant="warning" role="status">
          <TriangleAlertIcon />
          <AlertDescription>Cliff opens within 48h — save your secret outside this browser.</AlertDescription>
        </Alert>
      )}

      <Label htmlFor="claim-secret">Claim secret (0x…)</Label>
      <InputGroup>
        <InputGroupAddon>
          <KeyRoundIcon />
        </InputGroupAddon>
        <InputGroupInput
          id="claim-secret"
          value={secret}
          onChange={(e) => setSecret(e.target.value)}
          placeholder="0x…"
          className="font-mono"
        />
      </InputGroup>
      {savedSecrets.length > 0 && (
        <p className={styles.savedRow}>
          Saved in this browser:{" "}
          {savedSecrets.map((s) => (
            <Button
              key={s.commitment}
              variant="outline"
              size="xs"
              className="font-mono"
              onClick={() => {
                setSecret(s.secret);
                lookup(s.secret);
              }}
            >
              {s.secret.slice(0, 10)}…
            </Button>
          ))}
        </p>
      )}
      <Button onClick={() => lookup(secret)} loading={busy} disabled={!secret}>
        Look up allocation
      </Button>
      {note && (
        <Alert variant="default">
          <InfoIcon />
          <AlertDescription>
            {note} <Link href="/app/shield">Shield &amp; earn instead →</Link>
          </AlertDescription>
        </Alert>
      )}

      {found.map((f) => {
        const cliff = f.epoch.vestStart + f.epoch.vestDuration;
        const unlocked = now >= cliff;
        return (
          <Card key={f.epoch.epoch + f.alloc.leaf}>
            <CardHeader className={styles.allocHead}>
              <span className="label">Epoch {f.epoch.epoch}</span>
              <span className="numeral-l">{fmt(BigInt(f.alloc.total))} STRK</span>
            </CardHeader>
            <CardContent className={styles.allocBody}>
              <CliffCountdown vestStart={f.epoch.vestStart} vestDuration={f.epoch.vestDuration} />
              <p className={`${styles.claimNote} caption`}>
                It&apos;s one claim, all at once — there&apos;s no partial withdrawal, and the cliff
                stands in for time-in-pool, which the pool makes deliberately unmeasurable.
              </p>
              <Button
                onClick={() => claim(f)}
                loading={busy}
                disabled={!unlocked}
                title={unlocked ? undefined : `Cliff opens ${new Date(cliff * 1000).toLocaleString()}`}
              >
                {unlocked ? "Claim privately" : "Locked until cliff"}
              </Button>
            </CardContent>
          </Card>
        );
      })}

      <Steps steps={steps} providerIndex={providerIndex} />
      <VisibilityStrip screen="claim" />
    </div>
  );
}
