import * as React from "react";
import { format, parse, isValid } from "date-fns";
import { Calendar as CalIcon } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { cn } from "@/lib/utils";

/**
 * Premium date picker (Popover + react-day-picker).
 * Reads/writes an ISO "yyyy-MM-dd" string so it is a drop-in replacement
 * for <input type="date">.
 */
export function DatePicker({
  value,
  onChange,
  placeholder = "Pick a date",
  className,
  disabled,
  fromYear = 1950,
  toYear = new Date().getFullYear() + 10,
  minDate,
  maxDate,
  testId,
}) {
  const [open, setOpen] = React.useState(false);
  const parsed = value ? parse(value, "yyyy-MM-dd", new Date()) : undefined;
  const selected = parsed && isValid(parsed) ? parsed : undefined;
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          disabled={disabled}
          data-testid={testId}
          className={cn(
            "flex h-10 w-full items-center justify-between rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-sm text-slate-800 dark:text-slate-100 ring-offset-background transition focus:outline-none focus:ring-2 focus:ring-primary-500 hover:border-primary-400 disabled:opacity-50",
            !selected && "text-slate-400",
            className
          )}
        >
          <span>{selected ? format(selected, "dd MMM yyyy") : placeholder}</span>
          <CalIcon className="h-4 w-4 opacity-60" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0 z-[95]" align="start">
        <Calendar
          mode="single"
          selected={selected}
          defaultMonth={selected}
          captionLayout="dropdown-buttons"
          fromYear={fromYear}
          toYear={toYear}
          disabled={(date) =>
            (minDate && date < minDate) || (maxDate && date > maxDate) || false
          }
          onSelect={(d) => {
            onChange(d ? format(d, "yyyy-MM-dd") : "");
            setOpen(false);
          }}
          initialFocus
        />
      </PopoverContent>
    </Popover>
  );
}

export default DatePicker;
