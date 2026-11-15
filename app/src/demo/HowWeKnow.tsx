import { useEffect, useState } from "react";

type Json = Record<string, unknown>;

function get(o: unknown, path: string): unknown {
  return path.split(".").reduce<unknown>((acc, k) => (acc && typeof acc === "object" ? (acc as Json)[k] : undefined), o);
}

function pct(v: unknown): string {
  return typeof v === "number" && Number.isFinite(v) ? `${Math.round(v * 100)}%` : "n/a";
}

function num(v: unknown, digits = 2): string {
  return typeof v === "number" && Number.isFinite(v) ? (Number.isInteger(v) ? String(v) : v.toFixed(digits)) : "n/a";
}

function useJson(url: string): { data: Json | null; state: "loading" | "ready" | "missing" } {
  const [s, setS] = useState<{ data: Json | null; state: "loading" | "ready" | "missing" }>({ data: null, state: "loading" });
  useEffect(() => {
    let alive = true;
    fetch(url)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((j) => alive && setS({ data: j && typeof j === "object" ? (j as Json) : null, state: j ? "ready" : "missing" }))
      .catch(() => alive && setS({ data: null, state: "missing" }));
    return () => {
      alive = false;
    };
  }, [url]);
  return s;
}

function Caveats({ v }: { v: unknown }) {
  if (!Array.isArray(v) || !v.length) return null;
  return (
    <details className="small">
      <summary className="label" style={{ cursor: "pointer", minHeight: 36, display: "flex", alignItems: "center" }}>
        Caveats ({v.length})
      </summary>
      <ul style={{ paddingLeft: 18, margin: "6px 0" }}>
        {v.map((c, i) => (
          <li key={i}>{String(c)}</li>
        ))}
      </ul>
    </details>
  );
}

/** Headlines from the two experiments, read at runtime from public/data. */
export function HowWeKnow() {
  const e1 = useJson("./data/exp1_summary.json");
  const e2 = useJson("./data/exp2_summary.json");
  return (
    <div>
      <section className="card" style={{ margin: "0 0 10px" }}>
        <p className="label" style={{ margin: 0 }}>
          Experiment 1 · Timing
        </p>
        {e1.state === "loading" ? (
          <p className="small muted">Loading.</p>
        ) : !e1.data ? (
          <p className="small muted">Results pending.</p>
        ) : (
          <>
            {typeof e1.data.headline === "string" && <p style={{ margin: "6px 0" }}>{e1.data.headline}</p>}
            <dl className="kv">
              <dt>Students</dt>
              <dd>{num(get(e1.data, "students"), 0)}</dd>
              <dt>Base rate</dt>
              <dd>{pct(get(e1.data, "base_rate"))}</dd>
              <dt>Asks per student-year</dt>
              <dd>{num(get(e1.data, "ask_comparison.budget_asks_per_student_year"), 1)}</dd>
              <dt>Hit rate: Steady rule</dt>
              <dd>{pct(get(e1.data, "ask_comparison.steady_rule.hit_rate"))}</dd>
              <dt>Hit rate: fixed calendar</dt>
              <dd>{pct(get(e1.data, "ask_comparison.fixed_calendar.hit_rate"))}</dd>
              <dt>Hit rate: random</dt>
              <dd>{pct(get(e1.data, "ask_comparison.random.hit_rate"))}</dd>
              <dt>Logistic AUC</dt>
              <dd>{num(get(e1.data, "ask_comparison.logistic.auc"))}</dd>
              <dt>Heads-ups per student-year</dt>
              <dd>{num(get(e1.data, "heads_up.alerts_per_student_year"), 2)}</dd>
              <dt>Heads-up hit rate vs calendar</dt>
              <dd>
                {pct(get(e1.data, "heads_up.hit_rate"))} vs {pct(get(e1.data, "heads_up.calendar_hit_rate"))}
              </dd>
              <dt>Weeks out / cooldown</dt>
              <dd>
                {num(get(e1.data, "heads_up.weeks_out"), 0)} / {num(get(e1.data, "heads_up.cooldown_weeks"), 0)}
              </dd>
            </dl>
            <Caveats v={e1.data.caveats} />
          </>
        )}
      </section>
      <section className="card" style={{ margin: 0 }}>
        <p className="label" style={{ margin: 0 }}>
          Experiment 2 · Words
        </p>
        {e2.state === "loading" ? (
          <p className="small muted">Loading.</p>
        ) : !e2.data ? (
          <p className="small muted">Results pending.</p>
        ) : (
          <>
            {typeof e2.data.headline === "string" && <p style={{ margin: "6px 0" }}>{e2.data.headline}</p>}
            <dl className="kv">
              <dt>Tone model precision / recall</dt>
              <dd>
                {num(get(e2.data, "model.precision"))} / {num(get(e2.data, "model.recall"))}
              </dd>
              <dt>Keyword baseline</dt>
              <dd>
                {num(get(e2.data, "baseline_keyword.precision"))} / {num(get(e2.data, "baseline_keyword.recall"))}
              </dd>
              <dt>Self-harm false flags</dt>
              <dd>
                {num(get(e2.data, "selfharm.false_flags"), 0)} of {num(get(e2.data, "selfharm.false_flag_pool"), 0)}
              </dd>
              <dt>Self-harm missed</dt>
              <dd>
                {num(get(e2.data, "selfharm.missed"), 0)} of {num(get(e2.data, "selfharm.risk_pool"), 0)}
              </dd>
            </dl>
            <Caveats v={e2.data.caveats} />
          </>
        )}
      </section>
    </div>
  );
}
