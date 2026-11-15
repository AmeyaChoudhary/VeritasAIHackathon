import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useSnap } from "../store/hooks";
import { TeenPhone } from "../teen/TeenPhone";
import { ParentPhone } from "../parent/ParentPhone";
import { OtherPhones } from "../parent/Others";
import { ControlRail } from "./ControlRail";
import { useReducedMotion } from "../ui/common";

export const DEVICE_W = 390;
export const DEVICE_H = 820;

export function Device({ children, scale, label }: { children: React.ReactNode; scale: number; label: string }) {
  return (
    <div className="device-slot" style={{ width: DEVICE_W * scale, height: DEVICE_H * scale }} role="region" aria-label={label}>
      <div className="device" style={{ transform: `scale(${scale})` }}>
        <div className="device-screen">{children}</div>
      </div>
    </div>
  );
}

function useScale(phones: number, railW: number): number {
  const calc = () => {
    const h = (window.innerHeight - 170) / DEVICE_H;
    const w = (window.innerWidth - railW - 60 - (phones - 1) * 72) / (phones * DEVICE_W);
    return Math.max(0.5, Math.min(1, h, w));
  };
  const [s, setS] = useState(calc);
  useEffect(() => {
    const f = () => setS(calc());
    window.addEventListener("resize", f);
    return () => window.removeEventListener("resize", f);
  });
  return s;
}

/** The amber light that crosses from the teen's phone to the parent's when a note goes out. */
function Light({ from, to, trigger }: { from: React.RefObject<HTMLDivElement | null>; to: React.RefObject<HTMLDivElement | null>; trigger: number }) {
  const reduced = useReducedMotion();
  const ref = useRef<HTMLDivElement>(null);
  const [on, setOn] = useState(false);
  useLayoutEffect(() => {
    if (!trigger || reduced || !from.current || !to.current || !ref.current) return;
    const box = from.current.parentElement?.getBoundingClientRect();
    const a = from.current.getBoundingClientRect();
    const b = to.current.getBoundingClientRect();
    if (!box) return;
    const sx = a.right - box.left - 30;
    const sy = a.top - box.top + a.height * 0.42;
    const ex = b.left - box.left + 30;
    const ey = b.top - box.top + b.height * 0.3;
    const el = ref.current;
    el.style.transition = "none";
    el.style.opacity = "0";
    el.style.transform = `translate(${sx}px, ${sy}px)`;
    setOn(true);
    requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        el.style.transition = "transform 1700ms cubic-bezier(0.45, 0, 0.2, 1), opacity 500ms ease";
        el.style.opacity = "1";
        el.style.transform = `translate(${ex}px, ${ey}px)`;
        window.setTimeout(() => {
          el.style.transition = "opacity 900ms ease";
          el.style.opacity = "0";
        }, 1800);
        window.setTimeout(() => setOn(false), 2800);
      }),
    );
  }, [trigger, reduced, from, to]);
  return <div ref={ref} className="light" aria-hidden="true" style={{ left: 0, top: 0, opacity: 0, visibility: on ? "visible" : "hidden" }} />;
}

function useNoteTrigger(): number {
  const snap = useSnap();
  const count = snap.events.filter((e) => e.from === "teen" && e.event.type !== "status" && e.at <= snap.now).length;
  const prev = useRef(count);
  const [t, setT] = useState(0);
  useEffect(() => {
    if (count > prev.current) setT(Date.now());
    prev.current = count;
  }, [count]);
  return t;
}

export function AlertsCaption() {
  const snap = useSnap();
  const alerts = snap.events.filter((e) => e.from === "teen" && e.event.type !== "status" && e.at <= snap.now);
  const bytes = alerts.reduce((a, r) => a + r.bytes, 0);
  return (
    <div className="below-glass" aria-label="Demo counters, not shown on the teen's phone">
      <div>TEXT SENT: 0 BYTES</div>
      <div>
        ALERTS SENT: {alerts.length}
        {alerts.length ? ` (${alerts.map((a) => `${a.bytes} B`).join(", ")}; ${bytes} B in all)` : ""}
      </div>
      <div className="muted" style={{ marginTop: 4 }}>
        Demo view. {snap.sim.world.teen.people.teen}'s phone never shows this.
      </div>
    </div>
  );
}

export function DemoShell() {
  const snap = useSnap();
  const scale = useScale(2, window.innerWidth <= 1180 ? 330 : 380);
  const teenRef = useRef<HTMLDivElement>(null);
  const parentRef = useRef<HTMLDivElement>(null);
  const trigger = useNoteTrigger();
  const people = snap.sim.world.teen.people;

  return (
    <div className="shell">
      <main className="stage">
        <div className="stage-head">
          <h1>
            Steady <span className="muted">· a prototype for the Veritas AI Hackathon 2026, AI + Health</span>
          </h1>
          <span className="label">Prototype. Not medical advice.</span>
        </div>
        <div className="phones">
          <div className="device-col" ref={teenRef}>
            <div className="device-caption">{people.teen}'s phone</div>
            <Device scale={scale} label={`${people.teen}'s phone`}>
              <TeenPhone />
            </Device>
            <AlertsCaption />
          </div>
          <div className="device-col" ref={parentRef}>
            <div className="device-caption">{people.parent}'s phone</div>
            <Device scale={scale} label={`${people.parent}'s phone`}>
              <ParentPhone />
            </Device>
            <OtherPhones />
          </div>
          <Light from={teenRef} to={parentRef} trigger={trigger} />
        </div>
      </main>
      <aside className="rail" aria-label="Demo controls">
        <ControlRail />
      </aside>
    </div>
  );
}
