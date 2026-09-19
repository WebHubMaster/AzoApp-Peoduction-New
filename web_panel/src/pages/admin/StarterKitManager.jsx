import { useEffect, useState, useCallback, useMemo } from "react";
import { motion } from "framer-motion";
import api from "@/lib/api";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Package, Plus, Trash2, Search, X, Save, ImagePlus, MapPin, IndianRupee,
  ShoppingBag, CheckCircle2, Crown, Sparkles, Users, RefreshCw,
} from "lucide-react";
import StarterKitPurchases from "./StarterKitPurchases";

function Field({ label, children, hint }) {
  return (
    <div>
      {label && <label className="block text-xs font-semibold text-slate-600 mb-1">{label}</label>}
      {children}
      {hint && <p className="text-[11px] text-slate-400 mt-1">{hint}</p>}
    </div>
  );
}

/* Reusable image-choose (server upload) control. */
function ImageUpload({ value, onChange, folder = "starter_kit", hint, square = true, testid }) {
  const [uploading, setUploading] = useState(false);
  return (
    <Field hint={hint}>
      <div className="flex items-center gap-3">
        {value
          ? <img src={value} alt="preview" className={`${square ? "h-16 w-16 rounded-xl" : "h-16 w-24 rounded-lg"} object-cover border border-slate-200`} />
          : <div className={`${square ? "h-16 w-16 rounded-xl" : "h-16 w-24 rounded-lg"} bg-slate-100 border border-dashed border-slate-300 flex items-center justify-center text-slate-400`}><ImagePlus className="h-5 w-5" /></div>}
        <div className="flex flex-col gap-1.5">
          <label className="inline-flex items-center gap-2 cursor-pointer text-sm font-semibold text-primary-700 border border-primary-200 rounded-lg px-3 py-1.5 hover:bg-primary-50 w-fit">
            <input type="file" accept="image/*" className="hidden" data-testid={testid}
              onChange={async (e) => {
                const file = e.target.files?.[0];
                if (!file) return;
                const fd = new FormData();
                fd.append("file", file);
                fd.append("folder", folder);
                try {
                  setUploading(true);
                  const { data } = await api.post("/media/upload", fd, { headers: { "Content-Type": "multipart/form-data" } });
                  onChange(data.url);
                  toast.success("Image uploaded");
                } catch (err) {
                  toast.error(err?.response?.data?.detail || "Upload failed");
                } finally { setUploading(false); }
              }} />
            {uploading ? "Uploading…" : (value ? "Change image" : "Choose image")}
          </label>
          {value && <button type="button" onClick={() => onChange("")} className="text-xs text-red-600 hover:underline w-fit">Remove</button>}
        </div>
      </div>
    </Field>
  );
}

/* Searchable multi-select of pincodes pulled from created Service Areas. */
function MandatoryAreas({ selected, onChange }) {
  const [areas, setAreas] = useState([]);
  const [q, setQ] = useState("");
  useEffect(() => {
    api.get("/admin/collection/service_areas").then((r) => setAreas(r.data || [])).catch(() => {});
  }, []);

  const options = useMemo(() => {
    const rows = [];
    (areas || []).forEach((a) => {
      (a.pincodes || []).forEach((p) => {
        rows.push({ pincode: String(p).trim(), area: a.name || "", city: a.city || "" });
      });
    });
    // de-dup by pincode
    const seen = new Set();
    const uniq = [];
    rows.forEach((r) => { if (r.pincode && !seen.has(r.pincode)) { seen.add(r.pincode); uniq.push(r); } });
    const term = q.trim().toLowerCase();
    return term
      ? uniq.filter((r) => r.pincode.includes(term) || r.area.toLowerCase().includes(term) || r.city.toLowerCase().includes(term))
      : uniq;
  }, [areas, q]);

  const sel = new Set(selected || []);
  const toggle = (pin) => {
    const next = new Set(sel);
    if (next.has(pin)) next.delete(pin); else next.add(pin);
    onChange([...next]);
  };

  return (
    <div>
      <div className="flex flex-wrap gap-1.5 mb-2 min-h-[26px]" data-testid="mandatory-selected">
        {(selected || []).length === 0 && <span className="text-[12px] text-slate-400">No mandatory areas — Starter Kit is optional everywhere.</span>}
        {(selected || []).map((p) => (
          <span key={p} className="inline-flex items-center gap-1 bg-primary-50 text-primary-700 text-[12px] font-semibold rounded-full px-2.5 py-0.5 border border-primary-200">
            {p}
            <button type="button" onClick={() => toggle(p)}><X className="h-3 w-3" /></button>
          </span>
        ))}
      </div>
      <div className="relative mb-2">
        <Search className="h-4 w-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search pincode, area or city…" className="pl-9" data-testid="mandatory-search" />
      </div>
      <div className="max-h-56 overflow-auto rounded-xl border border-slate-200 divide-y divide-slate-100" data-testid="mandatory-options">
        {options.length === 0 && <p className="p-3 text-[12px] text-slate-400">No pincodes found. Create Service Areas first (Services → Service Areas).</p>}
        {options.map((r) => (
          <button type="button" key={r.pincode} onClick={() => toggle(r.pincode)}
            className="w-full flex items-center justify-between px-3 py-2 hover:bg-slate-50 text-left">
            <span className="flex items-center gap-2 text-sm text-slate-700">
              <MapPin className="h-3.5 w-3.5 text-slate-400" />
              <span className="font-semibold">{r.pincode}</span>
              <span className="text-slate-400 text-[12px]">{r.area}{r.city ? ` · ${r.city}` : ""}</span>
            </span>
            {sel.has(r.pincode)
              ? <CheckCircle2 className="h-4 w-4 text-emerald-500" />
              : <span className="h-4 w-4 rounded-full border border-slate-300" />}
          </button>
        ))}
      </div>
    </div>
  );
}

export default function StarterKitManager() {
  const [cfg, setCfg] = useState(null);
  const [saving, setSaving] = useState(false);
  const [summary, setSummary] = useState({ count: 0, revenue: 0 });
  const [refreshKey, setRefreshKey] = useState(0);
  const [tab, setTab] = useState("config");

  const load = useCallback(() => {
    api.get("/starter-kit/admin/config").then((r) => setCfg(r.data)).catch(() => toast.error("Could not load config"));
  }, []);
  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    api.get("/starter-kit/admin/purchases", { params: { page: 1, page_size: 1 } })
      .then((r) => setSummary({ count: r.data.total_all ?? 0, revenue: r.data.total_revenue ?? 0 })).catch(() => {});
  }, []);

  if (!cfg) return <div className="p-6 text-slate-400">Loading Starter Kit…</div>;

  const set = (k, v) => setCfg((p) => ({ ...p, [k]: v }));
  const setItem = (i, k, v) => setCfg((p) => { const items = [...(p.items || [])]; items[i] = { ...items[i], [k]: v }; return { ...p, items }; });
  const addItem = () => setCfg((p) => ({ ...p, items: [...(p.items || []), { name: "", description: "", image: "", size_hint: "Square image ≥ 800×800px (PNG/JPG/WebP)" }] }));
  const removeItem = (i) => setCfg((p) => ({ ...p, items: (p.items || []).filter((_, idx) => idx !== i) }));
  const setBenefit = (i, v) => setCfg((p) => { const b = [...(p.benefits || [])]; b[i] = v; return { ...p, benefits: b }; });
  const addBenefit = () => setCfg((p) => ({ ...p, benefits: [...(p.benefits || []), ""] }));
  const removeBenefit = (i) => setCfg((p) => ({ ...p, benefits: (p.benefits || []).filter((_, idx) => idx !== i) }));

  const save = async () => {
    setSaving(true);
    try {
      const payload = {
        ...cfg,
        actual_price: Number(cfg.actual_price) || 0,
        discounted_price: Number(cfg.discounted_price) || 0,
        renewal_days: Number(cfg.renewal_days) || 0,
        renewal_reminder_days: Number(cfg.renewal_reminder_days) || 0,
        benefits: (cfg.benefits || []).map((b) => b.trim()).filter(Boolean),
        items: (cfg.items || []).filter((it) => (it.name || "").trim()),
      };
      const { data } = await api.put("/starter-kit/admin/config", payload);
      setCfg(data);
      toast.success("Starter Kit saved");
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Save failed");
    } finally { setSaving(false); }
  };

  const savings = Math.max((Number(cfg.actual_price) || 0) - (Number(cfg.discounted_price) || 0), 0);
  const isPurchases = tab === "purchases";

  return (
    <div className="w-full" data-testid="starter-kit-manager">
      <div className="flex items-start justify-between flex-wrap gap-3 mb-5">
        <div className="flex items-center gap-3">
          <div className="h-11 w-11 rounded-2xl bg-[#0D47A1] text-white flex items-center justify-center shadow-lg shadow-[#0D47A1]/25"><Package className="h-6 w-6" /></div>
          <div>
            <h1 className="font-heading font-extrabold text-2xl text-slate-900">Starter Kit</h1>
            <p className="text-slate-500 text-sm" data-testid="sk-page-subtitle">
              {isPurchases ? "Manage partner starter kit purchases, orders, payments and delivery status." : "Configure the premium partner kit, pricing & mandatory areas."}
            </p>
          </div>
        </div>
        {isPurchases ? (
          <div className="flex items-center gap-2 flex-wrap" data-testid="sk-header-summary">
            <div className="hidden sm:flex items-center gap-3 h-10 px-4 rounded-xl bg-white ring-1 ring-slate-200 text-sm">
              <span className="inline-flex items-center gap-1.5 text-slate-600"><Users className="h-4 w-4 text-[#0D47A1]" /><b className="text-slate-900 tabular-nums" data-testid="sk-header-count">{summary.count}</b> purchases</span>
              <span className="h-4 w-px bg-slate-200" />
              <span className="inline-flex items-center gap-1.5 text-slate-600"><IndianRupee className="h-4 w-4 text-emerald-600" /><b className="text-slate-900 tabular-nums" data-testid="sk-header-revenue">₹{Number(summary.revenue || 0).toLocaleString("en-IN")}</b></span>
            </div>
            <Button variant="outline" onClick={() => setRefreshKey((k) => k + 1)} data-testid="sk-refresh" className="h-10 rounded-xl">
              <RefreshCw className="h-4 w-4 mr-1.5" /> Refresh
            </Button>
          </div>
        ) : (
          <Button onClick={save} disabled={saving} className="bg-primary-700 hover:bg-primary-800 h-10 rounded-xl" data-testid="starter-kit-save">
            <Save className="h-4 w-4 mr-1.5" />{saving ? "Saving…" : "Save changes"}
          </Button>
        )}
      </div>

      <div className="inline-flex items-center gap-1 p-1 rounded-xl bg-slate-100 ring-1 ring-slate-200/70 mb-5" data-testid="sk-tabs">
        {[["config", "Configuration"], ["purchases", `Purchases (${summary.count})`]].map(([k, l]) => (
          <button key={k} onClick={() => setTab(k)} data-testid={`sk-tab-${k}`}
            className={`relative px-4 h-9 rounded-lg text-sm font-semibold transition-colors duration-150 ${tab === k ? "text-white" : "text-slate-600 hover:text-slate-900"}`}>
            {tab === k && <motion.span layoutId="sk-tab-pill" className="absolute inset-0 rounded-lg bg-[#0D47A1] shadow-sm shadow-[#0D47A1]/30" transition={{ type: "spring", stiffness: 500, damping: 40 }} />}
            <span className="relative z-10">{l}</span>
          </button>
        ))}
      </div>

      {tab === "config" && (
        <div className="space-y-6">
          {/* Status + pricing */}
          <div className="bg-white rounded-2xl border border-slate-200 p-5">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-heading font-bold text-slate-800 flex items-center gap-2"><Sparkles className="h-4 w-4 text-primary-600" /> Kit status & pricing</h3>
              <label className="flex items-center gap-2 text-sm font-medium text-slate-600">
                {cfg.enabled ? "Enabled" : "Disabled"}
                <Switch checked={!!cfg.enabled} onCheckedChange={(v) => set("enabled", v)} data-testid="sk-enabled" />
              </label>
            </div>
            <div className="grid sm:grid-cols-2 gap-4">
              <Field label="Kit title"><Input value={cfg.title || ""} onChange={(e) => set("title", e.target.value)} placeholder="AzoApp Pro Starter Kit" /></Field>
              <Field label="Badge label (shows on profile)"><Input value={cfg.badge_label || ""} onChange={(e) => set("badge_label", e.target.value)} placeholder="AzoApp Pro" /></Field>
              <Field label="Subtitle"><Input value={cfg.subtitle || ""} onChange={(e) => set("subtitle", e.target.value)} placeholder="Look the part. Win customer trust." /></Field>
              <Field label="Tagline (social proof)"><Input value={cfg.tagline || ""} onChange={(e) => set("tagline", e.target.value)} placeholder="Join 10,000+ verified partners" /></Field>
              <Field label="Actual price (₹) — struck-through">
                <Input type="number" value={cfg.actual_price} onChange={(e) => set("actual_price", e.target.value)} data-testid="sk-actual-price" />
              </Field>
              <Field label="Discounted price (₹) — partner pays">
                <Input type="number" value={cfg.discounted_price} onChange={(e) => set("discounted_price", e.target.value)} data-testid="sk-discounted-price" />
              </Field>
              <Field label="Renewal period (days) — 0 = lifetime, no renewal" hint="Kit membership auto-expires after this many days; partners are nudged to renew.">
                <Input type="number" value={cfg.renewal_days ?? 365} onChange={(e) => set("renewal_days", e.target.value)} data-testid="sk-renewal-days" />
              </Field>
              <Field label="Remind before expiry (days)" hint="Auto-nudge partners this many days before the kit expires.">
                <Input type="number" value={cfg.renewal_reminder_days ?? 15} onChange={(e) => set("renewal_reminder_days", e.target.value)} data-testid="sk-renewal-reminder-days" />
              </Field>
            </div>
            {savings > 0 && (
              <div className="mt-3 inline-flex items-center gap-1.5 bg-emerald-50 text-emerald-700 rounded-full px-3 py-1 text-sm font-semibold">
                <IndianRupee className="h-3.5 w-3.5" /> Partner saves ₹{savings.toLocaleString("en-IN")}
              </div>
            )}
            <div className="mt-4">
              <ImageUpload value={cfg.hero_image} onChange={(v) => set("hero_image", v)} folder="starter_kit"
                hint="Optional hero/banner image for the partner Starter Kit page. Recommended: landscape ≥ 1200×600px." square={false} testid="sk-hero-upload" />
            </div>
          </div>

          {/* Included items */}
          <div className="bg-white rounded-2xl border border-slate-200 p-5">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-heading font-bold text-slate-800 flex items-center gap-2"><ShoppingBag className="h-4 w-4 text-primary-600" /> What&apos;s inside the kit</h3>
              <Button variant="outline" size="sm" onClick={addItem} data-testid="sk-add-item"><Plus className="h-4 w-4 mr-1" /> Add item</Button>
            </div>
            <div className="space-y-4">
              {(cfg.items || []).map((it, i) => (
                <div key={it.id || i} className="rounded-xl border border-slate-200 p-4 grid md:grid-cols-[auto_1fr] gap-4" data-testid={`sk-item-${i}`}>
                  <ImageUpload value={it.image} onChange={(v) => setItem(i, "image", v)} folder="starter_kit"
                    hint={it.size_hint || "Recommended: square ≥ 800×800px"} testid={`sk-item-image-${i}`} />
                  <div className="space-y-2 min-w-0">
                    <div className="flex items-start gap-2">
                      <Input value={it.name || ""} onChange={(e) => setItem(i, "name", e.target.value)} placeholder="Item name (e.g. Branded T-Shirt)" className="font-semibold" />
                      <button type="button" onClick={() => removeItem(i)} className="text-red-500 p-2 hover:bg-red-50 rounded-lg shrink-0"><Trash2 className="h-4 w-4" /></button>
                    </div>
                    <Textarea rows={2} value={it.description || ""} onChange={(e) => setItem(i, "description", e.target.value)} placeholder="Short description shown to the partner…" />
                    <Field label="Image size suggestion (shown to admin above)">
                      <Input value={it.size_hint || ""} onChange={(e) => setItem(i, "size_hint", e.target.value)} placeholder="Square image ≥ 800×800px" />
                    </Field>
                  </div>
                </div>
              ))}
              {(cfg.items || []).length === 0 && <p className="text-sm text-slate-400">No items yet. Add branded t-shirt, cap, ID card, etc.</p>}
            </div>
          </div>

          {/* Benefits */}
          <div className="bg-white rounded-2xl border border-slate-200 p-5">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-heading font-bold text-slate-800 flex items-center gap-2"><Crown className="h-4 w-4 text-primary-600" /> Benefits after purchase</h3>
              <Button variant="outline" size="sm" onClick={addBenefit} data-testid="sk-add-benefit"><Plus className="h-4 w-4 mr-1" /> Add benefit</Button>
            </div>
            <div className="space-y-2">
              {(cfg.benefits || []).map((b, i) => (
                <div key={i} className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0" />
                  <Input value={b} onChange={(e) => setBenefit(i, e.target.value)} placeholder="e.g. Premium badge on your profile" />
                  <button type="button" onClick={() => removeBenefit(i)} className="text-red-500 p-2 hover:bg-red-50 rounded-lg"><Trash2 className="h-4 w-4" /></button>
                </div>
              ))}
            </div>
          </div>

          {/* Mandatory areas */}
          <div className="bg-white rounded-2xl border border-slate-200 p-5">
            <h3 className="font-heading font-bold text-slate-800 flex items-center gap-2 mb-1"><MapPin className="h-4 w-4 text-primary-600" /> Mandatory areas</h3>
            <p className="text-[12px] text-slate-500 mb-4">Partners whose service pincode matches any selected pincode <b>must</b> purchase the Starter Kit before using the app — all other menus stay locked until they buy. Pincodes come from your created Service Areas.</p>
            <MandatoryAreas selected={cfg.mandatory_pincodes || []} onChange={(v) => set("mandatory_pincodes", v)} />
          </div>

          <div className="flex justify-end">
            <Button onClick={save} disabled={saving} className="bg-primary-700 hover:bg-primary-800">
              <Save className="h-4 w-4 mr-1.5" />{saving ? "Saving…" : "Save changes"}
            </Button>
          </div>
        </div>
      )}

      {tab === "purchases" && (
        <StarterKitPurchases onSummary={setSummary} kitTitle={cfg.title} refreshKey={refreshKey} />
      )}
    </div>
  );
}
