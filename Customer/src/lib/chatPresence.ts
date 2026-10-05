import { useSyncExternalStore } from "react";

// Tiny global store tracking whether the user is currently viewing a chat screen
// (the support ticket thread). Used to (a) hide the bottom nav while chatting and
// (b) stay silent on new-message sounds while the chat is on screen — a pleasant
// chime plays only when a message arrives while the user is NOT in the chat.
let openCount = 0;
const subs = new Set<() => void>();
const emit = () => subs.forEach((cb) => { try { cb(); } catch { /* ignore */ } });

export const enterChat = () => { openCount += 1; emit(); };
export const exitChat = () => { openCount = Math.max(0, openCount - 1); emit(); };
export const isChatOpen = () => openCount > 0;

const subscribe = (cb: () => void) => { subs.add(cb); return () => { subs.delete(cb); }; };

export const useChatOpen = () => useSyncExternalStore(subscribe, isChatOpen, isChatOpen);
