/**
 * Standard VAPID Web Push registration for the WEB target (browser / PWA).
 *
 * WHY this exists: native FCM getToken() is fragile on real devices
 * (TOO_MANY_REGISTRATIONS, SERVICE_NOT_AVAILABLE, VPN/WiFi blocking FCM ports).
 * The browser's own PushManager.subscribe() does NOT call getToken() — it talks
 * straight to the browser push service using our self-generated VAPID key — so it
 * registers reliably where native FCM fails. The backend (webpush_service.py)
 * delivers the SAME payload to this channel, so a web user gets identical pushes.
 *
 * Only runs on web; guarded so it is never bundled into a native code path.
 */
import { api } from "@/src/api/client";

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i += 1) out[i] = raw.charCodeAt(i);
  return out;
}

/** Stable per-browser id so a re-subscribe updates the SAME backend record. */
function webDeviceId(): string {
  try {
    let id = localStorage.getItem("azo_web_device_id");
    if (!id) {
      id = `web-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
      localStorage.setItem("azo_web_device_id", id);
    }
    return id;
  } catch {
    return `web-${Math.random().toString(36).slice(2, 12)}`;
  }
}

function browserName(): string {
  const ua = (navigator.userAgent || "").toLowerCase();
  if (ua.includes("edg/")) return "edge";
  if (ua.includes("chrome") || ua.includes("crios")) return "chrome";
  if (ua.includes("firefox") || ua.includes("fxios")) return "firefox";
  if (ua.includes("safari")) return "safari";
  return "web";
}

export type WebPushResult = { ok: boolean; reason?: string; error?: string };

export async function registerWebPush(): Promise<WebPushResult> {
  // 1) Capability check — old / in-app browsers (and iOS < 16.4 non-PWA) lack Push.
  if (typeof window === "undefined" || !("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) {
    return { ok: false, reason: "unsupported", error: "This browser does not support Web Push." };
  }

  // 2) Permission — must be granted (asks the user if still "default").
  let perm = Notification.permission;
  if (perm === "default") {
    try { perm = await Notification.requestPermission(); } catch { /* ignore */ }
  }
  if (perm !== "granted") {
    return { ok: false, reason: "permission", error: "Notification permission was not granted in the browser." };
  }

  // 3) VAPID public key from the backend (self-generated, always available).
  let publicKey = "";
  try {
    const cfg = await api.get<{ public_key: string; enabled: boolean }>("/notifications/webpush/public-key");
    publicKey = cfg?.public_key || "";
  } catch (e: any) {
    return { ok: false, reason: "no_vapid", error: `Could not fetch VAPID key: ${String(e?.message || e)}` };
  }
  if (!publicKey) return { ok: false, reason: "no_vapid", error: "Web Push VAPID key is not configured on the server." };

  // 4) Register the service worker (served from /sw.js at the site root).
  let reg: ServiceWorkerRegistration;
  try {
    reg = await navigator.serviceWorker.register("/sw.js", { scope: "/" });
    await navigator.serviceWorker.ready;
  } catch (e: any) {
    return { ok: false, reason: "sw_failed", error: `Service worker registration failed: ${String(e?.message || e)}` };
  }

  // 5) Subscribe (reuse existing sub if present, else create a new one).
  let sub: PushSubscription | null = null;
  try {
    sub = await reg.pushManager.getSubscription();
    if (!sub) {
      sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey),
      });
    }
  } catch (e: any) {
    return { ok: false, reason: "subscribe_failed", error: `PushManager.subscribe failed: ${String(e?.message || e)}` };
  }

  // 6) Persist the subscription on the backend (keyed by stable device_id).
  try {
    await api.post("/notifications/webpush/subscribe", {
      subscription: sub.toJSON(),
      device_id: webDeviceId(),
      user_agent: navigator.userAgent || "",
      platform: "web",
      browser: browserName(),
    });
  } catch (e: any) {
    return { ok: false, reason: "backend_failed", error: `Saving subscription failed: ${String(e?.message || e)}` };
  }

  return { ok: true };
}
