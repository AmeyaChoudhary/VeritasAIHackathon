// Keys come from app/.env.local (see .env.example). With a key missing, the Connect screen
// says "Not set up yet" and offers sample data.

const env = (import.meta as unknown as { env?: Record<string, string | undefined> }).env ?? {};

export const GOOGLE_CLIENT_ID = (env.VITE_GOOGLE_CLIENT_ID ?? "").trim();
export const LASTFM_API_KEY = (env.VITE_LASTFM_API_KEY ?? "").trim();

export const GMAIL_SCOPE = "https://www.googleapis.com/auth/gmail.readonly";
export const CALENDAR_SCOPE = "https://www.googleapis.com/auth/calendar.events.readonly";

export const MS_CLIENT_ID = (env.VITE_MS_CLIENT_ID ?? "").trim();
export const FITBIT_CLIENT_ID = (env.VITE_FITBIT_CLIENT_ID ?? "").trim();

export const CLASSROOM_SCOPE = "https://www.googleapis.com/auth/classroom.courses.readonly https://www.googleapis.com/auth/classroom.coursework.me.readonly";
export const DRIVE_ACTIVITY_SCOPE = "https://www.googleapis.com/auth/drive.activity.readonly";
