import { useSyncExternalStore } from "react";

// Tiny global store that tracks whether the user is currently viewing a chat
// screen (support ticket thread or booking chat). Used to (a) hide the mobile
// bottom nav while chatting and (b) stay silent on new-message sounds while the
// chat is on screen (a different, pleasant chime plays only when NOT in a chat).
let openCount = 0;
const subs = new Set();
const emit = () => subs.forEach((cb) => { try { cb(); } catch { /* ignore */ } });

export const enterChat = () => { openCount += 1; emit(); };
export const exitChat = () => { openCount = Math.max(0, openCount - 1); emit(); };
export const isChatOpen = () => openCount > 0;

const subscribe = (cb) => { subs.add(cb); return () => subs.delete(cb); };

// React hook: re-renders a component whenever chat-open state changes.
export const useChatOpen = () => useSyncExternalStore(subscribe, isChatOpen, isChatOpen);
