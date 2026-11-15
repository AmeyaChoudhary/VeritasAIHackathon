import { useSnap, useStore } from "../store/hooks";
import { ProtoLine } from "../ui/common";
import { TeenTop } from "./Top";

function Lines988() {
  return (
    <div className="btn-col">
      <a className="btn btn-primary" href="tel:988">
        Call 988
      </a>
      <a className="btn" href="sms:988">
        Text 988
      </a>
    </div>
  );
}

/** Shown on "concern" words. 988 fills the screen behind the question. */
export function AreYouSafe({ onMore }: { onMore: () => void }) {
  const store = useStore();
  const answer = (a: "yes" | "no") => store.dispatch({ a: "teen", input: { kind: "safe", answer: a } });
  return (
    <div className="overlay crisis" role="alertdialog" aria-modal="true" aria-labelledby="safe-h">
      <TeenTop />
      <div className="phone-body">
        <h1 id="safe-h" className="sentence" style={{ fontSize: 32, marginTop: 4 }}>
          Are you safe right now?
        </h1>
        <div className="btn-row" style={{ marginBottom: 26 }}>
          <button className="btn btn-primary" style={{ minWidth: 120 }} onClick={() => answer("yes")}>
            Yes
          </button>
          <button className="btn" style={{ minWidth: 120 }} onClick={() => answer("no")}>
            No
          </button>
        </div>
        <p className="label">988 Suicide and Crisis Lifeline</p>
        <p className="big-number" aria-hidden="true">
          988
        </p>
        <p className="muted">Free and open all day and night. You can call or text.</p>
        <Lines988 />
        <button className="btn btn-quiet btn-block" style={{ marginTop: 14, color: "inherit" }} onClick={onMore}>
          More help
        </button>
      </div>
      <ProtoLine />
    </div>
  );
}

/** 988 full screen. With "plan" words, 911 comes first. */
export function Crisis({ emergency, onMore }: { emergency: boolean; onMore: () => void }) {
  const store = useStore();
  const snap = useSnap();
  const parent = snap.sim.world.teen.people.parent;
  return (
    <div className="overlay crisis" role="alertdialog" aria-modal="true" aria-labelledby="crisis-h">
      <TeenTop />
      <div className="phone-body">
        {emergency && (
          <>
            <h1 id="crisis-h" className="sentence" style={{ fontSize: 28 }}>
              If you've hurt yourself or taken something, call 911 now.
            </h1>
            <a className="btn btn-primary btn-block" href="tel:911" style={{ marginBottom: 22 }}>
              Call 911
            </a>
          </>
        )}
        <p className="label">988 Suicide and Crisis Lifeline</p>
        <p className="big-number" aria-hidden="true">
          988
        </p>
        {!emergency && (
          <h1 id="crisis-h" className="sentence" style={{ fontSize: 22 }}>
            You can talk to someone right now.
          </h1>
        )}
        <p className="muted">Free and open all day and night. You can call or text.</p>
        <Lines988 />
        <div className="btn-col" style={{ marginTop: 10 }}>
          <a className="btn" href="sms:">
            Message {parent}
          </a>
          <button className="btn" onClick={onMore}>
            More help
          </button>
          <button className="btn btn-quiet" style={{ color: "inherit" }} onClick={() => store.dispatch({ a: "teen", input: { kind: "dismiss", what: "safety" } })}>
            Back to Steady
          </button>
        </div>
      </div>
      <ProtoLine />
    </div>
  );
}
