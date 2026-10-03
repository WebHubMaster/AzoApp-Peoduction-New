import { label } from "../bookings/shared";
import { subTone, setTone, payTone, SET_LABEL } from "./subShared";

const Pill = ({ t, text, tid, dot = true }) => (
  <span data-testid={tid} className={`inline-flex items-center gap-1.5 h-[22px] px-2 rounded-md text-[11.5px] font-medium ring-1 whitespace-nowrap transition-colors ${t.pill}`}>
    {dot && <span className={`h-1.5 w-1.5 rounded-full ${t.dot}`} />}{text}
  </span>
);
export const SubStatusBadge = ({ s, tid }) => <Pill t={subTone(s)} text={label(s)} tid={tid} />;
export const SettleBadge = ({ s, tid }) => <Pill t={setTone(s)} text={SET_LABEL[s] || label(s)} tid={tid} />;
export const SubPayBadge = ({ s, tid }) => {
  const t = payTone(s || "pending");
  return <span data-testid={tid} className={`inline-flex items-center h-[20px] px-1.5 rounded text-[11px] font-medium ring-1 whitespace-nowrap ${t.pill}`}>{label(s || "pending")}</span>;
};
