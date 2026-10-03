let guard = null;
export const setNavGuard = (fn) => { guard = fn; };
export const guardNav = (go) => (guard ? guard(go) : go());
