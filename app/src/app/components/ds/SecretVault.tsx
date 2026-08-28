"use client";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import styles from "./ds.module.css";

/**
 * Hard gate after commitment generation — a seed-phrase-grade problem (DESIGN.md §10 rule 2).
 * The continue button stays disabled until the user checks the confirmation box; this is the
 * one place in the app a disabled button is justified.
 */
export default function SecretVault({
  secret,
  onDownload,
  onContinue,
}: {
  secret: string;
  onDownload: () => void;
  onContinue: () => void;
}) {
  const [checked, setChecked] = useState(false);
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(secret);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      // clipboard API unavailable — the visible text + download button still work
    }
  }

  return (
    <Card className={styles.secretVault} role="group" aria-label="Save your claim secret">
      <CardHeader>
        <CardTitle>Your claim secret — save it now</CardTitle>
      </CardHeader>
      <CardContent className={styles.secretVaultBody}>
        <p className="body">
          Treat it like a private key until you claim: anyone holding this secret can direct the
          reward to their own note, and a lost secret cannot be reissued. Download it — a cleared
          browser won&apos;t have it.
        </p>
        <div className={styles.secretRow}>
          <code className={`${styles.secretCode} mono`}>{secret}</code>
          <Button variant="outline" size="sm" onClick={copy}>
            {copied ? "Copied" : "Copy"}
          </Button>
        </div>
        <Button variant="outline" size="sm" className="self-start" onClick={onDownload}>
          Download secret file
        </Button>
        <label className={styles.secretConfirm}>
          <Checkbox checked={checked} onCheckedChange={(v) => setChecked(v === true)} />
          <span className="body">I&apos;ve saved this. I understand it can&apos;t be recovered.</span>
        </label>
        <Button className="w-full" onClick={onContinue} disabled={!checked}>
          Continue
        </Button>
      </CardContent>
    </Card>
  );
}
