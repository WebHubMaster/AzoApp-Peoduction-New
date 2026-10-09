/** Single entry for EVERY notification tap (Notifee foreground/background/cold start,
 *  FCM tray, expo-notifications). De-dupes the same tap arriving via several channels
 *  and waits until the splash has routed, so the tap always opens its own screen. */
import { onNotificationTap, onFcmNotificationOpen } from "@/src/lib/notifications";

export type Tap = { data: Record<string, any>; action: string };
type Handler = (t: Tap) => void;

let handler: Handler | null = null;
let pending: Tap[] = [];
let navReady = false;
const readyQ: (() => void)[] = [];
const seen = new Map<string, number>();
let sourcesOn = false;

/** Splash calls this after its first router.replace — taps navigate only after it. */
export function markNavReady() {
  if (navReady) return;
  setTimeout(() => { navReady = true; readyQ.splice(0).forEach((f) => f()); }, 400);
}
const whenReady = (f: () => void) => (navReady ? f() : readyQ.push(f));

function fresh(t: Tap) {
  const d = t.data || {};
  const key = `${d.message_id || ""}|${d.type || d.event || ""}|${d.booking_id || d.code || ""}|${d.link || ""}|${t.action}`;
  const now = Date.now();
  for (const [k, at] of seen) if (now - at > 8000) seen.delete(k);
  if (seen.has(key)) return false;
  seen.set(key, now);
  return true;
}

export function emitTap(data: Record<string, any> | undefined, action = "default") {
  if (!data || !Object.keys(data).length) return;
  const t = { data, action };
  if (!fresh(t)) return;
  if (handler) { const h = handler; whenReady(() => h(t)); } else pending.push(t);
}

function startSources() {
  if (sourcesOn) return;
  sourcesOn = true;
  try { onNotificationTap((d, a) => emitTap(d, a)); } catch { /* ignore */ }
  try { onFcmNotificationOpen((d) => emitTap(d, "default")); } catch { /* ignore */ }
}

/** Register the app's router for taps (call once the user is known). */
export function setTapHandler(h: Handler | null) {
  handler = h;
  startSources();
  if (h && pending.length) { const q = pending; pending = []; q.forEach((t) => whenReady(() => h(t))); }
}
