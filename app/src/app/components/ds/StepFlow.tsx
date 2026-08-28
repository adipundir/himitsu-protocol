import styles from "./ds.module.css";

const STEPS = ["Shield", "Register", "Wait", "Claim"] as const;

export default function StepFlow({ current }: { current: 1 | 2 | 3 | 4 }) {
  return (
    <ol className={styles.stepFlow} aria-label="Progress">
      {STEPS.map((label, i) => {
        const n = i + 1;
        const state = n < current ? "done" : n === current ? "current" : "locked";
        return (
          <li key={label} className={styles.stepFlowItem} data-state={state}>
            <span className={styles.stepFlowDot} aria-hidden="true">
              {state === "done" ? "✓" : n}
            </span>
            <span className="label">{label}</span>
          </li>
        );
      })}
    </ol>
  );
}
