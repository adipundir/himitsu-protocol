export type Denomination = 100 | 1_000 | 10_000;
export type HeatStop = 1 | 2 | 3 | 4 | 5;

export interface Bucket {
  token: string;
  tokenSymbol: string;
  denomination: Denomination;
  depth: number;
  multiplier: number;
  heat: HeatStop;
}

export interface DepthSnapshot {
  generatedAt: string | null;
  buckets: Bucket[];
  /** Non-standard-amount deposits, grouped by token — the problem the gauges exist to fix. */
  nonStandard: { token: string; tokenSymbol: string; depth: number }[];
}

export const HEAT_NOTE: Record<HeatStop, string> = {
  1: "Almost nobody here. You'd stand out, and you'd be paid the most for it.",
  2: "Thin crowd. Good rate, thinner cover.",
  3: "Filling up. Rate is coming down as it does.",
  4: "Decent cover here.",
  5: "Deep crowd, low subsidy. Best place to hide, least paid for it.",
};

export const HEAT_WORD: Record<HeatStop, string> = {
  1: "critically thin",
  2: "thin",
  3: "filling",
  4: "healthy",
  5: "deep",
};
