"use client";
import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import styles from "./ds.module.css";
import { formatUnits, planSplit } from "../himitsu/lib";

/** Digits and at most one decimal point — same rule as the shield page's custom input. */
function sanitizeDecimal(v: string): string {
  const digitsAndDot = v.replace(/[^0-9.]/g, "");
  const firstDot = digitsAndDot.indexOf(".");
  if (firstDot === -1) return digitsAndDot;
  return digitsAndDot.slice(0, firstDot + 1) + digitsAndDot.slice(firstDot + 1).replace(/\./g, "");
}

/**
 * Exit planner: guidance only, zero wallet execution. Entering the pool in standard pieces
 * is half the defense; exiting with a distinctive amount undoes it, because withdrawals are
 * public at the edge and a unique value is matchable against the deposits that formed it.
 * This plans the exit the same way the shield page plans the entry (planSplit), but no
 * gauge multipliers appear: exits deepen no bucket and earn nothing. The user executes
 * every withdrawal from their own wallet.
 */
export default function ExitPlanner() {
  const [amount, setAmount] = useState("");
  const plan = planSplit(amount);

  return (
    <Card className={styles.exitPlanner}>
      <CardContent className={styles.exitPlannerBody}>
        <span className="label">Exit planner</span>
        <p className="body">
          Leaving the pool with a distinctive amount undoes your cover. Plan the exit in
          standard pieces.
        </p>
        <Input
          type="text"
          inputMode="decimal"
          value={amount}
          onChange={(e) => setAmount(sanitizeDecimal(e.target.value))}
          placeholder="Amount to withdraw, in STRK"
          className={`font-mono ${styles.exitPlannerInput}`}
          aria-label="Amount to withdraw in STRK"
        />
        {plan ? (
          <>
            <div className={styles.exitPlanRows}>
              {plan.pieces.map((piece) => (
                <div key={piece.denomination} className={styles.exitPlanRow}>
                  <span className="numeral-m">
                    {piece.count} × {piece.denomination.toLocaleString()} STRK
                  </span>
                  <span className="caption">
                    {formatUnits(piece.amount * BigInt(piece.count))} STRK
                  </span>
                </div>
              ))}
              {plan.remainder > 0n && (
                <p className="caption">
                  {formatUnits(plan.remainder)} STRK stays shielded in the pool, spend it
                  privately later.
                </p>
              )}
            </div>
            <div className={styles.exitGuidance}>
              <p className="caption">
                Withdraw the pieces as separate transactions spread over time. Several exits
                in quick succession read as one person leaving.
              </p>
              <p className="caption">
                Use a fresh recipient address for each piece. A reused address ties the
                pieces back together.
              </p>
              <p className="caption">
                Execute the withdrawals from your wallet. Himitsu never touches your funds.
              </p>
            </div>
          </>
        ) : (
          amount.trim() !== "" && (
            <p className="caption">
              Enter at least 10 STRK to see a plan. Smaller amounts have no standard piece.
            </p>
          )
        )}
      </CardContent>
    </Card>
  );
}
