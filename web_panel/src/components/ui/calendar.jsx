import * as React from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { DayPicker } from "react-day-picker";

import { cn } from "@/lib/utils";
import { buttonVariants } from "@/components/ui/button";

const IconLeft = ({ className, ...p }) => (
  <ChevronLeft className={cn("h-4 w-4", className)} {...p} />
);
const IconRight = ({ className, ...p }) => (
  <ChevronRight className={cn("h-4 w-4", className)} {...p} />
);
const CAL_COMPONENTS = { IconLeft, IconRight };

/**
 * Premium calendar wrapper around react-day-picker@8.
 *
 * Notes:
 *  - When `captionLayout` is a "dropdown*" variant we HIDE the redundant
 *    "September 2026" caption label and let the month + year <select>s be the
 *    single source of truth. Previously both were shown, which made the header
 *    look duplicated/broken (Bug #3 in Sep-2026 report).
 *  - Native <select> styling is tightened so month/year dropdowns look like
 *    premium pill buttons instead of raw OS controls.
 */
function Calendar({
  className,
  classNames,
  showOutsideDays = true,
  captionLayout,
  ...props
}) {
  const isDropdown =
    captionLayout === "dropdown" || captionLayout === "dropdown-buttons";
  return (
    <DayPicker
      captionLayout={captionLayout}
      showOutsideDays={showOutsideDays}
      className={cn("p-3", className)}
      classNames={{
        months: "flex flex-col sm:flex-row space-y-4 sm:space-x-4 sm:space-y-0",
        month: "space-y-4",
        caption: cn(
          "flex justify-center pt-1 relative items-center",
          // When dropdowns are on, give them the whole header row and drop the
          // default label so we don't render "September 2026" twice.
          isDropdown && "px-8"
        ),
        caption_label: cn(
          "text-sm font-semibold text-slate-800 dark:text-slate-100",
          // Hide the default caption label when dropdowns are enabled — the
          // selectors already show the month/year.
          isDropdown && "hidden"
        ),
        caption_dropdowns: "flex items-center gap-2",
        dropdown:
          "appearance-none bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg px-2.5 py-1 pr-6 text-sm font-medium text-slate-700 dark:text-slate-100 hover:border-primary-400 focus:outline-none focus:ring-2 focus:ring-primary-500 cursor-pointer",
        dropdown_month: "relative",
        dropdown_year: "relative",
        nav: "space-x-1 flex items-center",
        nav_button: cn(
          buttonVariants({ variant: "outline" }),
          "h-7 w-7 bg-transparent p-0 opacity-70 hover:opacity-100 border-slate-200"
        ),
        nav_button_previous: "absolute left-1",
        nav_button_next: "absolute right-1",
        table: "w-full border-collapse space-y-1",
        head_row: "flex",
        head_cell:
          "text-slate-400 rounded-md w-9 font-medium text-[0.72rem] uppercase tracking-wide",
        row: "flex w-full mt-1.5",
        cell: cn(
          "relative p-0 text-center text-sm focus-within:relative focus-within:z-20 [&:has([aria-selected])]:bg-primary-50 [&:has([aria-selected].day-outside)]:bg-primary-50/50 [&:has([aria-selected].day-range-end)]:rounded-r-md",
          props.mode === "range"
            ? "[&:has(>.day-range-end)]:rounded-r-md [&:has(>.day-range-start)]:rounded-l-md first:[&:has([aria-selected])]:rounded-l-md last:[&:has([aria-selected])]:rounded-r-md"
            : "[&:has([aria-selected])]:rounded-lg"
        ),
        day: cn(
          buttonVariants({ variant: "ghost" }),
          "h-9 w-9 p-0 font-normal aria-selected:opacity-100 hover:bg-primary-50 hover:text-primary-700 rounded-lg"
        ),
        day_range_start: "day-range-start",
        day_range_end: "day-range-end",
        day_selected:
          "bg-primary-600 text-white hover:bg-primary-700 hover:text-white focus:bg-primary-700 focus:text-white shadow-sm",
        day_today: "bg-amber-100 text-amber-800 font-semibold",
        day_outside:
          "day-outside text-slate-300 aria-selected:bg-primary-50/50 aria-selected:text-slate-400",
        day_disabled: "text-slate-300 opacity-50 cursor-not-allowed",
        day_range_middle:
          "aria-selected:bg-primary-50 aria-selected:text-primary-700",
        day_hidden: "invisible",
        ...classNames,
      }}
      components={CAL_COMPONENTS}
      {...props}
    />
  );
}
Calendar.displayName = "Calendar";

export { Calendar };
