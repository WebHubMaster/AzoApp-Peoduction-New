/**
 * Tiny shared flag so notifications.ts and backgroundRing.ts can coordinate the
 * single Notifee foreground service WITHOUT importing each other (avoids an import
 * cycle). When the background job listener owns the foreground service, cancelling
 * a finished ring must NOT tear the service down (that would kill the SSE listener).
 */
let _bgListenerActive = false;
export const setBgListenerActive = (v: boolean) => { _bgListenerActive = v; };
export const isBgListenerActive = () => _bgListenerActive;

/** True while an APK update download owns the Notifee foreground service. */
let _updateFgs = false;
export const setUpdateFgsActive = (v: boolean) => { _updateFgs = v; };
export const isUpdateFgsActive = () => _updateFgs;
