import React, { useEffect, useState } from "react";
import { X, RefreshCw, Apple, Play } from "lucide-react";
import api from "@/lib/api";

const DAY_KEY = "azo_install_prompt_day";

function todayKey() {
  return new Date().toISOString().slice(0, 10);
}
function isStandalone() {
  return window.matchMedia("(display-mode: standalone)").matches || window.navigator.standalone === true;
}
function isIos() {
  return /iphone|ipad|ipod/i.test(window.navigator.userAgent) && !window.MSStream;
}
function isAndroid() {
  return /android/i.test(window.navigator.userAgent);
}

/**
 * Mobile-only "Install App" prompt that redirects to the Play Store (Android) or
 * App Store (iOS) based on the visitor's OS. Shown at most ONCE PER DAY per device.
 * Also renders the service-worker update banner.
 */
export default function InstallPrompt() {
  const [show, setShow] = useState(false);
  const [updateReg, setUpdateReg] = useState(null);
  const [cfg, setCfg] = useState({
    enabled: true, install_prompt_enabled: true,
    install_title: "Install AzoApp",
    install_message: "Get the full app experience — download AzoApp from the store.",
    play_store_url: "", app_store_url: "", android_enabled: true, ios_enabled: true,
  });

  useEffect(() => {
    api.get("/growth/config").then((r) => { if (r.data?.pwa) setCfg((c) => ({ ...c, ...r.data.pwa })); }).catch(() => {});
  }, []);

  // Which store applies to THIS visitor's OS (mobile only). null => show nothing.
  const target = (() => {
    if (isAndroid() && cfg.android_enabled !== false && cfg.play_store_url)
      return { platform: "android", url: cfg.play_store_url };
    if (isIos() && cfg.ios_enabled !== false && cfg.app_store_url)
      return { platform: "ios", url: cfg.app_store_url };
    return null;
  })();

  useEffect(() => {
    const onUpd = (e) => setUpdateReg(e.detail);
    window.addEventListener("azo-sw-update", onUpd);
    return () => window.removeEventListener("azo-sw-update", onUpd);
  }, []);

  useEffect(() => {
    if (isStandalone()) return;                                  // already installed → never
    if (cfg.enabled === false || cfg.install_prompt_enabled === false) return;
    if (!target) return;                                         // OS disabled / no store URL
    if (localStorage.getItem(DAY_KEY) === todayKey()) return;    // already shown today
    const t = setTimeout(() => setShow(true), 2500);
    return () => clearTimeout(t);
  }, [cfg, target]);

  const seenToday = () => { try { localStorage.setItem(DAY_KEY, todayKey()); } catch { /* ignore */ } };
  const dismiss = () => { seenToday(); setShow(false); };
  const install = () => {
    seenToday();
    if (target?.url) window.open(target.url, "_blank", "noopener,noreferrer");
    setShow(false);
  };
  const doUpdate = () => {
    try { updateReg?.waiting?.postMessage({ type: "SKIP_WAITING" }); } catch { /* ignore */ }
    setTimeout(() => window.location.reload(), 300);
  };

  if (isStandalone() && !updateReg) return null;

  return (
    <>
      {updateReg && (
        <div data-testid="pwa-update-banner" className="fixed left-1/2 -translate-x-1/2 bottom-4 z-[9999] w-[min(92vw,420px)]">
          <div className="flex items-center gap-3 rounded-2xl bg-slate-900 text-white shadow-2xl px-4 py-3">
            <RefreshCw className="h-5 w-5 text-primary-300 shrink-0" />
            <p className="text-sm flex-1">A new version of AzoApp is available.</p>
            <button onClick={doUpdate} className="h-9 px-3 rounded-xl bg-white text-slate-900 text-sm font-bold">Update</button>
          </div>
        </div>
      )}

      {cfg.enabled !== false && cfg.install_prompt_enabled !== false && show && target && (
        <div data-testid="pwa-install-prompt" className="fixed left-1/2 -translate-x-1/2 bottom-4 z-[9998] w-[min(94vw,440px)] animate-in slide-in-from-bottom-4">
          <div className="relative rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xl p-4">
            <button onClick={dismiss} data-testid="pwa-dismiss" className="absolute right-3 top-3 h-8 w-8 grid place-items-center rounded-lg text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"><X className="h-4 w-4" /></button>
            <div className="flex items-center gap-3.5">
              <img src={cfg.icon || "/logo192.png"} alt="AzoApp" className="h-14 w-14 rounded-2xl shadow" />
              <div className="min-w-0 pr-6">
                <p className="font-bold text-slate-900 dark:text-white">{cfg.install_title || "Install AzoApp"}</p>
                <p className="text-[13px] text-slate-500 dark:text-slate-400 mt-0.5">{cfg.install_message}</p>
              </div>
            </div>
            <button onClick={install} data-testid="pwa-install-btn" className="mt-3 w-full h-11 rounded-2xl bg-primary-700 hover:bg-primary-800 text-white font-bold inline-flex items-center justify-center gap-2">
              {target.platform === "ios" ? <Apple className="h-4 w-4" /> : <Play className="h-4 w-4" />}
              {target.platform === "ios" ? "Get it on the App Store" : "Get it on Google Play"}
            </button>
          </div>
        </div>
      )}
    </>
  );
}
