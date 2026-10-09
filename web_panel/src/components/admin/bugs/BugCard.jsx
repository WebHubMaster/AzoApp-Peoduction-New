import React, { memo } from "react";
import { CheckCircle2, RotateCcw, Smartphone, Tag, User, Clock, Image as ImageIcon, ChevronRight } from "lucide-react";
import { APP_LABEL, CAT_LABEL, fmtDate, isSolved, shortId, statusMeta } from "./bugUtils";

export const Pill = ({ icon: Icon, children, className = "", ...p }) => (
  <span {...p} className={`inline-flex items-center gap-1 h-6 px-2 rounded-md text-[11px] font-semibold ring-1 ring-inset ${className}`}>{Icon && <Icon className="h-3 w-3" />}{children}</span>
);
export const StatusPill = ({ status, ...p }) => {
  const m = statusMeta(status);
  return <Pill icon={m.icon} className={m.badge} {...p}>{m.label}</Pill>;
};
const neutral = "bg-slate-50 text-slate-600 ring-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:ring-slate-700";

function BugCard({ b, onOpen, onResolve, onReopen }) {
  const solved = isSolved(b.status);
  const m = statusMeta(b.status);
  return (
    <article data-testid={`bug-card-${b.id}`} onClick={() => onOpen(b)}
      className="group relative cursor-pointer rounded-xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-card hover:shadow-cardhover hover:border-slate-300 dark:hover:border-slate-700 transition-[box-shadow,border-color] duration-200 overflow-hidden">
      <span className={`absolute left-0 top-0 h-full w-[3px] ${m.bar}`} />
      <div className="p-4 sm:p-5 pl-5 sm:pl-6">
        <div className="flex items-start gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 text-[11px] font-semibold text-slate-400 mb-1">
              <span data-testid={`bug-id-${b.id}`} className="font-mono tracking-wide">{shortId(b.id)}</span><span>·</span>
              <span className="inline-flex items-center gap-1"><Clock className="h-3 w-3" />{fmtDate(b.created_at)}</span>
            </div>
            <h3 className="font-heading font-bold text-[15px] text-slate-900 dark:text-white leading-snug break-words group-hover:text-primary-700 dark:group-hover:text-primary-300 transition-colors">{b.title}</h3>
            <p className="text-sm text-slate-600 dark:text-slate-300 mt-1 line-clamp-2 break-words">{b.description}</p>
          </div>
          <ChevronRight className="hidden sm:block h-5 w-5 text-slate-300 group-hover:text-primary-600 group-hover:translate-x-0.5 transition-[color,transform] mt-1" />
        </div>

        <div className="mt-3 flex flex-col sm:flex-row sm:items-center gap-3">
        <div className="flex-1 min-w-0 flex flex-wrap items-center gap-1.5">
          <StatusPill status={b.status} data-testid={`bug-status-${b.id}`} />
          <Pill icon={Smartphone} className={neutral}>{b.app_label || APP_LABEL[b.reporter_role] || "App"}</Pill>
          <Pill icon={Tag} className="bg-primary-50 text-primary-700 ring-primary-100 dark:bg-primary-900/30 dark:text-primary-300 dark:ring-primary-900" data-testid={`bug-category-badge-${b.id}`}>{CAT_LABEL[b.category] || "Other"}</Pill>
          {b.screenshot_url && <Pill icon={ImageIcon} className={neutral}>Screenshot</Pill>}
          <span className="inline-flex items-center gap-1 text-xs text-slate-500 ml-0.5 min-w-0"><User className="h-3 w-3 shrink-0" /><span className="truncate">{b.reporter_name || "—"}</span></span>
        </div>
        <div className="flex items-center justify-end gap-2 shrink-0" onClick={(e) => e.stopPropagation()}>
          {solved ? (
            <button type="button" data-testid={`bug-reopen-${b.id}`} onClick={() => onReopen(b)}
              className="h-9 px-3 rounded-md border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 text-[13px] font-semibold inline-flex items-center gap-1.5 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors">
              <RotateCcw className="h-4 w-4" />Reopen
            </button>
          ) : (
            <button type="button" data-testid={`bug-resolve-${b.id}`} onClick={() => onResolve(b)}
              className="h-9 px-3 rounded-md bg-primary-700 hover:bg-primary-800 text-white text-[13px] font-semibold inline-flex items-center gap-1.5 transition-colors">
              <CheckCircle2 className="h-4 w-4" />Mark Solved
            </button>
          )}
        </div>
        </div>

        {solved && b.resolution_note && (
          <div className="mt-3 flex items-start gap-2 rounded-lg bg-emerald-50/70 dark:bg-emerald-900/20 border border-emerald-100 dark:border-emerald-900/40 px-3 py-2">
            <CheckCircle2 className="h-4 w-4 text-emerald-600 mt-0.5 shrink-0" />
            <p className="text-[13px] text-emerald-900 dark:text-emerald-200 min-w-0 break-words"><span className="font-semibold">Resolution · </span>{b.resolution_note}
              <span className="text-emerald-700/70 dark:text-emerald-400/70"> — {b.resolved_by || "Admin"}{b.resolved_at ? `, ${fmtDate(b.resolved_at)}` : ""}</span></p>
          </div>
        )}

      </div>
    </article>
  );
}
export default memo(BugCard);
