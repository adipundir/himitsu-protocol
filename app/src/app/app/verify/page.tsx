"use client";
import { useEffect, useState } from "react";
import { FileSearchIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Skeleton } from "@/components/ui/skeleton";
import styles from "./verify.module.css";

interface EpochFile {
  epoch: number;
  pool: string;
  vault: string;
  token: string;
  fromBlock: number;
  toBlock: number;
  pot: string;
  vestStart: number;
  vestDuration: number;
  root: string;
  allocations: unknown[];
}

export default function VerifyPage() {
  const [epochs, setEpochs] = useState<EpochFile[] | null>(null);
  const [copiedFor, setCopiedFor] = useState<number | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const manifest = (await (await fetch("/epochs/manifest.json")).json()) as { epochs: number[] };
        const files = await Promise.all(
          manifest.epochs.map(async (n) => (await fetch(`/epochs/epoch-${n}.json`)).json() as Promise<EpochFile>),
        );
        setEpochs(files.sort((a, b) => b.epoch - a.epoch));
      } catch {
        setEpochs([]);
      }
    })();
  }, []);

  function recomputeCommand(e: EpochFile): string {
    return `make epoch-close EPOCH=${e.epoch} TOKEN=${e.token} POT=${e.pot} FROM_BLOCK=${e.fromBlock} TO_BLOCK=${e.toBlock}`;
  }

  async function copy(e: EpochFile) {
    try {
      await navigator.clipboard.writeText(recomputeCommand(e));
      setCopiedFor(e.epoch);
      setTimeout(() => setCopiedFor(null), 1600);
    } catch {
      // clipboard unavailable — the command is still selectable text
    }
  }

  return (
    <div className={styles.verify}>
      <p className="display">Anyone can recompute the root. Nobody has to trust us.</p>
      <p className="body">
        Every root comes from public chain data, run through <code className="mono">indexer/</code>.
        This page won&apos;t compute it for you — it gives you the exact command to check it yourself.
      </p>

      {epochs === null && (
        <div className={styles.loadingStack}>
          <Skeleton className="h-40 w-full" />
          <Skeleton className="h-40 w-full" />
        </div>
      )}

      {epochs !== null && epochs.length === 0 && (
        <Empty className={styles.empty}>
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <FileSearchIcon />
            </EmptyMedia>
            <EmptyTitle>No epochs closed yet</EmptyTitle>
            <EmptyDescription>Its root and recompute command will appear here.</EmptyDescription>
          </EmptyHeader>
        </Empty>
      )}

      {epochs?.map((e) => (
        <Card key={e.epoch}>
          <CardHeader className={styles.epochHead}>
            <span className="label">Epoch {e.epoch}</span>
            <span className="caption">
              blocks {e.fromBlock.toLocaleString()}–{e.toBlock.toLocaleString()} · {e.allocations.length} allocations
            </span>
          </CardHeader>
          <CardContent className={styles.epochBody}>
            <div className={styles.rootRow}>
              <span className="label">On-chain root</span>
              <code className={`${styles.rootValue} mono`}>{e.root}</code>
            </div>
            <div className={styles.command}>
              <span className="label">Recompute it yourself</span>
              <div className={styles.commandRow}>
                <code className="mono">{recomputeCommand(e)}</code>
                <Button variant="outline" size="sm" onClick={() => copy(e)}>
                  {copiedFor === e.epoch ? "Copied" : "Copy"}
                </Button>
              </div>
              <p className="caption">
                Requires the repo checked out with a Starknet RPC configured — the same public
                deposit and registration events anyone can read.
              </p>
            </div>
          </CardContent>
        </Card>
      ))}

      <div className={styles.links}>
        <a href="https://github.com/adipundir/himitsu-protocol/blob/main/strk20.json" target="_blank" rel="noreferrer">
          strk20.json →
        </a>
        <a
          href="https://github.com/adipundir/himitsu-protocol/tree/main/deployments"
          target="_blank"
          rel="noreferrer"
        >
          deployments/ →
        </a>
      </div>
    </div>
  );
}
