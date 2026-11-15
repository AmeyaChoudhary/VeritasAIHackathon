import { useMemo, useState } from "react";
import { CSV_TEMPLATE, parseBodyCsv, parseSpotify, type BodyWeek, type MusicWeek } from "../engine/importers";

function MiniLine({ values, label, unit }: { values: (number | null)[]; label: string; unit: string }) {
  const W = 320;
  const H = 56;
  const nums = values.filter((v): v is number => v != null);
  if (!nums.length) return null;
  const min = Math.min(...nums);
  const max = Math.max(...nums);
  const pad = (max - min) * 0.15 || 1;
  const x = (i: number) => 6 + (i * (W - 12)) / Math.max(1, values.length - 1);
  const y = (v: number) => H - 6 - ((v - (min - pad)) / (max - min + 2 * pad)) * (H - 12);
  let d = "";
  values.forEach((v, i) => {
    if (v == null) return;
    d += `${d && values[i - 1] != null ? "L" : "M"}${x(i).toFixed(1)},${y(v).toFixed(1)} `;
  });
  const mean = nums.reduce((a, b) => a + b, 0) / nums.length;
  return (
    <div className="chart-row">
      <div className="label">
        <span>{label}</span>
        <span>
          USUAL {mean.toFixed(unit === "STEPS" ? 0 : 1)} {unit}
        </span>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`${label} by week, ${values.length} weeks`}>
        <path d={d} fill="none" stroke="#444A52" strokeWidth={1} />
      </svg>
    </div>
  );
}

export function ImportData() {
  const [music, setMusic] = useState<{ weeks: MusicWeek[]; plays: number } | null>(null);
  const [body, setBody] = useState<{ weeks: BodyWeek[]; rows: number } | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const templateHref = useMemo(() => `data:text/csv;charset=utf-8,${encodeURIComponent(CSV_TEMPLATE)}`, []);

  const read = async (file: File | undefined, kind: "music" | "body") => {
    if (!file) return;
    setErr(null);
    try {
      const text = await file.text();
      if (kind === "music") setMusic(parseSpotify(text));
      else setBody(parseBodyCsv(text));
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not read that file.");
    }
  };

  const mw = music?.weeks.slice(-26) ?? [];
  const bw = body?.weeks.slice(-26) ?? [];

  return (
    <div>
      <p className="label">Import my data</p>
      <h1 className="title" style={{ fontSize: 20 }}>
        Give Steady your normal on day one.
      </h1>
      <p className="small">Files are read in this browser. Nothing is uploaded.</p>

      <label className="field">
        <span className="label">Spotify listening history (.json)</span>
        <input type="file" accept=".json,application/json" onChange={(e) => read(e.target.files?.[0], "music")} />
      </label>
      <label className="field">
        <span className="label">Sleep and steps (.csv)</span>
        <input type="file" accept=".csv,text/csv" onChange={(e) => read(e.target.files?.[0], "body")} />
      </label>
      <p className="small">
        <a href={templateHref} download="steady-sleep-steps-template.csv">
          Get the CSV template
        </a>{" "}
        <span className="muted">(date,sleep_hours,steps)</span>
      </p>

      {err && (
        <p className="card small" role="alert">
          {err}
        </p>
      )}

      {music && (
        <section className="card" aria-label="Music">
          <p className="small" style={{ marginTop: 0 }}>
            {music.plays} plays over {music.weeks.length} weeks.
          </p>
          <MiniLine values={mw.map((w) => w.hours)} label="LISTENING A WEEK" unit="H" />
          <MiniLine values={mw.map((w) => w.hours * w.afterMidnight)} label="AFTER MIDNIGHT" unit="H" />
        </section>
      )}
      {body && (
        <section className="card" aria-label="Sleep and steps">
          <p className="small" style={{ marginTop: 0 }}>
            {body.rows} days over {body.weeks.length} weeks. {body.weeks.filter((w) => w.days < 4).length} weeks have under 4 days and would be left out.
          </p>
          <MiniLine values={bw.map((w) => w.sleep)} label="SLEEP" unit="H" />
          <MiniLine values={bw.map((w) => w.steps)} label="ACTIVITY" unit="STEPS" />
        </section>
      )}
      {(music || body) && <p className="mono small" style={{ marginTop: 10 }}>Read on this phone. Nothing was uploaded.</p>}
    </div>
  );
}
