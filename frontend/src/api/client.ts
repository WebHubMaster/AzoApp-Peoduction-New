/**
 * API client for the AzoApp Partner/Merchant app.
 * Talks to the SAME FastAPI backend that powers the web panels (feature parity).
 * Base URL comes from EXPO_PUBLIC_BACKEND_URL; the ingress routes /api → backend.
 */
import { secureStorage } from "@/src/utils/storage";

const RAW = process.env.EXPO_PUBLIC_BACKEND_URL || "";
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
  if (/^https?:\/\//i.test(u)) return u;
  if (u.startsWith("/")) return `${MEDIA_ORIGIN}${u}`;
  return `${MEDIA_ORIGIN}/${u}`;
}

export class ApiError extends Error {
  status: number;
  detail: string;
  constructor(status: number, detail: string) {
    super(detail);
    this.status = status;
    this.detail = detail;
  }
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
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let res: Response;
  try {
    res = await fetch(`${API_BASE}${path}`, {
      method,
      headers,
      body: body != null ? JSON.stringify(body) : undefined,
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
    const detail =
      (data && (data.detail || data.message)) ||
      (res.status >= 500 ? "Something went wrong. Please try again shortly." : "Request failed");
    throw new ApiError(res.status, typeof detail === "string" ? detail : "Request failed");
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
