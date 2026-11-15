import type { SignalId } from "../engine/types";

/** Line icons: 24 x 24, 1.75 stroke, round caps. Always decorative, so hidden from readers. */
const PATHS = {
  moon: "M20 14.5A8 8 0 0 1 9.5 4a7 7 0 1 0 10.5 10.5Z",
  chat: "M5 6.5A2.5 2.5 0 0 1 7.5 4h9A2.5 2.5 0 0 1 19 6.5v6A2.5 2.5 0 0 1 16.5 15H11l-4 3.5V15A2.5 2.5 0 0 1 5 12.5Z",
  pulse: "M3 12.5h4l2.5-6 4 11 2.5-5H21",
  wave: "M3 12c2 0 2-4 4-4s2 8 4 8 2-10 4-10 2 6 4 6h2",
  music: "M9 17.5V6l10-2v11.5M9 17.5a2.5 2.5 0 1 1-5 0 2.5 2.5 0 0 1 5 0Zm10-2a2.5 2.5 0 1 1-5 0 2.5 2.5 0 0 1 5 0Z",
  clock: "M12 7.5V12l3 2M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z",
  phone: "M8.5 3.5h7A1.5 1.5 0 0 1 17 5v14a1.5 1.5 0 0 1-1.5 1.5h-7A1.5 1.5 0 0 1 7 19V5a1.5 1.5 0 0 1 1.5-1.5ZM11 17.5h2",
  book: "M5 5.5A1.5 1.5 0 0 1 6.5 4H12v15H6.5A1.5 1.5 0 0 0 5 20.5Zm14 0A1.5 1.5 0 0 0 17.5 4H12v15h5.5a1.5 1.5 0 0 1 1.5 1.5Z",
  keyboard: "M4.5 7h15A1.5 1.5 0 0 1 21 8.5v7a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 15.5v-7A1.5 1.5 0 0 1 4.5 7ZM7 10.5h.01M10.5 10.5h.01M14 10.5h.01M17 10.5h.01M8 14h8",
  home: "M4 11.5 12 5l8 6.5V19a1 1 0 0 1-1 1h-4.5v-5h-5v5H5a1 1 0 0 1-1-1Z",
  link: "M10 14a4 4 0 0 0 5.66 0l2.5-2.5a4 4 0 0 0-5.66-5.66L11.5 6.8M14 10a4 4 0 0 0-5.66 0l-2.5 2.5a4 4 0 0 0 5.66 5.66l1-1",
  gear: "M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Zm7.4-3a7.4 7.4 0 0 0-.1-1.3l2-1.5-2-3.4-2.3.9a7.6 7.6 0 0 0-2.2-1.3L14.4 3h-4l-.4 2.4a7.6 7.6 0 0 0-2.2 1.3l-2.3-.9-2 3.4 2 1.5a7.4 7.4 0 0 0 0 2.6l-2 1.5 2 3.4 2.3-.9a7.6 7.6 0 0 0 2.2 1.3l.4 2.4h4l.4-2.4a7.6 7.6 0 0 0 2.2-1.3l2.3.9 2-3.4-2-1.5c.07-.42.1-.86.1-1.3Z",
  lock: "M7.5 11V8.5a4.5 4.5 0 0 1 9 0V11M6.5 11h11A1.5 1.5 0 0 1 19 12.5v6a1.5 1.5 0 0 1-1.5 1.5h-11A1.5 1.5 0 0 1 5 18.5v-6A1.5 1.5 0 0 1 6.5 11Z",
  bell: "M6 16.5V11a6 6 0 0 1 12 0v5.5l1.5 1.5h-15ZM10 20.5a2 2 0 0 0 4 0",
  alert: "M12 8.5v4.5m0 3h.01M10.3 4.3 3.2 17a2 2 0 0 0 1.7 3h14.2a2 2 0 0 0 1.7-3L13.7 4.3a2 2 0 0 0-3.4 0Z",
  life: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Zm0-5a4 4 0 1 0 0-8 4 4 0 0 0 0 8ZM5.6 5.6l3.6 3.6m5.6 5.6 3.6 3.6m0-12.8-3.6 3.6M9.2 14.8l-3.6 3.6",
  doctor: "M7 4v5a4 4 0 0 0 8 0V4M11 13v2.5a4.5 4.5 0 0 0 9 0V14m0 0a1.75 1.75 0 1 0 0-3.5 1.75 1.75 0 0 0 0 3.5Z",
  check: "M5 12.5 10 17.5 19 7",
  hand: "M8 11.5V6a1.5 1.5 0 0 1 3 0v4.5m0-.5V4.5a1.5 1.5 0 0 1 3 0V10m0-3.5a1.5 1.5 0 0 1 3 0V13c0 4-2.5 7-6.5 7-3 0-4.6-1.6-6-4.5L5 12.8a1.4 1.4 0 0 1 2.5-1.2Z",
  calendar: "M7 3.5v3m10-3v3M4.5 9.5h15M6 5h12a1.5 1.5 0 0 1 1.5 1.5v12A1.5 1.5 0 0 1 18 20H6a1.5 1.5 0 0 1-1.5-1.5v-12A1.5 1.5 0 0 1 6 5Z",
  sun: "M12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm0-13v2m0 14v2M3 12h2m14 0h2M5.6 5.6 7 7m10 10 1.4 1.4m0-12.8L17 7M7 17l-1.4 1.4",
  arrow: "M5 12h14m-5-5 5 5-5 5",
  back: "M19 12H5m5-5-5 5 5 5",
  help: "M9.5 9.5a2.5 2.5 0 1 1 3.6 2.2c-.7.4-1.1 1-1.1 1.8m0 3h.01M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z",
  sparkle: "M12 4.5 13.6 10l5.4 2-5.4 2-1.6 5.5L10.4 14 5 12l5.4-2Z",
  chart: "M4 19.5h16M7 16v-4m5 4V7m5 9v-6",
  x: "M6 6l12 12M18 6 6 18",
} as const;

export type IconName = keyof typeof PATHS;

export function Icon({ name, size = 20, className }: { name: IconName; size?: number; className?: string }) {
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <path d={PATHS[name]} />
    </svg>
  );
}

export const SIGNAL_ICON: Record<SignalId, IconName> = {
  sleep: "moon",
  reaching_out: "chat",
  activity: "pulse",
  tone: "wave",
  music: "music",
  replies: "clock",
  night_phone: "phone",
  screen_time: "phone",
  school: "book",
  night_activity: "sun",
  typing_speed: "keyboard",
  typing_corrections: "keyboard",
};

/** Sentence-case names for the rows on Home and the chips on a note. */
export const SIGNAL_NAME: Record<SignalId, string> = {
  sleep: "Sleep",
  reaching_out: "Reaching out",
  activity: "Activity",
  tone: "Tone",
  music: "Late listening",
  replies: "Reply time",
  night_phone: "Night phone use",
  screen_time: "Screen time",
  school: "Schoolwork",
  night_activity: "Late-night activity",
  typing_speed: "Typing speed",
  typing_corrections: "Corrections",
};
