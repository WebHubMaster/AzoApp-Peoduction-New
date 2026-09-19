import PremiumDateRangePicker from "@/components/ui/PremiumDateRangePicker";

/**
 * DateRangePicker — kept for backward compatibility. Now delegates to the
 * centralized reference-style PremiumDateRangePicker so every existing usage
 * (from/to strings + onApply({from,to}) | onApply(null)) is upgraded automatically.
 */
export default function DateRangePicker({ from, to, onApply, className = "", accent = "#0D47A1" }) {
  return (
    <PremiumDateRangePicker
      from={from}
      to={to}
      onApply={onApply}
      className={className}
      accent={accent}
      align="end"
      data-testid="custom-range"
      triggerLabel="Pick a date range"
    />
  );
}
