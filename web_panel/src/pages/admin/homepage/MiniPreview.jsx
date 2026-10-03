import { mediaSrc } from "@/lib/api";
import { Play } from "lucide-react";
import { metaOf } from "./meta";

const B = ({ className = "" }) => <span className={`block rounded-[3px] bg-slate-200 dark:bg-slate-600 ${className}`} />;

const KINDS = {
  hero: () => <div className="flex h-full gap-1.5 p-1.5"><div className="flex-1 space-y-1 pt-1"><B className="h-1.5 w-3/4" /><B className="h-1.5 w-1/2" /><span className="block h-2 w-6 rounded-sm bg-[#0D47A1]/70 mt-1.5" /></div><div className="w-2/5 rounded bg-blue-100 dark:bg-blue-900/40" /></div>,
  circles: () => <div className="flex h-full items-center justify-around px-1">{[0, 1, 2, 3].map((i) => <span key={i} className="h-4 w-4 rounded-full bg-blue-100 dark:bg-blue-900/40 ring-1 ring-blue-200/70" />)}</div>,
  tiles: () => <div className="grid grid-cols-3 gap-1 h-full p-1.5">{[0, 1, 2].map((i) => <span key={i} className="rounded bg-indigo-100 dark:bg-indigo-900/40" />)}</div>,
  cards: () => <div className="grid grid-cols-4 gap-1 h-full p-1.5">{[0, 1, 2, 3].map((i) => <div key={i} className="rounded bg-white dark:bg-slate-700 ring-1 ring-slate-200 dark:ring-slate-600 p-0.5 flex flex-col gap-0.5"><span className="flex-1 rounded-sm bg-slate-200 dark:bg-slate-600" /><B className="h-1 w-3/4" /></div>)}</div>,
  banner: (cfg) => cfg?.image ? <img src={mediaSrc(cfg.image)} alt="" className="h-full w-full object-cover" /> : <div className="h-full m-1.5 rounded bg-gradient-to-r from-amber-100 to-orange-100 dark:from-amber-900/30 dark:to-orange-900/30" />,
  video: (cfg) => <div className="relative h-full bg-slate-800 grid place-items-center">{cfg?.poster && <img src={mediaSrc(cfg.poster)} alt="" className="absolute inset-0 h-full w-full object-cover opacity-70" />}<span className="relative h-5 w-5 rounded-full bg-white/90 grid place-items-center"><Play className="h-2.5 w-2.5 text-slate-800 fill-slate-800" /></span></div>,
  tickets: () => <div className="flex h-full items-center gap-1 px-1.5">{[0, 1].map((i) => <div key={i} className="flex-1 h-7 rounded border border-dashed border-emerald-300 bg-emerald-50 dark:bg-emerald-900/20 flex items-center px-1"><B className="h-1.5 w-2/3 !bg-emerald-200" /></div>)}</div>,
  lines: () => <div className="h-full p-1.5 space-y-1">{[0, 1, 2].map((i) => <div key={i} className="flex items-center justify-between rounded-sm bg-white dark:bg-slate-700 ring-1 ring-slate-200 dark:ring-slate-600 px-1 py-0.5"><B className="h-1 w-2/3" /><span className="text-[7px] leading-none text-slate-400">+</span></div>)}</div>,
  posts: () => <div className="grid grid-cols-3 gap-1 h-full p-1.5">{[0, 1, 2].map((i) => <div key={i} className="flex flex-col gap-0.5"><span className="flex-1 rounded-sm bg-sky-100 dark:bg-sky-900/40" /><B className="h-1 w-full" /></div>)}</div>,
  icons: () => <div className="grid grid-cols-3 gap-1 h-full p-1.5">{[0, 1, 2].map((i) => <div key={i} className="flex flex-col items-center justify-center gap-0.5"><span className="h-2.5 w-2.5 rounded-full bg-emerald-200" /><B className="h-1 w-3/4" /></div>)}</div>,
  steps: () => <div className="flex h-full items-center justify-around px-1">{[1, 2, 3].map((i) => <span key={i} className="h-4 w-4 rounded-full bg-[#0D47A1]/15 text-[7px] font-bold text-[#0D47A1] grid place-items-center">{i}</span>)}</div>,
};

export default function MiniPreview({ s, className = "" }) {
  const kind = metaOf(s.type).kind;
  const R = KINDS[kind] || KINDS.cards;
  return (
    <div className={`relative overflow-hidden rounded-md border border-[#E5E7EB] dark:border-slate-700 bg-[#F9FAFB] dark:bg-slate-800 ${s.enabled ? "" : "opacity-50 grayscale"} ${className}`} aria-hidden data-testid={`hp-mini-${s.id}`}>
      {R(s.config)}
    </div>
  );
}
