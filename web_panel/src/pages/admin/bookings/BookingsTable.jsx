import { ArrowUp, ArrowDown, ArrowUpDown, Copy, Eye, MoreHorizontal, ExternalLink, UserRound, BadgeCheck, ChevronsLeft, ChevronLeft, ChevronRight, ChevronsRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { StatusBadge, PayBadge, TypeBadge } from "./Badges";
import { inr, dParts, amountOf, initials } from "./shared";

const Avatar = ({ name, tone = "bg-slate-100 text-slate-600" }) => <span className={`h-7 w-7 rounded-full grid place-items-center text-[10.5px] font-semibold shrink-0 ${tone}`} aria-hidden>{initials(name)}</span>;

function Th({ k, children, sort, setSort, className = "" }) {
  const on = sort.key === k;
  if (!k) return <th className={`py-2.5 px-3 text-left text-[12px] font-semibold uppercase tracking-wide text-[#6B7280] whitespace-nowrap ${className}`}>{children}</th>;
  return (
    <th className={`py-2.5 px-3 text-left whitespace-nowrap ${className}`} aria-sort={on ? (sort.dir === "asc" ? "ascending" : "descending") : "none"}>
      <button type="button" onClick={() => setSort({ key: k, dir: on && sort.dir === "asc" ? "desc" : "asc" })} data-testid={`bk-sort-${k}`}
        className={`inline-flex items-center gap-1 text-[12px] font-semibold uppercase tracking-wide hover:text-[#111827] ${on ? "text-[#0D47A1]" : "text-[#6B7280]"}`}>
        {children}{on ? (sort.dir === "asc" ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />) : <ArrowUpDown className="h-3 w-3 opacity-40" />}
      </button>
    </th>
  );
}

function Actions({ b, a }) {
  return (
    <div className="flex items-center justify-end gap-1">
      <Button variant="outline" className="h-7 px-2.5 text-[12.5px]" onClick={() => a.view(b)} data-testid={`bk-view-${b.code}`}><Eye className="h-3.5 w-3.5" /> View</Button>
      <DropdownMenu>
        <DropdownMenuTrigger asChild><Button variant="ghost" size="icon" className="h-7 w-7 text-slate-500" aria-label={`More actions for ${b.code}`} data-testid={`bk-menu-${b.code}`}><MoreHorizontal className="h-4 w-4" /></Button></DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-52 text-[13px]">
          <DropdownMenuItem onSelect={() => a.view(b)}><Eye className="h-3.5 w-3.5 mr-2" /> View Booking</DropdownMenuItem>
          <DropdownMenuItem onSelect={() => a.full(b)} data-testid={`bk-menu-full-${b.code}`}><ExternalLink className="h-3.5 w-3.5 mr-2" /> Manage (reschedule, refund…)</DropdownMenuItem>
          {b.customer_id && <DropdownMenuItem onSelect={() => a.customer(b)}><UserRound className="h-3.5 w-3.5 mr-2" /> Customer Profile</DropdownMenuItem>}
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={() => a.copy(b.code)}><Copy className="h-3.5 w-3.5 mr-2" /> Copy Booking Code</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

const Code = ({ b, a }) => (
  <span className="inline-flex items-center gap-1.5">
    <button type="button" onClick={() => a.view(b)} className="font-mono text-[13px] font-semibold text-[#0D47A1] hover:underline">#{b.code}</button>
    <Tooltip><TooltipTrigger asChild><button type="button" onClick={() => a.copy(b.code)} aria-label="Copy booking code" className="text-slate-300 hover:text-[#0D47A1] opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity" data-testid={`bk-copy-${b.code}`}><Copy className="h-3.5 w-3.5" /></button></TooltipTrigger><TooltipContent className="text-xs">Copy code</TooltipContent></Tooltip>
  </span>
);

function Row({ b, a, sel, toggle }) {
  const [d, t] = dParts(b.created_at);
  return (
    <tr className={`group border-b border-[#F1F2F4] dark:border-slate-800 last:border-0 transition-colors ${sel ? "bg-blue-50/50 dark:bg-blue-900/10" : "hover:bg-slate-50/80 dark:hover:bg-slate-800/40"}`} data-testid={`bk-row-${b.code}`}>
      <td className="pl-4 pr-1 py-2.5 w-8"><Checkbox checked={sel} onCheckedChange={toggle} aria-label={`Select ${b.code}`} data-testid={`bk-select-${b.code}`} /></td>
      <td className="px-3 py-2.5 whitespace-nowrap"><Code b={b} a={a} /></td>
      <td className="px-3 py-2.5 max-w-[240px]"><p className="text-[13.5px] font-medium text-[#111827] dark:text-white truncate">{b.service_name}</p><p className="text-[11.5px] text-slate-400 truncate">{b.category_name || "—"}</p></td>
      <td className="px-3 py-2.5">
        <button type="button" disabled={!b.customer_id} onClick={() => a.customer(b)} className="flex items-center gap-2 min-w-0 text-left disabled:cursor-default group/c">
          <Avatar name={b.customer_name} tone="bg-blue-50 text-[#0D47A1]" /><span className="text-[13.5px] text-slate-700 dark:text-slate-200 truncate max-w-[140px] group-hover/c:text-[#0D47A1]">{b.customer_name || "—"}</span>
        </button>
      </td>
      <td className="px-3 py-2.5">{b.partner_name ? <span className="flex items-center gap-2 min-w-0"><Avatar name={b.partner_name} tone="bg-green-50 text-[#15803D]" /><span className="text-[13.5px] text-slate-700 dark:text-slate-200 truncate max-w-[130px]">{b.partner_name}</span><BadgeCheck className="h-3.5 w-3.5 text-[#2563EB] shrink-0" aria-label="Verified partner" /></span> : <span className="text-slate-400">—</span>}</td>
      <td className="px-3 py-2.5"><TypeBadge s={b.booking_type} /></td>
      <td className="px-3 py-2.5"><StatusBadge s={b.status} tid={`bk-status-${b.code}`} /></td>
      <td className="px-3 py-2.5 text-right text-[13.5px] font-semibold tabular-nums text-[#111827] dark:text-white whitespace-nowrap">{inr(amountOf(b))}</td>
      <td className="px-3 py-2.5"><PayBadge s={b.payment_status} /></td>
      <td className="px-3 py-2.5 whitespace-nowrap"><p className="text-[13px] text-slate-700 dark:text-slate-200">{d}</p><p className="text-[11.5px] text-slate-400">{t}</p></td>
      <td className="pl-3 pr-4 py-2.5"><Actions b={b} a={a} /></td>
    </tr>
  );
}

function MobileCard({ b, a, sel, toggle }) {
  const [d, t] = dParts(b.created_at);
  return (
    <div className={`p-3.5 border-b border-[#F1F2F4] dark:border-slate-800 last:border-0 ${sel ? "bg-blue-50/50" : ""}`} data-testid={`bk-row-${b.code}`}>
      <div className="flex items-start gap-2.5">
        <Checkbox checked={sel} onCheckedChange={toggle} className="mt-0.5" aria-label={`Select ${b.code}`} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2"><Code b={b} a={a} /><StatusBadge s={b.status} /></div>
          <p className="text-[14px] font-medium text-[#111827] dark:text-white truncate mt-1">{b.service_name}</p>
          <p className="text-[12.5px] text-slate-500 truncate">{b.customer_name} · {d} {t}</p>
          <div className="flex items-center justify-between mt-2">
            <span className="flex items-center gap-2"><b className="text-[14px] tabular-nums text-[#111827] dark:text-white">{inr(amountOf(b))}</b><PayBadge s={b.payment_status} /></span>
            <Button variant="outline" className="h-8 text-[13px]" onClick={() => a.view(b)} data-testid={`bk-view-${b.code}`}>View Details</Button>
          </div>
        </div>
      </div>
    </div>
  );
}

export function Pager({ page, pages, setPage, size, setSize, total }) {
  const from = total ? (page - 1) * size + 1 : 0;
  const to = Math.min(total, page * size);
  const nums = [...new Set([1, page - 1, page, page + 1, pages].filter((n) => n >= 1 && n <= pages))].sort((x, y) => x - y);
  const B = ({ onClick, disabled, label, children, tid, active }) => (
    <button type="button" onClick={onClick} disabled={disabled} aria-label={label} data-testid={tid}
      className={`h-8 min-w-8 px-2 rounded-md text-[13px] tabular-nums border transition-colors disabled:opacity-35 disabled:cursor-not-allowed ${active ? "bg-[#0D47A1] border-[#0D47A1] text-white" : "border-[#E5E7EB] dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 hover:bg-slate-50 enabled:hover:border-slate-300"}`}>{children}</button>
  );
  return (
    <div className="flex flex-col sm:flex-row sm:items-center gap-3 px-4 py-3 border-t border-[#E5E7EB] dark:border-slate-800" data-testid="bk-pager">
      <div className="flex items-center gap-3 text-[13px] text-slate-500">
        <label className="flex items-center gap-2 whitespace-nowrap">Rows per page
          <select value={size} onChange={(e) => { setSize(Number(e.target.value)); setPage(1); }} data-testid="bk-page-size" className="h-8 rounded-md border border-[#E5E7EB] dark:border-slate-700 bg-white dark:bg-slate-900 px-2 text-[13px]">
            {[10, 25, 50, 100].map((n) => <option key={n} value={n}>{n}</option>)}
          </select>
        </label>
        <span className="whitespace-nowrap" data-testid="bk-showing">Showing {from}–{to} of {total}</span>
      </div>
      <div className="flex items-center gap-1 sm:ml-auto">
        <B onClick={() => setPage(1)} disabled={page <= 1} label="First page" tid="bk-page-first"><ChevronsLeft className="h-3.5 w-3.5" /></B>
        <B onClick={() => setPage(page - 1)} disabled={page <= 1} label="Previous page" tid="bk-page-prev"><ChevronLeft className="h-3.5 w-3.5" /></B>
        {nums.map((n, i) => <span key={n} className="flex items-center gap-1">{i > 0 && n - nums[i - 1] > 1 && <span className="text-slate-300 px-0.5">…</span>}<B onClick={() => setPage(n)} active={n === page} label={`Page ${n}`} tid={`bk-page-${n}`}>{n}</B></span>)}
        <B onClick={() => setPage(page + 1)} disabled={page >= pages} label="Next page" tid="bk-page-next"><ChevronRight className="h-3.5 w-3.5" /></B>
        <B onClick={() => setPage(pages)} disabled={page >= pages} label="Last page" tid="bk-page-last"><ChevronsRight className="h-3.5 w-3.5" /></B>
      </div>
    </div>
  );
}

export default function BookingsTable({ rows, isMobile, sort, setSort, selected, toggle, toggleAll, a }) {
  const allSel = rows.length > 0 && rows.every((b) => selected.has(b.id));
  if (isMobile) return <div data-testid="bk-list">{rows.map((b) => <MobileCard key={b.id} b={b} a={a} sel={selected.has(b.id)} toggle={() => toggle(b.id)} />)}</div>;
  const p = { sort, setSort };
  return (
    <div className="overflow-x-auto" data-testid="bk-list">
      <table className="w-full min-w-[1180px]">
        <thead>
          <tr className="bg-[#F9FAFB] dark:bg-slate-800/50 border-b border-[#E5E7EB] dark:border-slate-800">
            <th className="pl-4 pr-1 py-2.5 w-8"><Checkbox checked={allSel} onCheckedChange={toggleAll} aria-label="Select all on this page" data-testid="bk-select-all" /></th>
            <Th k="code" {...p}>Booking Code</Th><Th k="service_name" {...p}>Service</Th><Th k="customer_name" {...p}>Customer</Th><Th k="partner_name" {...p}>Partner</Th>
            <Th {...p}>Type</Th><Th k="status" {...p}>Status</Th><Th k="amount" {...p} className="text-right">Amount</Th><Th k="payment_status" {...p}>Payment</Th><Th k="created_at" {...p}>Date</Th>
            <Th {...p} className="text-right pr-4">Action</Th>
          </tr>
        </thead>
        <tbody>{rows.map((b) => <Row key={b.id} b={b} a={a} sel={selected.has(b.id)} toggle={() => toggle(b.id)} />)}</tbody>
      </table>
    </div>
  );
}
