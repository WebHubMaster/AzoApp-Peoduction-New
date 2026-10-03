import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { mediaSrc } from "@/lib/api";

export default function CityCategories({ data, selected, setSelected }) {
  const on = new Set(selected);
  const toggle = (id, v) => setSelected((s) => (v ? [...new Set([...s, id])] : s.filter((x) => x !== id)));
  const count = (id) => data.all_services.filter((s) => s.category_id === id).length;
  return (
    <div className="space-y-3" data-testid="pm-categories">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-[13px] text-slate-500">Only categories turned ON appear in this city (app, website &amp; search).</p>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" className="h-9" onClick={() => setSelected(data.all_categories.map((c) => c.id))} data-testid="pm-cat-all-on">All on</Button>
          <Button size="sm" variant="outline" className="h-9" onClick={() => setSelected([])} data-testid="pm-cat-all-off">All off</Button>
        </div>
      </div>
      <div className="grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-2.5">
        {data.all_categories.map((c) => (
          <label key={c.id} className={`flex items-center gap-3 rounded-xl border p-3 cursor-pointer transition-colors ${on.has(c.id) ? "border-emerald-300 bg-emerald-50/50 dark:bg-emerald-900/10" : "border-slate-200 dark:border-slate-700 hover:border-slate-300"}`}>
            {c.image ? <img src={mediaSrc(c.image)} alt="" className="h-9 w-9 rounded-lg object-cover" /> : <div className="h-9 w-9 rounded-lg bg-slate-100 dark:bg-slate-800" />}
            <div className="flex-1 min-w-0">
              <p className="text-[14px] font-semibold text-slate-800 dark:text-slate-100 truncate">{c.name}</p>
              <p className="text-[12px] text-slate-400">{count(c.id)} services{c.status !== "active" ? " · inactive globally" : ""}</p>
            </div>
            <Switch checked={on.has(c.id)} onCheckedChange={(v) => toggle(c.id, v)} data-testid={`pm-cat-${c.id}`} />
          </label>
        ))}
      </div>
    </div>
  );
}
