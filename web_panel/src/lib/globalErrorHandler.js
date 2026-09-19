import { toast } from "sonner";

/**
 * Suppress the CRA dev "Uncaught runtime errors" red overlay and, in its place,
 * show a clean, friendly toast. We attach listeners in the CAPTURE phase and
 * call stopImmediatePropagation so react-error-overlay's own (bubble-phase)
 * listener never fires — the app keeps running instead of crashing to a red screen.
 */

let _last = 0;
function friendly(message) {
  const now = Date.now();
  if (now - _last < 4000) return; // throttle bursts
  _last = now;
  try {
    toast.error(message, { id: "runtime-error", duration: 4000 });
  } catch (_) {
    /* noop */
  }
}

function isAxiosLike(reason) {
  return !!(reason && (reason.isAxiosError || reason.name === "AxiosError"));
}

// Clipboard writes reject with a DOMException (NotAllowedError) when the page
// lacks clipboard permission — common in embedded/preview/insecure contexts and
// automated browsers. These are non-critical (the copy simply didn't happen), so
// we swallow them instead of crashing to the red runtime-error overlay.
function isClipboardError(reason) {
  if (!reason) return false;
  const name = reason.name || "";
  const msg = String(reason.message || reason || "");
  return (
    name === "NotAllowedError" ||
    /clipboard/i.test(msg) ||
    /writeText/i.test(msg)
  );
}

export function installGlobalErrorHandlers() {
  if (typeof window === "undefined" || window.__azoErrHandlersInstalled) return;
  window.__azoErrHandlersInstalled = true;

  // Unhandled promise rejections (e.g. an axios call without try/catch).
  window.addEventListener(
    "unhandledrejection",
    (event) => {
      const reason = event.reason;
      if (isClipboardError(reason)) {
        // Non-critical: copy-to-clipboard was blocked. Swallow silently so the
        // red overlay never appears and never blocks the UI.
        event.preventDefault();
        event.stopImmediatePropagation();
        return;
      }
      if (isAxiosLike(reason)) {
        const status = reason?.response?.status;
        if (status === 401 || status === 403) {
          // auth/permission handled elsewhere — just swallow silently
        } else if (!reason.response) {
          friendly("Connection issue. Please check your network and try again.");
        } else if (status >= 500) {
          friendly("Something went wrong on our end. Please try again shortly.");
        }
        // Prevent the red overlay from showing for handled API failures.
        event.preventDefault();
        event.stopImmediatePropagation();
      }
    },
    true, // capture phase → runs before react-error-overlay's listener
  );

  // Generic runtime errors that bubble to window.
  window.addEventListener(
    "error",
    (event) => {
      const err = event.error;
      if (isClipboardError(err)) {
        event.preventDefault();
        event.stopImmediatePropagation();
        return;
      }
      if (isAxiosLike(err)) {
        friendly("Something went wrong. Please try again.");
        event.preventDefault();
        event.stopImmediatePropagation();
      }
    },
    true,
  );
}
