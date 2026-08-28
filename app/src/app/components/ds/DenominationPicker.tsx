import { Input } from "@/components/ui/input";
import styles from "./ds.module.css";
import type { Bucket } from "./types";

export const STANDARD_DENOMS = [100, 1_000, 10_000] as const;

export type PickerValue = (typeof STANDARD_DENOMS)[number] | "custom";

/** Looks up a standard bucket's live depth/multiplier for the "you'd be 1 of N" projection. */
function bucketFor(buckets: Bucket[], denom: number): Bucket | undefined {
  return buckets.find((b) => b.denomination === denom);
}

export default function DenominationPicker({
  buckets,
  value,
  onChange,
  customAmount,
  onCustomAmountChange,
  disabled,
}: {
  buckets: Bucket[];
  value: PickerValue;
  onChange: (v: PickerValue) => void;
  customAmount: string;
  onCustomAmountChange: (v: string) => void;
  disabled?: boolean;
}) {
  return (
    <div className={styles.picker}>
      <div className={styles.pickerRow}>
        {STANDARD_DENOMS.map((d) => {
          const bucket = bucketFor(buckets, d);
          const depth = bucket?.depth ?? 0;
          const multiplier = bucket?.multiplier ?? 3.0;
          const heat = bucket?.heat ?? 1;
          const on = value === d;
          return (
            <button
              key={d}
              type="button"
              className={on ? styles.pickerOptOn : styles.pickerOpt}
              onClick={() => onChange(d)}
              disabled={disabled}
              aria-pressed={on}
            >
              <span className="numeral-l">{d.toLocaleString()}</span>
              <span className={`${styles.pickerMultiplier} numeral-m`} data-heat={heat}>
                {multiplier.toFixed(1)}×
              </span>
              <span className={`${styles.pickerSub} caption`}>you&apos;d be 1 of {depth + 1}</span>
            </button>
          );
        })}
      </div>

      <div className={value === "custom" ? styles.pickerCustomOn : styles.pickerCustom}>
        <button
          type="button"
          className={styles.pickerCustomToggle}
          onClick={() => onChange("custom")}
          disabled={disabled}
          aria-pressed={value === "custom"}
        >
          <span className="label">Custom amount</span>
        </button>
        {value === "custom" && (
          <Input
            type="text"
            inputMode="numeric"
            value={customAmount}
            onChange={(e) => onCustomAmountChange(e.target.value.replace(/[^0-9]/g, ""))}
            placeholder="Amount in STRK"
            className="font-mono"
            aria-label="Custom amount in STRK"
            disabled={disabled}
          />
        )}
      </div>
    </div>
  );
}
