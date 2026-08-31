import { ProviderInterface, RpcProvider } from "starknet";

// ─── Protocol constants (verified — see ARCHITECTURE.md) ────────────────────

/** STRK20 privacy pool. The wallet injects it via "${poolAddress}" — the app itself only
 *  needs it for display links. Sepolia is a distinct deployment (different class hash,
 *  "v2.0" per its docs) but its `Deposit` event is byte-identical to mainnet's — confirmed
 *  by comparing both class ABIs directly over RPC, 2026-08-29 — so the indexer's event
 *  decoding works unmodified against either. */
export const POOL_ADDRESS = "0x040337b1af3c663e86e333bab5a4b28da8d4652a15a69beee2b677776ffe812a";
export const PoolSepolia = "0x0254a6b2997ef52e9f830ce1f543f6b29768295e8d17e2267d672c552cfe0d91";

export function poolForIndex(index: number): string {
    if (index === 0) return POOL_ADDRESS;
    if (index === 2) return PoolSepolia;
    return "0x0";
}

/** STRK token (mainnet). */
export const addrSTRK = "0x04718f5a0fc34cc1af16a1cdee98ffb20c31f5cd61d6ab07201858f4287c938d";

/** Poseidon domain tags — MUST equal contracts/src/poseidon.cairo. Values are the
 *  Cairo short-string encodings, parity-locked by epochs/vectors.json. */
export const REG_TAG = 6297027931175637143612101539605526523565617n;   // 'HIMITSU_REG_TAG:V1'
export const LEAF_TAG = 1612039150380963108757444326742539811690272305n; // 'HIMITSU_LEAF_TAG:V1'

// ─── RPC providers, indexed (0 = Mainnet, 2 = Sepolia) ──────────────────────

// NEXT_PUBLIC_PROVIDER_URL is the Alchemy key; without it, fall back to public lava
// RPC so a deployment with no secrets still works end-to-end (lava is rate-limited).
const alchemyKey = process.env.NEXT_PUBLIC_PROVIDER_URL;
export const myFrontendProviders: ProviderInterface[] = [
    new RpcProvider({ nodeUrl: alchemyKey ? "https://starknet-mainnet.g.alchemy.com/starknet/version/rpc/v0_10/" + alchemyKey : "https://rpc.starknet.lava.build" }),
    new RpcProvider({ nodeUrl: "https://rpc.starknet.lava.build" }),
    new RpcProvider({ nodeUrl: alchemyKey ? "https://starknet-sepolia.g.alchemy.com/starknet/version/rpc/v0_10/" + alchemyKey : "https://rpc.starknet-testnet.lava.build" })];

/** Frontend provider indices where the STRK20 pool exists. */
export const Strk20Networks: Record<number, string> = { 0: "MAINNET", 2: "SEPOLIA" };

// ─── HimitsuVault ───────────────────────────────────────────────────────────

export const VaultMainnet = process.env.NEXT_PUBLIC_VAULT_ADDRESS ?? "0x0";
export const VaultSepolia = process.env.NEXT_PUBLIC_VAULT_ADDRESS_SEPOLIA ?? "0x0";

export function vaultForIndex(index: number): string {
    if (index === 0) return VaultMainnet;
    if (index === 2) return VaultSepolia;
    return "0x0";
}

/** Reward fee, display-side mirror of indexer/src/epoch-close.ts's REWARD_FEE_BPS (the
 *  enforcement lives THERE, in the published reward math, so no front-end or rejected
 *  transaction can dodge it): a pure percentage of the deposited amount, deliberately
 *  uncapped, withheld from the gross allocation and left in the pot — funding source 1 in
 *  ARCHITECTURE.md's "Where the money comes from". */
export const SPLIT_FEE_BPS = 50n;

/** The split-flow fee for a deposit total, in base units. */
export function splitFeeRaw(depositTotal: bigint): bigint {
    return (depositTotal * SPLIT_FEE_BPS) / 10_000n;
}

export function voyagerTx(index: number, hash: string): string {
    return (index === 0 ? "https://voyager.online/tx/" : "https://sepolia.voyager.online/tx/") + hash;
}

export function voyagerAddress(index: number, address: string): string {
    return (index === 0 ? "https://voyager.online/contract/" : "https://sepolia.voyager.online/contract/") + address;
}

// ─── Gauges (mirror indexer/src/gauge.ts — display only, the indexer is authoritative) ──

export const E18 = 10n ** 18n;

/** Well-known mainnet tokens, keyed by the decimal form used in depth bucket keys. */
export const TOKEN_LABELS: Record<string, string> = {
    "2009894490435840142178314390393166646092438090257831307886760648929397478285": "STRK",
    "2087021424722619777119509474943472645767659996348769578120564519014510906823": "ETH",
    "2368576823837625528275935341135881659748932889268308403712618244410713532584": "USDC",
    "2967174050445828070862061291903957281356339325911846264948421066253307482040": "USDT",
    "1806018566677800621296032626439935115720767031724401394291089442012247156652": "WBTC",
    "1886212889629631188189497155848883534738756148921111726686756987927630157522": "wstETH",
};
export const DENOMS = [
    { human: 100n, label: "100 STRK" },
    { human: 1_000n, label: "1,000 STRK" },
    { human: 10_000n, label: "10,000 STRK" },
];

/** Same denominations, as plain numbers — mirrors indexer/src/gauge.ts's STANDARD_DENOMINATIONS. */
export const STANDARD_DENOMS = [10, 100, 1_000, 10_000] as const;

/** Display tier for a deposit landing at 1-indexed cumulative bucket depth `depthAfter`
 *  (counting the deposit itself) — mirrors gaugeMultiplierX10's thresholds in
 *  indexer/src/gauge.ts. Lets the split card simulate where each piece of a batch actually
 *  lands instead of showing the bucket's pre-batch tier for all of them. */
export function gaugeTier(depthAfter: number): number {
    if (depthAfter < 25) return 3.0;
    if (depthAfter < 100) return 2.0;
    if (depthAfter < 400) return 1.5;
    return 1.2;
}

/** Ceiling on deposit pieces batched into one split session's pool transaction. The Ready
 *  wallet's real per-transaction action limit is UNVERIFIED (needs a multi-deposit batch on
 *  Sepolia to measure), and proving is ~30 s per piece, so a large batch is a long, fragile
 *  session even if the wallet allows it. Conservative until the limit is measured; raise it
 *  only after a real Sepolia batch of the new size succeeds. */
export const MAX_SPLIT_PIECES = 10;
