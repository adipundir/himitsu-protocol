"use client";
import { useEffect, useState } from "react";
import styles from "./himitsu.module.css";
import { Steps } from "./Earn";
import { useStoreWallet } from "../Wallet/walletContext";
import { useFrontendProvider } from "../client/provider/providerContext";
import { vaultForIndex } from "@/utils/constants";
import { computeCommitment, loadSecrets, toHex, waitTx, type ActionResult } from "./lib";

interface EpochAllocation { commitment: string; total: string; leaf: string; proof: string[] }
interface EpochFile {
  epoch: number; token: string; vestStart: number; vestDuration: number; root: string;
  allocations: EpochAllocation[];
}

interface Found { epoch: EpochFile; alloc: EpochAllocation }

export default function Claim() {
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
      // privacy_invoke(epoch_id, secret, token, total, proof: Span<felt252>, note_id)
      // Span serializes as [len, ...elems]; "${openNoteIds[0]}"/"OPEN" are LITERAL placeholder
      // strings the wallet substitutes — never hex-normalize them.
      const actions = [
        { type: "transfer", token: f.epoch.token, amount: "OPEN", recipient: address },
        {
          type: "invoke",
          contract: vault,
          calldata: [
            toHex(f.epoch.epoch), toHex(BigInt(secret.trim())), toHex(f.epoch.token), toHex(f.alloc.total),
            toHex(proof.length), ...proof, "${openNoteIds[0]}",
          ],
        },
      ];
      setSteps([{ label: "Claim", status: "pending", detail: "Confirm in your wallet. Proving takes ~30 s; the reward lands directly in your shielded balance." }]);
      const tx = await myWalletAccount.strk20InvokeTransaction(actions as never);
      setSteps([{ label: "Claim", status: "pending", txHash: tx.transaction_hash, detail: "Waiting for inclusion…" }]);
      await waitTx(providerIndex, tx.transaction_hash);
      setSteps([{ label: "Claim", status: "ok", txHash: tx.transaction_hash, detail: "Claimed into your shielded balance. No public link points back to your deposit address." }]);
    } catch (e) {
      setSteps([{ label: "Claim", status: "error", detail: (e as Error)?.message ?? "failed" }]);
    } finally {
      setBusy(false);
    }
  }

  const savedSecrets = typeof window === "undefined" ? [] : loadSecrets();

  if (!address) return <p className={styles.hint}>Connect a wallet to claim rewards.</p>;

  return (
    <div>
      <p className={styles.lede}>
        Reveal your secret to claim vested rewards <strong>through the pool itself</strong> — the
        payout arrives as a shielded note, unlinkable to the address that deposited.
      </p>
      <label className={styles.small}>Claim secret (0x…)</label>
      <input value={secret} onChange={(e) => setSecret(e.target.value)} placeholder="0x…" className="mono" />
      {savedSecrets.length > 0 && (
        <p className={styles.small}>
          Saved in this browser:{" "}
          {savedSecrets.map((s) => (
            <button key={s.commitment} className={styles.linkBtn} onClick={() => { setSecret(s.secret); lookup(s.secret); }}>
              {s.secret.slice(0, 10)}…
            </button>
          ))}
        </p>
      )}
      <button className={styles.cta} onClick={() => lookup(secret)} disabled={!secret || busy}>Look up allocation</button>
      {note && <p className={styles.hint}>{note}</p>}
      {found.map((f) => {
        const now = Math.floor(Date.now() / 1000);
        const el = Math.max(0, Math.min(now - f.epoch.vestStart, f.epoch.vestDuration));
        const pct = Math.floor((el / f.epoch.vestDuration) * 100);
        const total = BigInt(f.alloc.total);
        return (
          <div key={f.epoch.epoch + f.alloc.leaf} className={styles.allocBox}>
            <div><strong>Epoch {f.epoch.epoch}</strong> — allocation <span className="mono">{fmt(total)} STRK</span></div>
            <div className={styles.vestbar} role="img" aria-label={`${pct}% vested`}><i style={{ width: `${pct}%` }} /></div>
            <div className={styles.small}>{pct}% vested · claims pay out only the newly-vested part; partial claims are fine.</div>
            <button className={styles.ctaSmall} onClick={() => claim(f)} disabled={busy}>{busy ? "Working…" : "Claim privately"}</button>
          </div>
        );
      })}
      <Steps steps={steps} providerIndex={providerIndex} />
    </div>
  );
}

function fmt(raw: bigint): string {
  const whole = raw / 10n ** 18n;
  const frac = ((raw % 10n ** 18n) * 100n) / 10n ** 18n;
  return `${whole}.${frac.toString().padStart(2, "0")}`;
}
