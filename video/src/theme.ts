import { continueRender, delayRender, staticFile } from "remotion";

/** Stability's palette: the same values as the app (app/src/styles.css). */
export const C = {
  night: "#0E1114",
  night2: "#161B21",
  paper: "#EFEDE8",
  paperHi: "#FBFAF7",
  card: "#FFFFFF",
  ink: "#15171A",
  inkSoft: "rgba(21,23,26,0.60)",
  inkFaint: "rgba(21,23,26,0.14)",
  hair: "rgba(21,23,26,0.08)",
  snow: "#F4F2EC",
  snowSoft: "rgba(244,242,236,0.62)",
  snowFaint: "rgba(244,242,236,0.16)",
  amber: "#F2A33A",
  sage: "#5FAE8B",
  grey: "#C9CCD1",
};

export const F = {
  display: "Inter, system-ui, sans-serif",
  body: "Inter, system-ui, sans-serif",
  mono: "'IBM Plex Mono', ui-monospace, monospace",
};

let loaded = false;
export const loadFonts = () => {
  if (loaded || typeof document === "undefined") return;
  loaded = true;
  const h = delayRender("local fonts");
  const faces = [
    ...[400, 500, 600, 700, 800].map((w) => new FontFace("Inter", `url(${staticFile(`fonts/inter-${w}.woff2`)})`, { weight: String(w) })),
    ...[400, 500].map((w) => new FontFace("IBM Plex Mono", `url(${staticFile(`fonts/plex-mono-${w}.woff2`)})`, { weight: String(w) })),
  ];
  Promise.all(faces.map((ff) => ff.load().then((x) => document.fonts.add(x))))
    .then(() => continueRender(h))
    .catch(() => continueRender(h));
};
