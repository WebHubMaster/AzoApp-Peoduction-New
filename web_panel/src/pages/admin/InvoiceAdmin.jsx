import React, { useCallback, useEffect, useRef, useState } from "react";
import { Save, Eye, Loader2, Download, Building2, Palette } from "lucide-react";
import api from "@/lib/api";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import InvoiceCenter from "@/components/invoices/InvoiceCenter";
import InvoiceA4Frame from "@/components/invoices/InvoiceA4Frame";

/* Premium invoice theme presets — keep in sync with backend INVOICE_THEMES. */
const INVOICE_THEMES = [
  { key: "azure", label: "Azure", accent: "#0D47A1", accent_dark: "#0B3C8A" },
  { key: "emerald", label: "Emerald", accent: "#047857", accent_dark: "#065F46" },
  { key: "graphite", label: "Graphite", accent: "#1F2937", accent_dark: "#111827" },
  { key: "indigo", label: "Indigo", accent: "#4338CA", accent_dark: "#3730A3" },
  { key: "maroon", label: "Maroon", accent: "#9F1239", accent_dark: "#881337" },
  { key: "teal", label: "Teal", accent: "#0F766E", accent_dark: "#115E59" },
];
const LETTERHEADS = [
  { key: "classic", label: "Classic", hint: "Accent underline header" },
  { key: "band", label: "Band", hint: "Solid colour header bar" },
];

/* ---------------------------------------------------------------- Admin: Invoice Management */
export function InvoiceManagement() {
  return (
    <div>
      <InvoiceCenter
        role="admin"
        title="Invoice Management"
        subtitle="Enterprise financial management — sabhi bookings, transactions, withdrawals & settlements ke invoices."
      />
    </div>
  );
}

/* ---------------------------------------------------------------- Admin: Business & Invoice Config */
const FIELDS = [
  { group: "Basic Business Information", cols: 2, items: [
    { k: "business_name", label: "Business Name" },
    { k: "legal_name", label: "Legal Business Name" },
    { k: "tax_label", label: "Tax Label (e.g. GST/VAT)" },
    { k: "payment_terms", label: "Default Payment Terms" },
  ]},
  { group: "Contact Information", cols: 2, items: [
    { k: "email", label: "Email" },
    { k: "phone", label: "Phone" },
    { k: "website", label: "Website" },
    { k: "support_contact", label: "Support Contact" },
    { k: "address", label: "Address", full: true },
    { k: "city", label: "City" },
    { k: "state", label: "State" },
    { k: "country", label: "Country" },
    { k: "zip", label: "ZIP / PIN Code" },
  ]},
  { group: "Legal Information", cols: 2, items: [
    { k: "gst_number", label: "GST / VAT Number" },
    { k: "tax_id", label: "Tax ID" },
    { k: "pan", label: "PAN" },
    { k: "cin", label: "Company Registration No. (CIN)" },
  ]},
  { group: "Invoice Settings", cols: 3, items: [
    { k: "prefix", label: "Invoice Prefix" },
    { k: "pad", label: "Number Padding", type: "number" },
    { k: "start_number", label: "Starting Number", type: "number" },
  ]},
  { group: "Footer & Policies", cols: 1, items: [
    { k: "footer_text", label: "Invoice Footer Text", area: true },
    { k: "terms", label: "Terms & Conditions", area: true },
    { k: "refund_policy", label: "Refund / Cancellation Policy", area: true },
  ]},
];

export function BusinessConfigSettings() {
  const [cfg, setCfg] = useState(null);
  const [saving, setSaving] = useState(false);
  const [preview, setPreview] = useState(null);
  const [previewHtml, setPreviewHtml] = useState("");
  const [prevLoading, setPrevLoading] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const frameRef = useRef(null);

  const loadPreview = useCallback(async () => {
    setPrevLoading(true);
    try {
      const r = await api.get("/invoices/preview/sample");
      setPreview(r.data);
    } catch {
      /* handled globally */
    } finally {
      setPrevLoading(false);
    }
  }, []);

  useEffect(() => {
    api.get("/admin/settings").then((r) => {
      setCfg(r.data.invoice_config || {});
    }).catch(() => setCfg({}));
    loadPreview();
  }, [loadPreview]);

  const set = (k, v) => setCfg((c) => ({ ...c, [k]: v }));

  // Build the sample payload with the CURRENT (possibly unsaved) theme/letterhead
  // so the preview + sample download reflect selections live.
  const themedPayload = useCallback(() => {
    if (!preview) return null;
    const t = INVOICE_THEMES.find((x) => x.key === (cfg?.invoice_theme || "azure")) || INVOICE_THEMES[0];
    return {
      ...preview,
      business_snapshot: {
        ...(preview.business_snapshot || {}),
        theme_key: t.key, accent: t.accent, accent_dark: t.accent_dark,
        letterhead: cfg?.letterhead || "classic",
      },
    };
  }, [preview, cfg?.invoice_theme, cfg?.letterhead]);

  // Render the unified server HTML (same template as print + PDF) into the A4 iframe.
  useEffect(() => {
    let alive = true;
    const p = themedPayload();
    if (!p) { setPreviewHtml(""); return () => { alive = false; }; }
    const t = setTimeout(async () => {
      try {
        const r = await api.post("/invoices/render/html", p, { responseType: "text", transformResponse: [(d) => d] });
        if (alive) setPreviewHtml(typeof r.data === "string" ? r.data : "");
      } catch { if (alive) setPreviewHtml(""); }
    }, 150);
    return () => { alive = false; clearTimeout(t); };
  }, [themedPayload]);

  const save = async () => {
    setSaving(true);
    try {
      await api.put("/admin/settings", { invoice_config: cfg });
      toast.success("Business configuration saved");
      await loadPreview();
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Save failed");
    } finally {
      setSaving(false);
    }
  };

  const doDownload = async () => {
    const p = themedPayload();
    if (!p) return;
    setDownloading(true);
    try {
      // Download the server-rendered sample (WeasyPrint) — the SAME HTML/CSS
      // template used for real invoice previews, prints and downloads.
      const r = await api.post("/invoices/render/pdf", p, { responseType: "blob" });
      const href = URL.createObjectURL(r.data); const a = document.createElement("a");
      a.href = href; a.download = "sample-invoice.pdf"; document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(href);
    } catch {
      toast.error("Could not generate the PDF. Please try again.");
    } finally {
      setDownloading(false);
    }
  };

  if (!cfg) {
    return <div className="flex items-center justify-center h-64"><Loader2 className="h-6 w-6 animate-spin text-slate-400" /></div>;
  }

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
        <div>
          <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2"><Building2 className="h-5 w-5 text-[#0D47A1]" /> Business &amp; Invoice Configuration</h2>
          <p className="text-sm text-slate-500">These details will appear on every invoice. The logo is pulled automatically from your Branding &amp; Theme settings.</p>
        </div>
        <Button onClick={save} disabled={saving} className="bg-[#0D47A1] hover:bg-[#0b3c8a]" data-testid="bizcfg-save">
          {saving ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Save className="h-4 w-4 mr-1" />} Save
        </Button>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        {/* Form */}
        <div className="space-y-5">
          {/* Theme & letterhead */}
          <div className="rounded-xl border border-slate-200 bg-white p-4" data-testid="invoice-theme-card">
            <p className="text-xs font-semibold uppercase tracking-widest text-slate-400 mb-3 flex items-center gap-1.5"><Palette className="h-3.5 w-3.5" /> Invoice Theme &amp; Letterhead</p>
            <label className="text-[11px] font-medium text-slate-500">Accent colour</label>
            <div className="mt-1.5 flex flex-wrap gap-2.5 mb-4">
              {INVOICE_THEMES.map((t) => {
                const active = (cfg.invoice_theme || "azure") === t.key;
                return (
                  <button key={t.key} type="button" onClick={() => set("invoice_theme", t.key)} title={t.label}
                    data-testid={`theme-${t.key}`}
                    className={`h-9 w-9 rounded-full transition-all ${active ? "ring-2 ring-offset-2 ring-slate-800 scale-105" : "hover:scale-105 ring-1 ring-slate-200"}`}
                    style={{ backgroundColor: t.accent }} aria-label={t.label} />
                );
              })}
            </div>
            <label className="text-[11px] font-medium text-slate-500">Letterhead style</label>
            <div className="mt-1.5 grid grid-cols-2 gap-2.5">
              {LETTERHEADS.map((l) => {
                const active = (cfg.letterhead || "classic") === l.key;
                const accent = (INVOICE_THEMES.find((x) => x.key === (cfg.invoice_theme || "azure")) || INVOICE_THEMES[0]).accent;
                return (
                  <button key={l.key} type="button" onClick={() => set("letterhead", l.key)}
                    data-testid={`letterhead-${l.key}`}
                    className={`text-left rounded-lg border p-3 transition-all ${active ? "border-slate-800 bg-slate-50" : "border-slate-200 hover:border-slate-300"}`}>
                    <div className="flex items-center gap-2">
                      <span className="inline-block h-5 w-8 rounded-sm" style={l.key === "band" ? { backgroundColor: accent } : { borderBottom: `3px solid ${accent}`, background: "#fff", boxShadow: "inset 0 0 0 1px #e2e8f0" }} />
                      <span className="text-sm font-semibold text-slate-800">{l.label}</span>
                    </div>
                    <p className="text-[11px] text-slate-500 mt-1">{l.hint}</p>
                  </button>
                );
              })}
            </div>
            <p className="text-[11px] text-slate-400 mt-3">Logo aapke Branding &amp; Theme (uploaded logo) se automatically invoice par aata hai.</p>
          </div>

          {FIELDS.map((sec) => (
            <div key={sec.group} className="rounded-xl border border-slate-200 bg-white p-4">
              <p className="text-xs font-semibold uppercase tracking-widest text-slate-400 mb-3">{sec.group}</p>
              <div className={`grid gap-3 ${sec.cols === 3 ? "grid-cols-3" : sec.cols === 2 ? "grid-cols-2" : "grid-cols-1"}`}>
                {sec.items.map((f) => (
                  <div key={f.k} className={f.full ? "col-span-full" : ""}>
                    <label className="text-[11px] font-medium text-slate-500">{f.label}</label>
                    {f.area ? (
                      <textarea value={cfg[f.k] || ""} onChange={(e) => set(f.k, e.target.value)} rows={2}
                        className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" data-testid={`bizcfg-${f.k}`} />
                    ) : (
                      <Input type={f.type || "text"} value={cfg[f.k] ?? ""} onChange={(e) => set(f.k, f.type === "number" ? Number(e.target.value) : e.target.value)}
                        className="mt-1 h-9" data-testid={`bizcfg-${f.k}`} />
                    )}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        {/* Live preview */}
        <div className="xl:sticky xl:top-4 self-start">
          <div className="flex items-center justify-between mb-2">
            <p className="text-sm font-semibold text-slate-700 flex items-center gap-1.5"><Eye className="h-4 w-4" /> Live Invoice Preview</p>
            <Button variant="outline" size="sm" onClick={doDownload} disabled={downloading || !preview}>
              {downloading ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Download className="h-4 w-4 mr-1" />} PDF
            </Button>
          </div>
          <div className="rounded-xl border border-slate-200 bg-slate-100 p-3 overflow-auto" style={{ maxHeight: "80vh" }}>
            {prevLoading || !previewHtml ? (
              <div className="flex items-center justify-center h-64"><Loader2 className="h-6 w-6 animate-spin text-slate-400" /></div>
            ) : (
              <InvoiceA4Frame ref={frameRef} html={previewHtml} />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
