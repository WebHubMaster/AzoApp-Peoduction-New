import React, { useEffect, useState, useCallback, useRef } from "react";
import api, { fmt } from "@/lib/api";
import PremiumSelect from "@/components/ui/PremiumSelect";
import { Trophy, Crown, Medal, Star, Flame, TrendingUp, MapPin, Gift } from "lucide-react";

const medalFor = (rank) => {
  if (rank === 1) return { bg: "from-amber-400 to-yellow-500", Icon: Crown };
  if (rank === 2) return { bg: "from-slate-300 to-slate-400", Icon: Medal };
  if (rank === 3) return { bg: "from-orange-400 to-amber-600", Icon: Medal };
  return null;
};

const Avatar = ({ name, me }) => (
  <div className={`h-10 w-10 rounded-full grid place-items-center font-heading font-bold text-sm shrink-0
    ${me ? "bg-primary-700 text-white" : "bg-primary-50 text-primary-700"}`}>
    {(name || "P").trim().charAt(0).toUpperCase()}
  </div>
);

const Row = ({ p, highlight, reward }) => (
  <div data-testid={`lb-row-${p.rank}`}
    className={`flex items-center gap-3 rounded-xl border p-3 ${highlight
      ? "border-primary-300 bg-primary-50/60 ring-1 ring-primary-200"
      : "border-slate-200 bg-white"}`}>
    <div className="w-7 text-center font-heading font-extrabold text-slate-500">{p.rank}</div>
    <Avatar name={p.name} me={p.is_me} />
    <div className="min-w-0 flex-1">
      <p className="font-semibold text-slate-800 truncate flex items-center gap-1.5">
        {p.name}
        {p.is_me && <span className="text-[10px] font-bold bg-primary-700 text-white rounded-full px-1.5 py-0.5">YOU</span>}
        {p.streak >= 3 && <span className="text-[11px] text-orange-500 flex items-center gap-0.5"><Flame className="h-3 w-3" />{p.streak}</span>}
      </p>
      <p className="text-xs text-slate-400 flex items-center gap-2">
        <span className="flex items-center gap-0.5"><Star className="h-3 w-3 fill-amber-400 text-amber-400" /> {p.rating}</span>
        {p.city && <span className="flex items-center gap-0.5"><MapPin className="h-3 w-3" /> {p.city}</span>}
      </p>
    </div>
    {reward > 0 && (
      <span className="text-[11px] font-semibold text-emerald-700 bg-emerald-50 rounded-full px-2 py-0.5 flex items-center gap-0.5">
        <Gift className="h-3 w-3" /> {fmt(reward)}
      </span>
    )}
    <div className="text-right">
      <p className="font-heading font-extrabold text-slate-900">{p.jobs_completed}</p>
      <p className="text-[10px] uppercase tracking-wide text-slate-400">jobs</p>
    </div>
  </div>
);

export default function PartnerLeaderboard() {
  const [data, setData] = useState(null);
  const [err, setErr] = useState(false);
  const [period, setPeriod] = useState("week");
  const [city, setCity] = useState("");
  const [skill, setSkill] = useState("");
  const [filterOpts, setFilterOpts] = useState({ cities: [], skills: [] });

  const load = useCallback((p, c, s) => {
    setData(null); setErr(false);
    const params = new URLSearchParams({ period: p });
    if (c) params.set("city", c);
    if (s) params.set("skill", s);
    api.get(`/partner/leaderboard?${params.toString()}`).then((r) => {
      setData(r.data);
      if (r.data?.filters) setFilterOpts(r.data.filters);
    }).catch(() => setErr(true));
  }, []);

  useEffect(() => { load(period, city, skill); }, [period, city, skill, load]);

  // Make it a *city* leaderboard by default: on first load, focus the board on
  // the partner's own city so they see local rivals (they can pick "All cities").
  const autoCityRef = useRef(false);
  useEffect(() => {
    if (!autoCityRef.current && !city && data?.me?.city && (filterOpts.cities || []).includes(data.me.city)) {
      autoCityRef.current = true;
      setCity(data.me.city);
    }
  }, [data, city, filterOpts]);

  const rewards = (data?.rewards_enabled && Array.isArray(data?.reward_top3)) ? data.reward_top3 : [];
  const rewardFor = (rank) => (period === "week" && rewards[rank - 1]) ? rewards[rank - 1] : 0;

  const top = data?.top || [];
  const podium = top.slice(0, 3);
  const rest = top.slice(3);
  const outsideTop = data?.me && !top.some((t) => t.is_me);

  return (
    <div className="w-full space-y-6" data-testid="partner-leaderboard">
      {/* Hero */}
      <div className="rounded-3xl bg-gradient-to-br from-primary-700 via-primary-800 to-slate-900 text-white p-6 relative overflow-hidden">
        <div className="absolute -right-6 -top-6 opacity-10"><Trophy className="h-40 w-40" /></div>
        <div className="relative">
          <p className="text-primary-200 text-sm flex items-center gap-1.5"><Trophy className="h-4 w-4" /> Fleet Leaderboard</p>
          <h2 className="font-heading font-extrabold text-2xl mt-1">Top 10 Partners</h2>
          {data && (
            <p className="text-primary-200 text-sm mt-1">
              {data.my_rank
                ? <>You are ranked <b className="text-white">#{data.my_rank}</b> of {data.total} partners{period === "week" ? " this week" : ""}. Climb higher — finish more jobs!</>
                : <>Complete jobs to enter the rankings among {data.total} partners.</>}
            </p>
          )}
          {/* Period tabs */}
          <div className="inline-flex mt-4 rounded-xl bg-white/10 p-1" data-testid="lb-period-tabs">
            {[["week", "This Week"], ["all", "All-time"]].map(([key, label]) => (
              <button key={key} data-testid={`lb-tab-${key}`} onClick={() => setPeriod(key)}
                className={`px-4 py-1.5 rounded-lg text-sm font-semibold transition ${period === key ? "bg-white text-primary-800" : "text-white/80 hover:text-white"}`}>
                {label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Filters — city / skill for local & same-trade competition */}
      <div className="flex flex-wrap items-center gap-2" data-testid="lb-filters">
        <PremiumSelect data-testid="lb-city" value={city} onChange={(e) => setCity(e.target.value)} placeholder="All cities"
          className="!h-9 !w-auto min-w-[140px] rounded-lg">
          <option value="">All cities</option>
          {filterOpts.cities.map((c) => <option key={c} value={c}>{c}</option>)}
        </PremiumSelect>
        <PremiumSelect data-testid="lb-skill" value={skill} onChange={(e) => setSkill(e.target.value)} placeholder="All skills"
          className="!h-9 !w-auto min-w-[140px] rounded-lg capitalize">
          <option value="">All skills</option>
          {filterOpts.skills.map((s) => <option key={s} value={s}>{s}</option>)}
        </PremiumSelect>
        {(city || skill) && (
          <button data-testid="lb-clear-filters" onClick={() => { setCity(""); setSkill(""); }}
            className="text-sm text-slate-500 hover:text-slate-700 underline">Clear</button>
        )}
        {(city || skill) && <span className="text-xs text-slate-400">Showing {data?.total ?? 0} partner{(data?.total ?? 0) === 1 ? "" : "s"}</span>}
      </div>

      {period === "week" && rewards.length > 0 && (
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 flex items-center gap-3" data-testid="lb-reward-banner">
          <div className="h-10 w-10 rounded-xl bg-emerald-500 text-white grid place-items-center"><Gift className="h-5 w-5" /></div>
          <p className="text-sm text-emerald-800">
            <b>Weekly rewards:</b> finish in the top 3 this week and earn a bonus automatically —
            <b> {rewards.map((a, i) => `#${i + 1} ${fmt(a)}`).join(" · ")}</b>. Paid to your wallet when the week ends. 🏆
          </p>
        </div>
      )}

      {err && <div className="text-slate-400 text-sm py-10 text-center">Leaderboard could not load. Please try again.</div>}
      {!data && !err && <div className="text-slate-400 text-sm py-10 text-center">Loading fleet leaderboard…</div>}

      {data && !err && (
        <>
          {/* Podium */}
          {podium.length >= 1 && (
            <div className="grid grid-cols-3 gap-3 items-end" data-testid="lb-podium">
              {[1, 0, 2].map((slot) => {
                const p = podium[slot];
                if (!p) return <div key={slot} />;
                const m = medalFor(p.rank);
                const h = p.rank === 1 ? "pt-6 pb-7" : "pt-5 pb-5";
                const rw = rewardFor(p.rank);
                return (
                  <div key={p.id} className={`rounded-2xl border text-center px-2 ${h}
                    ${p.is_me ? "border-primary-300 bg-primary-50" : "border-slate-200 bg-white"}
                    ${p.rank === 1 ? "shadow-lg shadow-amber-100 -translate-y-1" : ""}`}>
                    <div className={`mx-auto mb-2 h-9 w-9 rounded-full grid place-items-center bg-gradient-to-br ${m?.bg || "from-slate-200 to-slate-300"}`}>
                      {m ? <m.Icon className="h-5 w-5 text-white" /> : <span className="text-white font-bold">{p.rank}</span>}
                    </div>
                    <Avatar name={p.name} me={p.is_me} />
                    <p className="font-semibold text-slate-800 text-sm truncate mt-2">{p.name}</p>
                    <p className="text-[11px] text-slate-400 flex items-center justify-center gap-0.5">
                      <Star className="h-3 w-3 fill-amber-400 text-amber-400" /> {p.rating}
                    </p>
                    <p className="font-heading font-extrabold text-lg text-primary-700 mt-1">{p.jobs_completed}</p>
                    <p className="text-[10px] uppercase tracking-wide text-slate-400 -mt-1">jobs</p>
                    {rw > 0 && <p className="text-[11px] font-semibold text-emerald-600 mt-1 flex items-center justify-center gap-0.5"><Gift className="h-3 w-3" /> {fmt(rw)}</p>}
                  </div>
                );
              })}
            </div>
          )}

          {/* Rest of top 10 */}
          <div className="space-y-2" data-testid="lb-list">
            {rest.map((p) => <Row key={p.id} p={p} highlight={p.is_me} reward={rewardFor(p.rank)} />)}
            {top.length === 0 && (
              <div className="rounded-2xl border border-dashed border-slate-200 p-10 text-center text-slate-400">
                {period === "week" ? "No jobs completed yet this week. Be the first on the board!" : "No ranked partners yet. Be the first to top the board!"}
              </div>
            )}
          </div>

          {/* Your row if outside top 10 */}
          {outsideTop && (
            <div>
              <p className="text-xs font-bold uppercase tracking-wide text-slate-400 mb-2 flex items-center gap-1">
                <TrendingUp className="h-3.5 w-3.5" /> Your position
              </p>
              <Row p={data.me} highlight reward={0} />
            </div>
          )}
        </>
      )}
    </div>
  );
}
