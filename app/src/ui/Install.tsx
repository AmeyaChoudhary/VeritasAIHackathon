import { useEffect, useState } from "react";

/** The browser's own install prompt, where it has one (Chrome, Edge, Android). */
type InstallEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: "accepted" | "dismissed" }> };

const KEY = "steady.install.dismissed";
const standalone = () =>
  window.matchMedia("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
const isIOS = () => /iphone|ipad|ipod/i.test(navigator.userAgent);

/**
 * One quiet line above the phone switcher that offers to put Stability on the home screen.
 * Android and desktop Chrome get an Install button. iPhone gets the two taps Safari needs.
 * It never shows once installed, and stays away after it is dismissed.
 */
export function InstallHint() {
  const [evt, setEvt] = useState<InstallEvent | null>(null);
  const [hidden, setHidden] = useState(() => standalone() || localStorage.getItem(KEY) === "1");

  useEffect(() => {
    const onPrompt = (e: Event) => {
      e.preventDefault();
      setEvt(e as InstallEvent);
    };
    const onInstalled = () => setHidden(true);
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  if (hidden || (!evt && !isIOS())) return null;
  const dismiss = () => {
    localStorage.setItem(KEY, "1");
    setHidden(true);
  };
  return (
    <div className="install" role="region" aria-label="Install Stability">
      {evt ? (
        <>
          <span>Keep Stability on your home screen.</span>
          <button
            className="install-go"
            onClick={async () => {
              await evt.prompt();
              const choice = await evt.userChoice;
              if (choice.outcome === "accepted") setHidden(true);
              setEvt(null);
            }}
          >
            Install
          </button>
        </>
      ) : (
        <span>
          To install: tap Share, then <b>Add to Home Screen</b>.
        </span>
      )}
      <button className="install-x" aria-label="Dismiss" onClick={dismiss}>
        <svg width="14" height="14" viewBox="0 0 24 24" aria-hidden="true">
          <path d="M6 6l12 12M18 6L6 18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </svg>
      </button>
    </div>
  );
}
