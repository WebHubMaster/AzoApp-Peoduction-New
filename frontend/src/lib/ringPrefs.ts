/* Partner alert prefs (Smart Snooze) + missed-request store — mirrors web lib/ringPrefs.js.
 * Device-local via AsyncStorage, snooze synced to the account via /partner/alert-prefs. */
import { storage } from "@/src/utils/storage";
import { api } from "@/src/api/client";

const PREF_KEY = "azo_ring_prefs";
const MISSED_KEY = "azo_missed_jobs";
const REMINDER_KEY = "azo_reminder_shown";
// Once a "job starts in 30 min" reminder is shown, suppress re-showing it for this
// long (survives app restarts). Matches product rule: next reminder only after 30 min.
const REMINDER_COOLDOWN_MS = 30 * 60 * 1000;

export type RingPrefs = {
  tone: string; volume: number; dndEnabled: boolean; dndStart: string; dndEnd: string;
  customSoundUrl: string; customSoundName: string; snoozeUntil: number;
};
export type MissedJob = {
  id: string; code?: string; service_name?: string; category_name?: string; service_image?: string;
  city?: string; address_line?: string; total?: number | string; schedule_type?: string; missed_at: number;
};

const DEFAULTS: RingPrefs = {
  tone: "classic", volume: 0.7, dndEnabled: false, dndStart: "22:00", dndEnd: "07:00",
  customSoundUrl: "", customSoundName: "", snoozeUntil: 0,
};

type Listener = (payload?: any) => void;
const listeners: Record<string, Set<Listener>> = {};
export function onRing(event: "prefs" | "missed" | "open-ring" | "test-ring-done", cb: Listener) {
  (listeners[event] ||= new Set()).add(cb);
  return () => { listeners[event]?.delete(cb); };
}
export function emitRing(event: "prefs" | "missed" | "open-ring" | "test-ring-done", payload?: any) {
  listeners[event]?.forEach((cb) => { try { cb(payload); } catch { /* ignore */ } });
}

let prefs: RingPrefs = { ...DEFAULTS };
let missed: MissedJob[] = [];
let reminderShown: Record<string, number> = {};
let loaded = false;

export async function loadLocal() {
  if (loaded) return;
  loaded = true;
  try { prefs = { ...DEFAULTS, ...(JSON.parse((await storage.getItem(PREF_KEY)) || "{}") || {}) }; } catch { /* ignore */ }
  try { missed = JSON.parse((await storage.getItem(MISSED_KEY)) || "[]") || []; } catch { /* ignore */ }
  try { reminderShown = JSON.parse((await storage.getItem(REMINDER_KEY)) || "{}") || {}; } catch { /* ignore */ }
  emitRing("prefs", prefs); emitRing("missed", missed);
}

export function getRingPrefs() { return prefs; }

export function setRingPrefs(patch: Partial<RingPrefs>) {
  prefs = { ...prefs, ...patch };
  storage.setItem(PREF_KEY, JSON.stringify(prefs));
  emitRing("prefs", prefs);
  api.put("/partner/alert-prefs", prefs).catch(() => {});
  return prefs;
}

export async function syncPrefsFromServer() {
  try {
    const data = await api.get<Partial<RingPrefs>>("/partner/alert-prefs");
    prefs = { ...DEFAULTS, ...(data || {}) };
    storage.setItem(PREF_KEY, JSON.stringify(prefs));
    emitRing("prefs", prefs);
  } catch { /* offline — keep local */ }
  return prefs;
}

export function isDndActive(p: RingPrefs = prefs) {
  if (!p.dndEnabled) return false;
  const [sh, sm] = String(p.dndStart || "22:00").split(":").map(Number);
  const [eh, em] = String(p.dndEnd || "07:00").split(":").map(Number);
  const now = new Date();
  const cur = now.getHours() * 60 + now.getMinutes();
  const s = sh * 60 + sm, e = eh * 60 + em;
  return s <= e ? cur >= s && cur < e : cur >= s || cur < e;
}

export function snoozeRemainingMs(p: RingPrefs = prefs) {
  const until = Number(p.snoozeUntil || 0);
  return until > Date.now() ? until - Date.now() : 0;
}
export const isSnoozed = () => snoozeRemainingMs() > 0;
export const setSnooze = (minutes: number) => setRingPrefs({ snoozeUntil: Date.now() + Math.max(1, minutes) * 60 * 1000 });
export const clearSnooze = () => setRingPrefs({ snoozeUntil: 0 });

export function getMissed() { return missed; }
export function addMissed(job: any) {
  if (!job || !job.id) return missed;
  missed = [{
    id: job.id, code: job.code, service_name: job.service_name, category_name: job.category_name,
    service_image: job.service_image, city: job.city, address_line: job.address_line, total: job.total,
    schedule_type: job.schedule_type, missed_at: Date.now(),
  }, ...missed.filter((j) => j.id !== job.id)].slice(0, 20);
  storage.setItem(MISSED_KEY, JSON.stringify(missed));
  emitRing("missed", missed);
  return missed;
}
export function removeMissed(id: string) {
  missed = missed.filter((j) => j.id !== id);
  storage.setItem(MISSED_KEY, JSON.stringify(missed));
  emitRing("missed", missed);
  return missed;
}

/* ── Scheduled "job starts in 30 min" reminder throttle ──
 * The backend polling/SSE fallback keeps offering the reminder for the whole
 * pre-start window, so without this the full-screen reminder re-appears every
 * time the partner reopens the app. We remember when it was last shown (per
 * booking, persisted) and suppress re-showing within the cooldown. */
export function wasReminderShownRecently(id: string) {
  const t = reminderShown[String(id)];
  return !!t && Date.now() - t < REMINDER_COOLDOWN_MS;
}
export function markReminderShown(id: string) {
  const key = String(id);
  reminderShown[key] = Date.now();
  // prune entries older than 6h so the map never grows unbounded
  const cutoff = Date.now() - 6 * 60 * 60 * 1000;
  for (const k of Object.keys(reminderShown)) if (reminderShown[k] < cutoff) delete reminderShown[k];
  storage.setItem(REMINDER_KEY, JSON.stringify(reminderShown));
}
