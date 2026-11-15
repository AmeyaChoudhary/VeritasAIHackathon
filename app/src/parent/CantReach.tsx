import { useSnap } from "../store/hooks";
import { cantReachText } from "../engine/notes";
import { Icon } from "../ui/icons";

export function CantReach() {
  const snap = useSnap();
  const t = cantReachText(snap.sim.world.teen.people);
  return (
    <div className="rise">
      <p className="label note-kind">
        <i className="pulse-dot urgent" aria-hidden="true" />
        Urgent
      </p>
      <h1 className="display">{t.title}</h1>
      <ul className="rows">
        {t.lines.map((l) => (
          <li key={l}>
            <span className="badge">
              <Icon name="arrow" />
            </span>
            <span>
              <b>{l}</b>
            </span>
          </li>
        ))}
      </ul>
      <div className="btn-col" style={{ marginTop: 18 }}>
        <a className="btn btn-primary btn-lg" href="tel:911">
          Call 911
        </a>
        <a className="btn btn-lg" href="tel:988">
          Call 988 for advice
        </a>
      </div>
    </div>
  );
}
