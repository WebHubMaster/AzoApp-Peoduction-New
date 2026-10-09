/** Weak-network safe "Complete Job": one fast attempt, then persisted background retries.
 *  The backend completion is idempotent + atomically locked, so retries never double-credit. */
import AsyncStorage from "@react-native-async-storage/async-storage";
import NetInfo from "@react-native-community/netinfo";
import { api } from "@/src/api/client";

const KEY = "azo_pending_completions";
const MAX_AGE_MS = 6 * 60 * 60 * 1000;
type Job = { id: string; otp: string; at: number };
export type CompletionEvent = { id: string; state: "retrying" | "done" | "failed"; data?: any; error?: string; attempt?: number };

const listeners = new Set<(ev: CompletionEvent) => void>();
const running = new Set<string>();
let kick: (() => void)[] = [];
NetInfo.addEventListener((s) => { if (s.isConnected) { const k = kick; kick = []; k.forEach((f) => f()); } });

export const onCompletion = (fn: (ev: CompletionEvent) => void) => { listeners.add(fn); return () => { listeners.delete(fn); }; };
const emit = (ev: CompletionEvent) => listeners.forEach((fn) => { try { fn(ev); } catch { /* noop */ } });
const retriable = (e: any) => !e?.status || e.status >= 500 || e.status === 409 || e.status === 408 || e.status === 429;

async function read(): Promise<Record<string, Job>> {
  try { return JSON.parse((await AsyncStorage.getItem(KEY)) || "{}") || {}; } catch { return {}; }
}
async function save(fn: (m: Record<string, Job>) => void) {
  const m = await read(); fn(m); await AsyncStorage.setItem(KEY, JSON.stringify(m)).catch(() => {});
}
const sleep = (ms: number) => new Promise<void>((r) => { const t = setTimeout(r, ms); kick.push(() => { clearTimeout(t); r(); }); });

export async function isCompletionPending(id: string) { return !!(await read())[id]; }

async function loop(id: string) {
  if (running.has(id)) return;
  running.add(id);
  let attempt = 0;
  try {
    for (;;) {
      const job = (await read())[id];
      if (!job) return;
      if (Date.now() - job.at > MAX_AGE_MS) { await save((m) => { delete m[id]; }); emit({ id, state: "failed", error: "Completion timed out. Please try again." }); return; }
      await sleep(Math.min(2000 * 2 ** attempt, 20000));
      try {
        const data = await api.post(`/bookings/${id}/complete`, { otp: job.otp }, { timeoutMs: 15000 });
        await save((m) => { delete m[id]; });
        emit({ id, state: "done", data });
        return;
      } catch (e: any) {
        if (!retriable(e)) { await save((m) => { delete m[id]; }); emit({ id, state: "failed", error: e?.detail || e?.message || "Could not complete job" }); return; }
        attempt += 1;
        emit({ id, state: "retrying", attempt });
      }
    }
  } finally { running.delete(id); }
}

/** Resolves with the completed job, or `{ queued: true }` when it will finish in the background. Throws on a real (4xx) error. */
export async function completeJob(id: string, otp: string): Promise<any> {
  try {
    return await api.post(`/bookings/${id}/complete`, { otp }, { timeoutMs: 15000 });
  } catch (e: any) {
    if (!retriable(e)) throw e;
    await save((m) => { m[id] = { id, otp, at: Date.now() }; });
    loop(id);
    return { queued: true };
  }
}

export async function resumePendingCompletions() {
  Object.keys(await read()).forEach((id) => { loop(id); });
}
