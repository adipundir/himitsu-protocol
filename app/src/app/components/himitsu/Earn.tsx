"use client";
import { useState } from "react";
import styles from "./himitsu.module.css";
import { useStoreWallet } from "../Wallet/walletContext";
import { useFrontendProvider } from "../client/provider/providerContext";
import { addrSTRK, DENOMS, E18, vaultForIndex, voyagerTx } from "@/utils/constants";
import { computeCommitment, downloadSecrets, randomSecret, saveSecret, toHex, waitTx, type ActionResult, type SavedSecret } from "./lib";

export default function Earn() {
  const myWalletAccount = useStoreWallet((s) => s.myWalletAccount);
  const address = useStoreWallet((s) => s.address);
  const providerIndex = useFrontendProvider((s) => s.currentFrontendProviderIndex);
  const vault = vaultForIndex(providerIndex);

  const [picked, setPicked] = useState(1);
  const [steps, setSteps] = useState<ActionResult[]>([]);
  const [saved, setSaved] = useState<SavedSecret | null>(null);
  const [busy, setBusy] = useState(false);

  const push = (r: ActionResult) => setSteps((s) => [...s.filter((x) => x.label !== r.label), r]);

  async function shieldAndRegister() {
    if (!myWalletAccount || busy) return;
    setBusy(true);
    setSteps([]);
    setSaved(null);
    const denom = DENOMS[picked]!;
    const amount = denom.human * E18;
    const secret = randomSecret();
    const commitment = computeCommitment(secret);
    try {
      // Step 1 — shield into the pool. Two wallet prompts: ERC-20 approve, then the deposit.
      push({ label: "Shield", status: "pending", detail: "Approve, then confirm the deposit in your wallet (2 prompts). Proving takes ~30 s." });
      const dep = await myWalletAccount.strk20InvokeTransaction([
        { type: "deposit", token: addrSTRK, amount: toHex(amount) },
      ] as never);
      push({ label: "Shield", status: "pending", txHash: dep.transaction_hash, detail: "Waiting for the deposit to land…" });
      await waitTx(providerIndex, dep.transaction_hash);
      push({ label: "Shield", status: "ok", txHash: dep.transaction_hash, detail: `${denom.label} shielded.` });

      // Step 2 — register the commitment with the vault (plain public call, same address).
      push({ label: "Register", status: "pending", detail: "Confirm the registration call." });
      const reg = await myWalletAccount.execute([
        { contractAddress: vault, entrypoint: "register", calldata: [toHex(commitment)] },
      ]);
      await waitTx(providerIndex, reg.transaction_hash);
      push({ label: "Register", status: "ok", txHash: reg.transaction_hash, detail: "Registered for rewards." });

      const entry: SavedSecret = {
        secret: toHex(secret), commitment: toHex(commitment),
        token: addrSTRK, amount: amount.toString(), createdAt: new Date().toISOString(),
      };
      saveSecret(entry);
      setSaved(entry);
    } catch (e) {
      push({ label: busy ? "Shield" : "Register", status: "error", detail: (e as Error)?.message ?? "failed" });
    } finally {
      setBusy(false);
    }
  }

  if (!address) return <p className={styles.hint}>Connect a wallet (Ready supports the STRK20 Wallet API today) to start earning.</p>;
  if (vault === "0x0") return <p className={styles.hint}>HimitsuVault is not deployed on this network yet.</p>;

  return (
    <div>
      <p className={styles.lede}>
        Shield a <strong>standard denomination</strong> and register for rewards. Round amounts are
        what make the crowd: a 1,000 withdrawal hides among every other 1,000. Thin buckets pay the
        highest multiplier.
      </p>
      <div className={styles.denoms}>
        {DENOMS.map((d, i) => (
          <button key={d.label} className={i === picked ? styles.denomOn : styles.denom} onClick={() => setPicked(i)} disabled={busy}>
            <span className={styles.denomAmt}>{d.label}</span>
            <span className={styles.denomSub}>gauge bucket {d.human.toString()}</span>
          </button>
        ))}
      </div>
      <button className={styles.cta} onClick={shieldAndRegister} disabled={busy}>
        {busy ? "Working…" : "Shield & Register"}
      </button>
      <p className={styles.small}>
        The deposit is public by design — it is the countable entry that deepens the set. A flat
        pool fee (4 STRK on mainnet) applies to pool transactions.
      </p>
      <Steps steps={steps} providerIndex={providerIndex} />
      {saved && (
        <div className={styles.secretBox}>
          <strong>Your claim secret — download it now.</strong>
          <p className={styles.small}>Rewards can only be claimed with this secret. It is stored in this browser, but the file is the real backup.</p>
          <code className={styles.code}>{saved.secret}</code>
          <button className={styles.ctaSmall} onClick={() => downloadSecrets([saved])}>Download secret file</button>
        </div>
      )}
    </div>
  );
}

export function Steps({ steps, providerIndex }: { steps: ActionResult[]; providerIndex: number }) {
  if (!steps.length) return null;
  return (
    <div className={styles.steps}>
      {steps.map((s) => (
        <div key={s.label} className={styles.step} data-status={s.status}>
          <span className={styles.stepDot} data-status={s.status} />
          <div>
            <strong>{s.label}</strong> — {s.detail}
            {s.txHash && (
              <>
                {" "}
                <a href={voyagerTx(providerIndex, s.txHash)} target="_blank" rel="noreferrer" className="mono">
                  {s.txHash.slice(0, 10)}…
                </a>
              </>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
