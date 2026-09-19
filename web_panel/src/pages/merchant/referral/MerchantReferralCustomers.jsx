import React, { useCallback, useEffect, useState } from "react";
import { Users, ArrowLeft, ChevronRight, Wrench, CheckCircle2 } from "lucide-react";
import api from "@/lib/api";
import {
  ReportCards, Pagination, SearchBox, ModuleHeader, EmptyState, PrivacyNote,
  fmt, fmtDate,
} from "./ReferralShared";

function Avatar({ name, tone = "sky" }) {
  const initials = (name || "C").split(" ").slice(0, 2).map((w) => w[0]).join("").toUpperCase();
  const tones = { sky: "bg-sky-100 text-sky-700", violet: "bg-violet-100 text-violet-700" };
  return <div className={`h-10 w-10 rounded-full grid place-items-center font-bold text-sm shrink-0 ${tones[tone]}`}>{initials}</div>;
}

function CustomerDetail({ id, onBack }) {
  const [d, setD] = useState(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    setLoading(true);
    api.get(`/merchant/referral/customers/${id}`).then((r) => setD(r.data)).catch(() => setD(null)).finally(() => setLoading(false));
  }, [id]);

  if (loading) return <div className="p-8 text-center text-slate-400 text-sm">Loading…</div>;
  if (!d) return <EmptyState title="Not found" desc="Customer details unavailable." />;
  const r = d.report || {};
  const cards = [
    { label: "Total Commission", value: r.total_commission, money: true, primary: true, sub: `${r.commission_services || 0} services` },
    { label: "This Month", value: r.this_month, money: true },
    { label: "Last Month", value: r.last_month, money: true },
    { label: "Today", value: r.today, money: true },
    { label: "Yesterday", value: r.yesterday, money: true },
    { label: "Total Services", value: d.total_services },
    { label: "Completed Services", value: d.completed_services },
  ];
  return (
    <div data-testid="customer-detail">
      <button onClick={onBack} data-testid="detail-back" className="inline-flex items-center gap-1.5 text-sm font-semibold text-slate-500 hover:text-primary-700 mb-3">
        <ArrowLeft className="h-4 w-4" /> Back to customers
      </button>
      <div className="flex items-center gap-3 mb-4">
        <Avatar name={d.name} />
        <div className="min-w-0">
          <h2 className="font-heading font-extrabold text-lg text-slate-900 dark:text-white truncate">{d.name}</h2>
          <p className="text-xs text-slate-400">{d.customer_code} · Referred customer</p>
        </div>
      </div>
      <ReportCards cards={cards} />

      <h3 className="mt-6 mb-2 text-sm font-bold text-slate-700 dark:text-slate-200 flex items-center gap-2"><Wrench className="h-4 w-4 text-primary-600" /> Service-wise commission</h3>
      <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden">
        {(d.services || []).length === 0 ? (
          <div className="p-6 text-center text-sm text-slate-400">No commission-earning services yet.</div>
        ) : d.services.map((s, i) => (
          <div key={i} className="flex items-center justify-between gap-3 px-4 py-3 border-t first:border-t-0 border-slate-100 dark:border-slate-800">
            <div className="min-w-0">
              <p className="text-sm font-semibold text-slate-900 dark:text-white truncate">{s.service_name}</p>
              <p className="text-[11px] text-slate-400">{fmtDate(s.date)} · {s.booking_code || ""} · eligible {fmt(s.eligible_amount)} · {s.commission_pct}%</p>
            </div>
            <span className="text-sm font-extrabold text-emerald-600 dark:text-emerald-400 tabular-nums shrink-0">{fmt(s.earned)}</span>
          </div>
        ))}
      </div>
      <PrivacyNote />
    </div>
  );
}

export default function MerchantReferralCustomers() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [qRaw, setQRaw] = useState("");
  const [q, setQ] = useState("");
  const [sel, setSel] = useState(null);

  useEffect(() => { const t = setTimeout(() => setQ(qRaw), 350); return () => clearTimeout(t); }, [qRaw]);
  useEffect(() => { setPage(1); }, [q, pageSize]);

  const load = useCallback(() => {
    setLoading(true);
    api.get("/merchant/referral/customers", { params: { page, page_size: pageSize, q } })
      .then((r) => setData(r.data)).catch(() => setData(null)).finally(() => setLoading(false));
  }, [page, pageSize, q]);
  useEffect(() => { if (!sel) load(); }, [load, sel]);

  if (sel) return <CustomerDetail id={sel} onBack={() => setSel(null)} />;

  const rep = data?.report || {};
  const cards = [
    { label: "Total Commission", value: rep.total_commission, money: true, primary: true, sub: `${rep.total_customers || 0} customers` },
    { label: "This Month", value: rep.this_month, money: true },
    { label: "Last Month", value: rep.last_month, money: true },
    { label: "Today", value: rep.today, money: true },
    { label: "Yesterday", value: rep.yesterday, money: true },
    { label: "Total Services", value: rep.total_services },
    { label: "Completed Services", value: rep.total_completed_services },
  ];
  const items = data?.items || [];

  return (
    <div data-testid="merchant-customers">
      <ModuleHeader title="My Customers" subtitle="Customers referred via your QR / code — and your earned commission" icon={Users} />
      <ReportCards cards={cards} />

      <div className="mt-5 flex items-center gap-2">
        <SearchBox value={qRaw} onChange={setQRaw} placeholder="Search customer name…" />
      </div>

      <div className="mt-4 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-slate-400 text-sm">Loading…</div>
        ) : items.length === 0 ? (
          <EmptyState title="No referred customers yet" desc="Customers who book through your QR code or sign up with your merchant code will appear here." />
        ) : items.map((c) => (
          <button key={c.id} data-testid={`customer-row-${c.id}`} onClick={() => setSel(c.id)}
            className="w-full flex items-center gap-3 px-4 py-3 border-t first:border-t-0 border-slate-100 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/50 text-left">
            <Avatar name={c.name} />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-slate-900 dark:text-white truncate">{c.name}</p>
              <p className="text-[11px] text-slate-400 flex items-center gap-2">
                <span className="inline-flex items-center gap-1"><CheckCircle2 className="h-3 w-3 text-emerald-500" />{c.completed_services} completed</span>
                <span>· {c.total_services} services</span>
              </p>
            </div>
            <div className="text-right shrink-0">
              <p className="text-sm font-extrabold text-emerald-600 dark:text-emerald-400 tabular-nums">{fmt(c.total_commission)}</p>
              <p className="text-[10px] text-slate-400 uppercase tracking-wide">commission</p>
            </div>
            <ChevronRight className="h-4 w-4 text-slate-300 shrink-0" />
          </button>
        ))}
      </div>

      <Pagination page={data?.page || 1} pages={data?.pages || 1} total={data?.total || 0}
        pageSize={pageSize} onPage={setPage} onPageSize={setPageSize} />
    </div>
  );
}
