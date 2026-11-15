import { useCurrentFrame } from "remotion";
import media from "../media.json";
import { F } from "../theme";
import { timing, Word } from "../timing";

type Line = { words: Word[]; s: number; e: number };
const buildLines = (): Line[] => {
  const out: Line[] = [];
  for (const sct of timing.sections) {
    let cur: Word[] = [];
    const flush = () => { if (cur.length) out.push({ words: cur, s: cur[0].s, e: cur[cur.length - 1].e }); cur = []; };
    for (const w of sct.words) {
      cur.push(w);
      const len = cur.map((x) => x.w).join(" ").length;
      if ((/[.,:;?!]$/.test(w.w) && len > 22) || len > 46) flush();
    }
    flush();
  }
  return out;
};
const LINES = buildLines();

/** One short line of the narration at a time; each word brightens as it is spoken. */
export const Captions: React.FC = () => {
  const frame = useCurrentFrame();
  if (!media.captions) return null;
  const t = frame / 30;
  const line = LINES.find((l, i) => t >= l.s - 0.08 && t < (LINES[i + 1] ? Math.min(LINES[i + 1].s - 0.08, l.e + 0.6) : l.e + 0.6));
  if (!line) return null;
  return (
    <div style={{ position: "absolute", left: 0, right: 0, bottom: 40, display: "flex", justifyContent: "center", pointerEvents: "none" }}>
      <div style={{ maxWidth: 1100, padding: "11px 24px", borderRadius: 16, background: "rgba(16,18,21,0.82)", fontFamily: F.body, fontWeight: 500, fontSize: 30, lineHeight: 1.25, color: "#fff", textAlign: "center" }}>
        {line.words.map((w, i) => (
          <span key={i} style={{ opacity: t >= w.s - 0.05 ? 1 : 0.5 }}>{w.w}{i < line.words.length - 1 ? " " : ""}</span>
        ))}
      </div>
    </div>
  );
};
