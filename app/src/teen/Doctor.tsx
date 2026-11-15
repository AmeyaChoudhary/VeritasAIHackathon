/** The doctor suggestion. 988 stays on screen. Nothing here says a note was sent. */
export function DoctorCard({ onOkay }: { onOkay?: () => void }) {
  return (
    <section className="card fade-in" aria-labelledby="doc-h">
      <p className="label">Worth a check</p>
      <h2 id="doc-h" className="sentence" style={{ fontSize: 22, margin: "6px 0 10px" }}>
        This is worth taking to a doctor.
      </h2>
      <p>Steady can't tell what's going on, and a questionnaire is not a diagnosis. A doctor can help you sort it out.</p>
      <p className="muted">If you ever feel unsafe, 988 is here by call or text, any time.</p>
      <div className="btn-row" style={{ marginTop: 12 }}>
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
    </section>
  );
}
