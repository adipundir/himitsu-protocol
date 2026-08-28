export type HeatStop = 1 | 2 | 3 | 4 | 5;

/**
 * Depth -> heat stop for the app's dashboard (DESIGN.md §3/§9: "heat is computed server-side
 * from depth thresholds so the treemap, the cards, and any future email digest never disagree.
 * Thresholds live in one place in the indexer, not in the client."). Heat 1-3 boundaries match
 * gaugeMultiplierX10's tiers exactly (gauge.ts); heat 4/5 split the flat 1.2x tail into
 * "healthy" vs "deep, low subsidy" for a more legible dashboard — multiplier bottoms out at
 * 1.2x for both, heat keeps telling the depth story past that point.
 */
export function heatStopForDepth(depth: number): HeatStop {
  if (depth < 25) return 1;
  if (depth < 100) return 2;
  if (depth < 400) return 3;
  if (depth < 1000) return 4;
  return 5;
}
