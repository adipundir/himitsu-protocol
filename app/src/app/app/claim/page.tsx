"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { KeyRoundIcon, TriangleAlertIcon } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group";
import { Label } from "@/components/ui/label";
import styles from "./claim.module.css";
import { useStoreWallet } from "../../components/Wallet/walletContext";
import { useFrontendProvider } from "../../components/client/provider/providerContext";
import { myFrontendProviders, vaultForIndex } from "@/utils/constants";
import { computeCommitment, getClaimMaster, loadSecrets, secretAtIndex, toHex, waitTx, watchForClaim, type ActionResult } from "../../components/himitsu/lib";
import { Steps } from "../../components/himitsu/Steps";
import CliffCountdown from "../../components/ds/CliffCountdown";
import NorenTransition from "../../components/ds/NorenTransition";
import ExitPlanner from "../../components/ds/ExitPlanner";
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
  /** The secret that produced this allocation's commitment; claims use it directly, so
   *  auto-discovered rows never depend on what is typed in the input. */
  secret: string;
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
  const chain = useStoreWallet((s) => s.chain);
  const strk20 = useStoreWallet((s) => s.strk20);
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

  // The smooth path: allocations for secrets already saved in this browser appear on their
  // own, no pasting or clicking. A manual lookup replaces the list (setAutoFound(false)).
  const [autoFound, setAutoFound] = useState(false);
  useEffect(() => {
    if (!epochs.length) return;
    const hits: Found[] = [];
    for (const saved of loadSecrets()) {
      let sec: bigint;
      try {
        sec = BigInt(saved.secret);
      } catch {
        continue;
      }
      const commitment = computeCommitment(sec);
      for (const ep of epochs) {
        const alloc = ep.allocations.find((a) => BigInt(a.commitment) === commitment);
        if (alloc) hits.push({ epoch: ep, alloc, secret: saved.secret });
      }
    }
    if (hits.length) {
      setFound((prev) => (prev.length ? prev : hits));
      setAutoFound(true);
    }
  }, [epochs]);

  // The device-independent path: one free wallet signature re-derives every session secret
  // (lib.ts), scanned against the published epochs with an HD-wallet-style gap limit. Works
  // in any browser, nothing stored anywhere.
  const [recovering, setRecovering] = useState(false);
  async function recoverFromWallet() {
    if (!myWalletAccount || !address || recovering) return;
    setRecovering(true);
    setNote("");
    setClaimedAmount(null);
    try {
      const master = await getClaimMaster(myWalletAccount, address, chain, vault);
      const hits: Found[] = [];
      const GAP = 8;
      let misses = 0;
      for (let i = 0; misses < GAP && i < 512; i++) {
        const sec = secretAtIndex(master, i);
        const commitment = computeCommitment(sec);
        let hit = false;
        for (const ep of epochs) {
          const alloc = ep.allocations.find((a) => BigInt(a.commitment) === commitment);
          if (alloc) {
            hits.push({ epoch: ep, alloc, secret: toHex(sec) });
            hit = true;
          }
        }
        misses = hit ? 0 : misses + 1;
      }
      setAutoFound(false);
      setFound(hits);
      if (!hits.length)
        setNote(
          "No allocations for this wallet in any published epoch. Sessions from before wallet-derived secrets need their saved secret instead.",
        );
    } catch (e) {
      setNote((e as Error)?.message ?? "Wallet signing was cancelled.");
    } finally {
      setRecovering(false);
    }
  }

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
      if (alloc) hits.push({ epoch: ep, alloc, secret: s.trim() });
    }
    setAutoFound(false);
    setFound(hits);
    if (!hits.length) setNote("No allocation found for this secret in any published epoch (epochs publish after each close).");
  }

  async function claim(f: Found) {
    if (!myWalletAccount || busy) return;
    setBusy(true);
    setSteps([]);
    // Tracks the most recent submitted tx, if any — a failure after this is set means a real
    // on-chain transaction may be in flight, not just a client-side error (mirrors shield/page.tsx).
    let lastTxHash: string | undefined;
    // A wallet call can complete on-chain (visible in the wallet's own activity) without ever
    // resolving the promise back to this page — observed directly on this same flow, not
    // hypothetical. We can't cancel wallet-side work, and pretending it failed would invite a
    // real duplicate claim attempt, so this only ever adds a warning to the still-pending step.
    let slowTimer: ReturnType<typeof setTimeout> | undefined;
    const armSlowWarning = (baseDetail: string) => {
      clearTimeout(slowTimer);
      slowTimer = setTimeout(() => {
        setSteps([{
          label: "Claim",
          status: "pending",
          txHash: lastTxHash,
          detail:
            `${baseDetail} This is taking much longer than usual. Check your wallet's own ` +
            `activity/transaction history — if it already shows this claim, don't click Claim ` +
            `again; wait for it to confirm or refresh this page instead.`,
        }]);
      }, 60_000);
    };
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
            toHex(BigInt(f.secret)),
            toHex(f.epoch.token),
            toHex(f.alloc.total),
            toHex(proof.length),
            ...proof,
            "${openNoteIds[0]}",
          ],
        },
      ];
      const pendingDetail = "Confirm in your wallet. Proving takes ~30 s.";
      setSteps([{ label: "Claim", status: "pending", detail: pendingDetail }]);
      armSlowWarning(pendingDetail);
      // Raced against directly watching for the vault's own Claimed event: a wallet can
      // complete this on-chain without ever resolving its own promise back here (same failure
      // mode as shield/page.tsx's deposit — observed directly), so whichever settles first wins.
      const claimFromBlock = await myFrontendProviders[providerIndex].getBlockNumber();
      const tx = await Promise.race([
        myWalletAccount.strk20InvokeTransaction(actions as never),
        watchForClaim(providerIndex, vault, BigInt(f.epoch.epoch), BigInt(f.alloc.leaf), claimFromBlock),
      ]);
      lastTxHash = tx.transaction_hash;
      const landingDetail = "Waiting for inclusion…";
      setSteps([{ label: "Claim", status: "pending", txHash: tx.transaction_hash, detail: landingDetail }]);
      armSlowWarning(landingDetail);
      await waitTx(providerIndex, tx.transaction_hash);
      clearTimeout(slowTimer);
      setSteps([{ label: "Claim", status: "ok", txHash: tx.transaction_hash, detail: "Claimed." }]);
      setClaimedAmount(fmt(BigInt(f.alloc.total)));
    } catch (e) {
      const detail = (e as Error)?.message ?? "The claim didn't land. Your allocation is untouched. Try again.";
      const caveat = lastTxHash
        ? " A transaction was already submitted — check it above before retrying, so you don't claim twice."
        : "";
      setSteps([{ label: "Claim", status: "error", txHash: lastTxHash, detail: `${detail}${caveat}` }]);
    } finally {
      clearTimeout(slowTimer);
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

      <div className={styles.intro}>
        <h1>Withdraw</h1>
        <p className="body">
          Collect your rewards. They land in your shielded balance, not your public one, ready
          to send privately or withdraw anytime.
        </p>
      </div>


      {address && strk20 === "unsupported" && (
        <Alert variant="default" className={styles.note}>
          <AlertDescription>
            This wallet doesn&apos;t support private STRK20 actions yet, so claiming will fail.
            Try <a href="https://www.ready.co/" target="_blank" rel="noreferrer">Ready</a>.
          </AlertDescription>
        </Alert>
      )}

      {cliffSoon && (
        <Alert variant="warning" role="status" className={styles.exposure}>
          <TriangleAlertIcon />
          <AlertDescription>Cliff opens within 48h. Save your secret outside this browser.</AlertDescription>
        </Alert>
      )}

      {myWalletAccount && (
        <div className={styles.recoverRow}>
          <Button size="xl" className={styles.ctaBar} onClick={recoverFromWallet} loading={recovering}>
            <span>Recover with wallet</span>
            <span aria-hidden="true">→</span>
          </Button>
          <p className="caption">
            One free signature re-derives your secrets and finds every allocation. Works on any
            device with this wallet.
          </p>
        </div>
      )}

      <Label htmlFor="claim-secret">Claim secret (0x…)</Label>
      <InputGroup className={styles.secretInput}>
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
              className={`font-mono ${styles.chip}`}
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
      <Button size="xl" className={styles.ctaBar} onClick={() => lookup(secret)} loading={busy} disabled={!secret}>
        <span>Look up allocation</span>
        <span aria-hidden="true">→</span>
      </Button>
      {note && (
        <Alert variant="default" className={styles.note}>
          <AlertDescription>
            {note} <Link href="/app/shield">Shield &amp; earn instead →</Link>
          </AlertDescription>
        </Alert>
      )}

      {autoFound && found.length > 0 && (
        <p className="caption">Found automatically from secrets saved in this browser.</p>
      )}
      {found.map((f) => {
        const cliff = f.epoch.vestStart + f.epoch.vestDuration;
        const unlocked = now >= cliff;
        return (
          <Card key={f.epoch.epoch + f.alloc.leaf} className={styles.allocCard}>
            <CardHeader className={styles.allocHead}>
              <span className="label">Epoch {f.epoch.epoch}</span>
              <span className="numeral-l">{fmt(BigInt(f.alloc.total))} STRK</span>
            </CardHeader>
            <CardContent className={styles.allocBody}>
              <div className={styles.allocCell}>
                <CliffCountdown vestStart={f.epoch.vestStart} vestDuration={f.epoch.vestDuration} />
                <p className="caption">
                  One claim, all at once. The cliff stands in for time-in-pool, which the pool
                  keeps deliberately unmeasurable.
                </p>
              </div>
              <Button
                size="xl"
                className={styles.ctaBar}
                onClick={() => claim(f)}
                loading={busy}
                disabled={!unlocked || !address || strk20 === "unsupported"}
                title={unlocked ? undefined : `Cliff opens ${new Date(cliff * 1000).toLocaleString()}`}
              >
                {unlocked ? (
                  <>
                    <span>Claim reward</span>
                    <span aria-hidden="true">→</span>
                  </>
                ) : (
                  "Locked until cliff"
                )}
              </Button>
            </CardContent>
          </Card>
        );
      })}

      <Steps steps={steps} providerIndex={providerIndex} />
      <ExitPlanner />
      <VisibilityStrip screen="claim" />
    </div>
  );
}
