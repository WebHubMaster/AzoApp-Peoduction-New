import * as React from "react"

import { cn } from "@/lib/utils"

const Textarea = React.forwardRef(({ className, ...props }, ref) => {
  return (
    <textarea
      className={cn(
        "flex min-h-[110px] w-full rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2.5 text-sm text-slate-800 dark:text-slate-100 shadow-sm transition-all placeholder:text-slate-400 focus-visible:outline-none focus-visible:border-primary-500 focus-visible:ring-2 focus-visible:ring-offset-0 focus-visible:ring-primary-300 dark:focus-visible:ring-primary-900/60 disabled:cursor-not-allowed disabled:opacity-50",
        className
      )}
      ref={ref}
      {...props} />
  );
})
Textarea.displayName = "Textarea"

export { Textarea }
