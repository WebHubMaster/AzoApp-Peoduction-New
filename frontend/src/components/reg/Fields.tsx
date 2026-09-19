import React, { useEffect, useMemo, useState } from "react";
import { View, Text, Pressable, TextInput, Modal, ScrollView, ActivityIndicator, TextInputProps } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Search, X, Check, ChevronDown, ChevronLeft, ChevronRight, CheckCircle2, AlertTriangle, ShieldCheck, Clock, LucideIcon } from "lucide-react-native";
import { TW, T, usePal } from "./tokens";

/* ---------------- Field: label (text-sm semibold slate-700) + red * + hint ---------------- */
export const Field = ({ label, children, hint, required }: { label: string; children: React.ReactNode; hint?: string; required?: boolean }) => (
  <View>
    <Text style={{ ...T.sm, fontWeight: "600", color: TW.slate700, marginBottom: 6 }}>
      {label}{required ? <Text style={{ color: TW.red500 }}> *</Text> : null}
    </Text>
    {children}
    {hint ? <Text style={{ ...T.xs, color: TW.slate400, marginTop: 4 }}>{hint}</Text> : null}
  </View>
);

/* ---------------- Input: h-12 rounded-xl border-slate-200 text-sm ---------------- */
export function WInput({ disabled, style, uppercase, tracking, ...props }: TextInputProps & { disabled?: boolean; uppercase?: boolean; tracking?: boolean }) {
  const P = usePal();
  const [focus, setFocus] = useState(false);
  return (
    <View style={[{ height: 48, borderRadius: 12, borderWidth: 1, borderColor: focus ? P[500] : TW.slate200, backgroundColor: disabled ? TW.slate100 : "#fff", opacity: disabled ? 0.5 : 1, boxShadow: focus ? `0px 0px 0px 2px ${P[100]}` : "0px 1px 2px rgba(0,0,0,0.05)" }, style as any]}>
      <TextInput editable={!disabled} placeholderTextColor={TW.slate400} onFocus={() => setFocus(true)} onBlur={() => setFocus(false)}
        autoCapitalize={uppercase ? "characters" : props.autoCapitalize} {...props}
        style={{ flex: 1, paddingHorizontal: 12, paddingVertical: 4, ...T.sm, lineHeight: undefined, color: TW.slate800, letterSpacing: tracking ? 2 : undefined }} />
    </View>
  );
}

export function WTextarea({ rows = 3, pad = 14, style, ...props }: TextInputProps & { rows?: number; pad?: number }) {
  const P = usePal();
  const [focus, setFocus] = useState(false);
  return (
    <TextInput multiline textAlignVertical="top" placeholderTextColor={TW.slate400} onFocus={() => setFocus(true)} onBlur={() => setFocus(false)} {...props}
      style={[{ minHeight: rows * 20 + pad * 2, width: "100%", borderRadius: 12, borderWidth: 1, borderColor: focus ? P[400] : TW.slate200, padding: pad, ...T.sm, color: TW.slate800, backgroundColor: "#fff" }, style as any]} />
  );
}

/* ---------------- Bottom sheet (PremiumSelect / Combo mobile menu) ---------------- */
function Sheet({ open, onClose, title, children }: { open: boolean; onClose: () => void; title: string; children: React.ReactNode }) {
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={open} transparent animationType="slide" onRequestClose={onClose}>
      <View style={{ flex: 1, justifyContent: "flex-end" }}>
        <Pressable style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.3)" }} onPress={onClose} />
        <View style={{ maxHeight: "70%", backgroundColor: "#fff", borderTopLeftRadius: 16, borderTopRightRadius: 16, borderTopWidth: 1, borderColor: TW.slate200, paddingBottom: insets.bottom, boxShadow: "0px -10px 40px rgba(0,0,0,0.2)" }}>
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, paddingTop: 12, paddingBottom: 8, borderBottomWidth: 1, borderBottomColor: TW.slate100 }}>
            <Text style={{ ...T.sm, fontWeight: "600", color: TW.slate700 }}>{title}</Text>
            <Pressable onPress={onClose} hitSlop={8} style={{ padding: 4 }}><X size={20} color={TW.slate400} /></Pressable>
          </View>
          {children}
        </View>
      </View>
    </Modal>
  );
}

/* ---------------- Searchable combo (web Combo) ---------------- */
export type Opt = { id?: string; name?: string; label?: string; [k: string]: any };
export function Combo({ value, display, onSelect, options, labelKey = "name", placeholder, disabled, testID }: {
  value?: string; display?: string; onSelect: (o: Opt) => void; options: Opt[]; labelKey?: string; placeholder?: string; disabled?: boolean; testID?: string;
}) {
  const P = usePal();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const filtered = useMemo(() => {
    const ql = q.trim().toLowerCase();
    const arr = options || [];
    if (!ql) return arr.slice(0, 60);
    return arr.filter((o) => String(o[labelKey] || "").toLowerCase().includes(ql)).slice(0, 60);
  }, [q, options, labelKey]);
  return (
    <>
      <Pressable testID={testID} disabled={disabled} onPress={() => !disabled && setOpen(true)}
        style={{ width: "100%", flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8, borderRadius: 12, borderWidth: 1, paddingHorizontal: 14, paddingVertical: 12, backgroundColor: disabled ? TW.slate100 : "#fff", borderColor: TW.slate200 }}>
        <Text numberOfLines={1} style={{ ...T.sm, color: disabled ? TW.slate400 : display ? TW.slate800 : TW.slate400, flex: 1 }}>{display || placeholder}</Text>
        <Search size={16} color={TW.slate400} />
      </Pressable>
      <Sheet open={open} onClose={() => { setOpen(false); setQ(""); }} title={placeholder || "Select"}>
        <View style={{ padding: 8, borderBottomWidth: 1, borderBottomColor: TW.slate100 }}>
          <View style={{ height: 36, borderRadius: 6, borderWidth: 1, borderColor: TW.slate200, backgroundColor: "#fff", justifyContent: "center" }}>
            <TextInput autoFocus value={q} onChangeText={setQ} placeholder="Type to search…" placeholderTextColor={TW.slate400} style={{ paddingHorizontal: 12, ...T.sm, lineHeight: undefined, color: TW.slate800 }} />
          </View>
        </View>
        <ScrollView keyboardShouldPersistTaps="handled" style={{ maxHeight: 240 }} contentContainerStyle={{ paddingVertical: 4 }}>
          {filtered.length === 0 ? <Text style={{ paddingHorizontal: 12, paddingVertical: 16, textAlign: "center", ...T.xs, color: TW.slate400 }}>No results</Text> : null}
          {filtered.map((o) => {
            const sel = value === (o.id || o[labelKey]);
            return (
              <Pressable key={String(o.id || o[labelKey])} testID={`opt-${o.id || o[labelKey]}`} onPress={() => { onSelect(o); setOpen(false); setQ(""); }}
                style={{ paddingHorizontal: 14, paddingVertical: 10, backgroundColor: sel ? P[50] : "transparent" }}>
                <Text style={{ ...T.sm, color: sel ? P[700] : TW.slate700, fontWeight: sel ? "500" : "400" }}>{o[labelKey]}</Text>
              </Pressable>
            );
          })}
        </ScrollView>
      </Sheet>
    </>
  );
}

/* ---------------- PremiumSelect (non-searchable) ---------------- */
export function WSelect({ value, onChange, options, placeholder = "Select...", disabled, testID }: {
  value: string; onChange: (v: string) => void; options: { value: string; label: string }[]; placeholder?: string; disabled?: boolean; testID?: string;
}) {
  const P = usePal();
  const [open, setOpen] = useState(false);
  const selected = options.find((o) => o.value === value && o.value !== "");
  return (
    <>
      <Pressable testID={testID} disabled={disabled} onPress={() => setOpen(true)}
        style={{ width: "100%", height: 48, paddingHorizontal: 12, flexDirection: "row", alignItems: "center", gap: 8, borderRadius: 12, borderWidth: 1, borderColor: open ? P[400] : TW.slate200, backgroundColor: "#fff", opacity: disabled ? 0.5 : 1, boxShadow: open ? `0px 0px 0px 2px ${P[100]}` : undefined }}>
        <Text numberOfLines={1} style={{ flex: 1, ...T.sm, color: selected ? TW.slate700 : TW.slate400 }}>{selected ? selected.label : placeholder}</Text>
        <ChevronDown size={16} color={TW.slate400} style={{ transform: [{ rotate: open ? "180deg" : "0deg" }] }} />
      </Pressable>
      <Sheet open={open} onClose={() => setOpen(false)} title={placeholder}>
        <ScrollView contentContainerStyle={{ paddingVertical: 4 }}>
          {options.map((o) => {
            const sel = o.value === value;
            return (
              <Pressable key={o.value || "_"} testID={testID ? `${testID}-opt-${o.value}` : undefined} onPress={() => { onChange(o.value); setOpen(false); }}
                style={{ flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 12, paddingVertical: 12, backgroundColor: sel ? P[50] : "transparent" }}>
                <Text style={{ flex: 1, ...T.sm, color: sel ? P[700] : TW.slate600, fontWeight: sel ? "500" : "400" }}>{o.label || <Text style={{ color: TW.slate400 }}>{placeholder}</Text>}</Text>
                {sel ? <Check size={16} color={P[700]} /> : null}
              </Pressable>
            );
          })}
        </ScrollView>
      </Sheet>
    </>
  );
}

/* ---------------- shadcn Button (h-10 rounded-xl text-sm semibold) ---------------- */
export function WButton({ title, onPress, variant = "default", disabled, loading, IconLeft, IconRight, minWidth, full, height = 40, testID }: {
  title: string; onPress?: () => void; variant?: "default" | "outline" | "emerald"; disabled?: boolean; loading?: boolean;
  IconLeft?: LucideIcon; IconRight?: LucideIcon; minWidth?: number; full?: boolean; height?: number; testID?: string;
}) {
  const P = usePal();
  const bg = variant === "default" ? P[700] : variant === "emerald" ? TW.emerald600 : "#fff";
  const fg = variant === "outline" ? TW.slate700 : "#fff";
  return (
    <Pressable testID={testID} disabled={disabled || loading} onPress={onPress}
      style={({ pressed }) => ({ height, minWidth, width: full ? "100%" : undefined, paddingHorizontal: 16, borderRadius: 12, backgroundColor: bg, borderWidth: variant === "outline" ? 1 : 0, borderColor: TW.slate200, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, opacity: disabled ? 0.5 : 1, transform: [{ scale: pressed ? 0.98 : 1 }], boxShadow: variant === "default" ? "0px 2px 6px rgba(13,71,161,0.3)" : undefined })}>
      {loading ? <ActivityIndicator size="small" color={fg} /> : (
        <>
          {IconLeft ? <IconLeft size={16} color={fg} /> : null}
          <Text style={{ ...T.sm, fontWeight: "600", color: fg }}>{title}</Text>
          {IconRight ? <IconRight size={16} color={fg} /> : null}
        </>
      )}
    </Pressable>
  );
}

/* ---------------- Step title ---------------- */
export function StepTitle({ Icon, title }: { Icon: LucideIcon; title: string }) {
  const P = usePal();
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 16 }}>
      <Icon size={20} color={P[700]} />
      <Text style={{ fontWeight: "700", ...T.lg, color: TW.slate900 }}>{title}</Text>
    </View>
  );
}

export type StepDef = { key: string; label: string; icon: LucideIcon };

/* ---------------- Partner stepper: round icons + labels + connectors ---------------- */
export function PartnerStepper({ steps, step, onStep }: { steps: StepDef[]; step: number; onStep: (i: number) => void }) {
  const P = usePal();
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 24 }} contentContainerStyle={{ flexGrow: 1, justifyContent: "space-between", alignItems: "center", paddingBottom: 4 }}>
      {steps.map((s, i) => {
        const done = i < step; const cur = i === step; const Ic = s.icon;
        return (
          <View key={s.key} style={{ flexDirection: "row", alignItems: "center" }}>
            <Pressable testID={`step-${s.key}`} onPress={() => i <= step && onStep(i)} style={{ alignItems: "center", gap: 4 }}>
              <View style={{ height: 36, width: 36, borderRadius: 18, alignItems: "center", justifyContent: "center", backgroundColor: done ? TW.emerald500 : cur ? P[700] : TW.slate100, boxShadow: cur ? `0px 0px 0px 4px ${P[100]}` : undefined }}>
                {done ? <Check size={16} color="#fff" /> : <Ic size={16} color={cur ? "#fff" : TW.slate400} />}
              </View>
              <Text style={{ ...T.px11, fontWeight: "500", color: cur ? P[700] : TW.slate400 }}>{s.label}</Text>
            </Pressable>
            {i < steps.length - 1 ? <View style={{ width: 24, height: 2, marginHorizontal: 4, marginBottom: 20, backgroundColor: i < step ? TW.emerald400 : TW.slate200 }} /> : null}
          </View>
        );
      })}
    </ScrollView>
  );
}

/* ---------------- Merchant compact progress (web sm:hidden block) ---------------- */
export function MerchantProgress({ steps, step }: { steps: StepDef[]; step: number }) {
  const P = usePal();
  const pct = ((step + 1) / steps.length) * 100;
  return (
    <View style={{ marginBottom: 24 }} testID="reg-stepper">
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
        <Text style={{ ...T.sm, fontWeight: "700", color: TW.slate900 }}>Step {step + 1} of {steps.length} · <Text style={{ color: P[600] }}>{steps[step].label}</Text></Text>
        <Text style={{ ...T.xs, fontWeight: "600", color: TW.slate400 }}>{Math.round(pct)}%</Text>
      </View>
      <View style={{ height: 8, borderRadius: 999, backgroundColor: TW.slate100, overflow: "hidden" }}>
        <View style={{ height: "100%", width: `${pct}%`, borderRadius: 999, backgroundColor: P[600] }} />
      </View>
    </View>
  );
}

/* ---------------- Pills / pincode badge / out-of-area ---------------- */
export function Pill({ bg, fg, Icon, text, spinning, testID }: { bg: string; fg: string; Icon?: LucideIcon; text: string; spinning?: boolean; testID?: string }) {
  return (
    <View testID={testID} style={{ flexDirection: "row", alignItems: "center", gap: 6, alignSelf: "flex-start", backgroundColor: bg, paddingHorizontal: 12, paddingVertical: 4, borderRadius: 999 }}>
      {spinning ? <ActivityIndicator size={12} color={fg} /> : Icon ? <Icon size={14} color={fg} /> : null}
      <Text style={{ ...T.xs, fontWeight: "600", color: fg }}>{text}</Text>
    </View>
  );
}

export function PincodeBadge({ pincode, checking, cov }: { pincode: string; checking: boolean; cov: any }) {
  if (String(pincode || "").length !== 6) return null;
  return (
    <View testID="reg-pincode-badge">
      {checking ? <Pill bg={TW.slate100} fg={TW.slate600} spinning text="Checking availability…" />
        : cov?.serviceable === true ? <Pill bg={TW.emerald100} fg={TW.emerald700} Icon={CheckCircle2} text="We serve your area" testID="reg-pincode-serviceable" />
          : cov?.serviceable === false ? <Pill bg={TW.rose100} fg={TW.rose700} Icon={AlertTriangle} text="Not serviceable" testID="reg-pincode-blocked" />
            : null}
    </View>
  );
}

export function OutOfArea({ pincode, subject }: { pincode: string; subject: string }) {
  return (
    <View testID="reg-out-of-area" style={{ borderRadius: 12, borderWidth: 1, borderColor: TW.amber300, backgroundColor: TW.amber50, padding: 12 }}>
      <Text style={{ ...T.sm, fontWeight: "600", color: TW.amber800 }}>We&apos;re not in this area yet</Text>
      <Text style={{ ...T.sm, color: TW.amber800, marginTop: 4 }}>Pincode <Text style={{ fontWeight: "700" }}>{pincode}</Text> is outside our current service areas, so {subject} can&apos;t be submitted for it.</Text>
    </View>
  );
}

/* ---------------- Info box (primary-50) ---------------- */
export function InfoBox({ text }: { text: string }) {
  const P = usePal();
  return (
    <View style={{ borderRadius: 12, backgroundColor: P[50], borderWidth: 1, borderColor: P[100], padding: 14, flexDirection: "row", alignItems: "flex-start", gap: 8 }}>
      <ShieldCheck size={16} color={P[700]} style={{ marginTop: 2 }} />
      <Text style={{ flex: 1, ...T.sm, color: P[700] }}>{text}</Text>
    </View>
  );
}

/* ---------------- Status banners ---------------- */
export function RejectedBanner({ reason }: { reason: string }) {
  return (
    <View testID="reg-rejected" style={{ marginBottom: 20, borderRadius: 16, backgroundColor: TW.red50, borderWidth: 1, borderColor: TW.red200, padding: 16, flexDirection: "row", alignItems: "flex-start", gap: 12 }}>
      <AlertTriangle size={20} color={TW.red500} style={{ marginTop: 2 }} />
      <View style={{ flex: 1 }}>
        <Text style={{ ...T.base, fontWeight: "600", color: TW.red700 }}>Application needs changes</Text>
        <Text style={{ ...T.sm, color: TW.red600, marginTop: 2 }}>{reason}</Text>
        <Text style={{ ...T.xs, color: TW.red500, marginTop: 4 }}>Please correct the details below and submit again.</Text>
      </View>
    </View>
  );
}

export function ApprovedBanner({ who }: { who: string }) {
  return (
    <View testID="reg-approved" style={{ marginBottom: 20, borderRadius: 16, backgroundColor: TW.emerald700, padding: 20, flexDirection: "row", alignItems: "flex-start", gap: 12 }}>
      <View style={{ height: 44, width: 44, borderRadius: 16, backgroundColor: "rgba(255,255,255,0.15)", alignItems: "center", justifyContent: "center" }}><ShieldCheck size={24} color="#fff" /></View>
      <View style={{ flex: 1 }}>
        <Text style={{ fontWeight: "700", ...T.lg, color: "#fff" }}>Profile approved &amp; locked</Text>
        <Text style={{ ...T.sm, color: "rgba(255,255,255,0.85)", marginTop: 2 }}>You are a Verified {who}. To change details, contact support.</Text>
      </View>
    </View>
  );
}

export function UnderReview({ onRefresh, refreshing }: { onRefresh: () => void; refreshing?: boolean }) {
  return (
    <View testID="reg-under-review" style={{ alignItems: "center", paddingVertical: 32 }}>
      <View style={{ height: 80, width: 80, borderRadius: 40, backgroundColor: TW.amber100, alignItems: "center", justifyContent: "center", marginBottom: 20 }}>
        <Clock size={40} color={TW.amber500} />
      </View>
      <Text style={{ fontWeight: "800", ...T.xl2, color: TW.slate900, textAlign: "center" }}>Account Under Review</Text>
      <Text style={{ ...T.base, color: TW.slate500, marginTop: 8, textAlign: "center", maxWidth: 448 }}>Your account is under review. You will receive an update within 24–48 hours. Please wait until your account is approved.</Text>
      <View style={{ marginTop: 20, backgroundColor: TW.amber100, paddingHorizontal: 16, paddingVertical: 6, borderRadius: 999 }}>
        <Text style={{ ...T.sm, fontWeight: "600", color: TW.amber700 }}>Under Review</Text>
      </View>
      <View style={{ marginTop: 32 }}>
        <WButton title="Refresh status" variant="outline" onPress={onRefresh} loading={refreshing} testID="reg-refresh-status" />
      </View>
    </View>
  );
}

/* ---------------- Review card ---------------- */
export function ReviewCard({ title, rows, onEdit, editable = true }: { title: string; rows: [string, any][]; onEdit: () => void; editable?: boolean }) {
  const P = usePal();
  return (
    <View style={{ borderRadius: 16, borderWidth: 1, borderColor: TW.slate200, overflow: "hidden" }}>
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, paddingVertical: 10, backgroundColor: TW.slate50, borderBottomWidth: 1, borderBottomColor: TW.slate100 }}>
        <Text style={{ ...T.sm, fontWeight: "600", color: TW.slate700 }}>{title}</Text>
        <Pressable onPress={onEdit} hitSlop={8}><Text style={{ ...T.xs, fontWeight: "500", color: P[600] }}>{editable ? "Edit" : "View"}</Text></Pressable>
      </View>
      {rows.map(([k, v], i) => (
        <View key={i} style={{ flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: 16, paddingHorizontal: 16, paddingVertical: 10, borderTopWidth: i ? 1 : 0, borderTopColor: TW.slate50 }}>
          <Text style={{ ...T.sm, color: TW.slate400 }}>{k}</Text>
          <Text style={{ ...T.sm, fontWeight: "500", color: TW.slate800, textAlign: "right", maxWidth: "60%" }}>{v || "—"}</Text>
        </View>
      ))}
    </View>
  );
}

/* ---------------- Sticky bottom nav ---------------- */
export function RegNav({ step, total, onBack, saving, onNext, nextDisabled, onSubmit, submitLabel, submitDisabled, viewOnly, onViewNext }: {
  step: number; total: number; onBack: () => void; saving?: boolean; onNext?: () => void; nextDisabled?: boolean;
  onSubmit?: () => void; submitLabel?: string; submitDisabled?: boolean; viewOnly?: boolean; onViewNext?: () => void;
}) {
  const insets = useSafeAreaInsets();
  const last = step === total - 1;
  return (
    <View testID={viewOnly ? "reg-view-nav" : "reg-nav"} style={{ position: "absolute", left: 0, right: 0, bottom: 0, paddingHorizontal: 20, paddingTop: 16, paddingBottom: 16 + insets.bottom, backgroundColor: "rgba(255,255,255,0.92)", borderTopWidth: 1, borderTopColor: TW.slate100, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
      <WButton title="Back" variant="outline" IconLeft={ChevronLeft} onPress={onBack} disabled={step === 0} testID="reg-back" />
      {viewOnly ? (
        <>
          <Text style={{ ...T.xs, fontWeight: "500", color: TW.slate400 }}>Step {step + 1} of {total} · View only</Text>
          <WButton title="Next" variant="outline" IconRight={ChevronRight} onPress={onViewNext} disabled={last} testID="reg-view-next" />
        </>
      ) : !last ? (
        <WButton title="Save & Continue" IconRight={ChevronRight} onPress={onNext} disabled={nextDisabled} loading={saving} minWidth={130} testID="reg-next" />
      ) : (
        <WButton title={submitLabel || "Submit Application"} variant="emerald" IconRight={Check} onPress={onSubmit} disabled={submitDisabled} loading={saving} minWidth={130} testID="reg-submit" />
      )}
    </View>
  );
}

/* ---------------- serviceability hook (web useEffect on pincode) ---------------- */
export function useServiceability(pincode: string, get: (url: string) => Promise<any>) {
  const [checking, setChecking] = useState(false);
  const [cov, setCov] = useState<any>(null);
  useEffect(() => {
    const pin = String(pincode || "").trim();
    if (pin.length !== 6) { setCov(null); setChecking(false); return; }
    let alive = true;
    setChecking(true);
    get(`/geo/serviceability?pincode=${pin}`)
      .then((r) => { if (alive) setCov(r); })
      .catch(() => { if (alive) setCov(null); })
      .finally(() => { if (alive) setChecking(false); });
    return () => { alive = false; };
  }, [pincode]);
  return { checking, cov };
}
