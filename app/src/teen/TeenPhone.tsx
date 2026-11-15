import { useEffect, useState } from "react";
import { useSnap, useStore } from "../store/hooks";
import { ProtoLine } from "../ui/common";
import { TeenPair } from "./Pair";
import { Disclosure } from "./Setup";
import { Questions } from "./Questions";
import { Home } from "./Home";
import { TypeScreen } from "./Type";
import { AreYouSafe, Crisis } from "./Safety";
import { Help } from "./Help";
import { Settings } from "./Settings";
import { Connect } from "./Connect";
import type { SourceId } from "../engine/types";
import { TeenTop } from "./Top";
import { Icon, type IconName } from "../ui/icons";

type Tab = "home" | "type" | "connect" | "settings";

const TABS: { id: Tab; label: string; icon: IconName }[] = [
  { id: "home", label: "Home", icon: "home" },
  { id: "type", label: "Type", icon: "keyboard" },
  { id: "connect", label: "Connect", icon: "link" },
  { id: "settings", label: "Settings", icon: "gear" },
];

export function TeenPhone() {
  const snap = useSnap();
  const store = useStore();
  const teen = snap.sim.world.teen;
  const [tab, setTab] = useState<Tab>("home");
  const [help, setHelp] = useState(false);
  const [checkin, setCheckin] = useState(false);
  const [typed, setTyped] = useState<{ text: string; key: number } | null>(null);
  const [connectTo, setConnectTo] = useState<{ source: SourceId | null; key: number }>({ source: null, key: 0 });

  // A scripted message from the demo shows up on the Type screen, then fades.
  useEffect(
    () =>
      store.onBus((b) => {
        if (b.type === "typed") {
          setTab("type");
          setHelp(false);
          setTyped({ text: b.text, key: Date.now() });
        }
      }),
    [store],
  );

  let body: React.ReactNode;
  let showTabs = false;
  if (!teen.paired) body = <TeenPair />;
  else if (!teen.acknowledged) body = <Disclosure />;
  else if (!teen.setupDone) body = <Questions mode="setup" onDone={() => setTab("home")} />;
  else if (checkin) body = <Questions mode="check" onDone={() => setCheckin(false)} />;
  else {
    showTabs = true;
    body =
      tab === "home" ? (
        <Home onStart={() => setCheckin(true)} />
      ) : tab === "type" ? (
        <TypeScreen incoming={typed} />
      ) : tab === "connect" ? (
        <Connect key={connectTo.key} initial={connectTo.source} />
      ) : (
        <Settings
          onOpenConnect={(source) => {
            setConnectTo({ source, key: Date.now() });
            setTab("connect");
          }}
        />
      );
  }

  const safety = teen.safety.screen;

  return (
    <div className="phone" aria-label={`${teen.people.teen}'s phone`}>
      <TeenTop onHelp={() => setHelp((h) => !h)} helpOpen={help} />
      <div className="phone-body">{body}</div>
      <ProtoLine />
      {showTabs && (
        <nav className="tabs" aria-label="Stability">
          {TABS.map((t) => (
            <button
              key={t.id}
              aria-current={tab === t.id ? "page" : undefined}
              onClick={() => {
                if (t.id === "connect") setConnectTo({ source: null, key: Date.now() });
                setTab(t.id);
              }}
            >
              <Icon name={t.icon} size={20} />
              <span>{t.label}</span>
            </button>
          ))}
        </nav>
      )}
      {safety === "ask" && <AreYouSafe onMore={() => setHelp(true)} />}
      {(safety === "help" || safety === "emergency") && <Crisis emergency={safety === "emergency"} onMore={() => setHelp(true)} />}
      {help && <Help onClose={() => setHelp(false)} />}
    </div>
  );
}
