"use client";
import { useState } from "react";
import styles from "./himitsu.module.css";
import { Steps } from "./Earn";
import { useStoreWallet } from "../Wallet/walletContext";
import { useFrontendProvider } from "../client/provider/providerContext";
import { addrSTRK, E18, vaultForIndex } from "@/utils/constants";
import { toHex, waitTx, type ActionResult } from "./lib";
import { uint256 } from "starknet";

export default function Fund() {
  const myWalletAccount = useStoreWallet((s) => s.myWalletAccount);
  const address = useStoreWallet((s) => s.address);
  const providerIndex = useFrontendProvider((s) => s.currentFrontendProviderIndex);
  const vault = vaultForIndex(providerIndex);

  const [amount, setAmount] = useState("100");
  const [steps, setSteps] = useState<ActionResult[]>([]);
  const [busy, setBusy] = useState(false);

  async function fund() {
    if (!myWalletAccount || busy) return;
    setBusy(true);
    setSteps([]);
    try {
      const raw = BigInt(amount) * E18;
      const u = uint256.bnToUint256(raw);
      setSteps([{ label: "Fund", status: "pending", detail: "Confirm the approve + fund multicall." }]);
      // One multicall: ERC-20 approve (u256 low/high) + vault.fund (u128 single felt).
      const tx = await myWalletAccount.execute([
        { contractAddress: addrSTRK, entrypoint: "approve", calldata: [vault, toHex(u.low), toHex(u.high)] },
        { contractAddress: vault, entrypoint: "fund", calldata: [addrSTRK, toHex(raw)] },
      ]);
      await waitTx(providerIndex, tx.transaction_hash);
      setSteps([{ label: "Fund", status: "ok", txHash: tx.transaction_hash, detail: `${amount} STRK added to the reward pot.` }]);
    } catch (e) {
      setSteps([{ label: "Fund", status: "error", detail: (e as Error)?.message ?? "failed" }]);
    } finally {
      setBusy(false);
    }
  }

  if (!address) return <p className={styles.hint}>Connect a wallet to fund a gauge.</p>;
  if (vault === "0x0") return <p className={styles.hint}>HimitsuVault is not deployed on this network yet.</p>;

  return (
    <div>
      <p className={styles.lede}>
        Sponsor the crowd. Anyone — the foundation, a DAO, a privacy app whose users need depth —
        can top up the reward pot that pays depositors. Your users are only private if the bucket
        they transact in is deep.
      </p>
      <label className={styles.small}>Amount (STRK)</label>
      <input value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^0-9]/g, ""))} className="mono" inputMode="numeric" />
      <button className={styles.cta} onClick={fund} disabled={busy || !amount || amount === "0"}>
        {busy ? "Working…" : "Fund the pot"}
      </button>
      <Steps steps={steps} providerIndex={providerIndex} />
    </div>
  );
}
