import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useSnap } from "../store/hooks";
import { TeenPhone } from "../teen/TeenPhone";
import { ParentPhone } from "../parent/ParentPhone";
import { OtherPhones } from "../parent/Others";
import { ControlBar, EvidenceDrawer } from "./ControlRail";
import { useReducedMotion } from "../ui/common";
import { Icon } from "../ui/icons";

export const DEVICE_W = 390;
export const DEVICE_H = 820;
const SIDE_BESIDE = 1240; // px: from here up, the side column sits beside the phones

/** A phone: dark bezel, a status bar, then the app. */
export function Device({ children, scale, label }: { children: React.ReactNode; scale: number; label: string }) {
  return (
    <div className="device-slot" style={{ width: DEVICE_W * scale, height: DEVICE_H * scale }} role="region" aria-label={label}>
      <div className="device" style={{ transform: `scale(${scale})` }}>
        <div className="device-screen">
          <div className="device-app">{children}</div>
          <div className="statusbar" aria-hidden="true">
            <span>9:41</span>
            <span className="sb-icons">
              <svg width="17" height="11" viewBox="0 0 17 11">
                <rect x="0" y="7" width="3" height="4" rx="1" />
                <rect x="4.6" y="5" width="3" height="6" rx="1" />
                <rect x="9.2" y="2.5" width="3" height="8.5" rx="1" />
                <rect x="13.8" y="0" width="3" height="11" rx="1" />
              </svg>
              <svg width="25" height="12" viewBox="0 0 25 12">
                <rect x="0.5" y="0.5" width="21" height="11" rx="3.4" fill="none" stroke="currentColor" opacity="0.4" />
                <rect x="2" y="2" width="18" height="8" rx="2" />
                <rect x="23" y="4" width="1.6" height="4" rx="0.8" opacity="0.4" />
              </svg>
            </span>
          </div>
          <i className="island" aria-hidden="true" />
        </div>
      </div>
    </div>
  );
}

/** As large as the window allows: the bar's real height is measured, and on a wide window the
 *  counters and the other adults' phones sit beside the phones, not under them. */
function useScale(bar: React.RefObject<HTMLElement | null>): number {
  const calc = () => {
    const barH = bar.current?.offsetHeight ?? 110;
    const side = window.innerWidth >= SIDE_BESIDE ? 300 : 0;
    const h = (window.innerHeight - barH - 62) / DEVICE_H;
    const w = (window.innerWidth - 64 - 64 - side) / (2 * DEVICE_W);
    return Math.max(0.5, Math.min(1.1, h, w));
  };
  const [s, setS] = useState(calc);
  useEffect(() => {
    const f = () => setS(calc());
    f();
    window.addEventListener("resize", f);
    const ro = typeof ResizeObserver !== "undefined" && bar.current ? new ResizeObserver(f) : null;
    if (ro && bar.current) ro.observe(bar.current);
    return () => {
      window.removeEventListener("resize", f);
      ro?.disconnect();
    };
  }, []);
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
      <div className="count-row">
        <Icon name="lock" size={14} />
        TEXT SENT: 0 BYTES
      </div>
      <div className="count-row">
        <Icon name="bell" size={14} />
        ALERTS SENT: {alerts.length}
        {alerts.length ? ` (${alerts.map((a) => `${a.bytes} B`).join(", ")}; ${bytes} B in all)` : ""}
      </div>
      <div className="count-note">Demo view. {snap.sim.world.teen.people.teen}'s phone never shows this.</div>
    </div>
  );
}

export function DemoShell() {
  const snap = useSnap();
  const barRef = useRef<HTMLElement>(null);
  const scale = useScale(barRef);
  const teenRef = useRef<HTMLDivElement>(null);
  const parentRef = useRef<HTMLDivElement>(null);
  const trigger = useNoteTrigger();
  const people = snap.sim.world.teen.people;
  const [drawer, setDrawer] = useState(false);

  return (
    <div className="shell">
      <header className="bar" ref={barRef} aria-label="Demo controls">
        <ControlBar drawerOpen={drawer} onDrawer={() => setDrawer((d) => !d)} />
      </header>
      <main className="stage">
        <div className="phones">
          <div className="device-col" ref={teenRef}>
            <div className="device-caption">{people.teen}'s phone</div>
            <Device scale={scale} label={`${people.teen}'s phone`}>
              <TeenPhone />
            </Device>
          </div>
          <div className="device-col" ref={parentRef}>
            <div className="device-caption">{people.parent}'s phone</div>
            <Device scale={scale} label={`${people.parent}'s phone`}>
              <ParentPhone />
            </Device>
          </div>
          <aside className="side-col" aria-label="Outside the phones">
            <AlertsCaption />
            <OtherPhones />
          </aside>
          <Light from={teenRef} to={parentRef} trigger={trigger} />
        </div>
      </main>
      <EvidenceDrawer open={drawer} onClose={() => setDrawer(false)} />
    </div>
  );
}
