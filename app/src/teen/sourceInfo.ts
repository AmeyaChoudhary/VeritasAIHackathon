// What each source's Connect screen says. Plain words, one screen per source.

import type { SourceId } from "../engine/types";
import { FITBIT_STATUS } from "../integrations/fitbit";

export type Kind = "google" | "microsoft" | "fitbit" | "lastfm" | "server" | "file" | "phone";

export interface SourceInfo {
  name: string;
  group: string;
  kind: Kind;
  reads: string;
  keeps: string;
  more: string[];
  /** For files: how to get the export. */
  howTo?: string[];
}

const GMAIL_LIMITS =
  "School accounts for students under 18 block apps like this until the school allows them, so use a personal account. Google lets up to 100 test users try it before it reviews the app.";
const SERVER =
  "This one needs the phone app or a server. Its API doesn't accept calls from a web page, so this web prototype can only show sample data. Stability never asks for your password.";
const FILE_NOTE = "The file is read on this phone and nothing is uploaded. Other people's messages in it are skipped without being read.";

export const SOURCE_INFO: Record<SourceId, SourceInfo> = {
  classroom: {
    name: "Google Classroom",
    group: "School",
    kind: "google",
    reads: "Your own coursework and what you turned in, in your classes.",
    keeps: "Weekly: assignments due, turned in late, missing, and how many you turned in after midnight. Titles are not downloaded.",
    more: [GMAIL_LIMITS],
  },
  canvas: {
    name: "Canvas",
    group: "School",
    kind: "server",
    reads: "Your own missing and late assignments, with an access token you make in your Canvas account settings.",
    keeps: "Weekly: missing and late counts.",
    more: [SERVER],
  },
  schoology: {
    name: "Schoology",
    group: "School",
    kind: "server",
    reads: "Your own assignments and grades, to count missing and late work, with the API key you make in your Schoology account.",
    keeps: "Weekly: missing and late counts.",
    more: [SERVER],
  },
  gmail: {
    name: "Gmail",
    group: "Email and calendar",
    kind: "google",
    reads: "The emails you send, from the last 28 days. For each reply, the time of the message it answered. Other people's emails are never opened.",
    keeps: "Weekly counts: emails sent, how long you take to reply, how many you send after midnight, and how many read as low mood. The text is scored on this phone and dropped.",
    more: [
      "Quoted and forwarded text is cut before scoring. An email whose own words can't be separated is skipped.",
      "Emails you sent in the last 24 hours also go through the self-harm check, the same as typed words.",
      GMAIL_LIMITS,
    ],
  },
  calendar: {
    name: "Google Calendar",
    group: "Email and calendar",
    kind: "google",
    reads: "Events from four weeks back to four weeks ahead.",
    keeps: "Whether an exam or test is coming. Titles are read on this phone and not kept.",
    more: ["This is context only. It never sends a note."],
  },
  microsoft: {
    name: "Microsoft 365",
    group: "Email and calendar",
    kind: "microsoft",
    reads: "Your Sent Items and your calendar, read the same way as Gmail and Google Calendar. Mail you received is never opened.",
    keeps: "The same as Gmail and Google Calendar: weekly counts, and which weeks have an exam.",
    more: [
      "Quoted and forwarded text is cut before scoring. An email whose own words can't be separated is skipped.",
      "Some school accounts need an admin to allow the app first.",
    ],
  },
  drive: {
    name: "Google Drive activity",
    group: "School",
    kind: "google",
    reads: "When you edit your own files. No file names and nothing inside them.",
    keeps: "Weekly: days with edits, and how many edits were after midnight.",
    more: ["Edits by other people in shared files are skipped."],
  },
  lastfm: {
    name: "Last.fm",
    group: "Music",
    kind: "lastfm",
    reads: "The plays from the last 28 days on the public Last.fm profile for the name you type.",
    keeps: "Weekly listening, how much is after midnight, and how often the same songs repeat. Also a music mood: how happy the songs sound, from a public list of song scores. You see the music mood here; it isn't used for anything else.",
    more: [
      "Stability can't check that the profile is yours. Checking would need Last.fm sign-in, which needs a server this prototype doesn't have. The name you type is used once and not kept.",
      "To send your Spotify plays to Last.fm: sign in at last.fm, open Settings, then Applications, and connect Spotify. New plays show up there within a few minutes.",
    ],
  },
  spotify: {
    name: "Spotify",
    group: "Music",
    kind: "file",
    reads: "Songs you played on Spotify. Sign in to Spotify to read your last 50 plays and your top songs, or choose your Spotify data download for up to 12 weeks. Podcasts, audiobooks and videos are skipped.",
    keeps: "Weekly: songs played, how many were between midnight and 5 a.m., and how often you repeated songs. From the data file also minutes listened and skips. Song names and ids are used only to count repeats and look up the music mood, then dropped. Music mood: how happy the songs sound, the average of Spotify's 0 to 1 score for songs found in a public list of 114,000 songs, with how many were found. You see the music mood here; it isn't used for anything else.",
    more: [
      "Both ways are read on this phone and nothing is uploaded. The Spotify sign-in is kept in memory for one read and then forgotten.",
      "Spotify sign-in here runs in Spotify's development mode, so only the app's owner and up to 5 people added in its Spotify dashboard can sign in. A public launch would need Spotify's approval, because Spotify's rules for apps restrict turning listening into numbers about a person. The data file and Last.fm work for everyone.",
      "Music mood never goes to a parent and doesn't change when Stability asks. There is no data that links a week's music mood to how a teen answers the questions, so it stays as context.",
      "To remove Stability's Spotify access, open your Spotify account, then Manage apps.",
    ],
    howTo: [
      "For the data file: on spotify.com, open your account, then Account privacy, and request your data. Account data comes in about 5 days. Extended streaming history can take up to 30 days and covers more.",
      "Choose the .zip here, or the StreamingHistory_music or Streaming_History_Audio .json files. You can pick several at once.",
    ],
  },
  fitbit: {
    name: "Fitbit",
    group: "Sleep and steps",
    kind: "fitbit",
    reads: "Sleep and steps from your Fitbit account.",
    keeps: "Nightly sleep hours and bedtime, and daily steps, as weekly averages.",
    more: [FITBIT_STATUS],
  },
  screentime: {
    name: "Phone data (Android)",
    group: "Phone",
    kind: "phone",
    reads: "A file from the Stability app on Android: screen time, Health Connect sleep and steps, and the Stability keyboard's daily numbers. On iPhone, screen-time threshold events.",
    keeps: "Daily minutes on the phone and in games, and how many of each were between midnight and 5 a.m., sleep hours and bedtime, steps, and from the keyboard: messages sent, typing speed, pauses, corrections and the share that reads as low mood. Games count only when the app tells Android it is a game, and app names are never kept. Never what you typed.",
    more: ["This needs the Stability app in native/. Export its file, then choose it here."],
  },
  instagram: {
    name: "Instagram data file",
    group: "Data files",
    kind: "file",
    reads: "The export Instagram gives you: messages you sent, your searches, and when you viewed posts and videos. Searches are read on this phone and then dropped. No usernames, links or titles are kept.",
    keeps: "Weekly: messages sent, posts and videos viewed, searches, activity after midnight, how many of your messages read as low mood, and how many searches were about self-harm.",
    more: [
      FILE_NOTE,
      "A search about self-harm from the last day brings up \"Are you safe right now?\" with 988, the same as words you type. Nothing about what you search or view goes to a parent.",
    ],
    howTo: ["In Instagram: Accounts Center, Your information and permissions, Download your information.", "Choose JSON as the format, then choose the .zip here."],
  },
  tiktok: {
    name: "TikTok data file",
    group: "Data files",
    kind: "file",
    reads: "The export TikTok gives you: messages you sent, your searches, and when you watched. Searches are read on this phone and then dropped. No usernames, links or titles are kept.",
    keeps: "Weekly: messages sent, videos watched, searches, activity after midnight, how many of your messages read as low mood, and how many searches were about self-harm.",
    more: [
      FILE_NOTE,
      "A search about self-harm from the last day brings up \"Are you safe right now?\" with 988, the same as words you type. Nothing about what you search or watch goes to a parent.",
    ],
    howTo: ["In TikTok: Settings and privacy, Account, Download your data.", "Choose JSON, then choose the file here."],
  },
  snapchat: {
    name: "Snapchat data file",
    group: "Data files",
    kind: "file",
    reads: "The export Snapchat gives you. Only chats you sent and their times.",
    keeps: "Weekly: chats sent, activity after midnight, and how many of your chats read as low mood.",
    more: [FILE_NOTE, "Snapchat only exports chats that were saved."],
    howTo: ["In Snapchat: Settings, My Data.", "Include the JSON files and your chat history, then choose the .zip here."],
  },
  discord: {
    name: "Discord data package",
    group: "Data files",
    kind: "file",
    reads: "The data package Discord gives you. It holds only messages you sent.",
    keeps: "Weekly: messages sent, activity after midnight, and how many of your messages read as low mood.",
    more: [FILE_NOTE, "Lines you quoted from someone else are cut before scoring."],
    howTo: ["In Discord: User Settings, Data and Privacy, Request all of my data.", "Choose the package .zip here."],
  },
  youtube: {
    name: "YouTube (Google Takeout)",
    group: "Data files",
    kind: "file",
    reads: "Your YouTube watch and search history from Google Takeout: video titles and searches, read on this phone and then dropped. Only weekly counts are kept.",
    keeps: "Weekly: how much you watched and searched, how much was after midnight, and how many videos or searches were about self-harm or read as low mood. Titles are never kept or shown to anyone.",
    more: [
      "YouTube no longer offers watch history through its API, so it is a file.",
      "A search about self-harm from the last day brings up \"Are you safe right now?\" with 988, the same as words you type. Nothing about what you watch goes to a parent.",
    ],
    howTo: ["At takeout.google.com, choose YouTube and YouTube Music, and set history to JSON.", "Choose the .zip here."],
  },
  chrome: {
    name: "Chrome history (Google Takeout)",
    group: "Data files",
    kind: "file",
    reads: "Your Chrome browsing history from Google Takeout: page titles and searches, read on this phone and then dropped. Only weekly counts are kept.",
    keeps: "Weekly: pages visited, how many after midnight, searches, how many pages or searches were about self-harm or read as low mood, and visits to major news sites with how many were between midnight and 5 a.m. Addresses and titles are never kept or shown to anyone.",
    more: [
      "Search words are read from Google, Bing, DuckDuckGo and YouTube searches.",
      "News sites are a short fixed list of major news outlets. You see the news counts here; they aren't used for anything else.",
      "A search about self-harm from the last day brings up \"Are you safe right now?\" with 988, the same as words you type. Nothing about what you visit goes to a parent.",
    ],
    howTo: ["At takeout.google.com, choose Chrome.", "Choose the .zip, or the History.json inside it, here."],
  },
};

export const GROUP_ORDER = ["School", "Email and calendar", "Music", "Sleep and steps", "Phone", "Data files"];
