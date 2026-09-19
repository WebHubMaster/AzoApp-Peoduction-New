import React, { useEffect, useState } from "react";
import api, { fmt } from "@/lib/api";
import { Badge } from "@/components/ui/badge";
import {
  Trophy, Gift, Star, Target, Crown, Sparkles, Flame, IndianRupee,
  CheckCircle2, Lock, TrendingUp, AlertTriangle, Zap, Medal, Snowflake, Receipt,
} from "lucide-react";

const Empty = ({ text }) => <div className="text-slate-400 text-sm text-center py-8">{text}</div>;

const Ring = ({ pct, size = 76, stroke = 8, color = "#0D47A1" }) => {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const off = c - (Math.min(100, Math.max(0, pct || 0)) / 100) * c;
  return (
    <svg width={size} height={size} className="shrink-0">
      <circle cx={size / 2} cy={size / 2} r={r} stroke="#e2e8f0" strokeWidth={stroke} fill="none" />
      <circle cx={size / 2} cy={size / 2} r={r} stroke={color} strokeWidth={stroke} fill="none"
        strokeDasharray={c} strokeDashoffset={off} strokeLinecap="round"
        transform={`rotate(-90 ${size / 2} ${size / 2})`} style={{ transition: "stroke-dashoffset .6s ease" }} />
      <text x="50%" y="50%" dominantBaseline="central" textAnchor="middle" className="fill-slate-800 font-bold" fontSize={size * 0.24}>{pct || 0}%</text>
    </svg>
  );
};

const Bar = ({ pct, className = "bg-primary-600" }) => (
  <div className="h-2.5 w-full rounded-full bg-white/60 overflow-hidden">
    <div className={`h-full rounded-full ${className} transition-all`} style={{ width: `${Math.min(100, Math.max(0, pct || 0))}%` }} />
  </div>
);

export function ChallengesRewards() {
  const [data, setData] = useState(null);
  const [bonuses, setBonuses] = useState(null);
  useEffect(() => {
    api.get("/partner/challenges").then((r) => setData(r.data)).catch(() => setData({ challenges: [], stats: {}, penalties: [] }));
    api.get("/partner/my-bonuses").then((r) => setBonuses(r.data)).catch(() => setBonuses({ rows: [], totals: {}, grand_total: 0, count: 0 }));
  }, []);

  if (!data) return <div className="text-slate-400 text-sm py-10 text-center">Loading your rewards…</div>;
  const s = data.stats || {};
  const next = s.next_reward;
  const streak = s.streak || {};
  const eligibleFirst = [...(data.challenges || [])].sort((a, b) => (b.eligible - a.eligible) || (b.progress_pct - a.progress_pct));

  return (
    <div className="w-full space-y-6" data-testid="challenges-rewards">
      {/* Hero */}
      <div className="rounded-3xl bg-gradient-to-br from-primary-700 via-primary-800 to-slate-900 text-white p-6 relative overflow-hidden">
        <div className="absolute -right-8 -top-8 opacity-10"><Trophy className="h-40 w-40" /></div>
        <div className="relative">
          <p className="text-primary-200 text-sm flex items-center gap-1.5"><Sparkles className="h-4 w-4" /> Rewards & Challenges</p>
          <div className="flex flex-wrap items-end gap-x-8 gap-y-4 mt-3">
            <div>
              <p className="text-primary-200 text-xs">Total bonuses earned</p>
              <p className="font-heading font-extrabold text-4xl">{fmt(s.total_earned || 0)}</p>
            </div>
            <div>
              <p className="text-primary-200 text-xs">Fleet rank</p>
              <p className="font-heading font-extrabold text-2xl flex items-center gap-1">
                <Crown className="h-5 w-5 text-amber-300" /> #{s.rank || "—"}
                <span className="text-primary-300 text-sm font-medium">/ {s.total_partners || 0}</span>
              </p>
            </div>
            <div>
              <p className="text-primary-200 text-xs">Active challenges</p>
              <p className="font-heading font-extrabold text-2xl flex items-center gap-1"><Flame className="h-5 w-5 text-orange-300" /> {s.active_count || 0}</p>
            </div>
            {s.eligible_count > 0 && (
              <div className="ml-auto bg-emerald-400/90 text-emerald-950 rounded-2xl px-4 py-2 font-semibold flex items-center gap-2 animate-pulse">
                <Zap className="h-4 w-4" /> {s.eligible_count} reward{s.eligible_count > 1 ? "s" : ""} unlocked!
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Auto Payout status + Streak bonus card */}
      <div className="grid md:grid-cols-2 gap-4" data-testid="auto-streak">
        {/* Auto Payout */}
        <div className={`rounded-2xl border p-4 flex items-center gap-3 ${s.auto_payout ? "border-emerald-200 bg-emerald-50" : "border-slate-200 bg-white"}`} data-testid="auto-payout-card">
          <div className={`h-11 w-11 rounded-xl grid place-items-center ${s.auto_payout ? "bg-emerald-500" : "bg-slate-300"} text-white`}>
            <Zap className="h-6 w-6" />
          </div>
          <div className="min-w-0">
            <p className="font-heading font-bold text-slate-900 flex items-center gap-2">
              Auto Payout
              <Badge className={`border-0 ${s.auto_payout ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-500"}`}>
                {s.auto_payout ? "ON" : "OFF"}
              </Badge>
            </p>
            <p className="text-xs text-slate-500 mt-0.5">
              {s.auto_payout
                ? "Unlocked bonuses land in your wallet instantly — no admin approval needed."
                : "Bonuses are released after admin approval."}
            </p>
          </div>
        </div>

        {/* Streak Bonus */}
        <div className="rounded-2xl border border-orange-200 bg-gradient-to-br from-orange-50 to-amber-50 p-4" data-testid="streak-card">
          <div className="flex items-center justify-between">
            <p className="font-heading font-bold text-slate-900 flex items-center gap-1.5">
              <Flame className="h-5 w-5 text-orange-500" /> 5★ Streak
            </p>
            <div className="text-right">
              <span className="font-heading font-extrabold text-2xl text-orange-600">{streak.current || 0}</span>
              <span className="text-xs text-slate-400"> in a row</span>
            </div>
          </div>
          {streak.enabled === false ? (
            <p className="text-xs text-slate-500 mt-2">Streak bonuses are currently paused.</p>
          ) : (
            <>
              <div className="flex items-center gap-1 mt-3">
                {Array.from({ length: streak.threshold || 5 }).map((_, i) => (
                  <div key={i} className={`h-2.5 flex-1 rounded-full ${i < (streak.into_milestone || 0) ? "bg-orange-500" : "bg-white/80 border border-orange-200"}`} />
                ))}
              </div>
              <p className="text-xs text-slate-600 mt-2">
                {(streak.remaining || 0) > 0
                  ? <><b className="text-orange-600">{streak.remaining}</b> more 5★ job{streak.remaining !== 1 ? "s" : ""} to earn a <b className="text-emerald-600">{fmt(streak.next_bonus || 0)}</b> bonus 🔥</>
                  : <>Keep the streak alive for your next bonus!</>}
              </p>
              <p className="text-[11px] text-slate-400 mt-1">
                Best streak: {streak.best || 0} · Bonuses paid: {streak.milestones_paid || 0}
              </p>
              {streak.freeze_enabled && (streak.freezes_total || 0) > 0 && (
                <div className="mt-2 flex items-center gap-1.5 text-[11px] font-medium text-sky-700 bg-sky-50 border border-sky-200 rounded-lg px-2 py-1 w-fit" data-testid="streak-freeze">
                  <Snowflake className="h-3.5 w-3.5" />
                  Streak Freeze: {streak.freezes_left || 0}/{streak.freezes_total} left this week — one off-day won&apos;t break your streak.
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* My Bonuses — reward history */}
      {bonuses && (bonuses.count > 0) && (
        <div className="rounded-2xl border border-slate-200 bg-white p-5" data-testid="my-bonuses">
          <div className="flex items-center justify-between flex-wrap gap-2 mb-3">
            <h3 className="font-heading font-bold text-lg flex items-center gap-2"><Receipt className="h-5 w-5 text-primary-600" /> My Bonuses</h3>
            <span className="text-sm text-slate-500">Total earned <b className="text-emerald-600">{fmt(bonuses.grand_total)}</b></span>
          </div>
          <div className="grid grid-cols-3 gap-2 mb-3">
            {[["Incentives", bonuses.totals?.incentive || 0, Zap, "text-emerald-600"], ["Streak", bonuses.totals?.streak_bonus || 0, Flame, "text-orange-600"], ["Leaderboard", bonuses.totals?.leaderboard_reward || 0, Trophy, "text-amber-600"]].map(([label, val, Icon, tone]) => (
              <div key={label} className="rounded-xl bg-slate-50 border border-slate-100 p-2.5 text-center">
                <Icon className={`h-4 w-4 mx-auto ${tone}`} />
                <p className="font-heading font-extrabold text-slate-800 mt-1">{fmt(val)}</p>
                <p className="text-[10px] uppercase tracking-wide text-slate-400">{label}</p>
              </div>
            ))}
          </div>
          <div className="space-y-1.5 max-h-72 overflow-auto" data-testid="my-bonuses-list">
            {bonuses.rows.map((b) => {
              const meta = b.kind === "streak_bonus" ? { Icon: Flame, tone: "text-orange-500" }
                : b.kind === "leaderboard_reward" ? { Icon: Trophy, tone: "text-amber-500" }
                : { Icon: Zap, tone: "text-emerald-500" };
              return (
                <div key={b.id} className="flex items-center gap-3 rounded-lg border border-slate-100 px-3 py-2">
                  <meta.Icon className={`h-4 w-4 shrink-0 ${meta.tone}`} />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm text-slate-700 truncate">{b.note}</p>
                    <p className="text-[11px] text-slate-400">{b.created_at ? new Date(b.created_at).toLocaleDateString() : ""}</p>
                  </div>
                  <p className="font-semibold text-emerald-600 shrink-0">+{fmt(b.amount)}</p>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* "So close" nudge */}
      {next && (
        <div className="rounded-2xl border-2 border-dashed border-primary-200 bg-primary-50/50 p-5 flex items-center gap-5" data-testid="next-reward">
          <Ring pct={next.progress_pct} />
          <div className="flex-1 min-w-0">
            <p className="text-xs text-primary-600 font-semibold uppercase tracking-wide">Closest reward</p>
            <p className="font-heading font-bold text-lg text-slate-900">{next.name}</p>
            <p className="text-sm text-slate-600">
              You are <b className="text-primary-700">{next.remaining_jobs} job{next.remaining_jobs !== 1 ? "s" : ""}</b> away from a
              <b className="text-emerald-600"> {fmt(next.bonus_amount)}</b> bonus. Keep going! 🚀
            </p>
          </div>
        </div>
      )}

      {/* Challenge grid */}
      <div>
        <h3 className="font-heading font-bold text-lg mb-3 flex items-center gap-2"><Target className="h-5 w-5 text-primary-600" /> Your Challenges</h3>
        {eligibleFirst.length === 0 && <Empty text="No active challenges right now. Check back soon!" />}
        <div className="grid sm:grid-cols-2 gap-4" data-testid="challenges-list">
          {eligibleFirst.map((c) => {
            const done = c.claim_status === "paid";
            const unlocked = c.eligible && !done;
            return (
              <div key={c.id} className={`rounded-2xl border overflow-hidden ${unlocked ? "border-emerald-300 shadow-lg shadow-emerald-100" : done ? "border-slate-200 opacity-80" : "border-slate-200"} bg-white`}>
                <div className={`p-4 ${unlocked ? "bg-gradient-to-br from-emerald-500 to-emerald-700" : done ? "bg-gradient-to-br from-slate-500 to-slate-700" : "bg-gradient-to-br from-primary-600 to-primary-800"} text-white`}>
                  <div className="flex justify-between items-start">
                    <div className="min-w-0">
                      <p className="font-heading font-bold text-base leading-tight">{c.name}</p>
                      <p className="text-white/80 text-xs mt-0.5 line-clamp-2">{c.description}</p>
                    </div>
                    <div className="text-right shrink-0 ml-2">
                      <p className="font-heading font-extrabold text-2xl">{fmt(c.bonus_amount)}</p>
                    </div>
                  </div>
                </div>
                <div className="p-4">
                  <div className="flex justify-between text-xs text-slate-500 mb-1.5">
                    <span>{c.jobs_done}{c.job_target > 0 ? ` / ${c.job_target}` : ""} jobs {c.rating_min > 0 && `· ${c.rating}★ / ${c.rating_min}★`}</span>
                    <span className="font-semibold">{c.progress_pct}%</span>
                  </div>
                  <Bar pct={c.progress_pct} className={unlocked ? "bg-emerald-500" : done ? "bg-slate-400" : "bg-primary-600"} />
                  <div className="mt-3 text-sm">
                    {done ? (
                      <span className="text-slate-500 font-medium flex items-center gap-1.5"><CheckCircle2 className="h-4 w-4 text-emerald-500" /> Bonus received — {fmt(c.bonus_amount)} 🎉</span>
                    ) : unlocked ? (
                      <span className="text-emerald-600 font-semibold flex items-center gap-1.5"><Trophy className="h-4 w-4" /> Unlocked! Bonus on its way to your wallet.</span>
                    ) : (
                      <span className="text-slate-500 flex items-center gap-1.5"><Lock className="h-3.5 w-3.5" /> {c.remaining_jobs} more job{c.remaining_jobs !== 1 ? "s" : ""} to unlock</span>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Penalties — transparent */}
      <div>
        <h3 className="font-heading font-bold text-lg mb-3 flex items-center gap-2"><AlertTriangle className="h-5 w-5 text-rose-500" /> Penalties
          {s.penalty_total > 0 && <Badge className="bg-rose-100 text-rose-700 border-0">-{fmt(s.penalty_total)}</Badge>}
        </h3>
        {(data.penalties || []).length === 0
          ? <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-5 text-center text-emerald-700 font-medium flex items-center justify-center gap-2"><Medal className="h-5 w-5" /> Spotless record — no penalties. Keep it up!</div>
          : (
            <div className="space-y-2" data-testid="penalties-list">
              {(data.penalties || []).map((p) => (
                <div key={p.id} className="bg-white rounded-xl border border-slate-200 p-4 flex justify-between items-center">
                  <div><p className="font-medium text-slate-800">{p.reason}</p>
                    <p className="text-xs text-slate-400 capitalize">{p.type} · {p.created_at ? new Date(p.created_at).toLocaleDateString() : ""} {p.status === "reversed" && "· reversed & refunded"}</p></div>
                  <p className={`font-semibold ${p.status === "reversed" ? "text-slate-400 line-through" : "text-rose-600"}`}>{p.type === "score" ? "—" : `-${fmt(p.amount)}`}</p>
                </div>
              ))}
            </div>
          )}
      </div>
    </div>
  );
}

export default ChallengesRewards;
