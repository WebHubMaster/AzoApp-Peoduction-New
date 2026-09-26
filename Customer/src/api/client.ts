/**
 * API client for the AzoApp Customer App.
 * Talks to the SAME FastAPI backend that powers the Customer Web Panel.
 * Base URL comes from EXPO_PUBLIC_BACKEND_URL; the ingress routes /api → backend.
 */
import { secureStorage } from "@/src/utils/storage";

const RAW = process.env.EXPO_PUBLIC_BACKEND_URL || "";
export const API_BASE = `${RAW.replace(/\/+$/, "")}/api`;
export const MEDIA_ORIGIN = RAW.replace(/\/+$/, "");
export const TOKEN_KEY = "azo_token";

export function mediaUrl(u?: string | null): string | undefined {
  if (!u) return undefined;
  if (/^(data:|blob:|file:|content:|asset:)/i.test(u)) return u;
  if (/^https?:\/\//i.test(u)) return u.replace(/^http:\/\/(?!localhost|127\.0\.0\.1|10\.|192\.168\.|0\.0\.0\.0)/i, "https://");
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

const MAX_RETRIES = 3;
const RETRY_BASE_MS = 700;

async function request<T = any>(path: string, opts: RequestOpts = {}, attempt = 0): Promise<T> {
  const { method = "GET", body, auth = true, timeoutMs = 45000 } = opts;
  const isForm = typeof FormData !== "undefined" && body instanceof FormData;
  const headers: Record<string, string> = isForm ? {} : { "Content-Type": "application/json" };
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
      body: body != null ? (isForm ? body : JSON.stringify(body)) : undefined,
      signal: controller.signal,
    });
  } catch {
    clearTimeout(timer);
    if (method === "GET" && attempt < MAX_RETRIES) {
      await new Promise((r) => setTimeout(r, RETRY_BASE_MS * Math.pow(2, attempt)));
      return request<T>(path, opts, attempt + 1);
    }
    throw new ApiError(0, "Connection issue. Reconnecting — please try again in a moment.");
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
    if (method === "GET" && res.status >= 500 && attempt < MAX_RETRIES) {
      await new Promise((r) => setTimeout(r, RETRY_BASE_MS * Math.pow(2, attempt)));
      return request<T>(path, opts, attempt + 1);
    }
    const raw = data && (data.detail ?? data.message);
    const detail = typeof raw === "string" ? raw
      : Array.isArray(raw) ? raw.map((e: any) => (e && typeof e.msg === "string" ? e.msg : "")).filter(Boolean).join(" ")
      : raw && typeof raw.msg === "string" ? raw.msg : "";
    throw new ApiError(res.status, detail || (res.status >= 500 ? "Something went wrong on our end. Please try again shortly." : "Request failed"));
  }
  return data as T;
}

export const api = {
  get: <T = any>(path: string, opts?: RequestOpts) => request<T>(path, { ...opts, method: "GET" }),
  post: <T = any>(path: string, body?: any, opts?: RequestOpts) => request<T>(path, { ...opts, method: "POST", body }),
  put: <T = any>(path: string, body?: any, opts?: RequestOpts) => request<T>(path, { ...opts, method: "PUT", body }),
  del: <T = any>(path: string, body?: any, opts?: RequestOpts) => request<T>(path, { ...opts, method: "DELETE", body }),
};
