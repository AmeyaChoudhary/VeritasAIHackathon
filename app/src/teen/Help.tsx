import { useSnap } from "../store/hooks";
import { ProtoLine } from "../ui/common";
import { TeenTop } from "./Top";

/** Always one tap away. */
export function Help({ onClose }: { onClose: () => void }) {
  const snap = useSnap();
  const parent = snap.sim.world.teen.people.parent;
  return (
    <div className="overlay" role="dialog" aria-modal="true" aria-labelledby="help-h">
      <TeenTop onHelp={onClose} helpOpen />
      <div className="phone-body">
        <h1 id="help-h" className="title">
          Help
        </h1>
        <div className="btn-row" style={{ marginBottom: 18 }}>
          <a className="btn btn-primary" href="tel:988">
            Call 988
          </a>
          <a className="btn btn-primary" href="sms:988">
            Text 988
          </a>
        </div>
        <ul className="help-list">
          <li>
            <p style={{ margin: "0 0 8px", fontWeight: 500 }}>If you've hurt yourself or taken something, call 911.</p>
            <a className="btn" href="tel:911">
              Call 911
            </a>
          </li>
          <li>
            <p style={{ margin: "0 0 8px" }}>If you want to reach out first.</p>
            <a className="btn" href="sms:">
              Message {parent}
            </a>
          </li>
          <li>
            <p style={{ margin: "0 0 8px" }}>
              <b>The Trevor Project</b>, for LGBTQ young people.
            </p>
            <div className="btn-row">
              <a className="btn" href="tel:18664887386">
                Call 1-866-488-7386
              </a>
              <a className="btn" href="sms:678678?&body=START">
                Text START to 678-678
              </a>
            </div>
          </li>
          <li>
            <p style={{ margin: "0 0 8px" }}>
              <b>The Childhelp hotline</b>, if you are not safe at home.
            </p>
            <a className="btn" href="tel:18004224453">
              Call 1-800-422-4453
            </a>
          </li>
        </ul>
        <button className="btn btn-block" style={{ marginTop: 18 }} onClick={onClose}>
          Close
        </button>
      </div>
      <ProtoLine />
    </div>
  );
}
