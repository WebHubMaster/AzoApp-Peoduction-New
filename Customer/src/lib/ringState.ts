/** Tiny shared flag: is the background job/reschedule SSE listener active?
 *  Kept out of notifications.ts to avoid an import cycle. */
let _bgActive = false;
export function setBgListenerActive(v: boolean) { _bgActive = v; }
export function isBgListenerActive(): boolean { return _bgActive; }
