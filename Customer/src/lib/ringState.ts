/** Tiny shared flag: is the background job/reschedule SSE listener active?
 *  Kept out of notifications.ts to avoid an import cycle. */
let _bgActive = false;
export function setBgListenerActive(v: boolean) { _bgActive = v; }
export function isBgListenerActive(): boolean { return _bgActive; }

/** True while an APK update download owns the Notifee foreground service. */
let _updateFgs = false;
export const setUpdateFgsActive = (v: boolean) => { _updateFgs = v; };
export const isUpdateFgsActive = () => _updateFgs;
