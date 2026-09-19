import { useCallback } from "react";
import { useSearchParams } from "react-router-dom";

/**
 * Keeps the active dashboard section/tab in the URL (?tab=...) so it survives
 * a full page reload and is shareable / back-button friendly.
 *
 * Drop-in replacement for `useState(defaultKey)`.
 *   const [active, setActive] = useTabParam("dashboard");
 *
 * Supports both direct values and functional updaters, just like setState.
 */
export default function useTabParam(defaultKey, param = "tab") {
  const [searchParams, setSearchParams] = useSearchParams();
  const active = searchParams.get(param) || defaultKey;

  const setActive = useCallback(
    (key) => {
      const current = searchParams.get(param) || defaultKey;
      const val = typeof key === "function" ? key(current) : key;
      // No-op if the tab is unchanged — prevents duplicate history entries when a
      // component re-syncs the same tab (e.g. on mount / effects).
      if (val === current) return;
      const next = new URLSearchParams(searchParams);
      if (val) next.set(param, val);
      else next.delete(param);
      // PUSH (not replace) so each in-dashboard section change creates a real
      // history entry. The browser / Android Back button then returns to the
      // PREVIOUS section instead of jumping out of the dashboard to the homepage.
      // (Entering the dashboard from login already uses replace, so no extra
      // entry is created for the default landing tab.)
      setSearchParams(next, { replace: false });
    },
    [searchParams, setSearchParams, param, defaultKey]
  );

  return [active, setActive];
}
