import { CONFIG } from "../engine/config";
import { ROW_LABEL } from "../engine/summary";
import { SIGNALS, type SignalId, type WeekRecord } from "../engine/types";

const W = 320;
const H = 46;
const MID = 24;
const PX = 6.5; // pixels per spread

/** One hairline per signal inside its soft personal band. Distance is drawn in the student's
 *  own spreads, better weeks up. While the range is learning the band is a wide haze that
 *  tightens. Drifted weeks are amber. */
export function SignalChart({ weeks, total = 12, signals }: { weeks: WeekRecord[]; total?: number; signals?: SignalId[] }) {
  const n = Math.max(total, weeks.length);
  const x = (w: number) => 10 + ((w - 1) * (W - 20)) / (n - 1);
  const y = (p: number) => MID - Math.max(-3.1, Math.min(2.7, p)) * PX;
  const present = SIGNALS.filter((k) => (!signals || signals.includes(k)) && weeks.some((r) => typeof r.data.values[k] === "number"));
  const rows = present.length ? present : (["sleep", "reaching_out", "activity", "tone"] as SignalId[]);

  return (
    <div aria-label="Your signals by week" role="group">
      {rows.map((sig) => {
        const dir = CONFIG.worseDirection[sig];
        const learned: number[] = [];
        const pts: { w: number; p: number; out: boolean; haze: number }[] = [];
        for (const r of weeks) {
          const v = r.data.values[sig];
          if (typeof v !== "number" || !r.valid) {
            pts.push({ w: r.week, p: NaN, out: false, haze: 1 });
            continue;
          }
          const range = r.ranges[sig] && !r.learning.includes(sig) ? r.ranges[sig] : null;
          let p: number;
          let haze = 1;
          if (range) {
            p = (-dir * (v - range.mean)) / range.spread;
          } else {
            learned.push(v);
            const k = learned.length;
            const mean = learned.reduce((a, b) => a + b, 0) / k;
            const sd = k > 1 ? Math.sqrt(learned.reduce((a, b) => a + (b - mean) ** 2, 0) / (k - 1)) : 0;
            const spread = Math.max(sd, CONFIG.spreadFloor[sig]);
            p = (-dir * (v - mean)) / spread;
            haze = 1 + 2.4 / k;
          }
          pts.push({ w: r.week, p, out: r.out.includes(sig), haze });
        }
        const valid = pts.filter((q) => !Number.isNaN(q.p));
        const last = weeks[weeks.length - 1];
        const status = !last ? "" : last.learning.includes(sig) ? "LEARNING" : last.out.includes(sig) ? "DRIFTED" : "IN RANGE";
        // band
        let band = "";
        if (valid.length) {
          const up = valid.map((q) => `${x(q.w).toFixed(1)},${y(q.haze).toFixed(1)}`);
          const down = [...valid].reverse().map((q) => `${x(q.w).toFixed(1)},${y(-q.haze).toFixed(1)}`);
          const first = valid[0];
          const lastV = valid[valid.length - 1];
          band = `M${x(first.w) - 6},${y(first.haze)} L${up.join(" L")} L${x(lastV.w) + 6},${y(lastV.haze)} L${x(lastV.w) + 6},${y(-lastV.haze)} L${down.join(" L")} L${x(first.w) - 6},${y(-first.haze)} Z`;
        }
        // line segments, broken at weeks without enough data
        const segs: { d: string; amber: boolean }[] = [];
        for (let i = 1; i < pts.length; i++) {
          const a = pts[i - 1];
          const b = pts[i];
          if (Number.isNaN(a.p) || Number.isNaN(b.p)) continue;
          segs.push({ d: `M${x(a.w).toFixed(1)},${y(a.p).toFixed(1)} L${x(b.w).toFixed(1)},${y(b.p).toFixed(1)}`, amber: b.out });
        }
        return (
          <div className="chart-row" key={sig}>
            <div className="label">
              <span>{ROW_LABEL[sig]}</span>
              <span>{status}</span>
            </div>
            <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`${ROW_LABEL[sig].toLowerCase()}: ${status.toLowerCase() || "no data yet"}`}>
              <line x1={4} x2={W - 4} y1={MID} y2={MID} stroke="#E2E5E8" strokeWidth={1} />
              {band && <path d={band} fill="#E2E5E8" opacity={0.75} />}
              {segs.map((s, i) => (
                <path
                  key={i}
                  d={s.d}
                  fill="none"
                  stroke={s.amber ? "#E39B2D" : "#444A52"}
                  strokeWidth={s.amber ? 1.6 : 1}
                  strokeLinecap="round"
                />
              ))}
              {pts.map((q) =>
                Number.isNaN(q.p) ? (
                  <text key={q.w} x={x(q.w)} y={MID + 4} textAnchor="middle" fontSize="9" fill="#5C636D" fontFamily="IBM Plex Mono, monospace">
                    ·
                  </text>
                ) : q.out ? (
                  <circle key={q.w} cx={x(q.w)} cy={y(q.p)} r={2.6} fill="#E39B2D" />
                ) : null,
              )}
              {valid.length > 0 && !valid[valid.length - 1].out && (
                <circle cx={x(valid[valid.length - 1].w)} cy={y(valid[valid.length - 1].p)} r={2.2} fill="#2A2E33" />
              )}
            </svg>
          </div>
        );
      })}
      <div className="label" style={{ display: "flex", justifyContent: "space-between", marginTop: 4 }}>
        <span>WEEK 1</span>
        <span>WEEK {n}</span>
      </div>
    </div>
  );
}
