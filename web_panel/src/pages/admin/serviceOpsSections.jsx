import React, { useEffect, useState, useMemo } from "react";
import { TrendingUp, MapPin, Info, CheckCircle2, XCircle, Loader2, Clock, ChevronDown, Users2, Trash2 } from "lucide-react";
import api from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { toast } from "sonner";
import DataTable from "@/components/admin/DataTable";
import ServiceAreaMap from "@/components/admin/ServiceAreaMap";

/* Small reusable COLLAPSIBLE guide card. Collapsed by default to keep the
   workspace compact; click the header to expand the full how-it-works guide. */
function GuideCard({ icon: Icon, title, children, tone = "primary", defaultOpen = false }) {
  const [open, setOpen] = useState(defaultOpen);
  const tones = {
    primary: "border-primary-200 bg-primary-50/60 dark:bg-primary-900/15 dark:border-primary-800 text-primary-900 dark:text-primary-100",
    amber: "border-amber-200 bg-amber-50 dark:bg-amber-900/15 dark:border-amber-800 text-amber-900 dark:text-amber-100",
  };
  return (
    <div className={`rounded-2xl border mb-5 ${tones[tone]}`} data-testid="ops-guide">
      <button
        type="button"
        data-testid="ops-guide-toggle"
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center gap-2 p-5 text-left"
        aria-expanded={open}
      >
        <Icon className="h-5 w-5 shrink-0" />
        <h3 className="font-heading font-bold flex-1">{title}</h3>
        <span className="text-xs font-semibold opacity-70 mr-1 hidden sm:inline">{open ? "Hide guide" : "Read guide"}</span>
        <ChevronDown className={`h-5 w-5 shrink-0 transition-transform duration-200 ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <div className="px-5 pb-5 -mt-1 text-sm leading-relaxed space-y-2 text-slate-700 dark:text-slate-300" data-testid="ops-guide-body">
          {children}
        </div>
      )}
    </div>
  );
}

/* Auto-surge (supply vs demand) control card. */
function AutoSurgeCard() {
  const [cfg, setCfg] = useState(null);
  useEffect(() => {
    api.get("/admin/settings").then((r) => {
      const b = r.data?.business_config || {};
      setCfg({
        auto_surge_enabled: !!b.auto_surge_enabled,
        auto_surge_max_pct: b.auto_surge_max_pct ?? 30,
        auto_surge_threshold: b.auto_surge_threshold ?? 1,
      });
    }).catch(() => setCfg({ auto_surge_enabled: false, auto_surge_max_pct: 30, auto_surge_threshold: 1 }));
  }, []);
  const save = async (patch) => {
    const next = { ...cfg, ...patch };
    setCfg(next);
    try { await api.put("/admin/settings", { business_config: next }); toast.success("Auto-surge settings saved"); }
    catch { toast.error("Could not save"); }
  };
  if (!cfg) return null;
  return (
    <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 mb-5" data-testid="auto-surge-card">
      <div className="flex items-center justify-between">
        <div>
          <p className="font-heading font-bold text-slate-900 dark:text-white flex items-center gap-2"><TrendingUp className="h-4 w-4 text-amber-500" /> Auto-surge (demand-based)</p>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1 max-w-xl">Automatically raises surge in a city when online partners can’t keep up with live demand (active jobs per online partner), then eases it back as supply recovers. Stacks on top of manual rules.</p>
        </div>
        <Switch data-testid="auto-surge-toggle" checked={cfg.auto_surge_enabled} onCheckedChange={(v) => save({ auto_surge_enabled: v })} />
      </div>
      {cfg.auto_surge_enabled && (
        <div className="flex flex-wrap gap-4 mt-4">
          <div><label className="text-[11px] font-semibold text-slate-500">Max surge %</label>
            <Input data-testid="auto-surge-max" type="number" className="w-32" value={cfg.auto_surge_max_pct}
              onChange={(e) => setCfg({ ...cfg, auto_surge_max_pct: e.target.value })}
              onBlur={(e) => save({ auto_surge_max_pct: Number(e.target.value || 0) })} /></div>
          <div><label className="text-[11px] font-semibold text-slate-500">Trigger at (jobs per partner)</label>
            <Input data-testid="auto-surge-threshold" type="number" step="0.1" className="w-40" value={cfg.auto_surge_threshold}
              onChange={(e) => setCfg({ ...cfg, auto_surge_threshold: e.target.value })}
              onBlur={(e) => save({ auto_surge_threshold: Number(e.target.value || 1) })} /></div>
          <p className="text-xs text-slate-400 self-end max-w-xs">e.g. Trigger 1.0 = surge kicks in once there’s more than one active job per online partner in that city.</p>
        </div>
      )}
    </div>
  );
}

/* ============================ SURGE RULES ============================ */

const HOUR_OPTS = [{ label: "Always (no time limit)", value: "any" },
  ...Array.from({ length: 24 }, (_, h) => ({ value: String(h), label: `${String(h).padStart(2, "0")}:00 (${h === 0 ? "12 AM" : h < 12 ? h + " AM" : h === 12 ? "12 PM" : (h - 12) + " PM"})` }))];
const DAY_OPTS = [
  { value: "mon", label: "Mon" }, { value: "tue", label: "Tue" }, { value: "wed", label: "Wed" },
  { value: "thu", label: "Thu" }, { value: "fri", label: "Fri" }, { value: "sat", label: "Sat" }, { value: "sun", label: "Sun" }];

const Lbl = ({ children }) => <label className="text-[11px] font-semibold text-slate-500 dark:text-slate-400">{children}</label>;

/* Custom Surge Rule form — every date/time field is SELECTABLE (dropdowns +
   day chips) so there is nothing to type wrongly. */
function SurgeRuleForm({ onCreated }) {
  const blank = { name: "", scope: "all", match_value: "", service_category: [],
    surge_type: "percentage", surge_value: "", start_hour: "any", end_hour: "any", days: [], status: "active" };
  const [f, setF] = useState(blank);
  const [busy, setBusy] = useState(false);
  const [cats, setCats] = useState([]);
  useEffect(() => {
    api.get("/catalog/categories")
      .then((r) => setCats((r.data || []).map((c) => c.name).filter(Boolean)))
      .catch(() => setCats([]));
  }, []);
  const set = (k, v) => setF((p) => ({ ...p, [k]: v }));
  const toggleDay = (d) => setF((p) => ({ ...p, days: p.days.includes(d) ? p.days.filter((x) => x !== d) : [...p.days, d] }));
  const addCategory = (name) => setF((p) => (p.service_category.includes(name) ? p : { ...p, service_category: [...p.service_category, name] }));
  const removeCategory = (name) => setF((p) => ({ ...p, service_category: p.service_category.filter((x) => x !== name) }));
  const availableCats = cats.filter((c) => !f.service_category.includes(c));

  const create = async () => {
    if (!f.name.trim()) return toast.error("Rule name required");
    if (!f.surge_type) return toast.error("Select a surge type");
    if (f.surge_value === "" || isNaN(Number(f.surge_value))) return toast.error("Enter a surge value");
    if (f.scope !== "all" && !f.match_value.trim()) return toast.error(`Enter the ${f.scope} to match`);
    if (f.start_hour !== "any" && f.end_hour === "any") return toast.error("Pick an end hour too (or set start to Always)");
    if (f.end_hour !== "any" && f.start_hour === "any") return toast.error("Pick a start hour too (or set end to Always)");
    const payload = {
      name: f.name.trim(), scope: f.scope,
      match_value: f.scope === "all" ? "" : f.match_value.trim(),
      service_category: f.service_category,
      surge_type: f.surge_type, surge_value: Number(f.surge_value),
      start_hour: f.start_hour === "any" ? "" : Number(f.start_hour),
      end_hour: f.end_hour === "any" ? "" : Number(f.end_hour),
      days: f.days, status: f.status,
    };
    setBusy(true);
    try { await api.post("/admin/collection/surge_rules", payload); toast.success("Surge rule created"); setF(blank); onCreated && onCreated(); }
    catch (e) { toast.error(e?.response?.data?.detail || "Could not create rule"); }
    finally { setBusy(false); }
  };

  return (
    <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5 space-y-3 h-fit" data-testid="surge-rule-form">
      <h3 className="font-heading font-bold text-slate-900 dark:text-white">Add Surge Rule</h3>

      <div><Lbl>Rule name</Lbl>
        <Input data-testid="surge-name" placeholder="e.g. Patna weekend evenings" value={f.name} onChange={(e) => set("name", e.target.value)} /></div>

      <div><Lbl>Scope</Lbl>
        <Select value={f.scope} onValueChange={(v) => set("scope", v)}>
          <SelectTrigger data-testid="surge-scope"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All areas</SelectItem>
            <SelectItem value="city">City</SelectItem>
            <SelectItem value="pincode">Pincode</SelectItem>
            <SelectItem value="category">Category</SelectItem>
          </SelectContent>
        </Select></div>

      {f.scope !== "all" && (
        <div><Lbl>Match value ({f.scope})</Lbl>
          <Input data-testid="surge-match" placeholder={f.scope === "pincode" ? "e.g. 800001" : f.scope === "city" ? "e.g. Patna" : "e.g. AC Repair"} value={f.match_value} onChange={(e) => set("match_value", e.target.value)} /></div>
      )}

      <div><Lbl>Apply to categories (optional · none = all categories)</Lbl>
        <div className="mt-1 rounded-lg border border-slate-200 dark:border-slate-700 p-2 space-y-2" data-testid="surge-categories">
          {f.service_category.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {f.service_category.map((c) => (
                <span key={c} data-testid={`surge-cat-chip-${c}`} className="inline-flex items-center gap-1 bg-primary-600 text-white text-xs font-semibold rounded-lg px-2 py-1">
                  {c}
                  <button type="button" onClick={() => removeCategory(c)} className="hover:text-primary-200" aria-label={`Remove ${c}`}><XCircle className="h-3.5 w-3.5" /></button>
                </span>
              ))}
            </div>
          )}
          <Select value="" onValueChange={(v) => v && addCategory(v)}>
            <SelectTrigger data-testid="surge-category-select">
              <SelectValue placeholder={cats.length ? (f.service_category.length ? "Add another category…" : "Select categories…") : "No categories found"} />
            </SelectTrigger>
            <SelectContent className="max-h-72">
              {availableCats.length === 0
                ? <div className="px-3 py-2 text-xs text-slate-400">{cats.length ? "All categories added" : "No categories created yet"}</div>
                : availableCats.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div><Lbl>Surge type</Lbl>
          <Select value={f.surge_type} onValueChange={(v) => set("surge_type", v)}>
            <SelectTrigger data-testid="surge-type"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="percentage">Percentage (%)</SelectItem>
              <SelectItem value="fixed">Fixed (₹)</SelectItem>
              <SelectItem value="multiplier">Multiplier (×)</SelectItem>
            </SelectContent>
          </Select></div>
        <div><Lbl>{f.surge_type === "fixed" ? "Amount (₹)" : f.surge_type === "multiplier" ? "Multiplier (e.g. 1.5)" : "Percent (e.g. 20)"}</Lbl>
          <Input data-testid="surge-value" type="number" placeholder={f.surge_type === "multiplier" ? "1.5" : "20"} value={f.surge_value} onChange={(e) => set("surge_value", e.target.value)} /></div>
      </div>

      {/* SELECTABLE time window */}
      <div className="rounded-xl border border-slate-200 dark:border-slate-700 p-3 space-y-2">
        <p className="text-xs font-semibold text-slate-600 dark:text-slate-300 flex items-center gap-1.5"><Clock className="h-3.5 w-3.5" /> Peak time window (IST)</p>
        <div className="grid grid-cols-2 gap-2">
          <div><Lbl>Start hour</Lbl>
            <Select value={f.start_hour} onValueChange={(v) => set("start_hour", v)}>
              <SelectTrigger data-testid="surge-start-hour"><SelectValue /></SelectTrigger>
              <SelectContent className="max-h-72">{HOUR_OPTS.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}</SelectContent>
            </Select></div>
          <div><Lbl>End hour</Lbl>
            <Select value={f.end_hour} onValueChange={(v) => set("end_hour", v)}>
              <SelectTrigger data-testid="surge-end-hour"><SelectValue /></SelectTrigger>
              <SelectContent className="max-h-72">{HOUR_OPTS.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}</SelectContent>
            </Select></div>
        </div>
        <div>
          <Lbl>Days (tap to select · none = all days)</Lbl>
          <div className="flex flex-wrap gap-1.5 mt-1" data-testid="surge-days">
            {DAY_OPTS.map((d) => {
              const on = f.days.includes(d.value);
              return (
                <button type="button" key={d.value} data-testid={`surge-day-${d.value}`} onClick={() => toggleDay(d.value)}
                  className={`px-2.5 py-1 rounded-lg text-xs font-semibold border transition ${on ? "bg-primary-600 text-white border-primary-600" : "bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:border-primary-300"}`}>
                  {d.label}
                </button>
              );
            })}
          </div>
        </div>
        <p className="text-[11px] text-slate-400">Leave both hours on <b>Always</b> for 24×7. Overnight (e.g. 22:00 → 06:00) is supported.</p>
      </div>

      <div><Lbl>Status</Lbl>
        <Select value={f.status} onValueChange={(v) => set("status", v)}>
          <SelectTrigger data-testid="surge-status"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="inactive">Inactive</SelectItem>
          </SelectContent>
        </Select></div>

      <Button data-testid="surge-create" onClick={create} disabled={busy} className="w-full bg-primary-700 hover:bg-primary-800">
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Create"}
      </Button>
    </div>
  );
}

function surgeWindowLabel(r) {
  const s = r.start_hour, e = r.end_hour;
  const blank = (v) => v === undefined || v === null || v === "";
  if ((blank(s) && blank(e)) || (Number(s) === 0 && Number(e) === 0)) {
    return (r.days && r.days.length) ? `All day · ${(Array.isArray(r.days) ? r.days : [r.days]).join(",")}` : "All day";
  }
  const hh = (v) => `${String(Number(v)).padStart(2, "0")}:00`;
  return `${hh(s)}–${hh(e)}${(r.days && r.days.length) ? " · " + (Array.isArray(r.days) ? r.days.join(",") : r.days) : ""}`;
}

export const SurgeRulesManager = () => {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const load = () => { setLoading(true); api.get("/admin/collection/surge_rules").then((r) => setRows(r.data || [])).finally(() => setLoading(false)); };
  useEffect(load, []);
  const del = async (id) => { try { await api.delete(`/admin/collection/surge_rules/${id}`); load(); } catch { toast.error("Could not delete"); } };
  const columns = [
    { key: "name", label: "Rule" },
    { key: "scope", label: "Scope" },
    { key: "match_value", label: "Match", render: (r) => r.match_value || "—" },
    { key: "surge_type", label: "Type" },
    { key: "surge_value", label: "Value", render: (r) => r.surge_type === "fixed" ? `₹${r.surge_value}` : r.surge_type === "multiplier" ? `${r.surge_value}×` : `${r.surge_value}%` },
    { key: "start_hour", label: "Window", render: surgeWindowLabel },
    { key: "status", label: "Status" },
    { key: "_del", label: "", render: (r) => <button data-testid={`surge-del-${r.id}`} onClick={() => del(r.id)} className="text-red-500 hover:text-red-700"><Trash2 className="h-4 w-4" /></button> },
  ];
  return (
    <div data-testid="surge-rules-manager">
      <GuideCard icon={TrendingUp} title="How Surge Pricing works">
        <p>Surge adds an <b>extra charge on top of the service price</b> automatically, based on
          where and when a customer books. It is calculated live at quote &amp; booking time and
          shown as a separate <b>“Surge charge”</b> line on the invoice.</p>
        <ul className="list-disc pl-5 space-y-1">
          <li><b>Scope</b> — <i>All areas</i> (everywhere), <i>City</i> (match a city name), <i>Pincode</i> (exact PIN), or <i>Category</i> (a whole service category).</li>
          <li><b>Match value</b> — the city / pincode / category name to match (e.g. <code>Patna</code> or <code>800001</code>). Hidden for “All areas”.</li>
          <li><b>Apply to categories</b> — optional; restrict the rule to one or more service categories picked from your created list (e.g. only “AC Repair” &amp; “Electrician”). None selected = applies to all.</li>
          <li><b>Surge type</b> — <i>Percentage</i> (e.g. 20% of service value), <i>Fixed ₹</i> (flat add-on), or <i>Multiplier</i> (1.5× ⇒ +50%).</li>
          <li><b>Peak window</b> — pick a <i>Start&nbsp;hour</i> &amp; <i>End&nbsp;hour</i> from the dropdowns and tap the <i>Days</i> you want. Everything is selectable — nothing to type.</li>
        </ul>
        <div className="rounded-xl border border-amber-300/70 bg-amber-50/70 dark:bg-amber-900/20 p-3 mt-1">
          <p className="font-bold flex items-center gap-1.5"><Clock className="h-4 w-4" /> When exactly does surge apply? (kab se kab tak)</p>
          <ul className="list-disc pl-5 space-y-1 mt-1">
            <li>The window is evaluated in <b>IST (India time)</b> at the moment of every price quote &amp; booking.</li>
            <li><b>Start 18:00, End 22:00</b> means surge is live from <b>6:00 PM up to (but not including) 10:00 PM</b> every selected day.</li>
            <li>Tap <b>Days</b> to limit it further, e.g. Fri/Sat/Sun evenings. No days selected = all days.</li>
            <li>Outside the window the surge is <b>0</b> automatically — no manual toggling needed.</li>
            <li><b>Applies the instant you save.</b> Whatever window you set takes effect immediately for all new quotes at that time — no restart, no delay.</li>
            <li>Keep both hours on <b>Always</b> for a <b>24×7 always-on</b> surge.</li>
          </ul>
        </div>
        <p className="pt-1"><b>Example:</b> Scope <i>City</i> = <code>Patna</code>, Type <i>Percentage</i> = <code>20</code>, Start <code>18:00</code> End <code>22:00</code>, Days <code>Fri, Sat, Sun</code>
          → weekend evening (6–10 PM) bookings in Patna cost 20% more. Multiple matching rules <b>stack</b> (add up).</p>
        <p className="text-xs opacity-80">Tip: keep a rule <b>Inactive</b> to pause it without deleting. Changes apply to new quotes instantly.</p>
      </GuideCard>

      <AutoSurgeCard />

      <div className="grid lg:grid-cols-3 gap-5 items-start">
        <SurgeRuleForm onCreated={load} />
        <div className="lg:col-span-2">
          <DataTable title="Surge Rules" rows={rows} loading={loading} columns={columns}
            searchKeys={["name", "scope", "match_value", "surge_type", "status"]} exportName="surge_rules"
            pageSize={10} emptyText="No surge rules yet" />
        </div>
      </div>
    </div>
  );
};

/* ============================ SERVICE AREAS ============================ */

/* ============================ LAUNCH DEMAND (WAITLIST) ============================ */
/* Dedicated advanced page: paginated, searchable, sortable table of out-of-area
   demand. Highest-request pincodes bubble to the top so admins pick the next
   launch city at a glance. Fed by GET /admin/waitlist/demand. */
export const LaunchDemandManager = () => {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const load = () => {
    setLoading(true);
    api.get("/admin/waitlist/demand")
      .then((r) => setData(r.data))
      .catch(() => setData({ demand: [], total_requests: 0, unique_pincodes: 0 }))
      .finally(() => setLoading(false));
  };
  useEffect(load, []);

  // Highest demand first (backend already sorts, but guarantee it here too).
  const rows = useMemo(() => {
    const list = (data?.demand || []).map((d, i) => ({ id: `${d.pincode}-${i}`, rank: 0, ...d }));
    list.sort((a, b) => (b.count || 0) - (a.count || 0));
    return list.map((d, i) => ({ ...d, rank: i + 1 }));
  }, [data]);

  const columns = [
    { key: "rank", label: "#", render: (r) => <span className="text-slate-400 font-semibold">{r.rank}</span> },
    { key: "pincode", label: "Pincode", render: (r) => <span className="font-semibold text-slate-800 dark:text-slate-100">{r.pincode}</span> },
    { key: "city", label: "City", render: (r) => r.city || "—" },
    { key: "count", label: "Requests", render: (r) => (
      <span className="inline-flex items-center gap-1">
        <span className="inline-block rounded-full bg-primary-100 dark:bg-primary-900/30 text-primary-800 dark:text-primary-200 font-bold px-2.5 py-0.5 text-xs">{r.count}</span>
        {r.rank === 1 && r.count > 1 && <span className="text-[10px] font-bold text-amber-600 uppercase">Top</span>}
      </span>
    ) },
    { key: "last_at", label: "Last request", render: (r) => r.last_at ? String(r.last_at).slice(0, 10) : "—" },
  ];

  return (
    <div data-testid="launch-demand-manager">
      <GuideCard icon={Users2} title="How Launch Demand works">
        <p>Whenever a customer opens the app from a location you <b>don’t serve yet</b>, they’re
          shown a friendly message and can leave their <b>pincode</b> to be notified at launch.
          Every such request lands here.</p>
        <ul className="list-disc pl-5 space-y-1">
          <li>Rows are ranked by <b>number of requests</b> — the most-wanted pincode sits at the very top (<b>#1 · Top</b>).</li>
          <li>Use the search box to find a specific pincode or city, and the pagination controls to page through all demand.</li>
          <li><b>City</b> is captured automatically from the customer’s detected location when available.</li>
          <li>Pick the highest-demand area as your <b>next launch city</b>, then add it under <i>Service Areas</i>.</li>
        </ul>
      </GuideCard>

      <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 mb-5 flex flex-wrap items-center gap-6" data-testid="launch-demand-summary">
        <div>
          <p className="text-2xl font-heading font-black text-slate-900 dark:text-white">{loading ? "—" : (data?.total_requests ?? 0)}</p>
          <p className="text-xs text-slate-500 uppercase tracking-wider">Total requests</p>
        </div>
        <div>
          <p className="text-2xl font-heading font-black text-slate-900 dark:text-white">{loading ? "—" : (data?.unique_pincodes ?? 0)}</p>
          <p className="text-xs text-slate-500 uppercase tracking-wider">Unique pincodes</p>
        </div>
        <div className="flex-1" />
        <button onClick={load} className="text-sm font-semibold text-primary-700 hover:underline flex items-center gap-1" data-testid="launch-demand-refresh">
          <Loader2 className={`h-3.5 w-3.5 ${loading ? "animate-spin" : "hidden"}`} /> Refresh
        </button>
      </div>

      <DataTable title="Launch Demand" rows={rows} loading={loading} columns={columns}
        searchKeys={["pincode", "city"]} exportName="launch_demand"
        pageSize={10} emptyText="No waitlist requests yet — out-of-area customers who leave their pincode will show up here." />
    </div>
  );
};

/* ============================ SERVICE AREAS ============================ */

/* Custom Service Area form with an interactive map centre-picker, forward
   geocode ("Find on map") and "Use my location" so the radius targets the exact
   real-world spot — no need to know lat/lng. */
/* haversine (km) for client-side overlap detection */
function _km(aLat, aLng, bLat, bLng) {
  const R = 6371, toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(bLat - aLat), dLng = toRad(bLng - aLng);
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(s)));
}

function ServiceAreaForm({ apiKey, existingAreas = [], onCreated }) {
  const blank = { name: "", city: "", pincodes: "", center_lat: "", center_lng: "", radius_km: "", polygon: null, status: "active" };
  const [f, setF] = useState(blank);
  const [busy, setBusy] = useState(false);
  const [locating, setLocating] = useState(false);
  const [bulking, setBulking] = useState(false);
  const [geoNote, setGeoNote] = useState("");
  const set = (k, v) => setF((p) => ({ ...p, [k]: v }));
  const setCenter = (lat, lng) => setF((p) => ({ ...p, center_lat: Number(lat).toFixed(6), center_lng: Number(lng).toFixed(6) }));

  // ---- overlap warning (circle↔circle distance, or shared pincodes) ----
  const overlaps = useMemo(() => {
    const out = [];
    const lat = Number(f.center_lat), lng = Number(f.center_lng), rad = Number(f.radius_km);
    const myPins = (f.pincodes || "").split(",").map((s) => s.trim()).filter(Boolean);
    for (const a of existingAreas || []) {
      const aPins = Array.isArray(a.pincodes) ? a.pincodes.map(String) : String(a.pincodes || "").split(",").map((s) => s.trim());
      const shared = myPins.filter((p) => aPins.includes(p));
      if (shared.length) { out.push(`${a.name} (shared pincode ${shared.join(", ")})`); continue; }
      if (f.center_lat !== "" && f.center_lng !== "" && rad > 0 && a.center_lat != null && a.center_lat !== "" && a.radius_km) {
        const d = _km(lat, lng, Number(a.center_lat), Number(a.center_lng));
        if (d < rad + Number(a.radius_km)) out.push(`${a.name} (circles overlap · ${d.toFixed(1)}km apart)`);
      }
    }
    return out;
  }, [f.center_lat, f.center_lng, f.radius_km, f.pincodes, existingAreas]);

  const findOnMap = async () => {
    const pin = (f.pincodes || "").split(",")[0].trim();
    const candidates = [pin, (f.city || "").trim(), (f.name || "").trim()].filter(Boolean);
    if (candidates.length === 0) { setGeoNote("Enter a pincode, city or area name first."); return; }
    setGeoNote("Searching…");
    for (const q of candidates) {
      try {
        const { data } = await api.get("/geo/geocode", { params: { q } });
        if (data?.found) {
          setCenter(data.lat, data.lng);
          setF((p) => ({ ...p, city: p.city || data.city || "" }));
          setGeoNote(`Centre set to ${data.display?.slice(0, 60) || `${data.lat}, ${data.lng}`}`);
          return;
        }
      } catch { /* try next */ }
    }
    setGeoNote("Couldn't find that location. Try a more specific city/pincode or drop the pin on the map.");
  };

  const useMyLocation = () => {
    if (!navigator.geolocation) { setGeoNote("Location not supported on this device."); return; }
    setLocating(true); setGeoNote("");
    navigator.geolocation.getCurrentPosition((pos) => {
      setCenter(pos.coords.latitude, pos.coords.longitude);
      setGeoNote("Centre set to your current location.");
      setLocating(false);
    }, () => { setGeoNote("Couldn't get your location (permission denied)."); setLocating(false); },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 });
  };

  const autoFillPincodes = async () => {
    if (f.center_lat === "" || f.center_lng === "" || !(Number(f.radius_km) > 0)) {
      setGeoNote("Set a centre + radius first (Find on map / Use my location).");
      return;
    }
    setBulking(true); setGeoNote("Scanning the radius for pincodes…");
    try {
      const { data } = await api.post("/admin/pincodes-in-radius", { lat: Number(f.center_lat), lng: Number(f.center_lng), radius_km: Number(f.radius_km) });
      const found = data?.pincodes || [];
      if (!found.length) { setGeoNote("No pincodes detected in that radius. Add them manually."); return; }
      const existing = (f.pincodes || "").split(",").map((s) => s.trim()).filter(Boolean);
      const merged = Array.from(new Set([...existing, ...found]));
      set("pincodes", merged.join(", "));
      setGeoNote(`Added ${found.length} pincode(s) found inside ${data.radius_km}km.`);
    } catch { setGeoNote("Couldn't scan the radius. Please try again."); }
    finally { setBulking(false); }
  };

  const create = async () => {
    if (!f.name.trim()) return toast.error("Area name required");
    const hasPin = (f.pincodes || "").trim().length > 0;
    const hasRadius = f.center_lat !== "" && f.center_lng !== "" && Number(f.radius_km) > 0;
    const hasPoly = Array.isArray(f.polygon) && f.polygon.length >= 3;
    if (!hasPin && !hasRadius && !hasPoly && !f.city.trim()) return toast.error("Add a pincode, city, centre+radius, or draw a polygon");
    if ((f.center_lat !== "" || f.center_lng !== "" || f.radius_km !== "") && !hasRadius && !hasPoly)
      return toast.error("For radius coverage set centre (lat/lng) AND a radius > 0");
    const payload = {
      name: f.name.trim(), city: f.city.trim(),
      pincodes: (f.pincodes || "").split(",").map((s) => s.trim()).filter(Boolean),
      center_lat: f.center_lat === "" ? "" : Number(f.center_lat),
      center_lng: f.center_lng === "" ? "" : Number(f.center_lng),
      radius_km: f.radius_km === "" ? "" : Number(f.radius_km),
      polygon: hasPoly ? f.polygon : null,
      status: f.status,
    };
    setBusy(true);
    try { await api.post("/admin/collection/service_areas", payload); toast.success("Service area created"); setF(blank); setGeoNote(""); onCreated && onCreated(); }
    catch (e) { toast.error(e?.response?.data?.detail || "Could not create area"); }
    finally { setBusy(false); }
  };

  return (
    <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5 space-y-3 h-fit" data-testid="service-area-form">
      <h3 className="font-heading font-bold text-slate-900 dark:text-white">Add Service Area</h3>

      <div><Lbl>Area name</Lbl>
        <Input data-testid="area-name" placeholder="e.g. Ranchi Zone" value={f.name} onChange={(e) => set("name", e.target.value)} /></div>
      <div><Lbl>City</Lbl>
        <Input data-testid="area-city" placeholder="e.g. Ranchi" value={f.city} onChange={(e) => set("city", e.target.value)} /></div>
      <div><Lbl>Pincodes (comma separated)</Lbl>
        <Input data-testid="area-pincodes" placeholder="e.g. 834001, 834002" value={f.pincodes} onChange={(e) => set("pincodes", e.target.value)} /></div>

      {/* Location picker */}
      <div className="rounded-xl border border-slate-200 dark:border-slate-700 p-3 space-y-2">
        <p className="text-xs font-semibold text-slate-600 dark:text-slate-300 flex items-center gap-1.5"><MapPin className="h-3.5 w-3.5" /> Coverage centre, radius or polygon</p>
        <div className="flex flex-wrap gap-2">
          <Button type="button" size="sm" variant="outline" data-testid="area-find" onClick={findOnMap}>Find on map</Button>
          <Button type="button" size="sm" variant="outline" data-testid="area-mylocation" onClick={useMyLocation} disabled={locating}>
            {locating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Use my location"}
          </Button>
          <Button type="button" size="sm" variant="outline" data-testid="area-bulk-pincodes" onClick={autoFillPincodes} disabled={bulking}>
            {bulking ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Auto-fill pincodes in radius"}
          </Button>
        </div>
        {geoNote && <p className="text-[11px] text-slate-500" data-testid="area-geo-note">{geoNote}</p>}
        <div className="grid grid-cols-2 gap-2">
          <div><Lbl>Center latitude</Lbl>
            <Input data-testid="area-lat" type="number" placeholder="e.g. 23.3441" value={f.center_lat} onChange={(e) => set("center_lat", e.target.value)} /></div>
          <div><Lbl>Center longitude</Lbl>
            <Input data-testid="area-lng" type="number" placeholder="e.g. 85.3096" value={f.center_lng} onChange={(e) => set("center_lng", e.target.value)} /></div>
        </div>
        <div><Lbl>Radius (km)</Lbl>
          <Input data-testid="area-radius" type="number" placeholder="e.g. 12" value={f.radius_km} onChange={(e) => set("radius_km", e.target.value)} /></div>
        {Array.isArray(f.polygon) && f.polygon.length >= 3 && (
          <p className="text-[11px] font-semibold text-purple-600" data-testid="area-polygon-note">Custom polygon set ({f.polygon.length} points) — this takes priority over the circle.</p>
        )}
        <ServiceAreaMap apiKey={apiKey}
          value={{ lat: f.center_lat === "" ? null : f.center_lat, lng: f.center_lng === "" ? null : f.center_lng }}
          radiusKm={f.radius_km} polygon={f.polygon} otherAreas={existingAreas}
          onChange={setCenter} onPolygon={(pts) => set("polygon", pts)} />
      </div>

      {overlaps.length > 0 && (
        <div className="rounded-lg border border-amber-300 bg-amber-50 dark:bg-amber-900/20 p-2.5 text-xs text-amber-800 dark:text-amber-200" data-testid="area-overlap-warning">
          <b>Overlap warning:</b> this zone overlaps {overlaps.length} existing area(s): {overlaps.join("; ")}. You can still save — just keep zones clean.
        </div>
      )}

      <div><Lbl>Status</Lbl>
        <Select value={f.status} onValueChange={(v) => set("status", v)}>
          <SelectTrigger data-testid="area-status"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="inactive">Inactive</SelectItem>
          </SelectContent>
        </Select></div>

      <Button data-testid="area-create" onClick={create} disabled={busy} className="w-full bg-primary-700 hover:bg-primary-800">
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Create"}
      </Button>
    </div>
  );
}

export const ServiceAreasManager = () => {
  const [enforce, setEnforce] = useState(true);
  const [loaded, setLoaded] = useState(false);
  const [tp, setTp] = useState({ pincode: "", city: "" });
  const [tres, setTres] = useState(null);
  const [testing, setTesting] = useState(false);
  const [apiKey, setApiKey] = useState("");
  const [rows, setRows] = useState([]);
  const [listLoading, setListLoading] = useState(true);

  const loadAreas = () => { setListLoading(true); api.get("/admin/collection/service_areas").then((r) => setRows(r.data || [])).finally(() => setListLoading(false)); };

  useEffect(() => {
    api.get("/admin/settings").then((r) => {
      const v = r.data?.business_config?.enforce_service_area;
      setEnforce(v === undefined ? true : !!v);
    }).catch(() => {}).finally(() => setLoaded(true));
    api.get("/auth/config").then((r) => setApiKey(r.data?.integrations?.google_maps_api_key || "")).catch(() => {});
    loadAreas();
  }, []);

  const delArea = async (id) => { try { await api.delete(`/admin/collection/service_areas/${id}`); loadAreas(); } catch { toast.error("Could not delete"); } };

  const toggleEnforce = async (v) => {
    setEnforce(v);
    try {
      await api.put("/admin/settings", { business_config: { enforce_service_area: v } });
      toast.success(v ? "Enforcement ON — out-of-area bookings are blocked" : "Enforcement OFF — bookings allowed everywhere");
    } catch { toast.error("Could not update setting"); setEnforce(!v); }
  };

  const runTest = async () => {
    setTesting(true); setTres(null);
    try {
      const { data } = await api.get("/serviceability", { params: { pincode: tp.pincode, city: tp.city } });
      setTres(data);
    } catch { toast.error("Check failed"); }
    finally { setTesting(false); }
  };

  const areaColumns = [
    { key: "name", label: "Area" },
    { key: "city", label: "City", render: (r) => r.city || "—" },
    { key: "pincodes", label: "Pincodes", render: (r) => (Array.isArray(r.pincodes) ? r.pincodes.join(", ") : r.pincodes) || "—" },
    { key: "center_lat", label: "Centre", render: (r) => (Array.isArray(r.polygon) && r.polygon.length >= 3) ? `polygon (${r.polygon.length} pts)` : (r.center_lat != null && r.center_lat !== "" && r.center_lng != null && r.center_lng !== "") ? `${Number(r.center_lat).toFixed(3)}, ${Number(r.center_lng).toFixed(3)}` : "—" },
    { key: "radius_km", label: "Radius", render: (r) => (Array.isArray(r.polygon) && r.polygon.length >= 3) ? "—" : (r.radius_km ? `${r.radius_km} km` : "—") },
    { key: "status", label: "Status" },
    { key: "_del", label: "", render: (r) => <button data-testid={`area-del-${r.id}`} onClick={() => delArea(r.id)} className="text-red-500 hover:text-red-700"><Trash2 className="h-4 w-4" /></button> },
  ];

  return (
    <div data-testid="service-areas-manager">
      <GuideCard icon={MapPin} title="How Service Areas work">
        <p>Service Areas define <b>where your platform accepts bookings</b>. When a customer
          checks out, their address is matched against your active areas. If it isn’t covered
          (and enforcement is ON), the booking is <b>blocked</b> with a friendly message.</p>
        <ul className="list-disc pl-5 space-y-1">
          <li><b>Pincodes</b> — the fastest, most exact match. List every serviced PIN, comma-separated (e.g. <code>800001, 800002</code>).</li>
          <li><b>Radius</b> — pick the <i>centre</i> on the map (or tap <b>Find on map</b> / <b>Use my location</b>) and set a <i>Radius (km)</i>; any address within that circle is covered. Great for “12 km around our Ranchi hub”.</li>
          <li><b>City</b> — a broad fallback: any address in that city is covered even if the exact PIN isn’t listed.</li>
        </ul>
        <p>Coverage is granted in this order: <b>pincode → radius → city</b>. Set an area to
          <b> Inactive</b> to pause it. If you have <b>no active areas</b>, the platform is open everywhere.</p>
        <p className="text-xs opacity-80">The map centre-picker activates automatically once a <b>Google Maps API key</b> is configured in Integration Center → Google Maps. Until then, <b>Find on map</b> and <b>Use my location</b> still set accurate coordinates.</p>
      </GuideCard>

      {/* Enforcement toggle */}
      <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 mb-5 flex items-center justify-between" data-testid="enforce-service-area">
        <div>
          <p className="font-heading font-bold text-slate-900 dark:text-white flex items-center gap-2"><Info className="h-4 w-4 text-primary-600" /> Enforce service areas at checkout</p>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">When ON, customers outside your serviced areas cannot place a booking. When OFF, areas are informational only.</p>
        </div>
        <Switch data-testid="enforce-toggle" checked={enforce} disabled={!loaded} onCheckedChange={toggleEnforce} />
      </div>

      {/* Live serviceability tester */}
      <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 mb-5" data-testid="serviceability-tester">
        <p className="font-heading font-bold text-slate-900 dark:text-white mb-3">Test an address</p>
        <div className="flex flex-wrap items-end gap-3">
          <div><label className="text-[11px] font-semibold text-slate-500">Pincode</label>
            <Input data-testid="test-pincode" className="w-40" placeholder="e.g. 800001" value={tp.pincode} onChange={(e) => setTp({ ...tp, pincode: e.target.value })} /></div>
          <div><label className="text-[11px] font-semibold text-slate-500">City</label>
            <Input data-testid="test-city" className="w-44" placeholder="e.g. Patna" value={tp.city} onChange={(e) => setTp({ ...tp, city: e.target.value })} /></div>
          <Button data-testid="test-run" onClick={runTest} disabled={testing} className="bg-primary-700 hover:bg-primary-800">
            {testing ? <Loader2 className="h-4 w-4 animate-spin" /> : "Check coverage"}
          </Button>
          {tres && (
            <div data-testid="test-result" className={`flex items-center gap-2 text-sm font-semibold px-3 py-2 rounded-lg ${tres.serviceable ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-300" : "bg-red-50 text-red-700 dark:bg-red-900/20 dark:text-red-300"}`}>
              {tres.serviceable ? <CheckCircle2 className="h-4 w-4" /> : <XCircle className="h-4 w-4" />}
              {tres.serviceable ? `Serviceable — ${tres.area || "open"} (${tres.match})` : `Not serviceable · we serve: ${(tres.serviced_cities || []).join(", ") || "—"}`}
              {tres.live_surge_pct_on_100 > 0 && (
                <span className="ml-2 flex items-center gap-1 text-amber-600"><Clock className="h-3.5 w-3.5" />live surge {tres.live_surge_pct_on_100}%{tres.live_surge_rule ? ` (${tres.live_surge_rule})` : ""}</span>
              )}
            </div>
          )}
        </div>
      </div>

      <div className="grid lg:grid-cols-3 gap-5 items-start">
        <ServiceAreaForm apiKey={apiKey} existingAreas={rows} onCreated={loadAreas} />
        <div className="lg:col-span-2">
          <DataTable title="Service Areas" rows={rows} loading={listLoading} columns={areaColumns}
            searchKeys={["name", "city", "pincodes", "status"]} exportName="service_areas"
            pageSize={10} emptyText="No service areas yet" />
        </div>
      </div>
    </div>
  );
};
