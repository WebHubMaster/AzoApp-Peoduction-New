import { useEffect, useState } from "react";
import { Search, ArrowUpDown, Layers, Pencil, Plus, SlidersHorizontal, Check, FolderSearch } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";
import SplitBar from "./SplitBar";
import { merchantPct } from "./shared";

export const SORTS = [
  ["name", "Name (A–Z)"], ["status", "Rate required first"], ["services", "Most services"], ["partner", "Partner % (high → low)"],
];
const FILTERS = [["all", "All"], ["done", "Configured"], ["pending", "Rate Required"]];

function Toolbar({ q, setQ, filter, setFilter, sort, setSort, counts, onBulk }) {
  return (
    <div className="flex flex-col lg:flex-row lg:items-center gap-2.5 px-4 py-3 border-b border-[#E5E7EB] dark:border-slate-800">
      <div className="relative w-full lg:w-[320px]">
        <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
        <Input data-testid="cc-search" className="pl-9 h-9 text-[13.5px] rounded-lg" placeholder="Search category..." value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
      <div className="flex gap-1.5 overflow-x-auto no-scrollbar -mx-1 px-1">
        {FILTERS.map(([k, l]) => (
          <button key={k} data-testid={`cc-filter-${k}`} onClick={() => setFilter(k)}
            className={`h-8 px-3 rounded-md text-[13px] font-medium whitespace-nowrap border transition-colors ${filter === k ? "bg-[#0D47A1] border-[#0D47A1] text-white" : "bg-white dark:bg-slate-900 border-[#E5E7EB] dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:border-slate-300 hover:text-slate-900"}`}>
            {l} <span className={`ml-1 tabular-nums text-[11.5px] ${filter === k ? "text-white/75" : "text-slate-400"}`}>{counts[k]}</span>
          </button>
        ))}
      </div>
      <div className="flex items-center gap-2 lg:ml-auto">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" className="h-8 text-[13px]" data-testid="cc-sort"><ArrowUpDown className="h-3.5 w-3.5" /> Sort</Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-52">
            {SORTS.map(([k, l]) => (
              <DropdownMenuItem key={k} data-testid={`cc-sort-${k}`} onSelect={() => setSort(k)} className="text-[13px] flex items-center justify-between">
                {l} {sort === k && <Check className="h-3.5 w-3.5 text-[#0D47A1]" />}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
        <Button className="h-8 text-[13px] bg-[#0D47A1] hover:bg-[#0B3C8A] text-white shadow-none" onClick={onBulk} data-testid="cc-bulk-configure"><SlidersHorizontal className="h-3.5 w-3.5" /> Bulk Configure</Button>
      </div>
    </div>
  );
}

const Thumb = ({ c }) => c.image
  ? <img src={c.image} alt="" className="h-9 w-9 rounded-lg object-cover shrink-0 ring-1 ring-black/5" />
  : <div className="h-9 w-9 rounded-lg bg-slate-100 dark:bg-slate-800 grid place-items-center shrink-0"><Layers className="h-4 w-4 text-slate-400" /></div>;

const StatusBadge = ({ c }) => c.configured
  ? <span className="inline-flex items-center gap-1 text-[11.5px] font-semibold px-2 py-0.5 rounded-md bg-green-50 text-[#15803D] ring-1 ring-green-600/15" data-testid={`cc-status-${c.id}`}><span className="h-1.5 w-1.5 rounded-full bg-[#16A34A]" /> Configured</span>
  : <span className="inline-flex items-center gap-1 text-[11.5px] font-semibold px-2 py-0.5 rounded-md bg-red-50 text-[#B91C1C] ring-1 ring-red-600/15" data-testid={`cc-status-${c.id}`}><span className="h-1.5 w-1.5 rounded-full bg-[#DC2626] animate-pulse" /> Rate Required</span>;

const ActionBtn = ({ c, onEdit }) => c.configured
  ? <Button variant="outline" className="h-8 px-3 text-[13px]" data-testid={`cc-edit-${c.id}`} onClick={onEdit}><Pencil className="h-3.5 w-3.5" /> Edit</Button>
  : <Button className="h-8 px-3 text-[13px] bg-[#0D47A1] hover:bg-[#0B3C8A] text-white shadow-none" data-testid={`cc-edit-${c.id}`} onClick={onEdit}><Plus className="h-3.5 w-3.5" /> Set Rate</Button>;

const Pct = ({ v, tid, strong }) => <span className={`tabular-nums text-[13.5px] ${strong ? "font-semibold text-[#111827] dark:text-white" : "text-slate-700 dark:text-slate-300"}`} data-testid={tid}>{v}%</span>;

function Row({ c, onEdit }) {
  const r = c.commission;
  return (
    <tr className={`group border-b border-[#F1F2F4] dark:border-slate-800 last:border-0 transition-colors ${c.configured ? "hover:bg-slate-50/80 dark:hover:bg-slate-800/40" : "bg-red-50/25 hover:bg-red-50/50 dark:bg-red-900/5"}`} data-testid={`cc-row-${c.id}`}>
      <td className="pl-4 pr-3 py-3">
        <div className="flex items-center gap-3 min-w-0">
          <span className={`h-6 w-[3px] rounded-full shrink-0 ${c.configured ? "bg-transparent" : "bg-[#F87171]"}`} />
          <Thumb c={c} />
          <div className="min-w-0">
            <p className="text-[13.5px] font-semibold text-[#111827] dark:text-white truncate" data-testid={`cc-name-${c.id}`}>{c.name}</p>
            {c.status && c.status !== "active" && <p className="text-[11.5px] text-slate-400 capitalize">{c.status}</p>}
          </div>
        </div>
      </td>
      <td className="px-3 py-3 text-[13.5px] text-slate-600 dark:text-slate-300 tabular-nums">{c.service_count}</td>
      {r ? (
        <>
          <td className="px-3 py-3 w-[200px]"><SplitBar r={r} tid={`cc-rates-${c.id}`} /></td>
          <td className="px-3 py-3"><Pct v={r.partner_pct} tid={`cc-partner-${c.id}`} strong /></td>
          <td className="px-3 py-3"><Pct v={r.platform_pct} tid={`cc-platform-${c.id}`} /></td>
          <td className="px-3 py-3" title={`Partner referral ${r.merchant_partner_referral_pct}% · Customer ${r.merchant_customer_pct}%`}><Pct v={merchantPct(r)} tid={`cc-merchant-${c.id}`} /></td>
          <td className="px-3 py-3"><Pct v={r.customer_refund_pct} tid={`cc-refund-${c.id}`} /></td>
          <td className="px-3 py-3"><Pct v={r.partner_cancellation_pct} tid={`cc-pcancel-${c.id}`} /></td>
        </>
      ) : (
        <td colSpan={6} className="px-3 py-3"><span className="text-[13px] text-[#B91C1C]" data-testid={`cc-missing-${c.id}`}>Not configured — bookings use the platform default split</span></td>
      )}
      <td className="px-3 py-3"><StatusBadge c={c} /></td>
      <td className="pl-3 pr-4 py-3 text-right"><ActionBtn c={c} onEdit={onEdit} /></td>
    </tr>
  );
}

function MobileCard({ c, onEdit }) {
  const r = c.commission;
  return (
    <div className={`p-4 border-b border-[#F1F2F4] dark:border-slate-800 last:border-0 ${c.configured ? "" : "bg-red-50/30"}`} data-testid={`cc-row-${c.id}`}>
      <div className="flex items-center gap-3">
        <Thumb c={c} />
        <div className="min-w-0 flex-1">
          <p className="text-[14px] font-semibold text-[#111827] dark:text-white truncate" data-testid={`cc-name-${c.id}`}>{c.name}</p>
          <p className="text-[12px] text-slate-400">{c.service_count} services</p>
        </div>
        <StatusBadge c={c} />
      </div>
      {r ? (
        <div className="mt-3 space-y-2">
          <SplitBar r={r} tid={`cc-rates-${c.id}`} />
          <div className="grid grid-cols-3 gap-2 text-[12px]">
            {[["Partner", r.partner_pct], ["Platform", r.platform_pct], ["Merchant", merchantPct(r)], ["Refund", r.customer_refund_pct], ["Partner cancel", r.partner_cancellation_pct]].map(([l, v]) => (
              <div key={l}><p className="text-slate-400">{l}</p><p className="font-semibold tabular-nums text-[#111827] dark:text-white text-[13.5px]">{v}%</p></div>
            ))}
          </div>
        </div>
      ) : <p className="mt-2 text-[13px] text-[#B91C1C]" data-testid={`cc-missing-${c.id}`}>Not configured</p>}
      <div className="mt-3 flex justify-end"><ActionBtn c={c} onEdit={onEdit} /></div>
    </div>
  );
}

const HEADS = ["Category", "Services", "Commission Split", "Partner", "Platform", "Merchant", "Refund", "Partner Cancel.", "Status", ""];

export function TableSkeleton() {
  return <div className="p-4 space-y-3">{[0, 1, 2, 3, 4].map((i) => <div key={i} className="flex items-center gap-3"><Skeleton className="h-9 w-9 rounded-lg" /><Skeleton className="h-4 w-40" /><Skeleton className="h-2 flex-1 max-w-[220px]" /><Skeleton className="h-4 w-16 ml-auto" /></div>)}</div>;
}

function useIsMobile() {
  const q = "(max-width: 767px)";
  const [m, setM] = useState(() => window.matchMedia(q).matches);
  useEffect(() => {
    const mq = window.matchMedia(q);
    const h = () => setM(mq.matches);
    mq.addEventListener("change", h);
    return () => mq.removeEventListener("change", h);
  }, []);
  return m;
}

export default function CategoryTable({ rows, loading, toolbar, onEdit }) {
  const isMobile = useIsMobile();
  return (
    <section className="bg-white dark:bg-slate-900 rounded-xl border border-[#E5E7EB] dark:border-slate-800 overflow-hidden" data-testid="cc-table-card">
      <div className="px-4 pt-4 pb-3">
        <h2 className="text-[17px] font-semibold text-[#111827] dark:text-white">Commission by Service Category</h2>
        <p className="text-[12.5px] text-[#6B7280]">Configure partner, platform and merchant commission rules for each service category.</p>
      </div>
      <Toolbar {...toolbar} />
      {loading ? <TableSkeleton /> : rows.length === 0 ? (
        <div className="py-14 text-center" data-testid="cc-empty">
          <FolderSearch className="h-8 w-8 mx-auto text-slate-300" />
          <p className="mt-2 text-[14px] font-medium text-slate-700 dark:text-slate-200">No categories match</p>
          <p className="text-[12.5px] text-slate-400">Try another search or filter. New categories are created in Services → Service Categories.</p>
        </div>
      ) : (
        isMobile ? <div data-testid="cc-list">{rows.map((c) => <MobileCard key={c.id} c={c} onEdit={() => onEdit(c)} />)}</div> : (
          <div className="overflow-x-auto" data-testid="cc-list">
            <table className="w-full min-w-[1040px]">
              <thead>
                <tr className="bg-[#F9FAFB] dark:bg-slate-800/50 border-b border-[#E5E7EB] dark:border-slate-800">
                  {HEADS.map((h, i) => <th key={i} className={`py-2.5 text-left text-[12px] font-semibold text-[#6B7280] uppercase tracking-wide ${i === 0 ? "pl-4 pr-3" : i === HEADS.length - 1 ? "pl-3 pr-4" : "px-3"}`}>{h}</th>)}
                </tr>
              </thead>
              <tbody>{rows.map((c) => <Row key={c.id} c={c} onEdit={() => onEdit(c)} />)}</tbody>
            </table>
          </div>
        )
      )}
    </section>
  );
}
