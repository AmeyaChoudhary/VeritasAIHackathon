import { useEffect, useMemo, useState } from "react";
import qrcode from "qrcode-generator";

const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** Sim times are UTC. Shown as "Sun 27 Dec, 21:30". */
export function fmtTime(t: number): string {
  const d = new Date(t);
  const hh = String(d.getUTCHours()).padStart(2, "0");
  const mm = String(d.getUTCMinutes()).padStart(2, "0");
  return `${DOW[d.getUTCDay()]} ${d.getUTCDate()} ${MON[d.getUTCMonth()]}, ${hh}:${mm}`;
}

export function fmtClock(t: number): string {
  const d = new Date(t);
  return `${String(d.getUTCHours()).padStart(2, "0")}:${String(d.getUTCMinutes()).padStart(2, "0")}`;
}

export function ProtoLine({ className = "phone-foot" }: { className?: string }) {
  return <div className={className}>Prototype. Not medical advice.</div>;
}

export function useReducedMotion(): boolean {
  const [r, setR] = useState(() => typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches);
  useEffect(() => {
    const m = window.matchMedia?.("(prefers-reduced-motion: reduce)");
    if (!m) return;
    const f = () => setR(m.matches);
    m.addEventListener("change", f);
    return () => m.removeEventListener("change", f);
  }, []);
  return !!r;
}

export function QR({ text, size = 148, label }: { text: string; size?: number; label: string }) {
  const { n, d } = useMemo(() => {
    const qr = qrcode(0, "M");
    qr.addData(text);
    qr.make();
    const n = qr.getModuleCount();
    let d = "";
    for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (qr.isDark(r, c)) d += `M${c},${r}h1v1h-1z`;
    return { n, d };
  }, [text]);
  return (
    <svg role="img" aria-label={label} viewBox={`-2 -2 ${n + 4} ${n + 4}`} width={size} height={size} shapeRendering="crispEdges">
      <rect x={-2} y={-2} width={n + 4} height={n + 4} fill="#FBFBFC" />
      <path d={d} fill="#2A2E33" />
    </svg>
  );
}

/** One sentence revealed word by word, unless the reader asks for less motion. */
export function WordByWord({ text, start = 0, step = 70, play }: { text: string; start?: number; step?: number; play: boolean }) {
  if (!play) return <>{text}</>;
  const words = text.split(" ");
  return (
    <>
      {words.map((w, i) => (
        <span key={i} className="word" style={{ animationDelay: `${start + i * step}ms` }}>
          {w}
          {i < words.length - 1 ? " " : ""}
        </span>
      ))}
    </>
  );
}

export function wordCount(text: string): number {
  return text.split(" ").length;
}
