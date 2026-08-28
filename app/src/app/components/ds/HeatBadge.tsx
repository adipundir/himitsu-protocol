"use client";
import { Tooltip, TooltipPopup, TooltipTrigger } from "@/components/ui/tooltip";
import styles from "./ds.module.css";
import type { HeatStop } from "./types";
import { HEAT_WORD } from "./types";

export default function HeatBadge({ multiplier, heat, depth }: { multiplier: number; heat: HeatStop; depth: number }) {
  const label = `${HEAT_WORD[heat]} bucket, ${depth} depositor${depth === 1 ? "" : "s"}`;
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <span
            className={`${styles.heatBadge} numeral-m`}
            data-heat={heat}
            aria-label={`${multiplier.toFixed(1)}× — ${label}`}
          >
            {multiplier.toFixed(1)}×
          </span>
        }
      />
      <TooltipPopup>{label}</TooltipPopup>
    </Tooltip>
  );
}
