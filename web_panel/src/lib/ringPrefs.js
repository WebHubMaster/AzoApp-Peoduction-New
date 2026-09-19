/* Partner alert preferences + missed-request store (device-local via localStorage).
 * Also exposes the Web-Audio ringtone patterns used by the incoming-job ring. */
import api from "@/lib/api";

const PREF_KEY = "azo_ring_prefs";
const MISSED_KEY = "azo_missed_jobs";

/* Each tone = one "beat" made of {f: frequency Hz, t: start offset sec}. Repeated
 * every ~1.7s while ringing. No audio assets needed — pure Web Audio. */
export const TONES = {
  classic: [{ f: 1000, t: 0 }, { f: 760, t: 0.26 }],
  chime:   [{ f: 1318, t: 0 }, { f: 1760, t: 0.18 }],
  pulse:   [{ f: 620, t: 0 }, { f: 620, t: 0.2 }, { f: 620, t: 0.4 }],
  urgent:  [{ f: 1200, t: 0 }, { f: 900, t: 0.12 }, { f: 1200, t: 0.24 }, { f: 900, t: 0.36 }],
  beep:    [{ f: 880, t: 0 }],
};

export const TONE_LABELS = {
  classic: "Classic Ring",
  chime: "Chime",
  pulse: "Pulse",
  urgent: "Urgent",
  beep: "Simple Beep",
};

const DEFAULTS = {
  tone: "classic",
  volume: 0.7,
  dndEnabled: false,
  dndStart: "22:00",
  dndEnd: "07:00",
  customSoundUrl: "",  // admin-uploaded ring audio; when set it replaces the Web-Audio tone
  customSoundName: "",
  snoozeUntil: 0,   // epoch-ms until which the ring is muted (Smart Snooze); 0 = off
};

/* ---- Custom (admin-uploaded) ring audio ---- */
let _customAudio = null;
export function playCustomSound(url, volume = 0.7, loop = true) {
  try {
    if (!url) return false;
    if (_customAudio && _customAudio.src === url) {
      _customAudio.volume = Math.max(0.05, Math.min(1, volume));
      if (_customAudio.paused) _customAudio.play().catch(() => {});
      return true;
    }
    stopCustomSound();
    const a = new Audio(url);
    a.loop = loop;
    a.volume = Math.max(0.05, Math.min(1, volume));
    a.play().catch(() => {});
    _customAudio = a;
    return true;
  } catch { return false; }
}

export function stopCustomSound() {
  try {
    if (_customAudio) { _customAudio.pause(); _customAudio.currentTime = 0; }
  } catch { /* ignore */ }
  _customAudio = null;
}

export function getRingPrefs() {
  try {
    return { ...DEFAULTS, ...(JSON.parse(localStorage.getItem(PREF_KEY)) || {}) };
  } catch {
    return { ...DEFAULTS };
  }
}

export function setRingPrefs(patch) {
  const next = { ...getRingPrefs(), ...patch };
  try { localStorage.setItem(PREF_KEY, JSON.stringify(next)); } catch { /* ignore */ }
  try { window.dispatchEvent(new CustomEvent("azo-ring-prefs", { detail: next })); } catch { /* ignore */ }
  // Persist to the account so settings follow the partner across devices.
  try { api.put("/partner/alert-prefs", next).catch(() => {}); } catch { /* ignore */ }
  return next;
}

/* Pull the account-synced prefs from the server into the local cache. */
export async function syncPrefsFromServer() {
  try {
    const { data } = await api.get("/partner/alert-prefs");
    const merged = { ...DEFAULTS, ...(data || {}) };
    localStorage.setItem(PREF_KEY, JSON.stringify(merged));
    window.dispatchEvent(new CustomEvent("azo-ring-prefs", { detail: merged }));
    return merged;
  } catch {
    return getRingPrefs();
  }
}

/* Is the current time inside the partner's Do-Not-Disturb window? Handles windows
 * that wrap past midnight (e.g. 22:00 -> 07:00). */
export function isDndActive(prefs = getRingPrefs()) {
  if (!prefs.dndEnabled) return false;
  const [sh, sm] = String(prefs.dndStart || "22:00").split(":").map(Number);
  const [eh, em] = String(prefs.dndEnd || "07:00").split(":").map(Number);
  const now = new Date();
  const cur = now.getHours() * 60 + now.getMinutes();
  const s = sh * 60 + sm;
  const e = eh * 60 + em;
  return s <= e ? cur >= s && cur < e : cur >= s || cur < e;
}

/* ---- Smart Snooze ---- : temporarily mute the ring for N minutes WITHOUT
 * breaking the accept-streak. While snoozed, incoming requests are skipped
 * entirely (never enqueued), so they are not auto-declined / counted as missed.
 * Emergency requests still ring through. Syncs to the account via setRingPrefs. */
export function snoozeRemainingMs(prefs = getRingPrefs()) {
  const until = Number(prefs.snoozeUntil || 0);
  return until > Date.now() ? until - Date.now() : 0;
}

export function isSnoozed(prefs = getRingPrefs()) {
  return snoozeRemainingMs(prefs) > 0;
}

export function setSnooze(minutes) {
  const until = Date.now() + Math.max(1, Number(minutes || 0)) * 60 * 1000;
  return setRingPrefs({ snoozeUntil: until });
}

export function clearSnooze() {
  return setRingPrefs({ snoozeUntil: 0 });
}

/* ---- Missed requests ---- */
export function getMissed() {
  try { return JSON.parse(localStorage.getItem(MISSED_KEY)) || []; }
  catch { return []; }
}

export function addMissed(job) {
  if (!job || !job.id) return getMissed();
  const list = getMissed().filter((j) => j.id !== job.id);
  list.unshift({
    id: job.id, code: job.code, service_name: job.service_name,
    category_name: job.category_name, service_image: job.service_image,
    city: job.city, address_line: job.address_line, total: job.total,
    schedule_type: job.schedule_type, missed_at: Date.now(),
  });
  const trimmed = list.slice(0, 20);
  try { localStorage.setItem(MISSED_KEY, JSON.stringify(trimmed)); } catch { /* ignore */ }
  try { window.dispatchEvent(new CustomEvent("azo-missed", { detail: trimmed })); } catch { /* ignore */ }
  return trimmed;
}

export function removeMissed(id) {
  const list = getMissed().filter((j) => j.id !== id);
  try { localStorage.setItem(MISSED_KEY, JSON.stringify(list)); } catch { /* ignore */ }
  try { window.dispatchEvent(new CustomEvent("azo-missed", { detail: list })); } catch { /* ignore */ }
  return list;
}

/* Play a single beat of a tone for previewing in settings (or the custom audio once). */
export function previewTone(toneKey, volume = 0.7, customUrl = "") {
  if (customUrl) {
    playCustomSound(customUrl, volume, false);
    setTimeout(() => stopCustomSound(), 6000);
    return;
  }
  try {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const ctx = new AC();
    const now = ctx.currentTime;
    const vol = Math.max(0.05, Math.min(1, volume));
    (TONES[toneKey] || TONES.classic).forEach(({ f, t }) => {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.connect(g); g.connect(ctx.destination);
      o.type = "sine"; o.frequency.value = f;
      g.gain.setValueAtTime(0.0001, now + t);
      g.gain.exponentialRampToValueAtTime(vol, now + t + 0.03);
      g.gain.exponentialRampToValueAtTime(0.0001, now + t + 0.4);
      o.start(now + t); o.stop(now + t + 0.44);
    });
    setTimeout(() => { try { ctx.close(); } catch { /* ignore */ } }, 1200);
  } catch { /* ignore */ }
}
