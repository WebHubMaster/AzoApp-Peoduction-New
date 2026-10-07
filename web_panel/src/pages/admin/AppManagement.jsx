import React, { useEffect, useRef, useState } from "react";
import { Smartphone, Upload, CheckCircle2, Loader2, Wrench, Rocket, Image as ImageIcon, Trash2 } from "lucide-react";
import api, { API, mediaSrc } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";

// 768KB stays under Nginx's default 1MB client_max_body_size on self-hosted proxies
const CHUNK = 768 * 1024;
const PARALLEL = 4;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function httpError(res, fallback) {
  let msg = fallback;
  try { const j = await res.json(); if (j?.detail) msg = j.detail; } catch { /* non-JSON proxy page */ }
  if (res.status === 413) msg = "Server rejected the upload size (413) — proxy body limit too low.";
  if (res.status === 401 || res.status === 403) msg = "Session expired — please log in again.";
  const err = new Error(`${msg} [HTTP ${res.status}]`);
  err.fatal = res.status === 400 || res.status === 401 || res.status === 403 || res.status === 413 || res.status === 404;
  return err;
}

async function withRetry(fn, tries = 6) {
  let last;
  for (let a = 0; a < tries; a += 1) {
    try { return await fn(); } catch (err) {
      last = err;
      if (err.fatal) throw err;
      await sleep(Math.min(1000 * 2 ** a, 10000));
    }
  }
  throw new Error(last?.message === "Failed to fetch" ? "Network error — could not reach the server. Check your connection and try again." : String(last?.message || last));
}
const PLATFORMS = [
  { key: "customer", label: "Customer App", pkg: "app.azoapp.homeservice" },
  { key: "partner", label: "Partner App", pkg: "app.azoapp.partner" },
];

function Field({ label, children, hint }) {
  return (
    <div className="space-y-1">
      <label className="text-[12px] font-semibold text-slate-500 dark:text-slate-400">{label}</label>
      {children}
      {hint ? <p className="text-[11px] text-slate-400">{hint}</p> : null}
    </div>
  );
}

function ToggleRow({ label, desc, value, onChange, testId }) {
  return (
    <div className="flex items-center justify-between rounded-xl border border-slate-200 dark:border-slate-800 p-3">
      <div className="pr-3">
        <p className="text-sm font-semibold text-slate-900 dark:text-white">{label}</p>
        {desc ? <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">{desc}</p> : null}
      </div>
      <Switch data-testid={testId} checked={!!value} onCheckedChange={onChange} />
    </div>
  );
}

function fmtSize(n) {
  n = Number(n || 0);
  if (!n) return "—";
  if (n > 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} MB`;
  return `${Math.round(n / 1024)} KB`;
}

function AppForm({ platform, cfg, onSaved }) {
  const [f, setF] = useState(cfg);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [pct, setPct] = useState(0);
  const [stage, setStage] = useState("");
  const fileRef = useRef(null);
  useEffect(() => { setF(cfg); }, [cfg]);
  const set = (k, v) => setF((p) => ({ ...p, [k]: v }));

  const save = async () => {
    setSaving(true);
    try {
      const { data } = await api.put(`/app-mgmt/admin/config/${platform.key}`, {
        latest_version: f.latest_version, version_code: f.version_code,
        playstore_url: f.playstore_url, update_enabled: f.update_enabled,
        force_update: f.force_update, release_notes: f.release_notes,
        maintenance_enabled: f.maintenance_enabled, maintenance_title: f.maintenance_title,
        maintenance_description: f.maintenance_description,
        maintenance_image: f.maintenance_image, maintenance_icon: f.maintenance_icon,
      });
      toast.success(`${platform.label} settings saved`);
      onSaved(data);
    } catch (e) { toast.error(e?.response?.data?.detail || "Save failed"); }
    setSaving(false);
  };

  const pickImage = (key) => (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => set(key, reader.result);
    reader.readAsDataURL(file);
  };

  const uploadApk = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.name.toLowerCase().endsWith(".apk")) { toast.error("Only .apk files are allowed"); return; }
    setUploading(true); setPct(0); setStage("Uploading");
    const uploadId = `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
    const token = localStorage.getItem("azo_token");
    const auth = { Authorization: `Bearer ${token}` };
    try {
      const total = Math.ceil(file.size / CHUNK);
      let done = 0;
      let next = 0;
      const sendOne = async (i) => {
        const blob = file.slice(i * CHUNK, (i + 1) * CHUNK);
        await withRetry(async () => {
          const res = await fetch(`${API}/app-mgmt/admin/apk/${platform.key}/chunk`, {
            method: "POST",
            headers: { ...auth, "X-Upload-Id": uploadId, "X-Chunk-Index": String(i), "Content-Type": "application/octet-stream" },
            body: blob,
          });
          if (!res.ok) throw await httpError(res, `Part ${i + 1}/${total} failed`);
        });
        done += 1;
        setPct(Math.round((done / total) * 100));
      };
      const worker = async () => { while (next < total) { const i = next; next += 1; await sendOne(i); } };
      await Promise.all(Array.from({ length: Math.min(PARALLEL, total) }, worker));
      setStage("Processing");
      const job = await withRetry(async () => {
        const fin = await fetch(`${API}/app-mgmt/admin/apk/${platform.key}/finish`, {
          method: "POST",
          headers: { ...auth, "Content-Type": "application/json" },
          body: JSON.stringify({ upload_id: uploadId, total_chunks: total, size: file.size }),
        });
        if (!fin.ok) throw await httpError(fin, "APK validation failed");
        return fin.json();
      }, 2);
      const started = Date.now();
      for (;;) {
        await sleep(2000);
        if (Date.now() - started > 30 * 60 * 1000) throw new Error("Processing timed out — please try again.");
        let st;
        try {
          const r = await fetch(`${API}/app-mgmt/admin/apk/${platform.key}/status/${job.job_id}`, { headers: auth });
          if (!r.ok) throw await httpError(r, "Status check failed");
          st = await r.json();
        } catch (err) { if (err.fatal) throw err; continue; }
        if (st.stage) setStage(st.stage);
        if (st.status === "error") throw new Error(st.error || "APK upload failed");
        if (st.status === "done") {
          const data = st.result || {};
          toast.success(`APK uploaded · v${data.version_name} (code ${data.version_code})`);
          onSaved(data);
          break;
        }
      }
    } catch (err) { toast.error(String(err.message || err)); }
    setUploading(false); setPct(0); setStage("");
    if (fileRef.current) fileRef.current.value = "";
  };

  const deleteApk = async () => {
    if (!window.confirm(`Delete the uploaded ${platform.label} APK from the server? This removes the file and disables in-app updates until you upload a new APK.`)) return;
    setDeleting(true);
    try {
      const { data } = await api.delete(`/app-mgmt/admin/apk/${platform.key}`);
      toast.success(`${platform.label} APK deleted`);
      onSaved(data);
    } catch (err) { toast.error(err?.response?.data?.detail || "Delete failed"); }
    setDeleting(false);
  };

  return (
    <div className="grid lg:grid-cols-2 gap-5" data-testid={`appmgmt-form-${platform.key}`}>
      {/* Update settings */}
      <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 space-y-4">
        <div className="flex items-center gap-2"><Rocket className="h-5 w-5 text-primary-600" /><h3 className="font-heading font-bold text-slate-900 dark:text-white">Update Settings</h3></div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Latest Version (name)" hint="Display only, e.g. 1.5.0"><Input data-testid={`ver-name-${platform.key}`} value={f.latest_version || ""} onChange={(e) => set("latest_version", e.target.value)} placeholder="1.5.0" /></Field>
          <Field label="Version Code" hint="Primary compare, e.g. 15"><Input data-testid={`ver-code-${platform.key}`} type="number" value={f.version_code || ""} onChange={(e) => set("version_code", e.target.value)} placeholder="15" /></Field>
        </div>
        <Field label="Play Store Link (reference only)"><Input data-testid={`playstore-${platform.key}`} value={f.playstore_url || ""} onChange={(e) => set("playstore_url", e.target.value)} placeholder="https://play.google.com/..." /></Field>

        <div className="rounded-xl border-2 border-dashed border-slate-300 dark:border-slate-700 p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-semibold text-slate-900 dark:text-white flex items-center gap-1.5"><Upload className="h-4 w-4" /> {platform.label} APK</p>
              <p className="text-[11px] text-slate-500 mt-0.5">Stored on your server (S3). App downloads from here — never Play Store. Package must be <code>{platform.pkg}</code>.</p>
            </div>
          </div>
          {f.apk_url ? (
            <div className="mt-3 flex items-center gap-2 text-[12px] text-emerald-600 dark:text-emerald-400" data-testid={`apk-current-${platform.key}`}>
              <CheckCircle2 className="h-4 w-4" /> Uploaded · {f.apk_package} · v{f.apk_version_name} · {fmtSize(f.apk_size)}
            </div>
          ) : <p className="mt-3 text-[12px] text-amber-600">No APK uploaded yet.</p>}
          <input ref={fileRef} data-testid={`apk-input-${platform.key}`} type="file" accept=".apk,application/vnd.android.package-archive" className="hidden" onChange={uploadApk} />
          <div className="mt-3 flex gap-2">
            <Button data-testid={`apk-upload-btn-${platform.key}`} disabled={uploading || deleting} onClick={() => fileRef.current?.click()} className="flex-1 bg-slate-800 hover:bg-slate-900 text-white">
              {uploading ? <><Loader2 className="h-4 w-4 animate-spin mr-2" /> {stage === "Uploading" || !stage ? `Uploading… ${pct}%` : `${stage}…`}</> : <>Upload / Replace APK</>}
            </Button>
            {f.apk_url ? (
              <Button data-testid={`apk-delete-btn-${platform.key}`} disabled={uploading || deleting} onClick={deleteApk} variant="outline" className="border-red-300 text-red-600 hover:bg-red-50 dark:border-red-800 dark:hover:bg-red-950" title="Delete uploaded APK">
                {deleting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
              </Button>
            ) : null}
          </div>
          {uploading ? <div className="mt-2 h-2 w-full rounded-full bg-slate-200 dark:bg-slate-800 overflow-hidden"><div className="h-full bg-primary-600 transition-all" style={{ width: `${pct}%` }} /></div> : null}
          {uploading && stage ? <p data-testid={`apk-stage-${platform.key}`} className="mt-1 text-[11px] text-slate-500">{stage}{stage === "Uploading" ? ` · ${pct}%` : " — please keep this tab open"}</p> : null}
        </div>

        <ToggleRow testId={`update-enabled-${platform.key}`} label="Update Enabled" desc="Turn the in-app update check on/off" value={f.update_enabled} onChange={(v) => set("update_enabled", v)} />
        <ToggleRow testId={`force-update-${platform.key}`} label="Force Update" desc="Blocking mandatory update (no close button)" value={f.force_update} onChange={(v) => set("force_update", v)} />
        <Field label="Release Notes (optional)"><textarea data-testid={`release-notes-${platform.key}`} value={f.release_notes || ""} onChange={(e) => set("release_notes", e.target.value)} rows={3} className="w-full rounded-md border border-slate-200 dark:border-slate-700 bg-transparent p-2 text-sm text-slate-900 dark:text-white" placeholder={"New features\nBug fixes"} /></Field>
      </div>

      {/* Maintenance */}
      <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 space-y-4 h-fit">
        <div className="flex items-center gap-2"><Wrench className="h-5 w-5 text-amber-500" /><h3 className="font-heading font-bold text-slate-900 dark:text-white">Maintenance Mode</h3></div>
        <ToggleRow testId={`maint-enabled-${platform.key}`} label="Maintenance Mode" desc="When ON, the app shows a blocking maintenance screen" value={f.maintenance_enabled} onChange={(v) => set("maintenance_enabled", v)} />
        {f.maintenance_enabled ? (
          <div className="space-y-3" data-testid={`maint-fields-${platform.key}`}>
            <Field label="Maintenance Title"><Input data-testid={`maint-title-${platform.key}`} value={f.maintenance_title || ""} onChange={(e) => set("maintenance_title", e.target.value)} placeholder="We’ll be back soon" /></Field>
            <Field label="Maintenance Description"><textarea data-testid={`maint-desc-${platform.key}`} value={f.maintenance_description || ""} onChange={(e) => set("maintenance_description", e.target.value)} rows={3} className="w-full rounded-md border border-slate-200 dark:border-slate-700 bg-transparent p-2 text-sm text-slate-900 dark:text-white" placeholder="App is under maintenance. Please try again later." /></Field>
            <div className="grid grid-cols-2 gap-3">
              {[["maintenance_image", "Image"], ["maintenance_icon", "Icon"]].map(([key, lbl]) => (
                <Field key={key} label={lbl}>
                  <label className="flex flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed border-slate-300 dark:border-slate-700 p-3 cursor-pointer">
                    {f[key] ? <img src={mediaSrc(f[key])} alt={lbl} className="h-16 w-16 rounded object-cover" /> : <ImageIcon className="h-6 w-6 text-slate-400" />}
                    <span className="text-[11px] text-primary-600 font-semibold">{f[key] ? "Change" : "Upload"}</span>
                    <input data-testid={`maint-${key}-input-${platform.key}`} type="file" accept="image/*" className="hidden" onChange={pickImage(key)} />
                  </label>
                </Field>
              ))}
            </div>
          </div>
        ) : null}
      </div>

      <div className="lg:col-span-2">
        <Button data-testid={`appmgmt-save-${platform.key}`} disabled={saving} onClick={save} className="w-full bg-primary-700 hover:bg-primary-800 h-11">
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : `Save ${platform.label} Settings`}
        </Button>
      </div>
    </div>
  );
}

export default function AppManagement() {
  const [tab, setTab] = useState("customer");
  const [all, setAll] = useState(null);
  const load = () => api.get("/app-mgmt/admin/config").then((r) => setAll(r.data)).catch(() => setAll({}));
  useEffect(() => { load(); }, []);

  return (
    <div className="space-y-5" data-testid="app-management">
      <div className="flex items-center gap-2">
        <Smartphone className="h-6 w-6 text-primary-600" />
        <div>
          <h2 className="font-heading font-bold text-lg text-slate-900 dark:text-white">App Management</h2>
          <p className="text-sm text-slate-500 dark:text-slate-400">Manage APK, version, force-update & maintenance for each app independently.</p>
        </div>
      </div>
      <div className="flex gap-2">
        {PLATFORMS.map((p) => (
          <button key={p.key} data-testid={`appmgmt-tab-${p.key}`} onClick={() => setTab(p.key)}
            className={`px-4 py-2 rounded-md text-sm font-semibold ${tab === p.key ? "bg-primary-700 text-white" : "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300"}`}>
            {p.label}
          </button>
        ))}
      </div>
      {!all ? <p className="text-sm text-slate-400">Loading…</p> :
        PLATFORMS.filter((p) => p.key === tab).map((p) => (
          <AppForm key={p.key} platform={p} cfg={all[p.key] || {}} onSaved={load} />
        ))}
    </div>
  );
}
