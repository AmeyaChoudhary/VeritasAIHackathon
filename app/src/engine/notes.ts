// The words people see. Wording comes from docs/parent-alerts.md and is used verbatim,
// with "Maya" and "Mom" swapped for the names entered at setup.

import type { HeadsUpEvent, People, Pronoun, SignalId } from "./types";

export interface PronounSet {
  sub: string; // she
  obj: string; // her
  pos: string; // her
  refl: string; // herself
  has: string; // has
  says: string; // says
  isnt: string; // isn't
}

export const PRONOUNS: Record<Pronoun, PronounSet> = {
  she: { sub: "she", obj: "her", pos: "her", refl: "herself", has: "has", says: "says", isnt: "isn't" },
  he: { sub: "he", obj: "him", pos: "his", refl: "himself", has: "has", says: "says", isnt: "isn't" },
  they: { sub: "they", obj: "them", pos: "their", refl: "themself", has: "have", says: "say", isnt: "aren't" },
};

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** How each area reads after "Maya has been". */
const AREA_PHRASE: Record<SignalId, (p: PronounSet) => string> = {
  sleep: () => "sleeping less than usual",
  reaching_out: () => "messaging people less often",
  activity: () => "less active than usual",
  tone: (p) => `sounding lower than usual in what ${p.sub} ${p.sub === "they" ? "type" : "types"}`,
  music: () => "listening to music later at night than usual",
  replies: () => "taking longer than usual to reply to emails",
  night_phone: () => "on the phone more late at night",
  screen_time: () => "on the phone more than usual",
  school: () => "missing more assignments or turning them in late",
  night_activity: () => "more active online late at night",
  typing_speed: () => "typing more slowly than usual",
  typing_corrections: () => "correcting more than usual while typing",
};

export function joinWords(items: string[]): string {
  if (items.length <= 1) return items.join("");
  return `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}

export interface Section {
  label?: string;
  text: string;
}

export interface NoteText {
  title: string;
  sections: Section[];
  replies: string[];
}

export function headsUpText(e: HeadsUpEvent, people: People): NoteText {
  const p = PRONOUNS[people.teenPronoun];
  const name = people.teen;
  const first =
    e.areas && e.areas.length && e.weeks
      ? `For the past ${e.weeks} weeks, ${name} has been ${joinWords(e.areas.map((a) => AREA_PHRASE[a](p)))}. Steady can't say why, and this is not a diagnosis.`
      : `Steady suggests you check in with ${name} about how ${p.sub} ${p.has} been feeling lately. This is not a diagnosis.`;
  return {
    title: `Worth checking in with ${name}`,
    sections: [
      { text: first },
      {
        label: "Tonight:",
        text: `find a low-key moment, like a drive or cooking together, and say what you've noticed yourself. For example: "You've seemed tired lately. How are you doing?" Then listen.`,
      },
      { label: "Try not to:", text: `take ${p.pos} phone, or push for a reason tonight.` },
      { label: "Next:", text: `book a visit with ${p.pos} pediatrician and ask about a depression screening.` },
      {
        label: `If ${p.sub} ${p.says} ${p.sub} ${p.isnt} safe:`,
        text: `call or text 988. If ${p.sub} ${p.has} hurt ${p.refl} or ${p.sub === "they" ? "are" : "is"} in immediate danger, call 911.`,
      },
    ],
    replies: ["We talked", "Booked a doctor", "Not yet"],
  };
}

export function urgentText(people: People): NoteText {
  const p = PRONOUNS[people.teenPronoun];
  const name = people.teen;
  const isAre = p.sub === "they" ? "are" : "is";
  return {
    title: `Please check on ${name} now`,
    sections: [
      {
        text: `${name} typed words that may be about suicide or self-harm. Steady can't tell how serious this is. Treat it as real until you have talked with ${p.obj}.`,
      },
      {
        label: "Now:",
        text: `go to ${p.obj}, stay calm, and ask ${p.obj} directly: "Are you thinking about suicide?" Listen without judging. Asking does not put the idea in ${p.pos} head.`,
      },
      { label: `Tonight, whatever ${p.sub} ${p.says}:`, text: "lock up or remove medicines and any guns in the home." },
      { label: `If ${p.sub} ${p.says} yes:`, text: `stay with ${p.obj}, and call or text 988 together.` },
      {
        label: `If ${p.sub} ${p.says} no or won't talk:`,
        text: `keep ${p.obj} close tonight, and call 988 yourself for advice.`,
      },
      { label: `If ${p.sub} ${p.has} hurt ${p.refl} or ${isAre} in immediate danger:`, text: "call 911." },
      { label: "Tomorrow:", text: `check in with ${p.obj} again, and call ${p.pos} pediatrician.` },
    ],
    replies: [`I'm with ${p.obj}`, "Called 988", `I can't reach ${p.obj}`],
  };
}

export function cantReachText(people: People): { title: string; lines: string[] } {
  const p = PRONOUNS[people.teenPronoun];
  const others = [people.second, people.trusted].filter(Boolean) as string[];
  return {
    title: `If you can't reach ${people.teen}`,
    lines: [
      ...(others.length ? [`The note has gone to ${joinWords(others)} too.`] : []),
      `Keep trying ${p.obj}, and anyone who may be with ${p.obj}.`,
      `Call 911 if you believe ${p.sub} ${p.sub === "they" ? "are" : "is"} in danger.`,
    ],
  };
}

/** The teen's setup screen, verbatim from docs/parent-alerts.md. */
export function setupScreenText(people: People): { title: string; paragraphs: string[]; secondLine?: string } {
  const pp = PRONOUNS[people.parentPronoun];
  const parent = people.parent;
  return {
    title: `Steady is linked to ${parent}'s phone.`,
    secondLine: people.second ? `If ${parent} doesn't answer an urgent note, it also goes to ${people.second}.` : undefined,
    paragraphs: [
      "Steady learns what's normal for you: sleep, activity, how often you message people, and the tone of what you type. Your messages never leave this phone.",
      `If something stays off for a few weeks, or your answers to its questions are high, Steady sends ${parent} a short note asking ${pp.obj} to check in with you. The note can say which areas changed, like sleep, and for how long. If you type something that sounds like you might hurt yourself, Steady can send ${parent} an urgent note right away.`,
      `Notes never include your messages, your answers or your scores. Steady won't tell you when it sends one. ${parent} can also see whether Steady is on and whether its keyboard is in use.`,
      "If you want, name a trusted adult outside your home. Urgent notes go to them too.",
      "You can also connect Gmail, Google Calendar, Last.fm and screen time. Steady reads them on this phone. From Gmail it reads only emails you send: how quickly you reply and their tone. Nothing you wrote leaves this phone.",
      "Help from 988 is always one tap away.",
    ],
  };
}

export function questionnaireLine(people: People): string {
  return `Your answers stay on this phone. A high result can send ${people.parent} a note to check in.`;
}

export function missesText(people: People): string {
  const p = PRONOUNS[people.teenPronoun];
  return `Steady will miss things. It only sees words typed on its own keyboard, and most worrying changes never send a note. No note does not mean ${people.teen} is fine. If you are worried, talk with ${p.obj}, and call ${p.pos} pediatrician or 988 any time.`;
}

export function statusLine(state: "waiting" | "on" | "not_connected", lowData: boolean, noKeyboard: boolean, people: People): { head: string; sub?: string } {
  if (state === "waiting") return { head: `Waiting for ${people.teen}'s phone` };
  if (state === "not_connected") return { head: "Not connected" };
  if (lowData) return { head: "On, but not enough data", sub: noKeyboard ? "The Steady keyboard isn't in use, so typed words aren't checked." : undefined };
  if (noKeyboard) return { head: "On, but the Steady keyboard isn't in use, so typed words aren't checked." };
  return { head: "On" };
}

export { cap };
