import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { COMM } from "./shared";

export default function SplitBar({ r, tid, className = "" }) {
  return (
    <TooltipProvider delayDuration={120}>
      <div className={`flex h-1.5 w-full overflow-hidden rounded-full bg-slate-100 gap-px ${className}`} data-testid={tid}>
        {COMM.map((c) => {
          const v = Number(r?.[c.k]) || 0;
          if (!v) return null;
          return (
            <Tooltip key={c.k}>
              <TooltipTrigger asChild>
                <div style={{ width: `${v}%` }} className={`${c.bar} h-full cc-bar-seg cursor-default`} />
              </TooltipTrigger>
              <TooltipContent className="text-xs">{c.label}: <b>{v}%</b></TooltipContent>
            </Tooltip>
          );
        })}
      </div>
    </TooltipProvider>
  );
}
