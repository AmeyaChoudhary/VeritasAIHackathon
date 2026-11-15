// How events leave the teen's phone. Typed text never goes through here: only the small
// JSON events from docs/parent-alerts.md, and the parent's receipts for urgent notes.
//
// The demo has no server. BroadcastTransport keeps the teen and parent views in sync across
// tabs of the same browser with a BroadcastChannel, and keeps a copy in localStorage so a tab
// opened later sees what was already sent. server/relay.mjs is the optional real relay.

import { SIGNALS, type HeadsUpEvent, type ReceiptEvent, type SteadyEvent } from "./types";

export type Wire = SteadyEvent | ReceiptEvent;

export interface SentRecord {
  id: string;
  /** Sim time it was sent. */
  at: number;
  event: Wire;
  /** The exact bytes on the wire. */
  json: string;
  bytes: number;
  from: "teen" | "parent";
  /** Who the relay hands it to. */
  to: string[];
}

export interface Transport {
  send(event: Wire, meta: { at: number; from: "teen" | "parent"; to: string[] }): SentRecord;
  list(): SentRecord[];
  subscribe(cb: (all: SentRecord[]) => void): () => void;
  clear(): void;
  close(): void;
}

const enc = new TextEncoder();

const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/;
const AREAS = new Set<string>(SIGNALS);

/** Only the schema fields of each event type, in schema order, with the right kinds of value.
 *  Anything else is dropped; a malformed event is refused. This keeps a future change from
 *  sending more than docs/parent-alerts.md allows. */
export function allowlisted(e: Wire): Wire {
  const bad = (why: string): never => {
    throw new Error(`Refused to send event: ${why}`);
  };
  const sentAt = (v: unknown) => (typeof v === "string" && ISO.test(v) ? v : bad("sent_at"));
  switch (e?.type) {
    case "heads_up": {
      const hasAreas = e.areas !== undefined;
      if (hasAreas !== (e.weeks !== undefined)) bad("areas and weeks go together");
      if (!hasAreas) return { type: "heads_up", sent_at: sentAt(e.sent_at) };
      if (!Array.isArray(e.areas) || !e.areas.length || !e.areas.every((a) => AREAS.has(a))) bad("areas");
      if (!Number.isInteger(e.weeks) || (e.weeks as number) < 0) bad("weeks");
      const out: HeadsUpEvent = { type: "heads_up", areas: [...(e.areas as HeadsUpEvent["areas"] & unknown[])], weeks: e.weeks, sent_at: sentAt(e.sent_at) };
      return out;
    }
    case "urgent":
      return { type: "urgent", sent_at: sentAt(e.sent_at) };
    case "status": {
      if (typeof e.enough_data !== "boolean" || typeof e.keyboard_used !== "boolean") bad("status fields");
      return { type: "status", enough_data: e.enough_data, keyboard_used: e.keyboard_used, sent_at: sentAt(e.sent_at) };
    }
    case "receipt": {
      if (typeof e.reached !== "boolean") bad("reached");
      return { type: "receipt", for: sentAt(e.for), reached: e.reached, sent_at: sentAt(e.sent_at) };
    }
    default:
      return bad("unknown type");
  }
}

export function eventJson(e: Wire): string {
  return JSON.stringify(allowlisted(e));
}

export function eventBytes(e: Wire): number {
  return enc.encode(eventJson(e)).length;
}

function makeRecord(raw: Wire, meta: { at: number; from: "teen" | "parent"; to: string[] }, n: number): SentRecord {
  const event = allowlisted(raw);
  const json = JSON.stringify(event);
  return {
    id: `${meta.at}-${n}-${Math.random().toString(36).slice(2, 7)}`,
    at: meta.at,
    event,
    json,
    bytes: enc.encode(json).length,
    from: meta.from,
    to: meta.to,
  };
}

/** In-memory transport for tests and for a single tab. */
export class MemoryTransport implements Transport {
  private items: SentRecord[] = [];
  private subs = new Set<(all: SentRecord[]) => void>();
  send(event: Wire, meta: { at: number; from: "teen" | "parent"; to: string[] }): SentRecord {
    const r = makeRecord(event, meta, this.items.length);
    this.items = [...this.items, r];
    this.subs.forEach((cb) => cb(this.items));
    return r;
  }
  list(): SentRecord[] {
    return this.items;
  }
  subscribe(cb: (all: SentRecord[]) => void): () => void {
    this.subs.add(cb);
    return () => this.subs.delete(cb);
  }
  clear(): void {
    this.items = [];
    this.subs.forEach((cb) => cb(this.items));
  }
  close(): void {
    this.subs.clear();
  }
}

/** BroadcastChannel + localStorage. Works offline, inside one browser. */
export class BroadcastTransport implements Transport {
  private key: string;
  private channel: BroadcastChannel | null;
  private subs = new Set<(all: SentRecord[]) => void>();
  private cache: SentRecord[];
  private onStorage = (e: StorageEvent) => {
    if (e.key === this.key) this.reload();
  };

  constructor(name = "steady-v3-events", key = "steady.v3.events") {
    this.key = key;
    this.cache = this.read();
    this.channel = typeof BroadcastChannel !== "undefined" ? new BroadcastChannel(name) : null;
    if (this.channel) this.channel.onmessage = () => this.reload();
    if (typeof window !== "undefined") window.addEventListener("storage", this.onStorage);
  }

  private read(): SentRecord[] {
    try {
      const raw = localStorage.getItem(this.key);
      const v = raw ? (JSON.parse(raw) as SentRecord[]) : [];
      return Array.isArray(v) ? v : [];
    } catch {
      return [];
    }
  }

  private write(items: SentRecord[]) {
    try {
      localStorage.setItem(this.key, JSON.stringify(items));
    } catch {
      // Storage full or blocked. The in-memory copy still works for this tab.
    }
  }

  private reload() {
    this.cache = this.read();
    this.subs.forEach((cb) => cb(this.cache));
  }

  send(event: Wire, meta: { at: number; from: "teen" | "parent"; to: string[] }): SentRecord {
    const items = this.read();
    const r = makeRecord(event, meta, items.length);
    const next = [...items, r];
    this.write(next);
    this.cache = next;
    this.channel?.postMessage({ t: "sent", id: r.id });
    this.subs.forEach((cb) => cb(this.cache));
    return r;
  }

  list(): SentRecord[] {
    return this.cache;
  }

  subscribe(cb: (all: SentRecord[]) => void): () => void {
    this.subs.add(cb);
    return () => this.subs.delete(cb);
  }

  clear(): void {
    this.write([]);
    this.cache = [];
    this.channel?.postMessage({ t: "clear" });
    this.subs.forEach((cb) => cb(this.cache));
  }

  close(): void {
    this.channel?.close();
    if (typeof window !== "undefined") window.removeEventListener("storage", this.onStorage);
    this.subs.clear();
  }
}
