// Records Maya's phone and her mom's phone from the real app, side by side in time, for the demo video.
// The app's single-phone routes run in two tabs that stay in sync; a third tab holds the demo controls.
// Usage, from video/:
//   (cd ../app && npm run build && cd dist && python3 -m http.server 5231 --bind 127.0.0.1) &
//   node tools/capture.mjs public/rec src/rec.json
// Needs Google Chrome and ffmpeg. Writes public/rec/teen.mp4, public/rec/parent.mp4 and src/rec.json,
// whose marks (seconds into the recordings) are what src/scenes/Demo.tsx cuts the clips by.
import puppeteer from "puppeteer-core";
import { execFileSync } from "node:child_process";
import { writeFileSync, mkdirSync } from "node:fs";

const [outDir, recJson] = process.argv.slice(2);
const BASE = "http://127.0.0.1:5231/";
const FFMPEG = process.env.FFMPEG ?? "ffmpeg";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
mkdirSync(outDir, { recursive: true });
const watchdog = setTimeout(() => { console.error('watchdog: stuck for 5 minutes, giving up'); process.exit(3); }, 300000);

const browser = await puppeteer.launch({
  executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  headless: true,
  args: ["--hide-scrollbars", "--window-size=1500,900", "--disable-background-timer-throttling",
         "--disable-backgrounding-occluded-windows", "--disable-renderer-backgrounding", "--force-device-scale-factor=2"],
});
/** A page in its own window, so every page keeps drawing frames while the others are recorded. */
const newWindowPage = async () => {
  const before = new Set(browser.targets());
  const cdp = await browser.target().createCDPSession();
  await cdp.send("Target.createTarget", { url: "about:blank", newWindow: true });
  const target = await browser.waitForTarget((t) => !before.has(t) && t.type() === "page");
  return target.page();
};
const driver = await newWindowPage();
await driver.setViewport({ width: 1500, height: 900, deviceScaleFactor: 1 });
await driver.goto(BASE + "#/", { waitUntil: "networkidle0" });
const phone = async (route) => {
  const p = await newWindowPage();
  await p.setViewport({ width: 390, height: 800, deviceScaleFactor: 2 });
  await p.goto(BASE + route, { waitUntil: "networkidle0" });
  return p;
};
const teen = await phone("#/teen");
const parent = await phone("#/parent");

/** Click the first visible element whose trimmed text is exactly one of `labels`. Returns the label clicked, or null. */
const clickText = (page, labels, sel = "button, label, [role=radio], [role=button], a") =>
  page.evaluate((labels, sel) => {
    const els = [...document.querySelectorAll(sel)].filter((e) => e.offsetParent !== null);
    for (const l of labels) {
      const el = els.find((e) => e.textContent.trim().toLowerCase() === l.toLowerCase());
      if (el) { el.click(); return l; }
    }
    return null;
  }, labels, sel);
const must = async (page, labels, what) => {
  for (let i = 0; i < 40; i++) {
    const hit = await clickText(page, labels);
    if (hit) return hit;
    await sleep(100);
  }
  throw new Error("could not click " + (what ?? labels.join("/")));
};
const scripted = (on) => driver.evaluate((on) => {
  const box = [...document.querySelectorAll("input[type=checkbox]")].find((c) => /scripted/i.test(c.closest("label")?.textContent ?? c.parentElement?.textContent ?? ""));
  if (!box) throw new Error("no scripted checkbox");
  if (box.checked !== on) box.click();
}, on);

// set up with the scripted answers (pairing, consent, the eight questions at the door) and reach week 1
await must(driver, ["Next week"]);
await sleep(2500);

const recTeen = await teen.screencast({ path: `${outDir}/teen.webm`, ffmpegPath: FFMPEG });
const t0 = Date.now();
const recParent = await parent.screencast({ path: `${outDir}/parent.webm`, ffmpegPath: FFMPEG });
const parentOffset = (Date.now() - t0) / 1000;
const marks = { w1: 0.2 };
const mark = (k) => { marks[k] = +((Date.now() - t0) / 1000).toFixed(2); };
const seen = async (page) => ((await page.evaluate(() => document.body.innerText)).match(/WEEK \d+/) || ["?"])[0];
const week = async (n, hold) => { mark("w" + n); await must(driver, ["Next week"]); await sleep(hold); console.log(`week ${n}: driver ${await seen(driver)} | teen ${await seen(teen)}`); };
const OPT = ["Not at all", "Several days", "More than half the days", "Nearly every day"];

/** Answer the question set that is open on Maya's phone. `answers` are option indexes, reused if there are more questions. */
const answer = async (prefix, answers) => {
  mark(prefix + "_open");
  console.log(prefix, "teen shows:", (await teen.evaluate(() => document.body.innerText)).replace(/\s+/g, " ").slice(0, 200));
  await must(teen, ["Start"], "Start on the ask card");
  await sleep(1500);
  let n = 0;
  for (; n < 12; n++) {
    const has = await teen.evaluate((OPT) => [...document.querySelectorAll("button, label, [role=radio]")].some((e) => e.offsetParent !== null && OPT.includes(e.textContent.trim())), OPT);
    if (!has) {
      const more = await clickText(teen, ["Continue", "Keep going", "Start", "Next"]);   // a screen between the two and the six
      if (!more) break;
      await sleep(1200);
      continue;
    }
    if (n === 0) mark(prefix + "_a1");
    await must(teen, [OPT[answers[Math.min(n, answers.length - 1)]]]);
    await sleep(650);
    await must(teen, ["Next", "Done", "Finish", "Submit", "See result"], "Next on a question");
    await sleep(900);
  }
  mark(prefix + "_done");
  await sleep(1300);                                   // the "Thanks for answering" screen, if there is one
  if (await clickText(teen, ["Done", "Okay", "Close"])) { mark(prefix + "_closed"); await sleep(900); }
  console.log(prefix, "answered", n, "| teen then shows:", (await teen.evaluate(() => document.body.innerText)).replace(/\s+/g, " ").slice(0, 150));
  return n;
};

/** The two-tap check-in on Maya's Home: stress, then time with people, each 1 to 5. */
const checkin = async (n, stress, people) => {
  mark("ci" + n);
  const tap = (row, v) => teen.evaluate((row, v) => {
    const dots = document.querySelectorAll(".checkin .ci-row")[row]?.querySelectorAll(".ci-dot");
    if (!dots || !dots[v - 1]) throw new Error("no check-in card on the page");
    dots[v - 1].click();
  }, row, v);
  await sleep(500);
  await tap(0, stress);
  await sleep(750);
  await tap(1, people);
  await sleep(1100);
};

await sleep(1600);
await week(2, 1700);
await week(3, 1900);
await scripted(false);               // from here Maya checks in and answers on her own phone, on camera
await sleep(700);
await checkin(4, 2, 4);
await week(4, 2600);                 // the monthly ask
const n1 = await answer("ask1", [1, 1]);          // "several days" on both: a total of 2, under the cutoff
await sleep(1500);
await checkin(5, 4, 3);
await week(5, 2600);                 // finals: signals drift
await checkin(6, 4, 2);
await week(6, 2800);                 // the ask model asks again, two weeks early
const n2 = await answer("ask2", [1, 1]);
await sleep(1500);
await checkin(7, 4, 2);
await week(7, 2400);
await checkin(8, 5, 1);
await week(8, 2800);
const n3 = await answer("ask3", [2, 2, 2, 1, 2, 1, 1, 1]);   // high on the two, then the six more
mark("doctor");
await sleep(600);
mark("note");
await sleep(6500);

// the Type tab: one low-mood message, one everyday message
mark("type_open");
await must(teen, ["Type"]);
await sleep(1400);
const box = 'textarea[placeholder="Type a message"], input[placeholder="Type a message"]';
mark("type1_start");
await teen.click(box);
await teen.type(box, "i miss how things used to be, nothing feels fun anymore", { delay: 55 });
await sleep(350);
mark("type1_send");
await must(teen, ["Send"]);
await sleep(3200);
mark("type2_start");
await teen.click(box);
await teen.type(box, "omw, save me a seat at lunch", { delay: 55 });
await sleep(300);
mark("type2_send");
await must(teen, ["Send"]);
await sleep(3200);
mark("end");

await recTeen.stop();
await recParent.stop();
const state = await teen.evaluate(() => document.body.innerText.slice(0, 300));
await browser.close();

writeFileSync(recJson, JSON.stringify({ ready: true, parentOffset: +parentOffset.toFixed(2), questions: [n1, n2, n3], marks }, null, 1) + "\n");
for (const name of ["teen", "parent"]) {
  execFileSync(FFMPEG, ["-y", "-v", "error", "-i", `${outDir}/${name}.webm`, "-vf", "scale=trunc(iw/2)*2:trunc(ih/2)*2", "-c:v", "libx264", "-crf", "22", "-preset", "slow", "-pix_fmt", "yuv420p", "-r", "30", "-g", "15", "-an", "-movflags", "+faststart", `${outDir}/${name}.mp4`]);
}
console.log("questions answered:", n1, n2, n3, "| marks:", JSON.stringify(marks));
clearTimeout(watchdog);
console.log("teen page at the end:", state.replace(/\s+/g, " ").slice(0, 160));
