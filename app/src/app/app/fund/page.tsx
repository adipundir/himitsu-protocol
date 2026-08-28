"use client";
import { useState } from "react";
import { uint256 } from "starknet";
import { InfoIcon } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { NumberField, NumberFieldDecrement, NumberFieldGroup, NumberFieldIncrement, NumberFieldInput } from "@/components/ui/number-field";
import styles from "./fund.module.css";
import { useStoreWallet } from "../../components/Wallet/walletContext";
import { useFrontendProvider } from "../../components/client/provider/providerContext";
import { useDepthSnapshot } from "../../components/ds/useDepthSnapshot";
import HeatBadge from "../../components/ds/HeatBadge";
import { Steps } from "../../components/himitsu/Steps";
import { addrSTRK, E18, vaultForIndex } from "@/utils/constants";
import { toHex, waitTx, type ActionResult } from "../../components/himitsu/lib";

export default function FundPage() {
  const myWalletAccount = useStoreWallet((s) => s.myWalletAccount);
  const address = useStoreWallet((s) => s.address);
  const providerIndex = useFrontendProvider((s) => s.currentFrontendProviderIndex);
  const vault = vaultForIndex(providerIndex);
  const { data } = useDepthSnapshot();

  const [amount, setAmount] = useState<number | null>(100);
  const [steps, setSteps] = useState<ActionResult[]>([]);
  const [busy, setBusy] = useState(false);

  async function fund() {
    if (!myWalletAccount || busy || !amount) return;
    setBusy(true);
    setSteps([]);
    try {
      const raw = BigInt(amount) * E18;
      const u = uint256.bnToUint256(raw);
      setSteps([{ label: "Fund", status: "pending", detail: "Confirm the approve + fund multicall." }]);
      const tx = await myWalletAccount.execute([
        { contractAddress: addrSTRK, entrypoint: "approve", calldata: [vault, toHex(u.low), toHex(u.high)] },
        { contractAddress: vault, entrypoint: "fund", calldata: [addrSTRK, toHex(raw)] },
      ]);
      await waitTx(providerIndex, tx.transaction_hash);
      setSteps([{ label: "Fund", status: "ok", txHash: tx.transaction_hash, detail: `${amount} STRK added to the reward pot.` }]);
    } catch (e) {
      setSteps([{ label: "Fund", status: "error", detail: (e as Error)?.message ?? "The pool rejected the transaction. Try again." }]);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={styles.fund}>
      <div className={styles.intro}>
        <h1>Fund a gauge</h1>
        <p className="body">Deeper buckets mean better privacy for everyone.</p>
      </div>

      {!address && (
        <Alert variant="info">
          <InfoIcon />
          <AlertDescription>Connect a wallet to fund a gauge.</AlertDescription>
        </Alert>
      )}
      {address && vault === "0x0" && (
        <Alert variant="default">
          <InfoIcon />
          <AlertDescription>HimitsuVault is not deployed on this network yet.</AlertDescription>
        </Alert>
      )}

      {data && data.buckets.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="font-sans text-sm">Current depth, the crowds your STRK would deepen</CardTitle>
          </CardHeader>
          <CardContent className={styles.contextBody}>
            <div className={styles.contextRow}>
              {data.buckets.map((b) => (
                <div key={`${b.token}:${b.denomination}`} className={styles.contextCell}>
                  <span className="numeral-m">
                    {b.denomination.toLocaleString()} {b.tokenSymbol}
                  </span>
                  <HeatBadge multiplier={b.multiplier} heat={b.heat} depth={b.depth} />
                  <span className="caption">{b.depth} deep</span>
                </div>
              ))}
            </div>
            <p className="caption">Raises the ceiling — turnout isn&apos;t guaranteed.</p>
          </CardContent>
        </Card>
      )}

      <Label htmlFor="fund-amount">Amount (STRK)</Label>
      <NumberField id="fund-amount" value={amount} onValueChange={setAmount} min={0} step={100} className={styles.amountField}>
        <NumberFieldGroup>
          <NumberFieldDecrement />
          <NumberFieldInput className="font-mono" />
          <NumberFieldIncrement />
        </NumberFieldGroup>
      </NumberField>
      <Button
        onClick={fund}
        loading={busy}
        disabled={!address || vault === "0x0" || !amount}
        className="self-start"
      >
        Fund the pot
      </Button>
      <p className="caption">
        Funding is an irreversible donation: there is no withdraw path, and STRK leaves the pot
        only through claims against posted epoch roots.
      </p>
      <Steps steps={steps} providerIndex={providerIndex} />
    </div>
  );
}
