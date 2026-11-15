// Simulated time. The demo runs a few months in a few minutes, so 30 minutes,
// 24 hours or two days can be shown in seconds. Pure functions over a small state
// object, so every tab can compute the same "now" from what is stored.

export interface ClockState {
  /** Sim time at the moment realAt was taken. */
  simAt: number;
  /** Real (wall) time in ms when simAt was set. */
  realAt: number;
  /** Sim ms per real ms. */
  speed: number;
  running: boolean;
}

export const SPEEDS: { label: string; value: number }[] = [
  { label: "1x", value: 1 },
  { label: "1 MIN/S", value: 60 },
  { label: "10 MIN/S", value: 600 },
  { label: "1 HR/S", value: 3600 },
];

export function makeClock(simAt: number, realNow: number, speed = 60): ClockState {
  return { simAt, realAt: realNow, speed, running: false };
}

export function clockNow(c: ClockState, realNow: number): number {
  return c.running ? c.simAt + (realNow - c.realAt) * c.speed : c.simAt;
}

function rebase(c: ClockState, realNow: number): ClockState {
  return { ...c, simAt: clockNow(c, realNow), realAt: realNow };
}

export function setRunning(c: ClockState, running: boolean, realNow: number): ClockState {
  return { ...rebase(c, realNow), running };
}

export function setSpeed(c: ClockState, speed: number, realNow: number): ClockState {
  return { ...rebase(c, realNow), speed };
}

/** Move to a sim time. Time only goes forward. */
export function jumpTo(c: ClockState, simAt: number, realNow: number): ClockState {
  const now = clockNow(c, realNow);
  return { ...c, simAt: Math.max(now, simAt), realAt: realNow };
}

/** A small wrapper for code that wants an object. realNow is injectable for tests. */
export class SimClock {
  state: ClockState;
  private real: () => number;
  constructor(simAt: number, real: () => number = () => Date.now(), speed = 60) {
    this.real = real;
    this.state = makeClock(simAt, real(), speed);
  }
  now(): number {
    return clockNow(this.state, this.real());
  }
  run(): void {
    this.state = setRunning(this.state, true, this.real());
  }
  pause(): void {
    this.state = setRunning(this.state, false, this.real());
  }
  speed(v: number): void {
    this.state = setSpeed(this.state, v, this.real());
  }
  advance(ms: number): void {
    this.state = jumpTo(this.state, this.now() + ms, this.real());
  }
}

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

/** "Week 6 · Sun 21:30" style label, relative to the start of week 1. */
export function weekLabel(t: number, startAt: number): { week: number; day: string; time: string } {
  const d = Math.floor((t - startAt) / 86400000);
  const week = Math.floor(d / 7) + 1;
  const date = new Date(t);
  const hh = String(date.getUTCHours()).padStart(2, "0");
  const mm = String(date.getUTCMinutes()).padStart(2, "0");
  return { week, day: DAYS[((d % 7) + 7) % 7], time: `${hh}:${mm}` };
}
