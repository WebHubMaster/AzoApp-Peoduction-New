import axios from "axios";
import { toast } from "sonner";

// Resolve the backend origin at RUNTIME. We prefer the build-time configured
// REACT_APP_BACKEND_URL, but fall back to the current window origin if it is
// missing/empty/"undefined". This makes the app immune to a stale cached bundle
// (or a missing frontend/.env) ever pointing API calls at "undefined/api" — the
// ingress routes same-origin "/api" to the backend, and the configured backend
// URL is the same origin the app is served from.
const _envBackend = process.env.REACT_APP_BACKEND_URL;
const _origin = (typeof window !== "undefined" && window.location && window.location.origin) || "";
const BACKEND_ORIGIN = String(
  _envBackend && _envBackend !== "undefined" ? _envBackend : _origin
).replace(/\/+$/, "");
export const API = `${BACKEND_ORIGIN}/api`;

/**
 * Resolve a media URL for <img>. Backend-stored media URLs are often RELATIVE
 * ("/api/media/..."), which a browser resolves against the PANEL origin — wrong
 * when the panel and backend are on different hosts (panel: webhubmaster.shop,
 * backend: api.webhubmaster.shop) → broken preview. Prefix relative URLs with the
 * backend origin so images always load. Absolute/data/blob URLs pass through.
 */
export const mediaSrc = (u) => {
  if (!u) return u;
  const s = String(u);
  if (/^(https?:|data:|blob:)/i.test(s)) return s;
  return `${BACKEND_ORIGIN}${s.startsWith("/") ? "" : "/"}${s}`;
};

// ---- Resilient axios instance -------------------------------------------------
// Generous timeout so slow networks don't fail prematurely; combined with retry
// below this keeps data loading even on flaky/slow connections.
const api = axios.create({
  baseURL: API,
  timeout: 45000,
});

api.interceptors.request.use((cfg) => {
  const t = localStorage.getItem("azo_token");
  if (t) cfg.headers.Authorization = `Bearer ${t}`;
  return cfg;
});

// ---- Friendly toast (throttled so a burst of failures shows one message) ------
let _lastToastAt = 0;
let _lastToastMsg = "";
function notifyError(message) {
  const now = Date.now();
  if (message === _lastToastMsg && now - _lastToastAt < 4000) return;
  _lastToastAt = now;
  _lastToastMsg = message;
  try {
    toast.error(message, { id: "api-error", duration: 4000 });
  } catch (_) {
    /* toaster not mounted yet */
  }
}

const MAX_RETRIES = 3;
const RETRY_BASE_MS = 700;

function isRetriable(error) {
  const cfg = error?.config || {};
  const method = (cfg.method || "get").toLowerCase();
  // Only retry safe/idempotent reads to avoid double-submitting writes.
  if (!["get", "head"].includes(method)) return false;
  // Network error / timeout (no response) → retry.
  if (!error.response) return true;
  // Transient server errors → retry.
  const s = error.response.status;
  return s >= 500 && s < 600;
}

api.interceptors.response.use(
  (res) => res,
  async (error) => {
    const cfg = error?.config;

    // --- Retry with exponential backoff (slow network / transient 5xx) ---
    if (cfg && isRetriable(error)) {
      cfg.__retryCount = cfg.__retryCount || 0;
      if (cfg.__retryCount < MAX_RETRIES) {
        cfg.__retryCount += 1;
        const delay = RETRY_BASE_MS * Math.pow(2, cfg.__retryCount - 1);
        await new Promise((r) => setTimeout(r, delay));
        return api(cfg);
      }
    }

    // --- Friendly, non-crashing error surfacing -----------------------------
    const status = error?.response?.status;
    const code = error?.code;
    if (status === 401) {
      // let auth flow handle silently (no scary toast)
    } else if (!error.response || code === "ECONNABORTED" || code === "ERR_NETWORK") {
      notifyError("Connection issue. Reconnecting — please try again in a moment.");
    } else if (status >= 500) {
      notifyError("Something went wrong on our end. Please try again shortly.");
    } else if (status === 403) {
      // permission errors handled by callers; keep quiet
    }
    // Reject as usual so callers' try/catch still works — but the app won't crash.
    return Promise.reject(error);
  },
);

export const fmt = (n) =>
  "₹" + Number(n || 0).toLocaleString("en-IN", { maximumFractionDigits: 2 });

/* Compact number: 1.2K / 15M / 15.06M / 3.4B — max 2 decimals, trailing zeros stripped.
   Numbers below 1,000 are shown in full (with up to 2 decimals). */
export const compact = (n) => {
  const num = Number(n) || 0;
  const sign = num < 0 ? "-" : "";
  const abs = Math.abs(num);
  const trim = (v) => v.toFixed(2).replace(/\.?0+$/, "");
  if (abs >= 1e9) return sign + trim(abs / 1e9) + "B";
  if (abs >= 1e6) return sign + trim(abs / 1e6) + "M";
  if (abs >= 1e3) return sign + trim(abs / 1e3) + "K";
  return sign + (Number.isInteger(abs) ? String(abs) : trim(abs));
};

/* Compact currency: ₹100.32K / ₹15.06M etc. */
export const fmtC = (n) => "\u20b9" + compact(n);

/* Compact "count+" trust stat: 1200 -> "1.2K+", 5000000 -> "50L+" (Indian).
   Strings (admin display overrides like "50K+") are returned as-is. */
export const compactPlus = (v) => {
  if (v === null || v === undefined || v === "") return null;
  if (typeof v === "string") return v;
  const x = Number(v) || 0;
  if (x >= 10000000) return `${(x / 10000000).toFixed(x % 10000000 ? 1 : 0)}Cr+`;
  if (x >= 100000) return `${(x / 100000).toFixed(x % 100000 ? 1 : 0)}L+`;
  if (x >= 1000) return `${(x / 1000).toFixed(x % 1000 ? 1 : 0)}K+`;
  return String(x);
};

export default api;
