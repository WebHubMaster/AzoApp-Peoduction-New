import { Check, Plus, ShieldCheck, ImageOff } from "lucide-react";
import { TEMPLATES, COLOR_PRESETS } from "@/pages/merchant/scanqr/qrData";

const Label = ({ children }) => <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-2">{children}</p>;

export default function PosterControls({ config, setConfig, adminLogo }) {
  const set = (patch) => setConfig((c) => ({ ...c, ...patch }));
  const setShow = (k, v) => setConfig((c) => ({ ...c, show: { ...c.show, [k]: v } }));

  return (
    <div className="space-y-6" data-testid="poster-controls">
      {/* Templates */}
      <div>
        <Label>Template</Label>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {TEMPLATES.map((t) => (
            <button key={t.id} data-testid={`tpl-${t.id}`} onClick={() => set({ template: t.id, primary: t.primary, preset: "template" })}
              className={`relative rounded-xl border-2 p-2 text-left transition ${config.template === t.id ? "border-primary-600" : "border-slate-200 dark:border-slate-700 hover:border-slate-300"}`}>
              <div className="h-10 rounded-lg mb-1.5" style={{ background: t.variant === "gradient" ? `linear-gradient(135deg, ${t.primary}, ${t.primary2 || "#2563eb"})` : t.variant === "solid" ? t.primary : t.variant === "luxe" ? "linear-gradient(135deg,#1f2a44,#0B1220)" : t.variant === "cream" ? "linear-gradient(135deg,#FAF7F0,#EAD9A8)" : "#f1f5f9", border: t.variant.match(/light|minimal|soft|band|print|cream/) ? `1px solid ${t.primary}33` : "none" }} />
              <span className="text-[11px] font-semibold text-slate-600 dark:text-slate-300">{t.label}</span>
              {config.template === t.id && <span className="absolute top-1 right-1 h-4 w-4 rounded-full bg-primary-600 text-white grid place-items-center"><Check className="h-2.5 w-2.5" /></span>}
            </button>
          ))}
        </div>
      </div>

      {/* Colors */}
      <div>
        <Label>Colour Theme</Label>
        <div className="flex items-center gap-2 flex-wrap">
          {COLOR_PRESETS.map((c) => (
            <button key={c.id} data-testid={`color-${c.id}`} onClick={() => set({ preset: c.id, primary: c.primary })}
              className={`h-9 w-9 rounded-xl border-2 transition ${config.primary === c.primary ? "border-slate-900 dark:border-white scale-110" : "border-transparent"}`}
              style={{ background: c.primary }} title={c.label} />
          ))}
          <label className="h-9 w-9 rounded-xl border-2 border-dashed border-slate-300 grid place-items-center cursor-pointer text-slate-400" title="Custom colour">
            <Plus className="h-4 w-4" />
            <input type="color" className="hidden" value={config.primary} onChange={(e) => set({ preset: "custom", primary: e.target.value })} />
          </label>
        </div>
      </div>

      {/* Logo — admin managed (read-only) */}
      <div>
        <Label>Business Logo</Label>
        <div className="flex items-center gap-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 p-3" data-testid="logo-managed">
          {adminLogo ? (
            <img src={adminLogo} alt="business logo" className="h-14 w-14 rounded-lg object-contain border border-slate-200 bg-white p-1" />
          ) : (
            <div className="h-14 w-14 rounded-lg border border-dashed border-slate-300 grid place-items-center text-slate-400"><ImageOff className="h-5 w-5" /></div>
          )}
          <div className="min-w-0">
            <p className="text-sm font-semibold text-slate-700 dark:text-slate-200 flex items-center gap-1.5">
              <ShieldCheck className="h-4 w-4 text-primary-600" /> Managed by AzoApp
            </p>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              {adminLogo ? "Your official logo is applied automatically and shown at the top of the poster." : "No logo set yet — it will appear here once added by the AzoApp team."}
            </p>
          </div>
        </div>
      </div>

      {/* Toggles — only these elements are shown on the poster */}
      <div>
        <Label>Show / Hide Elements</Label>
        <div className="grid grid-cols-2 gap-2">
          {[["logo", "Logo"], ["tagline", "Trusted Home Services"]].map(([k, l]) => (
            <label key={k} className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300 cursor-pointer">
              <input type="checkbox" checked={!!(config.show || {})[k]} onChange={(e) => setShow(k, e.target.checked)} className="h-4 w-4 accent-primary-600" data-testid={`show-${k}`} /> {l}
            </label>
          ))}
        </div>
      </div>
    </div>
  );
}
