import React, { useEffect, useState, useCallback, useMemo } from "react";
import api from "@/lib/api";
import {
  MapPin, Star, Phone, RefreshCw, Loader2, Radar, Circle,
} from "lucide-react";

const JK = "'Plus Jakarta Sans','Public Sans',system-ui,sans-serif";

/* Deterministic pseudo-position so the same partner stays put between refreshes. */
const hashPos = (id, i) => {
  let h = 0;
  const s = String(id || i);
  for (let k = 0; k < s.length; k++) h = (h * 31 + s.charCodeAt(k)) & 0xffff;
  const ang = (h % 360) * (Math.PI / 180);
  const rad = 18 + ((h >> 4) % 30);        // 18%–48% from centre
  return { x: 50 + Math.cos(ang) * rad, y: 50 + Math.sin(ang) * rad };
};

export default function PartnerCoverage() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [active, setActive] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get("/admin/partners/live");
      setData(data);
    } catch { setData(null); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const partners = data?.partners || [];
  const stats = useMemo(() => {
    let avail = 0, busy = 0;
    partners.forEach((p) => (p.active_job ? busy++ : avail++));
    return { avail, busy, total: partners.length, areas: (data?.areas || []).length };
  }, [partners, data]);

  const dots = useMemo(() => partners.slice(0, 22).map((p, i) => ({
    ...p, ...hashPos(p.id, i), busy: !!p.active_job,
  })), [partners]);

  return (
    <div className="rounded-2xl border border-[#E6EAF0] bg-white overflow-hidden" data-testid="partner-coverage" style={{ fontFamily: JK }}>
      <div className="flex items-center justify-between px-5 py-4 border-b border-[#EEF2F7]">
        <div>
          <h3 className="text-[15px] font-extrabold text-[#172033] flex items-center gap-2">
            <Radar className="h-4 w-4 text-[#0D47A1]" /> Live Partner Coverage
          </h3>
          <p className="text-[12px] text-[#64748B] mt-0.5">Online partners around your service zones</p>
        </div>
        <button onClick={load} title="Refresh" data-testid="coverage-refresh"
          className="h-9 w-9 rounded-md border border-[#E6EAF0] text-[#64748B] hover:bg-[#F6F8FC] hover:text-[#0D47A1] flex items-center justify-center transition-colors">
          <RefreshCw className="h-4 w-4" />
        </button>
      </div>

      <div className="grid md:grid-cols-[1fr_200px]">
        {/* Radar */}
        <div className="relative aspect-[1.6] md:aspect-auto md:min-h-[260px] bg-[#F6F8FC] overflow-hidden">
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="relative" style={{ width: "88%", paddingBottom: "0", aspectRatio: "1/1", maxWidth: 260 }}>
              {/* rings */}
              {[1, 0.66, 0.33].map((r) => (
                <span key={r} className="absolute rounded-full border border-[#D5DFEF]"
                  style={{ inset: `${(1 - r) * 50}%` }} />
              ))}
              <span className="absolute left-0 right-0 top-1/2 h-px bg-[#D5DFEF]" />
              <span className="absolute top-0 bottom-0 left-1/2 w-px bg-[#D5DFEF]" />
              {/* sweep */}
              <span className="azo-radar-sweep absolute inset-0 rounded-full"
                style={{ background: "conic-gradient(from 0deg, rgba(13,71,161,0.18), rgba(13,71,161,0) 55%)" }} />
              {/* centre = customer zone */}
              <span className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 h-3 w-3 rounded-full bg-[#0D47A1] ring-4 ring-[#0D47A1]/15" />

              {/* partner dots */}
              {dots.map((p) => (
                <button key={p.id} type="button" data-testid={`coverage-dot-${p.id}`}
                  onClick={() => setActive(active?.id === p.id ? null : p)}
                  className="absolute -translate-x-1/2 -translate-y-1/2 rounded-full transition-transform hover:scale-125 focus:outline-none"
                  style={{ left: `${p.x}%`, top: `${p.y}%` }}>
                  <span className={`block h-2.5 w-2.5 rounded-full ring-2 ring-white ${p.busy ? "bg-[#F59E0B]" : "bg-[#16A34A]"}`} />
                </button>
              ))}
            </div>
          </div>

          {loading && (
            <div className="absolute inset-0 flex items-center justify-center bg-white/50">
              <Loader2 className="h-5 w-5 animate-spin text-[#0D47A1]" />
            </div>
          )}

          {/* popover */}
          {active && (
            <div className="absolute bottom-3 left-3 right-3 rounded-xl border border-[#E6EAF0] bg-white shadow-lg p-3" data-testid="coverage-popover">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-[13.5px] font-bold text-[#172033] truncate">{active.name || "Partner"}</p>
                  <p className="text-[12px] text-[#64748B] truncate">{active.category || (active.categories || [])[0] || "Partner"}</p>
                </div>
                <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full shrink-0 ${active.busy ? "bg-[#FEF5E7] text-[#B45309]" : "bg-[#E9F8EF] text-[#15803D]"}`}>
                  {active.busy ? "On a job" : "Available"}
                </span>
              </div>
              <div className="flex items-center gap-3 mt-2 text-[12px] text-[#64748B]">
                {active.rating != null && <span className="flex items-center gap-1"><Star className="h-3 w-3 fill-amber-400 text-amber-400" />{active.rating}</span>}
                {active.city && <span className="flex items-center gap-1"><MapPin className="h-3 w-3" />{active.city}</span>}
                {active.active_job?.eta_label && <span>ETA {active.active_job.eta_label}</span>}
                {active.phone && <span className="flex items-center gap-1 ml-auto"><Phone className="h-3 w-3" />{active.phone}</span>}
              </div>
            </div>
          )}
        </div>

        {/* Legend / stats */}
        <div className="border-t md:border-t-0 md:border-l border-[#EEF2F7] p-4 flex flex-col gap-3 justify-center">
          <Stat dot="#16A34A" label="Available" value={stats.avail} />
          <Stat dot="#F59E0B" label="On a job" value={stats.busy} />
          <Stat dot="#0D47A1" label="Service zones" value={stats.areas} ring />
          <p className="text-[11px] text-[#94A3B8] leading-relaxed mt-1">
            Tap a dot to inspect a partner. Positions are relative to the customer zone (centre).
          </p>
        </div>
      </div>
    </div>
  );
}

const Stat = ({ dot, label, value, ring }) => (
  <div className="flex items-center gap-2.5">
    {ring
      ? <Circle className="h-3 w-3" style={{ color: dot }} />
      : <span className="h-2.5 w-2.5 rounded-full" style={{ background: dot }} />}
    <span className="text-[13px] text-[#64748B] flex-1">{label}</span>
    <span className="text-[16px] font-extrabold text-[#172033]" style={{ fontFamily: JK }}>{value}</span>
  </div>
);
