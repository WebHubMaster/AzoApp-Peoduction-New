/**
 * API client for the AzoApp Partner/Merchant App
 * Talks to the SAME FastAPI backend that powers the web panels (feature parity).
 * Base URL comes from EXPO_PUBLIC_BACKEND_URL; the ingress routes /api → backend.
 */
import { secureStorage } from "@/src/utils/storage";
import { getDeviceUid } from "@/src/lib/deviceId";

const RAW = process.env.EXPO_PUBLIC_BACKEND_URL || "https://api.webhubmaster.shop";
export const API_BASE = `${RAW.replace(/\/+$/, "")}/api`;
export const MEDIA_ORIGIN = RAW.replace(/\/+$/, "");
export const TOKEN_KEY = "azo_token";

/**
 * Absolutise a media/asset URL returned by the backend.
 * The backend returns RELATIVE paths (e.g. "/api/media/file/kyc/x.webp").
 * Browsers resolve these against the page origin, but React Native's <Image>
 * needs a fully-qualified URL — otherwise the image silently fails to load.
 */
export function mediaUrl(u?: string | null): string | undefined {
  if (!u) return undefined;
  // Local / inline URIs must pass through untouched — prefixing them corrupts the
  // source (e.g. a base64 profile photo or a freshly-picked file:// image).
  if (/^(data:|blob:|file:|content:|asset:)/i.test(u)) return u;
  if (/^https?:\/\//i.test(u)) {
    // Android 15+ blocks cleartext http (network security policy) → every http
    // image silently fails to load. Our backend serves https, so upgrade any
    // absolute http URL for a real (non-local) host to https.
    return u.replace(/^http:\/\/(?!localhost|127\.0\.0\.1|10\.|192\.168\.|0\.0\.0\.0)/i, "https://");
  }
  if (u.startsWith("/")) return `${MEDIA_ORIGIN}${u}`;
  return `${MEDIA_ORIGIN}/${u}`;
}

export class ApiError extends Error {
  status: number;
  detail: string;
  code: string;
  constructor(status: number, detail: string, code = "") {
    super(detail);
    this.status = status;
    this.detail = detail;
    this.code = code;
  }
}

// When the backend force-logs-out this device (single-device lock: another device
// registered), the API layer clears the token and notifies AuthContext so the app
// drops to the login screen with a "session ended" banner.
let _onForceLogout: ((reason: string) => void) | null = null;
export function setForceLogoutHandler(fn: ((reason: string) => void) | null) {
  _onForceLogout = fn;
}

let _memoryToken: string | null = null;

export async function getToken(): Promise<string | null> {
  if (_memoryToken) return _memoryToken;
  _memoryToken = await secureStorage.getItem(TOKEN_KEY);
  return _memoryToken;
}

export async function setToken(token: string | null) {
  _memoryToken = token;
  if (token) await secureStorage.setItem(TOKEN_KEY, token);
  else await secureStorage.removeItem(TOKEN_KEY);
}

interface RequestOpts {
  method?: string;
  body?: any;
  auth?: boolean;
  timeoutMs?: number;
}

async function request<T = any>(path: string, opts: RequestOpts = {}): Promise<T> {
  const { method = "GET", body, auth = true, timeoutMs = 45000 } = opts;
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (auth) {
    const t = await getToken();
    if (t) headers.Authorization = `Bearer ${t}`;
  }
  // Single-device login: every OTP verification carries this device's stable id so the
  // backend can register / enforce the bound device.
  let finalBody = body;
  if (method === "POST" && path === "/auth/verify-otp") {
    finalBody = { ...(body || {}), device_id: (body && body.device_id) || (await getDeviceUid()) };
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let res: Response;
  try {
    res = await fetch(`${API_BASE}${path}`, {
      method,
      headers,
      body: finalBody != null ? JSON.stringify(finalBody) : undefined,
      signal: controller.signal,
    });
  } catch (e: any) {
    clearTimeout(timer);
    throw new ApiError(0, "Network issue. Please check your connection and try again.");
  }
  clearTimeout(timer);

  const text = await res.text();
  let data: any = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }
  if (!res.ok) {
    const raw = data && (data.detail ?? data.message);
    let code = "";
    let detail = "";
    if (raw && typeof raw === "object" && !Array.isArray(raw) && (raw.code || raw.message)) {
      // Structured error, e.g. { code: "device_mismatch", message: "..." }.
      code = typeof raw.code === "string" ? raw.code : "";
      detail = typeof raw.message === "string" ? raw.message : "";
    } else {
      // FastAPI 422 returns an array of {msg} objects — flatten to a readable string.
      detail = typeof raw === "string" ? raw
        : Array.isArray(raw) ? raw.map((e: any) => (e && typeof e.msg === "string" ? e.msg : "")).filter(Boolean).join(" ")
        : raw && typeof raw.msg === "string" ? raw.msg : "";
    }
    // Auto-logout: this device's session was revoked because a new device registered.
    if (res.status === 401 && code === "device_revoked") {
      await setToken(null);
      try { _onForceLogout?.("device_revoked"); } catch { /* ignore */ }
    }
    throw new ApiError(res.status, detail || (res.status >= 500 ? "Something went wrong. Please try again shortly." : "Request failed"), code);
  }
  return data as T;
}

export const api = {
  get: <T = any>(path: string, opts?: RequestOpts) => request<T>(path, { ...opts, method: "GET" }),
  post: <T = any>(path: string, body?: any, opts?: RequestOpts) =>
    request<T>(path, { ...opts, method: "POST", body }),
  put: <T = any>(path: string, body?: any, opts?: RequestOpts) =>
    request<T>(path, { ...opts, method: "PUT", body }),
  del: <T = any>(path: string, body?: any, opts?: RequestOpts) =>
    request<T>(path, { ...opts, method: "DELETE", body }),
};
