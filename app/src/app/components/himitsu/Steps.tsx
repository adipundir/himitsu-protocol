import { CircleCheckIcon, CircleXIcon, Loader2Icon } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { voyagerTx } from "@/utils/constants";
import type { ActionResult } from "./lib";

const VARIANT: Record<ActionResult["status"], "info" | "success" | "error"> = {
  pending: "info",
  ok: "success",
  error: "error",
};

export function Steps({ steps, providerIndex }: { steps: ActionResult[]; providerIndex: number }) {
  if (!steps.length) return null;
  return (
    <div className="mt-4 flex flex-col gap-2">
      {steps.map((s) => (
        <Alert key={s.label} variant={VARIANT[s.status]}>
          {s.status === "pending" && <Loader2Icon className="animate-spin" />}
          {s.status === "ok" && <CircleCheckIcon />}
          {s.status === "error" && <CircleXIcon />}
          <AlertTitle>{s.label}</AlertTitle>
          <AlertDescription>
            {s.detail}
            {s.txHash && (
              <>
                {" "}
                <a
                  href={voyagerTx(providerIndex, s.txHash)}
                  target="_blank"
                  rel="noreferrer"
                  className="font-mono underline underline-offset-2"
                >
                  {s.txHash.slice(0, 10)}…
                </a>
              </>
            )}
          </AlertDescription>
        </Alert>
      ))}
    </div>
  );
}
