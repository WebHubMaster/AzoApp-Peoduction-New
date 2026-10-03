import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";

export default function CityCategories({ data, selected, setSelected }) {
  const on = new Set(selected);
  const toggle = (id, v) => setSelected((s) => (v ? [...new Set([...s, id])] : s.filter((x) => x !== id)));
  const count = (id) => data.all_services.filter((s) => s.category_id === id).length;
  return (
    <div className="space-y-3" data-testid="pm-categories">
      <div className="flex items-center justify-between">
        <p className="text-sm text-slate-500">Is city me sirf ON wali categories dikhengi (app, website, search sab jagah).</p>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={() => setSelected(data.all_categories.map((c) => c.id))} data-testid="pm-cat-all-on">All on</Button>
          <Button size="sm" variant="outline" onClick={() => setSelected([])} data-testid="pm-cat-all-off">All off</Button>
        </div>
      </div>
      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {data.all_categories.map((c) => (
          <label key={c.id} className={`flex items-center gap-3 rounded-xl border p-3 cursor-pointer transition-colors ${on.has(c.id) ? "border-emerald-300 bg-emerald-50/50 dark:bg-emerald-900/10" : "border-slate-200 dark:border-slate-700"}`}>
            {c.image ? <img src={c.image} alt="" className="h-10 w-10 rounded-lg object-cover" /> : <div className="h-10 w-10 rounded-lg bg-slate-100" />}
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-slate-800 dark:text-slate-100 truncate">{c.name}</p>
              <p className="text-xs text-slate-400">{count(c.id)} services{c.status !== "active" ? " · inactive globally" : ""}</p>
            </div>
            <Switch checked={on.has(c.id)} onCheckedChange={(v) => toggle(c.id, v)} data-testid={`pm-cat-${c.id}`} />
          </label>
        ))}
      </div>
    </div>
  );
}
