import { useSnap } from "../store/hooks";
import { ProtoLine } from "../ui/common";
import { TeenTop } from "./Top";
import { Icon } from "../ui/icons";

/** Always one tap away. */
export function Help({ onClose }: { onClose: () => void }) {
  const snap = useSnap();
  const parent = snap.sim.world.teen.people.parent;
  return (
    <div className="overlay" role="dialog" aria-modal="true" aria-labelledby="help-h">
      <TeenTop onHelp={onClose} helpOpen />
      <div className="phone-body">
        <h1 id="help-h" className="display">
          Help
        </h1>
        <div className="card help-988">
          <p className="label">988 Suicide and Crisis Lifeline</p>
          <div className="btn-row">
            <a className="btn btn-primary btn-lg" href="tel:988">
              Call 988
            </a>
            <a className="btn btn-primary btn-lg" href="sms:988">
              Text 988
            </a>
          </div>
        </div>
        <ul className="rows help-rows">
          <li>
            <span className="badge">
              <Icon name="alert" />
            </span>
            <span>
              <b>If you've hurt yourself or taken something, call 911.</b>
              <a className="btn btn-sm" href="tel:911">
                Call 911
              </a>
            </span>
          </li>
          <li>
            <span className="badge">
              <Icon name="chat" />
            </span>
            <span>
              <b>If you want to reach out first.</b>
              <a className="btn btn-sm" href="sms:">
                Message {parent}
              </a>
            </span>
          </li>
          <li>
            <span className="badge">
              <Icon name="life" />
            </span>
            <span>
              <b>The Trevor Project</b>
              <span className="row-text">For LGBTQ young people.</span>
              <span className="btn-row">
                <a className="btn btn-sm" href="tel:18664887386">
                  Call 1-866-488-7386
                </a>
                <a className="btn btn-sm" href="sms:678678?&body=START">
                  Text START to 678-678
                </a>
              </span>
            </span>
          </li>
          <li>
            <span className="badge">
              <Icon name="home" />
            </span>
            <span>
              <b>The Childhelp hotline</b>
              <span className="row-text">If you are not safe at home.</span>
              <a className="btn btn-sm" href="tel:18004224453">
                Call 1-800-422-4453
              </a>
            </span>
          </li>
        </ul>
        <button className="btn btn-block" style={{ marginTop: 14 }} onClick={onClose}>
          Close
        </button>
      </div>
      <ProtoLine />
    </div>
  );
}
