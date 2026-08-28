import { ProviderInterface, RpcProvider } from "starknet";

// ─── Protocol constants (verified — see ARCHITECTURE.md) ────────────────────

/** STRK20 privacy pool, Starknet mainnet. The wallet injects it via "${poolAddress}" —
 *  the app itself only needs it for display links. */
export const POOL_ADDRESS = "0x040337b1af3c663e86e333bab5a4b28da8d4652a15a69beee2b677776ffe812a";

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

export function voyagerTx(index: number, hash: string): string {
    return (index === 0 ? "https://voyager.online/tx/" : "https://sepolia.voyager.online/tx/") + hash;
}

// ─── Gauges (mirror indexer/src/gauge.ts — display only, the indexer is authoritative) ──

export const E18 = 10n ** 18n;
export const DENOMS = [
    { human: 100n, label: "100 STRK" },
    { human: 1_000n, label: "1,000 STRK" },
    { human: 10_000n, label: "10,000 STRK" },
];
