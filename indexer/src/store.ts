import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import path from "node:path";
import type { DepositEvent, RegisteredEvent } from "./types.ts";

export interface EventStore {
  /** Last block number successfully indexed (inclusive); -1 means empty. */
  lastIndexedBlock: number;
  deposits: DepositEvent[];
  registrations: RegisteredEvent[];
}

/** bigint has no native JSON representation; round-trip it through a tagged object. */
function replacer(_key: string, value: unknown): unknown {
  return typeof value === "bigint" ? { $bigint: value.toString() } : value;
}
function reviver(_key: string, value: unknown): unknown {
  if (value !== null && typeof value === "object" && "$bigint" in (value as Record<string, unknown>)) {
    return BigInt((value as { $bigint: string }).$bigint);
  }
  return value;
}

export function storePathFor(vault: string): string {
  return path.join(import.meta.dirname, "..", ".data", `events-${vault}.json`);
}

export function loadStore(filePath: string): EventStore {
  if (!existsSync(filePath)) return { lastIndexedBlock: -1, deposits: [], registrations: [] };
  return JSON.parse(readFileSync(filePath, "utf8"), reviver) as EventStore;
}

export function saveStore(filePath: string, store: EventStore): void {
  mkdirSync(path.dirname(filePath), { recursive: true });
  writeFileSync(filePath, JSON.stringify(store, replacer, 2));
}
