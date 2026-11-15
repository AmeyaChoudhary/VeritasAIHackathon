// Glue between the pure engine and React. One tab is the driver: it runs the clock and the
// rules and sends events. Other tabs (#/teen, #/parent, or a second demo tab) read the shared
// state from localStorage and pass their actions to the driver over a BroadcastChannel.
// Typed text is never stored here. The tone dots keep only a number per message.

import { useSyncExternalStore } from "react";
import { clockNow, jumpTo, makeClock, setRunning, setSpeed, type ClockState } from "../engine/clock";
import { iso, type FlagLevel, type Input } from "../engine/rules";
import { advance, applyInput, autoSetup, createWorld, nextWeekTarget, type AdvanceResult, type World } from "../engine/runner";
import { SCENARIOS, type ScenarioId } from "../engine/simulate";
import { BroadcastTransport, type SentRecord, type Wire } from "../engine/transport";
import type { Reply, ReplyChoice } from "../engine/parent";
import type { Pronoun, SteadyEvent } from "../engine/types";
import { isLowMood, loadToneModel, scoreTone, type ToneModel } from "../engine/tone";
import { setRiskModel } from "../engine/selfharm";
import { clearAccounts, getAccounts } from "../integrations/accounts";
import { clearLedger } from "../integrations/ledger";
import { liveWeekFrom } from "../integrations/live";
import type { LiveLookup } from "../engine/runner";

/** Real numbers from accounts connected on this phone, joined to the engine's weeks. */
const live: LiveLookup = (weekOf) => liveWeekFrom(getAccounts(), weekOf);

export type Role = "demo" | "teen" | "parent";

export interface Dot {
  at: number;
  score: number | null;
  low: boolean | null;
}

export interface Sim {
  rev: number;
  world: World;
  clock: ClockState;
  playing: boolean;
  lastStop: { at: number; label: string } | null;
  dots: Dot[];
  savedReal: number;
}

export type ParentStep = "pair" | "second" | "dnd" | "misses" | "done";

export interface ParentState {
  rev: number;
  step: ParentStep;
  parent: string;
  parentPronoun: Pronoun;
  second: string;
  dnd: boolean | null;
  /** Sim time this parent's phone linked. */
  pairedAt: number | null;
  replies: Reply[];
  seen: string[];
}

export type Action =
  | { a: "reset"; scenario: ScenarioId }
  | { a: "nextWeek" }
  | { a: "play"; on: boolean }
  | { a: "run"; on: boolean }
  | { a: "speed"; speed: number }
  | { a: "jump"; ms: number }
  | { a: "scripted"; on: boolean }
  | { a: "teen"; input: Input }
  | { a: "typed"; level: FlagLevel; score: number | null; low: boolean | null; textHash?: string }
  | { a: "autoSetup" };

export interface Snapshot {
  sim: Sim;
  parent: ParentState;
  events: SentRecord[];
  now: number;
  driver: boolean;
  tone: "loading" | "ready" | "failed";
}

const K = {
  sim: "steady.v3.sim",
  parent: "steady.v3.parent",
};

const PLAY_EVERY_MS = 2600;

function read<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

function write(key: string, v: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(v));
  } catch {
    // Blocked storage: this tab still works on its own.
  }
}

function randomCode(): string {
  const a = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let s = "";
  const r = new Uint32Array(6);
  crypto.getRandomValues(r);
  for (const x of r) s += a[x % a.length];
  return `${s.slice(0, 3)}-${s.slice(3)}`;
}

export function normCode(c: string): string {
  return c.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

function freshSim(id: ScenarioId, realNow: number, scripted = true): Sim {
  const scn = SCENARIOS[id];
  const world = createWorld(scn, randomCode(), scripted);
  return { rev: 1, world, clock: makeClock(world.now, realNow, 60), playing: false, lastStop: null, dots: [], savedReal: realNow };
}

function freshParent(id: ScenarioId): ParentState {
  const p = SCENARIOS[id].people;
  return { rev: 1, step: "pair", parent: p.parent, parentPronoun: p.parentPronoun, second: p.second ?? "", dnd: null, pairedAt: null, replies: [], seen: [] };
}

export function recipients(e: Wire, people: { parent: string; second?: string; trusted?: string }): string[] {
  if (e.type === "urgent") return [people.parent, people.second, people.trusted].filter(Boolean) as string[];
  if (e.type === "receipt") return [people.second, people.trusted].filter(Boolean) as string[];
  return [people.parent];
}

type Bus = { type: "typed"; text: string; level: FlagLevel };

class Store {
  role: Role;
  sim: Sim;
  parent: ParentState;
  events: SentRecord[];
  driver = false;
  tone: Snapshot["tone"] = "loading";
  toneModel: ToneModel | null = null;
  transport: BroadcastTransport;
  private chan: BroadcastChannel | null;
  private subs = new Set<() => void>();
  private busSubs = new Set<(b: Bus) => void>();
  private snap: Snapshot;
  private lastPlay = 0;

  constructor(role: Role) {
    this.role = role;
    const realNow = Date.now();
    const saved = read<Sim>(K.sim);
    if (saved && saved.world?.v === 1 && SCENARIOS[saved.world.scenarioId]) {
      // A clock left running in another session would jump ahead. Hold it where it was.
      saved.clock = setRunning(saved.clock, false, saved.savedReal ?? realNow);
      saved.clock.realAt = realNow;
      saved.playing = false;
      this.sim = saved;
    } else {
      this.sim = freshSim("maya", realNow);
    }
    this.parent = read<ParentState>(K.parent) ?? freshParent(this.sim.world.scenarioId);
    this.transport = new BroadcastTransport();
    this.events = this.transport.list();
    this.transport.subscribe((all) => {
      this.events = all;
      this.emit();
    });
    this.chan = typeof BroadcastChannel !== "undefined" ? new BroadcastChannel("steady-v3-state") : null;
    if (this.chan) {
      this.chan.onmessage = (ev: MessageEvent) => {
        const m = ev.data as { t: string; action?: Action };
        if (m.t === "sim") this.reloadSim();
        else if (m.t === "parent") this.reloadParent();
        else if (m.t === "action" && m.action && this.driver) this.apply(m.action);
      };
    }
    window.addEventListener("storage", (e) => {
      if (e.key === K.sim) this.reloadSim();
      if (e.key === K.parent) this.reloadParent();
    });
    this.snap = this.makeSnap();
    if (role !== "parent") this.claimDriver();
    window.setInterval(() => this.loop(), 200);
    loadToneModel("./models/tone.json")
      .then((m) => {
        this.toneModel = m;
        this.tone = "ready";
        this.emit();
      })
      .catch(() => {
        this.tone = "failed";
        this.emit();
      });
    // Without this file the app falls back to the phrase list alone.
    loadToneModel("./models/risk.json")
      .then((m) => setRiskModel(m))
      .catch(() => setRiskModel(null));
  }

  private claimDriver() {
    const locks = (navigator as Navigator & { locks?: LockManager }).locks;
    if (locks?.request) {
      locks
        .request("steady-v3-driver", () => {
          this.driver = true;
          this.reloadSim();
          this.emit();
          return new Promise<void>(() => {}); // held until the tab closes
        })
        .catch(() => {
          this.driver = true;
        });
    } else {
      this.driver = true;
    }
  }

  private reloadSim() {
    const s = read<Sim>(K.sim);
    if (s && s.rev !== this.sim.rev) {
      this.sim = s;
      this.emit();
    }
  }

  private reloadParent() {
    const p = read<ParentState>(K.parent);
    if (p && p.rev !== this.parent.rev) {
      this.parent = p;
      this.emit();
    }
  }

  private makeSnap(): Snapshot {
    return {
      sim: this.sim,
      parent: this.parent,
      events: this.events,
      now: clockNow(this.sim.clock, Date.now()),
      driver: this.driver,
      tone: this.tone,
    };
  }

  private emit() {
    this.snap = this.makeSnap();
    this.subs.forEach((f) => f());
  }

  subscribe = (f: () => void) => {
    this.subs.add(f);
    return () => {
      this.subs.delete(f);
    };
  };

  getSnapshot = () => this.snap;

  onBus(f: (b: Bus) => void) {
    this.busSubs.add(f);
    return () => {
      this.busSubs.delete(f);
    };
  }

  private saveSim(next: Sim) {
    this.sim = { ...next, rev: next.rev + 1, savedReal: Date.now() };
    write(K.sim, this.sim);
    this.chan?.postMessage({ t: "sim" });
    this.emit();
  }

  updateParent(fn: (p: ParentState) => ParentState) {
    const cur = read<ParentState>(K.parent) ?? this.parent;
    const next = { ...fn(cur), rev: cur.rev + 1 };
    this.parent = next;
    write(K.parent, next);
    this.chan?.postMessage({ t: "parent" });
    this.emit();
  }

  dispatch = (action: Action) => {
    if (this.driver) this.apply(action);
    else this.chan?.postMessage({ t: "action", action });
  };

  /** A parent reply. It stays on the parent's phone; urgent replies send a receipt to the relay. */
  reply(note: { id: string; event: SteadyEvent }, choice: ReplyChoice) {
    const at = this.snap.now;
    this.updateParent((p) => ({ ...p, replies: [...p.replies, { noteId: note.id, choice, at }] }));
    if (note.event.type === "urgent") {
      const people = this.sim.world.teen.people;
      const receipt: Wire = { type: "receipt", for: note.event.sent_at, reached: choice !== "cant_reach", sent_at: iso(at) };
      const to = recipients(receipt, people);
      if (to.length) this.transport.send(receipt, { at, from: "parent", to });
    }
  }

  // ------------------------------------------------------------ driver side

  private handle(sim: Sim, r: AdvanceResult): Sim {
    const people = r.world.teen.people;
    for (const e of r.emitted) this.transport.send(e.event, { at: e.at, from: "teen", to: recipients(e.event, people) });
    let next: Sim = { ...sim, world: r.world };
    if (r.replies.length) {
      const notes = this.transport.list().filter((x) => x.from === "teen" && (x.event.type === "heads_up" || x.event.type === "urgent"));
      for (const rep of r.replies) {
        const target = [...notes].reverse().find((n) => n.at <= rep.at);
        if (target) this.replyAt(target, rep.choice, rep.at);
      }
    }
    for (const t of r.typed) {
      const score = this.toneModel ? this.scoreTone(t.text) : null;
      next = { ...next, dots: [...next.dots, { at: t.at, score: score?.score ?? null, low: score?.low ?? null }].slice(-40) };
      this.busSubs.forEach((f) => f({ type: "typed", text: t.text, level: t.level }));
    }
    if (r.stop) {
      next = { ...next, clock: { ...setRunning(next.clock, false, Date.now()), simAt: r.stop.at }, lastStop: r.stop, playing: false };
    }
    return next;
  }

  private scoreTone(text: string): { score: number; low: boolean } | null {
    const m = this.toneModel;
    if (!m) return null;
    try {
      return toneOf(m, text);
    } catch {
      return null;
    }
  }

  private replyAt(note: SentRecord, choice: ReplyChoice, at: number) {
    this.updateParent((p) => ({ ...p, replies: [...p.replies, { noteId: note.id, choice, at }] }));
    if (note.event.type === "urgent") {
      const people = this.sim.world.teen.people;
      const receipt: Wire = { type: "receipt", for: note.event.sent_at, reached: choice !== "cant_reach", sent_at: iso(at) };
      const to = recipients(receipt, people);
      if (to.length) this.transport.send(receipt, { at, from: "parent", to });
    }
  }

  private ensureSetup(sim: Sim): Sim {
    if (sim.world.teen.setupDone) return sim;
    const scn = SCENARIOS[sim.world.scenarioId];
    const r = autoSetup(sim.world, scn);
    const people = r.world.teen.people;
    for (const e of r.emitted) this.transport.send(e.event, { at: e.at, from: "teen", to: recipients(e.event, people) });
    if (this.parent.step !== "done") {
      this.updateParent((p) => ({ ...p, step: "done", dnd: p.dnd ?? true, pairedAt: p.pairedAt ?? sim.world.now }));
    }
    return { ...sim, world: r.world };
  }

  private apply(action: Action) {
    const realNow = Date.now();
    let sim = this.sim;
    const scn = SCENARIOS[sim.world.scenarioId];
    const now = clockNow(sim.clock, realNow);
    switch (action.a) {
      case "reset": {
        this.transport.clear();
        clearAccounts();
        clearLedger();
        const fresh = freshSim(action.scenario, realNow, sim.world.scripted);
        const p = { ...freshParent(action.scenario), rev: this.parent.rev + 1 };
        this.parent = p;
        write(K.parent, p);
        this.chan?.postMessage({ t: "parent" });
        this.saveSim({ ...fresh, rev: sim.rev + 1 });
        return;
      }
      case "autoSetup":
        sim = this.ensureSetup(sim);
        break;
      case "nextWeek": {
        sim = this.ensureSetup(sim);
        const target = nextWeekTarget(sim.world, scn);
        if (target == null) {
          sim = { ...sim, playing: false };
          break;
        }
        const r = advance(sim.world, Math.max(target, sim.world.now), scn, { stopAtStops: true, live });
        sim = this.handle({ ...sim, lastStop: null }, r);
        if (!r.stop) sim = { ...sim, clock: { ...setRunning(sim.clock, false, realNow), simAt: r.world.now, realAt: realNow } };
        break;
      }
      case "play":
        if (action.on) sim = this.ensureSetup(sim);
        sim = { ...sim, playing: action.on };
        this.lastPlay = 0;
        break;
      case "run":
        if (action.on) sim = this.ensureSetup(sim);
        sim = { ...sim, clock: setRunning(sim.clock, action.on, realNow), lastStop: action.on ? null : sim.lastStop };
        break;
      case "speed":
        sim = { ...sim, clock: setSpeed(sim.clock, action.speed, realNow) };
        break;
      case "jump": {
        sim = this.ensureSetup(sim);
        const target = Math.max(now, sim.world.now) + action.ms;
        const r = advance(sim.world, target, scn, { stopAtStops: false, live });
        sim = this.handle({ ...sim, lastStop: null }, r);
        sim = { ...sim, clock: jumpTo(sim.clock, r.world.now, realNow) };
        break;
      }
      case "scripted":
        sim = { ...sim, world: { ...sim.world, scripted: action.on } };
        break;
      case "teen": {
        const r = applyInput(sim.world, scn, action.input, Math.max(now, sim.world.now), undefined, live);
        sim = this.handle(sim, { ...r, stop: null });
        break;
      }
      case "typed": {
        const r = applyInput(sim.world, scn, { kind: "typed", level: action.level, textHash: action.textHash }, Math.max(now, sim.world.now), undefined, live);
        sim = this.handle(sim, { ...r, stop: null });
        sim = { ...sim, dots: [...sim.dots, { at: r.world.now, score: action.score, low: action.low }].slice(-40) };
        break;
      }
    }
    this.saveSim(sim);
  }

  private loop() {
    const realNow = Date.now();
    if (this.driver) {
      let sim = this.sim;
      const scn = SCENARIOS[sim.world.scenarioId];
      const now = clockNow(sim.clock, realNow);
      if (sim.clock.running && now > sim.world.now + 1) {
        if (!sim.world.teen.setupDone) sim = this.ensureSetup(sim);
        const r = advance(sim.world, now, scn, { stopAtStops: true, live });
        if (r.emitted.length || r.stop || r.typed.length || r.replies.length || r.world.teen !== sim.world.teen) {
          this.saveSim(this.handle(sim, r));
        } else {
          this.sim = { ...sim, world: r.world };
        }
      }
      if (this.sim.playing && realNow - this.lastPlay > PLAY_EVERY_MS) {
        this.lastPlay = realNow;
        if (nextWeekTarget(this.sim.world, scn) == null) this.apply({ a: "play", on: false });
        else this.apply({ a: "nextWeek" });
      }
    }
    if (this.sim.clock.running || this.snap.now !== clockNow(this.sim.clock, realNow)) this.emit();
  }
}

// Tone scoring is kept out of the class so a missing model never breaks the store.
function toneOf(m: ToneModel, text: string) {
  return { score: scoreTone(m, text), low: isLowMood(m, text) };
}

let store: Store | null = null;

export function getStore(role: Role): Store {
  if (!store) store = new Store(role);
  return store;
}

export function useSnapshot(role: Role): Snapshot {
  const s = getStore(role);
  return useSyncExternalStore(s.subscribe, s.getSnapshot);
}

export type { Store };
