import { useSnap } from "../store/hooks";
import { cantReachText } from "../engine/notes";

export function CantReach() {
  const snap = useSnap();
  const t = cantReachText(snap.sim.world.teen.people);
  return (
    <div className="fade-in">
      <p className="label">Urgent</p>
      <h1 className="title">{t.title}</h1>
      {t.lines.map((l) => (
        <p key={l} className="lede">
          {l}
        </p>
      ))}
      <div className="btn-col" style={{ marginTop: 18 }}>
        <a className="btn btn-primary" href="tel:911">
          Call 911
        </a>
        <a className="btn" href="tel:988">
          Call 988 for advice
        </a>
      </div>
    </div>
  );
}
