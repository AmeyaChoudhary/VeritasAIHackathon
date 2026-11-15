import { useEffect, useState } from "react";
import { DemoShell, Device, AlertsCaption } from "./demo/DemoShell";
import { ControlRail } from "./demo/ControlRail";
import { TeenPhone } from "./teen/TeenPhone";
import { ParentPhone } from "./parent/ParentPhone";
import { OtherPhones } from "./parent/Others";

type Route = "demo" | "teen" | "parent";

export function routeOf(hash: string): Route {
  if (hash.startsWith("#/teen")) return "teen";
  if (hash.startsWith("#/parent")) return "parent";
  return "demo";
}

function useRoute(): Route {
  const [r, setR] = useState(() => routeOf(window.location.hash));
  useEffect(() => {
    const f = () => setR(routeOf(window.location.hash));
    window.addEventListener("hashchange", f);
    return () => window.removeEventListener("hashchange", f);
  }, []);
  return r;
}

function useWide(): boolean {
  const q = "(min-width: 768px)";
  const [w, setW] = useState(() => window.matchMedia(q).matches);
  useEffect(() => {
    const m = window.matchMedia(q);
    const f = () => setW(m.matches);
    m.addEventListener("change", f);
    return () => m.removeEventListener("change", f);
  }, []);
  return w;
}

function useSoloScale(): number {
  const calc = () => Math.max(0.55, Math.min(1, (window.innerHeight - 60) / 820));
  const [s, setS] = useState(calc);
  useEffect(() => {
    const f = () => setS(calc());
    window.addEventListener("resize", f);
    return () => window.removeEventListener("resize", f);
  }, []);
  return s;
}

function Mobile() {
  const [v, setV] = useState<Route>("teen");
  return (
    <div className="mobile">
      <div className="mobile-main">
        {v === "teen" ? (
          <TeenPhone />
        ) : v === "parent" ? (
          <ParentPhone />
        ) : (
          <div className="mobile-demo">
            <div className="btn-col" style={{ marginBottom: 12 }}>
              <AlertsCaption />
              <OtherPhones />
            </div>
            <ControlRail />
          </div>
        )}
      </div>
      <nav className="switch" aria-label="Show">
        {(["teen", "parent", "demo"] as Route[]).map((k) => (
          <button key={k} aria-pressed={v === k} onClick={() => setV(k)}>
            {k === "teen" ? "Teen" : k === "parent" ? "Parent" : "Demo"}
          </button>
        ))}
      </nav>
    </div>
  );
}

function Solo({ which }: { which: "teen" | "parent" }) {
  const wide = useWide();
  const scale = useSoloScale();
  const phone = which === "teen" ? <TeenPhone /> : <ParentPhone />;
  if (!wide)
    return (
      <div className="mobile">
        <div className="mobile-main">{phone}</div>
      </div>
    );
  return (
    <div className="solo">
      <div className="device-col">
        <Device scale={scale} label={which === "teen" ? "Teen phone" : "Parent phone"}>
          {phone}
        </Device>
        {which === "parent" && <OtherPhones />}
        <a className="small" href="#/">
          Back to the demo
        </a>
      </div>
    </div>
  );
}

export function App() {
  const route = useRoute();
  const wide = useWide();
  if (route === "teen") return <Solo which="teen" />;
  if (route === "parent") return <Solo which="parent" />;
  return wide ? <DemoShell /> : <Mobile />;
}
