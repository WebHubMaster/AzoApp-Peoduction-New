import { tone, payTone, label } from "./shared";

export const StatusBadge = ({ s, tid }) => {
  const t = tone(s);
  return <span data-testid={tid} className={`inline-flex items-center gap-1.5 h-[22px] px-2 rounded-md text-[11.5px] font-medium ring-1 whitespace-nowrap transition-colors ${t.pill}`}><span className={`h-1.5 w-1.5 rounded-full ${t.dot}`} />{label(s)}</span>;
};
export const PayBadge = ({ s, tid }) => {
  const v = s || "pending";
  const t = payTone(v);
  return <span data-testid={tid} className={`inline-flex items-center h-[20px] px-1.5 rounded text-[11px] font-medium ring-1 whitespace-nowrap ${t.pill}`}>{label(v)}</span>;
};
export const TypeBadge = ({ s }) => <span className="inline-flex items-center h-[20px] px-1.5 rounded text-[11px] font-medium bg-slate-50 dark:bg-slate-800 text-slate-600 dark:text-slate-300 ring-1 ring-slate-200 dark:ring-slate-700 whitespace-nowrap">{label(s || "direct")}</span>;
