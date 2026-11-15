import { useSnap, useStore } from "../store/hooks";
import { ProtoLine } from "../ui/common";
import { TeenTop } from "./Top";
import { Icon } from "../ui/icons";

function Lines988() {
  return (
    <div className="btn-col">
      <a className="btn btn-primary btn-lg" href="tel:988">
        Call 988
      </a>
      <a className="btn btn-lg" href="sms:988">
        Text 988
      </a>
    </div>
  );
}

function Lifeline() {
  return (
    <div className="lifeline">
      <p className="label">988 Suicide and Crisis Lifeline</p>
      <p className="big-number" aria-hidden="true">
        988
      </p>
      <p className="muted">Free and open all day and night. You can call or text.</p>
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
        <h1 id="safe-h" className="display crisis-h">
          Are you safe right now?
        </h1>
        <div className="yesno">
          <button className="btn btn-primary btn-lg" onClick={() => answer("yes")}>
            Yes
          </button>
          <button className="btn btn-lg" onClick={() => answer("no")}>
            No
          </button>
        </div>
        <Lifeline />
        <Lines988 />
        <button className="btn btn-quiet btn-block" style={{ marginTop: 10 }} onClick={onMore}>
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
          <div className="card crisis-card">
            <h1 id="crisis-h" className="title">
              If you've hurt yourself or taken something, call 911 now.
            </h1>
            <a className="btn btn-primary btn-lg btn-block" href="tel:911">
              <Icon name="alert" size={18} />
              Call 911
            </a>
          </div>
        )}
        {!emergency && (
          <h1 id="crisis-h" className="display crisis-h">
            You can talk to someone right now.
          </h1>
        )}
        <Lifeline />
        <Lines988 />
        <div className="btn-col" style={{ marginTop: 10 }}>
          <a className="btn" href="sms:">
            Message {parent}
          </a>
          <button className="btn" onClick={onMore}>
            More help
          </button>
          <button className="btn btn-quiet" onClick={() => store.dispatch({ a: "teen", input: { kind: "dismiss", what: "safety" } })}>
            Back to Steady
          </button>
        </div>
      </div>
      <ProtoLine />
    </div>
  );
}
