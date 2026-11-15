import { Icon } from "../ui/icons";

/** The doctor suggestion. 988 stays on screen. Nothing here says a note was sent. */
export function DoctorCard({ onOkay }: { onOkay?: () => void }) {
  return (
    <section className="card doc rise" aria-labelledby="doc-h">
      <div className="doc-head">
        <span className="badge">
          <Icon name="doctor" />
        </span>
        <p className="label">Worth a check</p>
      </div>
      <h2 id="doc-h" className="title">
        This is worth taking to a doctor.
      </h2>
      <p className="lede">A questionnaire is not a diagnosis. A doctor can help you sort it out.</p>
      <div className="btn-row">
        <a className="btn" href="tel:988">
          Call 988
        </a>
        <a className="btn" href="sms:988">
          Text 988
        </a>
        {onOkay && (
          <button className="btn btn-quiet" onClick={onOkay}>
            Okay
          </button>
        )}
      </div>
      <p className="small muted doc-foot">If you ever feel unsafe, 988 is here by call or text, any time.</p>
    </section>
  );
}
