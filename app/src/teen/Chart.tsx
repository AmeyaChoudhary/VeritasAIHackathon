import { CONFIG } from "../engine/config";
import { SIGNALS, type SignalId, type WeekRecord } from "../engine/types";
import { Icon, SIGNAL_ICON, SIGNAL_NAME } from "../ui/icons";

export type SignalState = "learning" | "in" | "out" | "none";

const STATE_WORD: Record<SignalState, string> = {
  learning: "Learning",
  in: "In range",
  out: "Drifting",
  none: "No data yet",
};

const STATE_COLOR: Record<SignalState, string> = {
  learning: "var(--idle)",
  in: "var(--sage)",
  out: "var(--amber)",
  none: "var(--idle)",
};

/** The signals to draw, in a fixed order, and where each one stands in the latest week. */
export function signalStates(weeks: WeekRecord[], signals?: SignalId[]): { sig: SignalId; state: SignalState }[] {
  const present = SIGNALS.filter((k) => (!signals || signals.includes(k)) && weeks.some((r) => typeof r.data.values[k] === "number"));
  const rows = present.length ? present : (["sleep", "reaching_out", "activity", "tone"] as SignalId[]);
  const last = weeks[weeks.length - 1];
  return rows.map((sig) => ({
    sig,
    state: !last ? "none" : last.learning.includes(sig) ? "learning" : last.out.includes(sig) ? "out" : "in",
  }));
}

/** One arc per signal: sage in range, amber outside, grey while learning. Words sit in the middle. */
export function SignalRing({
  states,
  week,
  status,
  sub,
}: {
  states: { sig: SignalId; state: SignalState }[];
  week: string;
  status: string;
  sub?: string;
}) {
  const S = 216;
  const R = 92;
  const C = 2 * Math.PI * R;
  const n = Math.max(1, states.length);
  const gap = n > 1 ? Math.min(16, C / n / 3) : 0;
  const seg = C / n - gap;
  const label = states.map((s) => `${SIGNAL_NAME[s.sig]}: ${STATE_WORD[s.state].toLowerCase()}`).join(", ");
  return (
    <div className="ring" role="img" aria-label={`${week}. ${status}${sub ? `, ${sub}` : ""}. ${label}.`}>
      <svg viewBox={`0 0 ${S} ${S}`} width={S} height={S} aria-hidden="true">
        <circle cx={S / 2} cy={S / 2} r={R} fill="none" stroke="rgba(21,23,26,0.05)" strokeWidth={12} />
        <g transform={`rotate(-90 ${S / 2} ${S / 2})`}>
          {states.map((s, i) => (
            <circle
              key={s.sig}
              className="ring-seg"
              cx={S / 2}
              cy={S / 2}
              r={R}
              fill="none"
              strokeWidth={12}
              strokeLinecap="round"
              stroke={STATE_COLOR[s.state]}
              strokeDasharray={`${seg} ${C - seg}`}
              strokeDashoffset={-(i * (seg + gap) + gap / 2)}
              style={{ animationDelay: `${i * 70}ms` }}
            />
          ))}
        </g>
      </svg>
      <div className="ring-center" aria-hidden="true">
        <span className="label">{week}</span>
        <span className="ring-status" key={status}>
          {status}
        </span>
        {sub && <span className="ring-sub">{sub}</span>}
      </div>
    </div>
  );
}

const W = 150;
const H = 44;
const MID = 22;
const PX = 5.4; // pixels per spread

/** One row per signal: icon, name, state, and the weeks so far drawn inside the student's own
 *  range. Distance is in the student's own spreads, better weeks up. Drifted weeks are amber. */
export function SignalRows({ weeks, total = 12, signals }: { weeks: WeekRecord[]; total?: number; signals?: SignalId[] }) {
  const n = Math.max(total, weeks.length);
  const x = (w: number) => 6 + ((w - 1) * (W - 12)) / (n - 1);
  const y = (p: number) => MID - Math.max(-3.2, Math.min(2.8, p)) * PX;
  const states = signalStates(weeks, signals);

  return (
    <div className="sig-list" aria-label="Your signals by week" role="group">
      {states.map(({ sig, state }) => {
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
        let band = "";
        if (valid.length) {
          const up = valid.map((q) => `${x(q.w).toFixed(1)},${y(q.haze).toFixed(1)}`);
          const down = [...valid].reverse().map((q) => `${x(q.w).toFixed(1)},${y(-q.haze).toFixed(1)}`);
          const first = valid[0];
          const lastV = valid[valid.length - 1];
          band = `M${x(first.w) - 5},${y(first.haze)} L${up.join(" L")} L${x(lastV.w) + 5},${y(lastV.haze)} L${x(lastV.w) + 5},${y(-lastV.haze)} L${down.join(" L")} L${x(first.w) - 5},${y(-first.haze)} Z`;
        }
        const segs: { key: number; d: string; amber: boolean }[] = [];
        for (let i = 1; i < pts.length; i++) {
          const a = pts[i - 1];
          const b = pts[i];
          if (Number.isNaN(a.p) || Number.isNaN(b.p)) continue;
          segs.push({ key: b.w, d: `M${x(a.w).toFixed(1)},${y(a.p).toFixed(1)} L${x(b.w).toFixed(1)},${y(b.p).toFixed(1)}`, amber: b.out });
        }
        const tip = valid[valid.length - 1];
        return (
          <div className={`sig-row is-${state}`} key={sig}>
            <span className="sig-icon">
              <Icon name={SIGNAL_ICON[sig]} size={18} />
            </span>
            <span className="sig-text">
              <span className="sig-name">{SIGNAL_NAME[sig]}</span>
              <span className="sig-state">{STATE_WORD[state]}</span>
            </span>
            <svg className="sig-spark" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`${SIGNAL_NAME[sig]}: ${STATE_WORD[state].toLowerCase()}`}>
              {band && <path d={band} className="spark-band" />}
              <line x1={2} x2={W - 2} y1={MID} y2={MID} className="spark-mid" />
              {segs.map((s) => (
                <path key={s.key} d={s.d} pathLength={1} className={`spark-line${s.amber ? " amber" : ""}`} />
              ))}
              {pts.map((q) =>
                Number.isNaN(q.p) ? (
                  <circle key={q.w} cx={x(q.w)} cy={MID} r={1.3} className="spark-gap" />
                ) : q.out && q !== tip ? (
                  <circle key={q.w} cx={x(q.w)} cy={y(q.p)} r={2.2} className="spark-dot amber" />
                ) : null,
              )}
              {tip && <circle key={`tip-${tip.w}`} cx={x(tip.w)} cy={y(tip.p)} r={3.6} className={`spark-tip is-${state}`} />}
            </svg>
          </div>
        );
      })}
    </div>
  );
}

/** Kept for callers that want the rows under their old name. */
export const SignalChart = SignalRows;
