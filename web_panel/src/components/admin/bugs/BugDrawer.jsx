import React from "react";
import { CheckCircle2, RotateCcw, User, Phone, Smartphone, Tag, Clock, History, FileText, ExternalLink } from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { mediaSrc } from "@/lib/api";
import { StatusPill } from "./BugCard";
import { APP_LABEL, CAT_LABEL, fmtDate, isSolved, shortId } from "./bugUtils";

const Section = ({ title, icon: Icon, children }) => (
  <section className="rounded-xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
    <h4 className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.12em] text-slate-400 mb-3"><Icon className="h-3.5 w-3.5" />{title}</h4>
    {children}
  </section>
);
const Row = ({ icon: Icon, label, value, testId }) => (
  <div className="flex items-start justify-between gap-3 py-1.5 text-sm">
    <span className="flex items-center gap-1.5 text-slate-500 shrink-0"><Icon className="h-3.5 w-3.5" />{label}</span>
    <span data-testid={testId} className="font-medium text-slate-800 dark:text-slate-200 text-right break-words min-w-0">{value || "—"}</span>
  </div>
);

export default function BugDrawer({ bug: b, onClose, onResolve, onReopen }) {
  const solved = b && isSolved(b.status);
  return (
    <Sheet open={!!b} onOpenChange={(o) => !o && onClose()}>
      <SheetContent side="right" data-testid="bug-drawer" className="w-full sm:max-w-xl p-0 flex flex-col bg-slate-50 dark:bg-slate-950 border-l border-slate-200 dark:border-slate-800">
        {b && (
          <>
            <SheetHeader className="text-left px-5 pt-5 pb-4 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800">
              <div className="flex items-center gap-2 text-[11px] font-semibold text-slate-400"><span className="font-mono">{shortId(b.id)}</span><StatusPill status={b.status} data-testid="bug-drawer-status" /></div>
              <SheetTitle data-testid="bug-drawer-title" className="font-heading text-lg leading-snug pr-6 break-words">{b.title}</SheetTitle>
              <SheetDescription className="text-xs">Reported {fmtDate(b.created_at)}</SheetDescription>
            </SheetHeader>
            <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-3">
              <Section title="Description" icon={FileText}><p data-testid="bug-drawer-description" className="text-sm text-slate-700 dark:text-slate-200 whitespace-pre-wrap break-words">{b.description}</p></Section>
              {b.screenshot_url && (
                <Section title="Attachment" icon={ExternalLink}>
                  <a href={mediaSrc(b.screenshot_url)} target="_blank" rel="noreferrer" data-testid="bug-drawer-screenshot" className="block">
                    <img src={mediaSrc(b.screenshot_url)} alt="Bug screenshot" loading="lazy" className="w-full max-h-80 object-contain rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-100 dark:bg-slate-800" />
                  </a>
                </Section>
              )}
              <Section title="Reporter & Source" icon={User}>
                <Row icon={User} label="Name" value={b.reporter_name} testId="bug-drawer-reporter" />
                <Row icon={Phone} label="Phone" value={b.reporter_phone} />
                <Row icon={Smartphone} label="Source app" value={b.app_label || APP_LABEL[b.reporter_role]} />
                <Row icon={Tag} label="Category" value={CAT_LABEL[b.category] || "Other"} />
              </Section>
              {b.resolution_note && (
                <Section title={solved ? "Resolution" : "Previous resolution"} icon={CheckCircle2}>
                  <p data-testid="bug-drawer-resolution" className="text-sm text-slate-800 dark:text-slate-200 whitespace-pre-wrap break-words">{b.resolution_note}</p>
                  <p className="text-xs text-slate-500 mt-2">{solved ? "Visible to the reporter in their app." : "Bug was reopened after this resolution."}</p>
                </Section>
              )}
              <Section title="Activity" icon={History}>
                <Row icon={Clock} label="Reported" value={fmtDate(b.created_at)} />
                {solved && <Row icon={CheckCircle2} label="Resolved" value={`${fmtDate(b.resolved_at)}${b.resolved_by ? ` · ${b.resolved_by}` : ""}`} testId="bug-drawer-resolved-at" />}
                <Row icon={History} label="Last updated" value={fmtDate(b.updated_at)} />
              </Section>
            </div>
            <div className="p-4 bg-white dark:bg-slate-900 border-t border-slate-200 dark:border-slate-800 flex justify-end gap-2">
              {solved ? (
                <button type="button" data-testid="bug-drawer-reopen" onClick={() => onReopen(b)} className="h-10 px-4 rounded-md border border-slate-200 dark:border-slate-700 text-sm font-semibold inline-flex items-center gap-1.5 hover:bg-slate-50 dark:hover:bg-slate-800"><RotateCcw className="h-4 w-4" />Reopen</button>
              ) : (
                <button type="button" data-testid="bug-drawer-resolve" onClick={() => onResolve(b)} className="h-10 px-4 rounded-md bg-primary-700 hover:bg-primary-800 text-white text-sm font-semibold inline-flex items-center gap-1.5"><CheckCircle2 className="h-4 w-4" />Mark Solved</button>
              )}
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
