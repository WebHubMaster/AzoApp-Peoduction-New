/** Global crash/error reporter → backend /api/logs/client (Admin Live Logs).
 *  Captures unhandled JS errors so production issues surface in the Admin
 *  monitoring dashboard. Never sends OTP/password/payment data. No-op on web. */
import { Platform } from "react-native";
import { api } from "@/src/api/client";

function expoApplication(): any { try { return require("expo-application"); } catch { return null; } } // eslint-disable-line @typescript-eslint/no-require-imports

let installed = false;

/** Report a React render-tree crash (from an ErrorBoundary) or any caught error. */
export function reportError(appType: "customer" | "partner", error: any, isFatal = true) {
  if (Platform.OS === "web") return;
  const App = expoApplication();
  try {
    api.post("/logs/client", {
      app: appType, level: isFatal ? "CRITICAL" : "ERROR",
      error_type: error?.name || "Error",
      message: String(error?.message || error || "Unhandled error"),
      stack: String(error?.stack || ""),
      app_version: App?.nativeApplicationVersion || "",
      version_code: String(App?.nativeBuildVersion ?? ""),
      device: Platform.OS, os_version: String((Platform as any).Version || ""),
    }).catch(() => {});
  } catch { /* noop */ }
}

export function initCrashReporter(appType: "customer" | "partner" = "partner") {
  if (installed || Platform.OS === "web") return;
  installed = true;
  const App = expoApplication();
  const meta = {
    app_version: App?.nativeApplicationVersion || App?.default?.nativeApplicationVersion || "",
    version_code: String(App?.nativeBuildVersion ?? App?.default?.nativeBuildVersion ?? ""),
    device: Platform.OS,
    os_version: String((Platform as any).Version || ""),
  };
  const g: any = globalThis as any;
  const prev = g?.ErrorUtils?.getGlobalHandler?.();
  g?.ErrorUtils?.setGlobalHandler?.((error: any, isFatal?: boolean) => {
    try {
      api.post("/logs/client", {
        app: appType,
        level: isFatal ? "CRITICAL" : "ERROR",
        error_type: error?.name || "Error",
        message: String(error?.message || error || "Unhandled error"),
        stack: String(error?.stack || ""),
        ...meta,
      }).catch(() => {});
    } catch { /* never let reporting crash the app */ }
    if (typeof prev === "function") prev(error, isFatal);
  });
}
