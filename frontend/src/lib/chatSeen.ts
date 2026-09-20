/**
 * Chat unseen-count tracking + last-seen persistence (WhatsApp-style badge).
 * We have no server read-receipts, so "unseen" = messages from the OTHER party
 * newer than the last time this device opened that booking's chat. Last-seen
 * timestamps persist in storage and are exposed via a tiny external store so the
 * Chat button badge and the chat screen stay in sync app-wide.
 */
import { useCallback, useSyncExternalStore } from "react";
import { storage } from "@/src/utils/storage";

const KEY = "azo_chat_seen"; // { [bookingId]: ISO string of last-seen message }
let seen: Record<string, string> = {};
let loaded = false;
const listeners = new Set<() => void>();

function emit() { listeners.forEach((l) => l()); }

async function ensureLoaded() {
  if (loaded) return;
  loaded = true;
  try { const raw = await storage.getItem(KEY); if (raw) seen = JSON.parse(raw) || {}; } catch { /* ignore */ }
  emit();
}
ensureLoaded();

function persist() { storage.setItem(KEY, JSON.stringify(seen)).catch(() => {}); }

/** Mark every message in a booking's thread as seen up to `latestIso` (or now). */
export function markChatSeen(bookingId: string, latestIso?: string) {
  if (!bookingId) return;
  const iso = latestIso || new Date().toISOString();
  if (seen[bookingId] && seen[bookingId] >= iso) return;
  seen[bookingId] = iso;
  persist();
  emit();
}

export function getLastSeen(bookingId: string): string {
  return seen[bookingId] || "";
}

function subscribe(cb: () => void) { listeners.add(cb); return () => { listeners.delete(cb); }; }
function snapshot() { return seen; }

/** Reactive count of messages from the other party newer than last-seen. */
export function useUnseenCount(bookingId: string, messages: any[], myId: string): number {
  const map = useSyncExternalStore(subscribe, snapshot, snapshot);
  const last = map[bookingId] || "";
  if (!Array.isArray(messages) || !messages.length) return 0;
  return messages.filter((m) => m && m.sender_id && m.sender_id !== myId && String(m.created_at || "") > last).length;
}

/** Hook returning a stable markSeen for the given booking. */
export function useMarkSeen(bookingId: string) {
  return useCallback((latestIso?: string) => markChatSeen(bookingId, latestIso), [bookingId]);
}
