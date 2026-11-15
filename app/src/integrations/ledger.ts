// Items already checked for self-harm words (emails, messages from exports, phone-file flags),
// so importing the same item again (for example after a disconnect and reconnect, or in a newer
// export) never flags it twice. Each entry is an opaque key from flagKey() in agg.ts (or the
// phone file's id) and the time it was checked. No content. Kept for ledgerKeepMs (35 days), at
// most ledgerMax entries, and kept through a disconnect. In memory when storage is blocked.

import { CONFIG } from "../engine/config";

const KEY = "steady.v3.emailLedger";
let mem: Record<string, number> | null = null;

function load(): Record<string, number> {
  if (mem) return mem;
  try {
    const raw = typeof localStorage !== "undefined" ? localStorage.getItem(KEY) : null;
    mem = raw ? (JSON.parse(raw) as Record<string, number>) : {};
  } catch {
    mem = {};
  }
  return mem;
}

function save(entries: Record<string, number>) {
  mem = entries;
  try {
    if (typeof localStorage !== "undefined") localStorage.setItem(KEY, JSON.stringify(entries));
  } catch {
    // Blocked storage: keep the ledger in memory for this page.
  }
}

function prune(entries: Record<string, number>, now: number): Record<string, number> {
  const ic = CONFIG.integrations;
  const kept = Object.entries(entries)
    .filter(([, at]) => now - at <= ic.ledgerKeepMs)
    .sort((a, b) => b[1] - a[1])
    .slice(0, ic.ledgerMax);
  return Object.fromEntries(kept);
}

export function ledgerHas(key: string, now = Date.now()): boolean {
  const e = load();
  return e[key] != null && now - e[key] <= CONFIG.integrations.ledgerKeepMs;
}

export function ledgerAdd(key: string, now = Date.now()) {
  save(prune({ ...load(), [key]: now }, now));
}

/** Only for the demo's Reset, which starts everything again. */
export function clearLedger() {
  mem = {};
  try {
    if (typeof localStorage !== "undefined") localStorage.removeItem(KEY);
  } catch {
    // ignore
  }
}
