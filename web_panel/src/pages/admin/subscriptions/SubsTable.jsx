import { ArrowUp, ArrowDown, ArrowUpDown, Copy, Eye, MoreHorizontal, UserRound, Users, CalendarCheck, IndianRupee, FileText, PauseCircle, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { inr, initials } from "../bookings/shared";
import { SubStatusBadge, SettleBadge, SubPayBadge } from "./SubBadges";
import { paidOf, setStatus, setAmount, planDuration, fmtDate } from "./subShared";

const Avatar = ({ name, tone }) => <span className={`h-7 w-7 rounded-full grid place-items-center text-[10.5px] font-semibold shrink-0 ${tone}`} aria-hidden>{initials(name)}</span>;

function Th({ k, children, sort, setSort, className = "" }) {
  const on = sort.key === k;
  if (!k) return <th className={`py-2.5 px-3 text-left text-[12px] font-semibold uppercase tracking-wide text-[#6B7280] whitespace-nowrap ${className}`}>{children}</th>;
  return (
    <th className={`py-2.5 px-3 text-left whitespace-nowrap ${className}`} aria-sort={on ? (sort.dir === "asc" ? "ascending" : "descending") : "none"}>
      <button type="button" onClick={() => setSort({ key: k, dir: on && sort.dir === "asc" ? "desc" : "asc" })} data-testid={`sub-sort-${k}`}
        className={`inline-flex items-center gap-1 text-[12px] font-semibold uppercase tracking-wide hover:text-[#111827] ${on ? "text-[#0D47A1]" : "text-[#6B7280]"}`}>
        {children}{on ? (sort.dir === "asc" ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />) : <ArrowUpDown className="h-3 w-3 opacity-40" />}
      </button>
    </th>
  );
}

function Actions({ s, a }) {
  const I = (Icon) => <Icon className="h-3.5 w-3.5 mr-2" />;
  return (
    <div className="flex items-center justify-end gap-1">
      <Button variant="outline" className="h-7 px-2.5 text-[12.5px]" onClick={() => a.view(s)} data-testid={`sub-view-${s.code}`}><Eye className="h-3.5 w-3.5" /> View</Button>
      <DropdownMenu>
        <DropdownMenuTrigger asChild><Button variant="ghost" size="icon" className="h-7 w-7 text-slate-500" aria-label={`More actions for ${s.code}`} data-testid={`sub-menu-${s.code}`}><MoreHorizontal className="h-4 w-4" /></Button></DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-52 text-[13px]">
          <DropdownMenuItem onSelect={() => a.view(s)}>{I(Eye)} View Subscription</DropdownMenuItem>
          <DropdownMenuItem onSelect={() => a.view(s, "maid")} data-testid={`sub-menu-maid-${s.code}`}>{I(Users)} {s.partner_name ? "Maid Details" : "Assign Maid"}</DropdownMenuItem>
          <DropdownMenuItem onSelect={() => a.view(s, "attendance")} data-testid={`sub-menu-attendance-${s.code}`}>{I(CalendarCheck)} Attendance</DropdownMenuItem>
          <DropdownMenuItem onSelect={() => a.view(s, "settlement")} data-testid={`sub-menu-settlement-${s.code}`}>{I(IndianRupee)} Settlement</DropdownMenuItem>
          {s.payment_status === "paid" && <DropdownMenuItem onSelect={() => a.invoice(s)} data-testid={`sub-menu-invoice-${s.code}`}>{I(FileText)} Invoice</DropdownMenuItem>}
          {s.customer_id && a.canCustomer && <DropdownMenuItem onSelect={() => a.customer(s)}>{I(UserRound)} Customer Profile</DropdownMenuItem>}
          {["active", "pending_payment"].includes(s.status) && <DropdownMenuSeparator />}
          {s.status === "active" && <DropdownMenuItem onSelect={() => a.view(s, "manage")} data-testid={`sub-menu-pause-${s.code}`}>{I(PauseCircle)} {s.pause?.active ? "Resume" : "Pause"}</DropdownMenuItem>}
          {["active", "pending_payment"].includes(s.status) && <DropdownMenuItem onSelect={() => a.view(s, "manage")} className="text-[#B91C1C] focus:text-[#B91C1C]" data-testid={`sub-menu-cancel-${s.code}`}>{I(XCircle)} Cancel</DropdownMenuItem>}
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={() => a.copy(s.code)}>{I(Copy)} Copy Subscription Code</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

const Code = ({ s, a }) => (
  <span className="inline-flex items-center gap-1.5">
    <button type="button" onClick={() => a.view(s)} className="font-mono text-[13px] font-semibold text-[#0D47A1] hover:underline">#{s.code}</button>
    <Tooltip><TooltipTrigger asChild><button type="button" onClick={() => a.copy(s.code)} aria-label="Copy subscription code" className="text-slate-300 hover:text-[#0D47A1] opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity" data-testid={`sub-copy-${s.code}`}><Copy className="h-3.5 w-3.5" /></button></TooltipTrigger><TooltipContent className="text-xs">Copy code</TooltipContent></Tooltip>
  </span>
);

const Maid = ({ s }) => (s.partner_name
  ? <span className="flex items-center gap-2 min-w-0"><Avatar name={s.partner_name} tone="bg-green-50 text-[#15803D]" /><span className="min-w-0"><span className="block text-[13.5px] text-slate-700 dark:text-slate-200 truncate max-w-[130px]">{s.partner_name}</span><span className="flex items-center gap-1 text-[11px] text-[#15803D]"><span className="h-1.5 w-1.5 rounded-full bg-[#16A34A]" />Assigned</span></span></span>
  : <span className="inline-flex items-center h-[20px] px-1.5 rounded text-[11px] font-medium bg-amber-50 text-[#B45309] ring-1 ring-amber-600/15">Unassigned</span>);

function Row({ s, a, sel, toggle }) {
  const st = setStatus(s);
  return (
    <tr className={`group border-b border-[#F1F2F4] dark:border-slate-800 last:border-0 transition-colors ${sel ? "bg-blue-50/50 dark:bg-blue-900/10" : "hover:bg-slate-50/80 dark:hover:bg-slate-800/40"}`} data-testid={`sub-row-${s.id}`}>
      <td className="pl-4 pr-1 py-2.5 w-8"><Checkbox checked={sel} onCheckedChange={toggle} aria-label={`Select ${s.code}`} data-testid={`sub-select-${s.code}`} /></td>
      <td className="px-3 py-2.5 whitespace-nowrap"><Code s={s} a={a} /></td>
      <td className="px-3 py-2.5">
        <button type="button" disabled={!s.customer_id || !a.canCustomer} onClick={() => a.customer(s)} className="flex items-center gap-2 min-w-0 text-left disabled:cursor-default group/c">
          <Avatar name={s.customer_name} tone="bg-blue-50 text-[#0D47A1]" />
          <span className="min-w-0"><span className="block text-[13.5px] text-slate-700 dark:text-slate-200 truncate max-w-[150px] group-hover/c:text-[#0D47A1]">{s.customer_name || "—"}</span><span className="block text-[11.5px] text-slate-400 truncate">{s.customer_phone || ""}</span></span>
        </button>
      </td>
      <td className="px-3 py-2.5 max-w-[200px]"><p className="text-[13.5px] font-medium text-[#111827] dark:text-white truncate">{s.service_name ? `${s.service_name}` : s.plan_label}</p><p className="text-[11.5px] text-slate-400 truncate">{s.plan_label} · {planDuration(s)}</p></td>
      <td className="px-3 py-2.5"><Maid s={s} /></td>
      <td className="px-3 py-2.5 whitespace-nowrap text-[13px] text-slate-700 dark:text-slate-200">{fmtDate(s.start_date)}</td>
      <td className="px-3 py-2.5 whitespace-nowrap text-[13px] text-slate-700 dark:text-slate-200">{fmtDate(s.end_date)}</td>
      <td className="px-3 py-2.5 text-right whitespace-nowrap"><p className="text-[13.5px] font-semibold tabular-nums text-[#111827] dark:text-white">{inr(paidOf(s))}</p><SubPayBadge s={s.payment_status} /></td>
      <td className="px-3 py-2.5 text-right whitespace-nowrap"><p className="text-[13.5px] font-semibold tabular-nums text-[#15803D]" data-testid={`sub-earned-${s.code}`}>{inr(s.accrued_earning)}</p><p className="text-[11px] text-slate-400">Net Earned</p></td>
      <td className="px-3 py-2.5"><span className="flex flex-col items-start gap-1"><SubStatusBadge s={s.status} tid={`sub-status-${s.code}`} />{s.pause?.active && s.status === "active" && <SubStatusBadge s="paused" tid={`sub-paused-${s.code}`} />}</span></td>
      <td className="px-3 py-2.5 whitespace-nowrap"><SettleBadge s={st} tid={`sub-settle-${s.code}`} />{st !== "none" && <p className="text-[11.5px] text-slate-500 tabular-nums mt-0.5">{inr(setAmount(s))}</p>}</td>
      <td className="pl-3 pr-4 py-2.5"><Actions s={s} a={a} /></td>
    </tr>
  );
}

function MobileCard({ s, a, sel, toggle }) {
  return (
    <div className={`p-3.5 border-b border-[#F1F2F4] dark:border-slate-800 last:border-0 ${sel ? "bg-blue-50/50" : ""}`} data-testid={`sub-row-${s.id}`}>
      <div className="flex items-start gap-2.5">
        <Checkbox checked={sel} onCheckedChange={toggle} className="mt-0.5" aria-label={`Select ${s.code}`} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2"><Code s={s} a={a} /><SubStatusBadge s={s.status} /></div>
          <p className="text-[14px] font-medium text-[#111827] dark:text-white truncate mt-1">{s.customer_name}</p>
          <p className="text-[12.5px] text-slate-500 truncate">{s.plan_label} · {planDuration(s)} · {s.partner_name || "Unassigned"}</p>
          <div className="flex items-center justify-between mt-2 gap-2">
            <span className="text-[12.5px] text-slate-500">Paid <b className="text-[13.5px] tabular-nums text-[#111827] dark:text-white">{inr(paidOf(s))}</b> · Earned <b className="text-[13.5px] tabular-nums text-[#15803D]">{inr(s.accrued_earning)}</b></span>
            <Button variant="outline" className="h-8 text-[13px] shrink-0" onClick={() => a.view(s)} data-testid={`sub-view-${s.code}`}>View Details</Button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function SubsTable({ rows, isMobile, sort, setSort, selected, toggle, toggleAll, a }) {
  const allSel = rows.length > 0 && rows.every((s) => selected.has(s.id));
  if (isMobile) return <div data-testid="sub-list">{rows.map((s) => <MobileCard key={s.id} s={s} a={a} sel={selected.has(s.id)} toggle={() => toggle(s.id)} />)}</div>;
  const p = { sort, setSort };
  return (
    <div className="overflow-x-auto" data-testid="sub-list">
      <table className="w-full min-w-[1280px]">
        <thead>
          <tr className="bg-[#F9FAFB] dark:bg-slate-800/50 border-b border-[#E5E7EB] dark:border-slate-800">
            <th className="pl-4 pr-1 py-2.5 w-8"><Checkbox checked={allSel} onCheckedChange={toggleAll} aria-label="Select all on this page" data-testid="sub-select-all" /></th>
            <Th k="code" {...p}>Code</Th><Th k="customer_name" {...p}>Customer</Th><Th k="plan_label" {...p}>Plan</Th><Th k="partner_name" {...p}>Maid</Th>
            <Th k="start_date" {...p}>Start Date</Th><Th k="end_date" {...p}>End Date</Th><Th k="paid" {...p} className="text-right">Paid</Th><Th k="earned" {...p} className="text-right">Earned</Th>
            <Th k="status" {...p}>Status</Th><Th {...p}>Settlement</Th><Th {...p} className="text-right pr-4">Action</Th>
          </tr>
        </thead>
        <tbody>{rows.map((s) => <Row key={s.id} s={s} a={a} sel={selected.has(s.id)} toggle={() => toggle(s.id)} />)}</tbody>
      </table>
    </div>
  );
}
