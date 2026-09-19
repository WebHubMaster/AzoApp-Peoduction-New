import React, { useState } from "react";
import { MapPinOff, MapPin, Heart, CheckCircle2, Loader2, Send } from "lucide-react";
import api from "@/lib/api";
import { Button } from "@/components/ui/button";

/**
 * OutOfAreaWaitlist — a polished, professional "we're not in your area yet"
 * panel. Thanks the customer for their interest and captures their pincode so
 * the platform can prioritise its next launch city.
 *
 * Props:
 *   city           – detected city (optional, for a personal touch)
 *   pincode        – detected pincode to pre-fill (optional)
 *   servicedCities – array of cities we currently serve (optional)
 *   compact        – tighter layout for the navbar dropdown
 *   onClose        – optional callback for a dismiss/close action
 */
// Normalise a detected postcode into a clean, submit-ready value.
// Keeps letters/digits/space (uppercased) so both Indian 6-digit PINs and
// international postcodes (e.g. "1012 NC") are preserved and valid.
const normPin = (v = "") => String(v).replace(/[^a-zA-Z0-9\s]/g, "").toUpperCase().replace(/\s+/g, " ").trim().slice(0, 10);

export default function OutOfAreaWaitlist({ city = "", pincode = "", servicedCities = [], compact = false, onClose }) {
  const [pin, setPin] = useState(normPin(pincode));
  const [phone, setPhone] = useState("");
  const [status, setStatus] = useState("idle"); // idle | sending | done
  const [err, setErr] = useState("");

  // Keep the field in sync if the detected pincode arrives/updates after mount.
  React.useEffect(() => { if (pincode) setPin(normPin(pincode)); }, [pincode]);

  const submit = async () => {
    const clean = normPin(pin);
    // Accept an Indian 6-digit PIN or any 4–10 char alphanumeric postcode.
    const digits = clean.replace(/\s/g, "");
    if (digits.length < 4) { setErr("Please enter a valid pincode / postcode."); return; }
    setErr(""); setStatus("sending");
    try {
      await api.post("/waitlist", { pincode: clean, city, phone: phone.trim(), source: "out_of_area" });
      setStatus("done");
    } catch {
      setErr("Something went wrong. Please try again.");
      setStatus("idle");
    }
  };

  if (status === "done") {
    return (
      <div className="text-center" data-testid="waitlist-success">
        <div className={`${compact ? "h-12 w-12" : "h-16 w-16"} rounded-2xl bg-emerald-50 dark:bg-emerald-900/20 mx-auto flex items-center justify-center mb-3`}>
          <CheckCircle2 className={`${compact ? "h-6 w-6" : "h-8 w-8"} text-emerald-600`} />
        </div>
        <h3 className={`font-heading font-bold ${compact ? "text-base" : "text-xl"} text-slate-900 dark:text-white`}>You&apos;re on the list! 🎉</h3>
        <p className="text-sm text-slate-500 dark:text-slate-400 mt-2">
          Thank you for your interest{city ? ` in ${city}` : ""}. We&apos;ll notify you the moment we launch service near <b>{pin}</b>. Your interest helps us decide where to go next.
        </p>
        {onClose && (
          <Button data-testid="waitlist-close" onClick={onClose} variant="outline" className="mt-4">Close</Button>
        )}
      </div>
    );
  }

  return (
    <div className="text-center" data-testid="out-of-area">
      <div className={`${compact ? "h-12 w-12" : "h-16 w-16"} rounded-2xl bg-amber-50 dark:bg-amber-900/20 mx-auto flex items-center justify-center mb-3`}>
        <MapPinOff className={`${compact ? "h-6 w-6" : "h-8 w-8"} text-amber-500`} />
      </div>
      <h3 className={`font-heading font-bold ${compact ? "text-base" : "text-xl"} text-slate-900 dark:text-white`}>
        We&apos;re not in {city || "your area"} yet
      </h3>
      <p className="text-sm text-slate-500 dark:text-slate-400 mt-2 leading-relaxed">
        <span className="inline-flex items-center gap-1 font-medium text-slate-600 dark:text-slate-300"><Heart className="h-4 w-4 text-rose-500" /> Thank you for your interest!</span><br />
        We&apos;re expanding fast. Leave your pincode and we&apos;ll notify you the very moment our professionals reach your neighbourhood.
      </p>

      {servicedCities.length > 0 && (
        <p className="text-xs text-slate-400 mt-2" data-testid="serviced-cities">
          Currently serving: <b className="text-slate-500 dark:text-slate-300">{servicedCities.join(", ")}</b>
        </p>
      )}

      <div className="mt-4 space-y-2 text-left">
        {pin ? (
          <p className="text-[11px] font-medium text-emerald-600 flex items-center gap-1" data-testid="waitlist-pin-detected">
            <MapPin className="h-3.5 w-3.5" /> Pincode detected from your location — just tap submit
          </p>
        ) : null}
        <input
          data-testid="waitlist-pincode"
          value={pin}
          onChange={(e) => setPin(e.target.value.replace(/[^a-zA-Z0-9\s]/g, "").toUpperCase().slice(0, 10))}
          placeholder="Your pincode (e.g. 834001)"
          className="w-full h-11 px-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm focus:outline-none focus:ring-2 focus:ring-primary-200"
        />
        <input
          data-testid="waitlist-phone"
          inputMode="tel"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          placeholder="Mobile (optional — for launch alert)"
          className="w-full h-11 px-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm focus:outline-none focus:ring-2 focus:ring-primary-200"
        />
        {err && <p className="text-xs text-red-600" data-testid="waitlist-error">{err}</p>}
        <Button data-testid="waitlist-submit" onClick={submit} disabled={status === "sending"} className="w-full h-11 bg-primary-700 hover:bg-primary-800">
          {status === "sending" ? <><Loader2 className="h-4 w-4 animate-spin mr-1" /> Adding you…</> : <><Send className="h-4 w-4 mr-1.5" /> Notify me at launch</>}
        </Button>
      </div>

      {onClose && (
        <button data-testid="out-of-area-skip" onClick={onClose} className="mt-3 text-sm text-slate-500 hover:text-slate-700 font-medium">Maybe later</button>
      )}
    </div>
  );
}
