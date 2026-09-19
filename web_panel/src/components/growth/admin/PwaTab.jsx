import React, { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Smartphone, Download, Eye, MousePointerClick, Percent, Users, Monitor, RotateCcw, Wifi, Signal, BatteryFull } from "lucide-react";
import api from "@/lib/api";
import { Card, KpiCard, Field, Input, Toggle, SaveBtn, StatusBadge, SectionHeader, inp, fmtNum, dt, cn } from "./kit";
import DataTable from "./DataTable";

function useForm(initial) {
  const [f, setF] = useState(initial || {});
  useEffect(() => { setF(initial || {}); }, [initial]);
  const set = (k, v) => setF((p) => ({ ...p, [k]: v }));
  return [f, set, setF];
}

export default function PwaTab({ cfg, onSaved }) {
  const [f, set, setF] = useForm(cfg);
  const [busy, setBusy] = useState(false);
  const [mode, setMode] = useState("mobile");
  const [data, setData] = useState(null);

  const load = useCallback(() => {
    api.get("/admin/growth/pwa-analytics").then((r) => setData(r.data)).catch(() => setData({ devices: [], summary: {} }));
  }, []);
  useEffect(() => { load(); }, [load]);

  const save = async () => {
    setBusy(true);
    try { await api.put("/admin/growth/config", { pwa: f }); toast.success("PWA settings saved"); onSaved?.(); }
    catch (e) { toast.error(e?.response?.data?.detail || "Save failed"); }
    setBusy(false);
  };
  const resetDefaults = () => setF({
    enabled: true, install_prompt_enabled: true, app_name: "AzoApp — Home Services", short_name: "AzoApp",
    install_title: "Install AzoApp", install_message: "Get the full app experience — download AzoApp from the store.",
    theme_color: "#0D47A1", background_color: "#ffffff",
    play_store_url: "", app_store_url: "", android_enabled: true, ios_enabled: true,
  });

  const summary = data?.summary || {};
  const devices = data?.devices || [];

  const columns = [
    { key: "customer_name", label: "Customer", sortable: true, render: (d) => <span className="font-semibold text-slate-800 dark:text-slate-100">{d.customer_name}</span> },
    { key: "device", label: "Device" },
    { key: "browser", label: "Browser" },
    { key: "os", label: "OS" },
    { key: "status", label: "Install Status", render: (d) => <StatusBadge status={d.status} /> },
    { key: "first_seen", label: "First Seen", sortable: true, render: (d) => dt(d.first_seen), sortValue: (d) => d.first_seen || "" },
    { key: "installed_at", label: "Installed At", render: (d) => d.installed_at ? dt(d.installed_at) : "—" },
    { key: "last_active", label: "Last Active", render: (d) => d.last_active ? dt(d.last_active, true) : "—" },
  ];

  return (
    <div className="space-y-5">
      {/* status cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
        <KpiCard label="PWA Status" value={f.enabled !== false ? "Enabled" : "Disabled"} icon={Smartphone} tone={f.enabled !== false ? "green" : "slate"} />
        <KpiCard label="Install Prompt" value={f.install_prompt_enabled !== false ? "On" : "Off"} icon={MousePointerClick} tone={f.install_prompt_enabled !== false ? "green" : "slate"} />
        <KpiCard label="Total PWA Installs" value={fmtNum(summary.installs)} icon={Download} tone="primary" />
        <KpiCard label="Prompt Views" value={fmtNum(summary.prompt_views)} icon={Eye} tone="sky" />
        <KpiCard label="Conversion Rate" value={`${summary.conversion_rate ?? 0}%`} icon={Percent} tone="violet" />
        <KpiCard label="Active Installed" value={fmtNum(summary.active_users)} icon={Users} tone="amber" />
      </div>

      <div className="grid xl:grid-cols-3 gap-5">
        {/* config */}
        <Card className="p-5 xl:col-span-2">
          <SectionHeader icon={Smartphone} title="Install Experience" subtitle="Redirects mobile visitors to the App Store / Play Store — shown once per day"
            right={<div className="flex items-center gap-4"><Toggle checked={f.enabled !== false} onChange={(v) => set("enabled", v)} label="PWA" /><Toggle checked={f.install_prompt_enabled !== false} onChange={(v) => set("install_prompt_enabled", v)} label="Prompt" /></div>} />
          <div className="grid sm:grid-cols-2 gap-4">
            <Field label="App Name"><Input value={f.app_name || ""} onChange={(e) => set("app_name", e.target.value)} /></Field>
            <Field label="Short Name"><Input value={f.short_name || ""} onChange={(e) => set("short_name", e.target.value)} /></Field>
            <Field label="Install Title"><Input value={f.install_title || ""} onChange={(e) => set("install_title", e.target.value)} /></Field>
            <Field label="Theme Color"><div className="flex items-center gap-2"><input type="color" className="h-10 w-12 rounded-xl border border-slate-200 dark:border-slate-700 cursor-pointer" value={f.theme_color || "#0D47A1"} onChange={(e) => set("theme_color", e.target.value)} /><Input value={f.theme_color || "#0D47A1"} onChange={(e) => set("theme_color", e.target.value)} /></div></Field>
            <Field label="Background Color"><div className="flex items-center gap-2"><input type="color" className="h-10 w-12 rounded-xl border border-slate-200 dark:border-slate-700 cursor-pointer" value={f.background_color || "#ffffff"} onChange={(e) => set("background_color", e.target.value)} /><Input value={f.background_color || "#ffffff"} onChange={(e) => set("background_color", e.target.value)} /></div></Field>
            <Field label="App Icon URL"><Input value={f.icon || ""} onChange={(e) => set("icon", e.target.value)} placeholder="https://…/icon.png" /></Field>
            <Field label="Splash Screen Icon URL"><Input value={f.splash_icon || ""} onChange={(e) => set("splash_icon", e.target.value)} placeholder="https://…/splash.png" /></Field>
            <Field label="Google Play Store URL"><Input value={f.play_store_url || ""} onChange={(e) => set("play_store_url", e.target.value)} placeholder="https://play.google.com/store/apps/details?id=…" /></Field>
            <Field label="Apple App Store URL"><Input value={f.app_store_url || ""} onChange={(e) => set("app_store_url", e.target.value)} placeholder="https://apps.apple.com/app/id…" /></Field>
          </div>
          <div className="mt-4 flex flex-wrap items-center gap-x-8 gap-y-3 rounded-2xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 p-4">
            <Toggle checked={f.android_enabled !== false} onChange={(v) => set("android_enabled", v)} label="Show on Android (Play Store)" />
            <Toggle checked={f.ios_enabled !== false} onChange={(v) => set("ios_enabled", v)} label="Show on iOS (App Store)" />
            <p className="text-xs text-slate-400 basis-full leading-relaxed">Prompt appears only on mobile, at most once per day per device, and redirects to the store matching the device OS. If a platform is turned off or its store URL is empty, nothing is shown on that OS.</p>
          </div>
          <div className="mt-4"><Field label="Install Message"><textarea className={inp + " h-16 py-2"} value={f.install_message || ""} onChange={(e) => set("install_message", e.target.value)} /></Field></div>
          <div className="mt-5 flex flex-wrap items-center gap-2">
            <SaveBtn onClick={save} busy={busy} />
            <button onClick={resetDefaults} className="h-11 px-4 rounded-xl border border-slate-200 dark:border-slate-700 text-sm font-semibold text-slate-600 dark:text-slate-300 inline-flex items-center gap-1.5"><RotateCcw className="h-4 w-4" /> Reset Defaults</button>
          </div>
        </Card>

        {/* live preview */}
        <Card className="p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-bold text-slate-900 dark:text-white">Live Preview</h3>
            <div className="flex items-center gap-1 p-1 rounded-xl bg-slate-100 dark:bg-slate-800">
              <button onClick={() => setMode("mobile")} className={cn("h-8 px-2.5 rounded-lg text-xs font-semibold inline-flex items-center gap-1", mode === "mobile" ? "bg-white dark:bg-slate-900 text-primary-700 shadow-sm" : "text-slate-500")}><Smartphone className="h-3.5 w-3.5" /> Mobile</button>
              <button onClick={() => setMode("desktop")} className={cn("h-8 px-2.5 rounded-lg text-xs font-semibold inline-flex items-center gap-1", mode === "desktop" ? "bg-white dark:bg-slate-900 text-primary-700 shadow-sm" : "text-slate-500")}><Monitor className="h-3.5 w-3.5" /> Desktop</button>
            </div>
          </div>
          {mode === "mobile" ? <PhoneMock f={f} /> : <DesktopMock f={f} />}
        </Card>
      </div>

      {/* analytics */}
      <div>
        <SectionHeader icon={Download} title="Installation Analytics" subtitle="Devices that viewed the prompt or installed the app" />
        <DataTable
          testId="pwa-table"
          columns={columns}
          rows={devices}
          searchKeys={["customer_name", "device", "browser", "os"]}
          searchPlaceholder="Search device / customer…"
          exportFilename="pwa-installs.csv"
          emptyTitle="No install activity yet"
          emptyHint="Once customers see or accept the install prompt, their devices appear here."
          emptyIcon={Smartphone}
        />
      </div>
    </div>
  );
}

function PhoneMock({ f }) {
  return (
    <div className="mx-auto w-[240px] rounded-[2rem] border-[6px] border-slate-900 dark:border-slate-700 bg-slate-900 shadow-2xl overflow-hidden">
      <div className="rounded-[1.5rem] overflow-hidden" style={{ background: f.background_color || "#ffffff" }}>
        {/* status bar */}
        <div className="flex items-center justify-between px-4 pt-2 pb-1 text-[10px] text-slate-500">
          <span>9:41</span>
          <div className="flex items-center gap-1"><Signal className="h-3 w-3" /><Wifi className="h-3 w-3" /><BatteryFull className="h-3 w-3" /></div>
        </div>
        <div className="h-40 grid place-items-center" style={{ background: `${f.theme_color || "#0D47A1"}10` }}>
          <div className="text-center">
            <div className="mx-auto h-14 w-14 rounded-2xl grid place-items-center text-white font-black text-lg shadow-lg" style={{ background: f.theme_color || "#0D47A1" }}>
              {f.icon ? <img src={f.icon} alt="" className="h-full w-full object-cover rounded-2xl" /> : (f.short_name || "A")[0]}
            </div>
            <p className="mt-2 text-xs font-bold text-slate-700">{f.short_name || "AzoApp"}</p>
          </div>
        </div>
        {/* install sheet */}
        <div className="p-3">
          <div className="rounded-2xl border border-slate-200 bg-white shadow-lg p-3">
            <div className="flex items-center gap-2">
              <div className="h-9 w-9 rounded-xl grid place-items-center text-white font-black shrink-0" style={{ background: f.theme_color || "#0D47A1" }}>{(f.short_name || "A")[0]}</div>
              <div className="min-w-0"><p className="text-xs font-bold text-slate-800 truncate">{f.install_title || "Install AzoApp"}</p><p className="text-[10px] text-slate-400 truncate">{f.app_name || "AzoApp — Home Services"}</p></div>
            </div>
            <p className="text-[10px] text-slate-500 mt-2 leading-snug">{f.install_message || "Get the full app experience — download AzoApp from the store."}</p>
            <div className="mt-2.5 flex gap-2">
              <button className="flex-1 h-8 rounded-lg text-[11px] font-bold text-white" style={{ background: f.theme_color || "#0D47A1" }}>Get the App</button>
              <button className="h-8 px-3 rounded-lg text-[11px] font-semibold text-slate-500 border border-slate-200">Later</button>
            </div>
            <div className="mt-1.5 flex items-center gap-2 text-[9px] font-semibold text-slate-400">
              {f.android_enabled !== false && <span>Play Store</span>}
              {f.ios_enabled !== false && <span>App Store</span>}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function DesktopMock({ f }) {
  return (
    <div className="rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden">
      <div className="flex items-center gap-1.5 px-3 py-2 bg-slate-100 dark:bg-slate-800">
        <span className="h-2.5 w-2.5 rounded-full bg-rose-400" /><span className="h-2.5 w-2.5 rounded-full bg-amber-400" /><span className="h-2.5 w-2.5 rounded-full bg-emerald-400" />
        <div className="ml-2 flex-1 h-6 rounded-md bg-white dark:bg-slate-900 text-[10px] text-slate-400 flex items-center px-2">azoapp.com</div>
      </div>
      <div className="p-6 grid place-items-center" style={{ background: f.background_color || "#ffffff" }}>
        <div className="rounded-2xl border border-slate-200 bg-white shadow-lg p-4 max-w-xs w-full">
          <div className="flex items-center gap-3">
            <div className="h-11 w-11 rounded-xl grid place-items-center text-white font-black shrink-0" style={{ background: f.theme_color || "#0D47A1" }}>{(f.short_name || "A")[0]}</div>
            <div className="min-w-0"><p className="text-sm font-bold text-slate-800 truncate">{f.install_title || "Install AzoApp"}</p><p className="text-[11px] text-slate-400 truncate">{f.app_name || "AzoApp — Home Services"}</p></div>
          </div>
          <p className="text-xs text-slate-500 mt-2">{f.install_message || "Get the full app experience — download AzoApp from the store."}</p>
          <div className="mt-3 rounded-lg bg-slate-50 border border-dashed border-slate-200 px-3 py-2 text-[11px] text-slate-400 text-center">Install prompt is shown on mobile only</div>
        </div>
      </div>
    </div>
  );
}
