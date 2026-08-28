import styles from "./ds.module.css";

/** Load-bearing copy — DESIGN.md §11. Use verbatim, per screen. */
export const VISIBILITY_COPY = {
  dashboard: {
    sees: "every deposit, its amount, and who made it",
    hides: "which deposit funded which withdrawal",
  },
  shield: {
    sees: "your address, the token, the amount, your registration",
    hides: "anything else you do with the pool afterward",
  },
  claim: {
    sees: "that this address claimed, and which allocation it claimed",
    hides: "where the reward goes next",
  },
} as const;

export default function VisibilityStrip({ screen }: { screen: keyof typeof VISIBILITY_COPY }) {
  const { sees, hides } = VISIBILITY_COPY[screen];
  return (
    <div className={styles.visibilityStrip}>
      <div className={styles.visibilityCol} data-side="public">
        <EyeIcon />
        <span className="label">Everyone sees</span>
        <p className={styles.visibilityText}>{sees}</p>
      </div>
      <div className={styles.visibilityDivider} aria-hidden="true" />
      <div className={styles.visibilityCol} data-side="private">
        <EyeOffIcon />
        <span className="label">Nobody sees</span>
        <p className={styles.visibilityText}>{hides}</p>
      </div>
    </div>
  );
}

function EyeIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 15 15" fill="none" aria-hidden="true">
      <path
        d="M1 7.5S3.5 2.8 7.5 2.8 14 7.5 14 7.5 11.5 12.2 7.5 12.2 1 7.5 1 7.5Z"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinejoin="round"
      />
      <circle cx="7.5" cy="7.5" r="2.1" stroke="currentColor" strokeWidth="1.2" />
    </svg>
  );
}
function EyeOffIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 15 15" fill="none" aria-hidden="true">
      <path
        d="M2 2l11 11M6.2 4.6c.4-.1.85-.15 1.3-.15 4 0 6.5 4.7 6.5 4.7s-.75 1.4-2.15 2.75M4.1 5.15C2.4 6.4 1 7.5 1 7.5s2.5 4.7 6.5 4.7c.9 0 1.7-.24 2.42-.62"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
