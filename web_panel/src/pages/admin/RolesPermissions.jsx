import { useEffect, useState } from "react";
import api from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { ShieldCheck, Plus, Trash2, Check, Save, Lock, Sparkles } from "lucide-react";

export default function RolesPermissions() {
  const [modules, setModules] = useState([]);
  const [actions, setActions] = useState(["view", "create", "edit", "delete"]);
  const [roles, setRoles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [sel, setSel] = useState(null);
  const [perms, setPerms] = useState({});
  const [descr, setDescr] = useState("");
  const [newName, setNewName] = useState("");
  const [saving, setSaving] = useState(false);

  const load = () => {
    setLoading(true);
    api.get("/admin/collection/roles").then((r) => setRoles(r.data || [])).finally(() => setLoading(false));
  };
  useEffect(() => {
    api.get("/admin/rbac/modules").then((r) => { setModules(r.data.modules || []); setActions(r.data.actions || actions); }).catch(() => {});
    load();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const selectRole = (r) => {
    setSel(r);
    setPerms(r.permissions && typeof r.permissions === "object" ? r.permissions : {});
    setDescr(r.description || "");
  };

  const createRole = async () => {
    if (!newName.trim()) return toast.error("Role name required");
    const { data } = await api.post("/admin/collection/roles", { name: newName.trim(), permissions: {}, status: "active" });
    toast.success(`Role "${newName.trim()}" created — now set its permissions`);
    setNewName(""); await load(); selectRole(data);
  };
  const delRole = async (r, e) => {
    e.stopPropagation();
    if (!window.confirm(`Delete role "${r.name}"?`)) return;
    await api.delete(`/admin/collection/roles/${r.id}`);
    if (sel?.id === r.id) { setSel(null); setPerms({}); }
    load();
  };

  const toggle = (mKey, action) => setPerms((p) => {
    const cur = { ...(p[mKey] || {}) };
    cur[action] = !cur[action];
    // turning off view removes everything; turning on any action implies view
    if (action === "view" && !cur.view) actions.forEach((a) => { cur[a] = false; });
    else if (cur[action]) cur.view = true;
    return { ...p, [mKey]: cur };
  });
  const toggleAllForModule = (mKey, val) => setPerms((p) => ({ ...p, [mKey]: Object.fromEntries(actions.map((a) => [a, val])) }));
  const toggleActionColumn = (action, val) => setPerms((p) => {
    const next = { ...p };
    modules.forEach((m) => {
      const cur = { ...(next[m.key] || {}), [action]: val };
      if (val && action !== "view") cur.view = true;
      next[m.key] = cur;
    });
    return next;
  });
  const grantAll = () => setPerms(Object.fromEntries(modules.map((m) => [m.key, Object.fromEntries(actions.map((a) => [a, true]))])));
  const clearAll = () => setPerms({});
  const viewOnly = () => setPerms(Object.fromEntries(modules.map((m) => [m.key, { view: true, create: false, edit: false, delete: false }])));

  const save = async () => {
    if (!sel) return;
    setSaving(true);
    try {
      await api.put(`/admin/collection/roles/${sel.id}`, { name: sel.name, description: descr, permissions: perms });
      toast.success("Permissions saved");
      load();
    } catch { toast.error("Failed to save"); }
    setSaving(false);
  };

  const countGranted = (r) => {
    const p = r.permissions || {};
    return Object.values(p).reduce((sum, m) => sum + Object.values(m || {}).filter(Boolean).length, 0);
  };
  const moduleCount = (r) => {
    const p = r.permissions || {};
    return Object.values(p).filter((m) => m && m.view).length;
  };

  return (
    <div className="grid lg:grid-cols-[300px_1fr] gap-5 items-start" data-testid="roles-permissions">
      {/* Roles list + create */}
      <div className="space-y-4">
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5">
          <h3 className="font-heading font-bold text-slate-900 dark:text-white flex items-center gap-2 mb-3"><Plus className="h-4 w-4" /> Create Role</h3>
          <div className="flex gap-2">
            <Input data-testid="role-name" placeholder="e.g. Support Manager" value={newName} onChange={(e) => setNewName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && createRole()} />
            <Button data-testid="role-create" onClick={createRole} className="bg-primary-700 hover:bg-primary-800 shrink-0">Add</Button>
          </div>
          <p className="text-xs text-slate-400 mt-2">Create the role, then select it to assign granular permissions.</p>
        </div>
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden">
          <p className="px-4 py-3 text-xs font-bold uppercase tracking-wider text-slate-400 border-b border-slate-100 dark:border-slate-800">Roles ({roles.length})</p>
          {loading && <p className="px-4 py-6 text-center text-sm text-slate-400">Loading…</p>}
          {!loading && roles.length === 0 && <p className="px-4 py-6 text-center text-sm text-slate-400">No roles yet</p>}
          {roles.map((r) => (
            <button key={r.id} data-testid={`role-item-${r.id}`} onClick={() => selectRole(r)}
              className={`w-full flex items-center justify-between px-4 py-3 text-left border-b border-slate-50 dark:border-slate-800 last:border-0 ${sel?.id === r.id ? "bg-primary-50 dark:bg-primary-900/20" : "hover:bg-slate-50 dark:hover:bg-slate-800"}`}>
              <div className="flex items-center gap-2 min-w-0">
                <div className="h-8 w-8 rounded-lg bg-primary-100 dark:bg-primary-900/40 text-primary-700 dark:text-primary-300 flex items-center justify-center shrink-0"><ShieldCheck className="h-4 w-4" /></div>
                <div className="min-w-0">
                  <p className="font-medium text-slate-800 dark:text-slate-100 truncate">{r.name}</p>
                  <p className="text-xs text-slate-400">{moduleCount(r)} modules · {countGranted(r)} perms</p>
                </div>
              </div>
              <span onClick={(e) => delRole(r, e)} className="text-slate-300 hover:text-red-500 shrink-0"><Trash2 className="h-4 w-4" /></span>
            </button>
          ))}
        </div>
      </div>

      {/* Permission matrix */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden">
        {!sel ? (
          <div className="p-16 text-center text-slate-400">
            <ShieldCheck className="h-10 w-10 mx-auto mb-3 text-slate-300" />
            <p>Select a role on the left (or create one) to configure its permissions.</p>
            <p className="text-xs mt-2 max-w-sm mx-auto">Permissions here control exactly which sidebar sections each admin user can see and act on — enforced live across the panel.</p>
          </div>
        ) : (
          <>
            <div className="p-5 border-b border-slate-100 dark:border-slate-800 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h3 className="font-heading font-bold text-lg text-slate-900 dark:text-white flex items-center gap-2"><Lock className="h-4 w-4 text-primary-600" /> Permissions · {sel.name}</h3>
                  <p className="text-xs text-slate-400">Grant View, Create, Edit and Delete separately per module.</p>
                </div>
                <Button data-testid="perms-save" onClick={save} disabled={saving} className="bg-primary-700 hover:bg-primary-800 gap-1.5"><Save className="h-4 w-4" />{saving ? "Saving…" : "Save Permissions"}</Button>
              </div>
              <Input placeholder="Short description (optional) — e.g. Handles bookings & partners" value={descr} onChange={(e) => setDescr(e.target.value)} className="text-sm" />
              <div className="flex flex-wrap gap-2">
                <button onClick={grantAll} className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-emerald-50 text-emerald-700 hover:bg-emerald-100 flex items-center gap-1"><Sparkles className="h-3 w-3" /> Grant full access</button>
                <button onClick={viewOnly} className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-sky-50 text-sky-700 hover:bg-sky-100">View-only</button>
                <button onClick={clearAll} className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-500 hover:bg-slate-200">Clear all</button>
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 dark:bg-slate-900/50 text-slate-500 dark:text-slate-400 sticky top-0">
                  <tr>
                    <th className="px-5 py-3 text-left font-semibold">Module</th>
                    {actions.map((a) => (
                      <th key={a} className="px-3 py-3 text-center font-semibold capitalize">
                        <div className="flex flex-col items-center gap-1">
                          {a}
                          <button onClick={() => toggleActionColumn(a, true)} className="text-[10px] text-primary-600 hover:underline">all</button>
                        </div>
                      </th>
                    ))}
                    <th className="px-3 py-3 text-center font-semibold">Full</th>
                  </tr>
                </thead>
                <tbody>
                  {modules.map((m) => {
                    const row = perms[m.key] || {};
                    const all = actions.every((a) => row[a]);
                    return (
                      <tr key={m.key} className="border-t border-slate-100 dark:border-slate-800 hover:bg-slate-50/60 dark:hover:bg-slate-800/40">
                        <td className="px-5 py-3 font-medium text-slate-800 dark:text-slate-100">{m.label}</td>
                        {actions.map((a) => (
                          <td key={a} className="px-3 py-3 text-center">
                            <button data-testid={`perm-${m.key}-${a}`} onClick={() => toggle(m.key, a)}
                              className={`h-6 w-6 rounded-md border inline-flex items-center justify-center transition ${row[a] ? "bg-primary-600 border-primary-600 text-white" : "border-slate-300 dark:border-slate-600 text-transparent hover:border-primary-400"}`}>
                              <Check className="h-4 w-4" />
                            </button>
                          </td>
                        ))}
                        <td className="px-3 py-3 text-center">
                          <button onClick={() => toggleAllForModule(m.key, !all)} className={`text-xs font-semibold px-2 py-1 rounded-md ${all ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-300"}`}>{all ? "Full" : "Grant"}</button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
