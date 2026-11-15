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

/** Headlines from the experiments, read at runtime from public/data. */
export function HowWeKnow() {
  const e1 = useJson("./data/exp1_summary.json");
  const e2 = useJson("./data/exp2_summary.json");
  const e3 = useJson("./data/exp3_summary.json");
  const e4 = useJson("./data/exp4_summary.json");
  const e5 = useJson("./data/exp5_summary.json");
  const e5b = useJson("./data/exp5b_summary.json");
  const e6 = useJson("./data/exp6_summary.json");
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
      <section className="card" style={{ margin: "0 0 10px" }}>
        <p className="label" style={{ margin: 0 }}>
          Experiment 3 · Asking
        </p>
        {e3.state === "loading" ? (
          <p className="small muted">Loading.</p>
        ) : !e3.data ? (
          <p className="small muted">Results pending.</p>
        ) : (
          <>
            {typeof e3.data.headline === "string" && <p style={{ margin: "6px 0" }}>{e3.data.headline}</p>}
            <dl className="kv">
              <dt>Asks per student-year</dt>
              <dd>{num(get(e3.data, "budget_asks_per_student_year"), 0)}</dd>
              <dt>Hit rate: fixed calendar</dt>
              <dd>{pct(get(e3.data, "methods.checkin_one.calendar_hit_rate"))}</dd>
              <dt>Hit rate: phone model</dt>
              <dd>{pct(get(e3.data, "methods.phone.hit_rate"))}</dd>
              <dt>Hit rate: one check-in</dt>
              <dd>{pct(get(e3.data, "methods.checkin_one.hit_rate"))}</dd>
              <dt>Random weeks, same student and quarter</dt>
              <dd>{pct(get(e3.data, "methods.checkin_one.matched_random_hit_rate"))}</dd>
              <dt>One check-in AUC: women / men</dt>
              <dd>
                {num(get(e3.data, "groups.gender.Women.checkin_auc"))} / {num(get(e3.data, "groups.gender.Men.checkin_auc"))}
              </dd>
            </dl>
            <Caveats v={e3.data.caveats} />
          </>
        )}
      </section>
      <section className="card" style={{ margin: "0 0 10px" }}>
        <p className="label" style={{ margin: 0 }}>
          Experiment 4 · The ask model this app runs
        </p>
        {e4.state === "loading" ? (
          <p className="small muted">Loading.</p>
        ) : !e4.data ? (
          <p className="small muted">Results pending.</p>
        ) : (
          <>
            {typeof e4.data.headline === "string" && <p style={{ margin: "6px 0" }}>{e4.data.headline}</p>}
            <dl className="kv">
              <dt>Students</dt>
              <dd>{num(get(e4.data, "students"), 0)}</dd>
              <dt>AUC, students never seen</dt>
              <dd>{num(get(e4.data, "auc"))}</dd>
              <dt>Hit rate: ask model</dt>
              <dd>{pct(get(e4.data, "hit_rate"))}</dd>
              <dt>Hit rate: fixed calendar</dt>
              <dd>{pct(get(e4.data, "calendar_hit_rate"))}</dd>
              <dt>Random weeks, same student and quarter</dt>
              <dd>{pct(get(e4.data, "matched_random_hit_rate"))}</dd>
              <dt>High weeks missed</dt>
              <dd>
                {num(get(e4.data, "high_weeks_missed"), 0)} of {num(get(e4.data, "high_weeks"), 0)}
              </dd>
              <dt>False alarms</dt>
              <dd>{num(get(e4.data, "false_alarms"), 0)}</dd>
              <dt>Check-in alone / answers alone AUC</dt>
              <dd>
                {num(get(e4.data, "checkin_only_auc"))} / {num(get(e4.data, "answers_only_auc"))}
              </dd>
            </dl>
            <Caveats v={e4.data.caveats} />
          </>
        )}
      </section>
      <section className="card" style={{ margin: "0 0 10px" }}>
        <p className="label" style={{ margin: 0 }}>
          Experiment 6 · The ask model on teenagers
        </p>
        {e6.state === "loading" ? (
          <p className="small muted">Loading.</p>
        ) : !e6.data ? (
          <p className="small muted">Results pending.</p>
        ) : (
          <>
            {typeof e6.data.headline === "string" && <p style={{ margin: "6px 0" }}>{e6.data.headline}</p>}
            <dl className="kv">
              <dt>Teens aged 12 to 17</dt>
              <dd>{num(get(e6.data, "teens"), 0)}</dd>
              <dt>AUC, unchanged model</dt>
              <dd>{num(get(e6.data, "auc"))}</dd>
              <dt>Top asks high / at random</dt>
              <dd>
                {pct(get(e6.data, "hit_rate"))} / {pct(get(e6.data, "base_rate"))}
              </dd>
              <dt>AUC: girls / boys</dt>
              <dd>
                {num(get(e6.data, "groups.Girls"))} / {num(get(e6.data, "groups.Boys"))}
              </dd>
            </dl>
            <Caveats v={e6.data.caveats} />
          </>
        )}
      </section>
      <section className="card" style={{ margin: "0 0 10px" }}>
        <p className="label" style={{ margin: 0 }}>
          Experiment 5 · Self-harm words
        </p>
        {e5.state === "loading" ? (
          <p className="small muted">Loading.</p>
        ) : !e5.data ? (
          <p className="small muted">Results pending.</p>
        ) : (
          <>
            {typeof e5.data.headline === "string" && <p style={{ margin: "6px 0" }}>{e5.data.headline}</p>}
            <dl className="kv">
              <dt>Held-out posts: model precision / recall</dt>
              <dd>
                {pct(get(e5.data, "test_precision_model"))} / {pct(get(e5.data, "test_recall_model"))}
              </dd>
              <dt>Phrase list precision / recall</dt>
              <dd>
                {pct(get(e5.data, "test_precision_phrase"))} / {pct(get(e5.data, "test_recall_phrase"))}
              </dd>
              <dt>Our messages found: both / phrase list</dt>
              <dd>
                {num(get(e5.data, "ours_found_either"), 0)} / {num(get(e5.data, "ours_found_phrase"), 0)} of {num(get(e5.data, "ours_self_harm"), 0)}
              </dd>
              <dt>Our messages false alarms: both / phrase list</dt>
              <dd>
                {num(get(e5.data, "ours_false_alarms_either"), 0)} / {num(get(e5.data, "ours_false_alarms_phrase"), 0)}
              </dd>
            </dl>
            <Caveats v={e5.data.caveats} />
            {e5b.data && typeof e5b.data.headline === "string" && (
              <p className="small" style={{ margin: "8px 0 0" }}>
                <b>Psychiatrist labels (5b).</b> {e5b.data.headline} So a flag from the model alone only asks the teen.
              </p>
            )}
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
