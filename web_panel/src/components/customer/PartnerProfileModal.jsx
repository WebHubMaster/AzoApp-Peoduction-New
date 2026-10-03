import React, { useEffect, useState } from "react";
import { X, Star, ShieldCheck, Briefcase, MapPin, Loader2, Crown, Quote } from "lucide-react";
import api from "@/lib/api";

function Avatar({ photo, name, size = "h-16 w-16" }) {
  const initial = (name || "P").trim().charAt(0).toUpperCase();
  if (photo) {
    return <img src={photo} alt={name} className={`${size} rounded-2xl object-cover`} data-testid="partner-profile-photo" />;
  }
  return (
    <div className={`${size} rounded-2xl grid place-items-center bg-primary-600 text-white font-black text-2xl`} data-testid="partner-profile-photo">
      {initial}
    </div>
  );
}

function Stars({ value = 0 }) {
  return (
    <span className="inline-flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map((i) => (
        <Star key={i} className={`h-3.5 w-3.5 ${i <= Math.round(value) ? "fill-amber-400 text-amber-400" : "text-slate-300"}`} />
      ))}
    </span>
  );
}

/**
 * Non-confidential partner profile shown to the customer when they tap the assigned
 * professional. Pulls /bookings/{id}/partner-card — photo, name, rating, experience,
 * verified badge and recent reviews. No phone, address, bank or other private data.
 */
export default function PartnerProfileModal({ bookingId, onClose }) {
  const [data, setData] = useState(null);
  const [err, setErr] = useState("");

  useEffect(() => {
    let alive = true;
    api.get(`/bookings/${bookingId}/partner-card`)
      .then((r) => { if (alive) setData(r.data); })
      .catch(() => { if (alive) setErr("Could not load profile"); });
    return () => { alive = false; };
  }, [bookingId]);

  return (
    <div className="fixed inset-0 z-[70] flex items-end sm:items-center justify-center bg-black/50 p-0 sm:p-4" onClick={onClose} data-testid="partner-profile-modal">
      <div className="w-full sm:max-w-md bg-white dark:bg-slate-900 rounded-t-3xl sm:rounded-3xl shadow-2xl max-h-[88vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="sticky top-0 bg-white dark:bg-slate-900 flex items-center justify-between px-5 py-3.5 border-b border-slate-100 dark:border-slate-800">
          <h3 className="font-heading font-extrabold text-slate-900 dark:text-white">Your Professional</h3>
          <button onClick={onClose} data-testid="partner-profile-close" className="h-8 w-8 grid place-items-center rounded-full hover:bg-slate-100 dark:hover:bg-slate-800">
            <X className="h-5 w-5 text-slate-500" />
          </button>
        </div>

        {!data && !err && (
          <div className="py-16 grid place-items-center text-slate-400"><Loader2 className="h-6 w-6 animate-spin" /></div>
        )}
        {err && <div className="py-16 text-center text-slate-400">{err}</div>}

        {data && (
          <div className="p-5">
            <div className="flex items-center gap-4">
              <Avatar photo={data.photo} name={data.name} />
              <div className="min-w-0">
                <p className="font-heading font-black text-lg text-slate-900 dark:text-white flex items-center gap-1.5 truncate">
                  {data.name}
                  {data.verified && <ShieldCheck className="h-4 w-4 text-emerald-500 shrink-0" />}
                  {data.premium && <Crown className="h-4 w-4 text-amber-500 shrink-0" />}
                </p>
                <div className="flex items-center gap-2 mt-0.5">
                  <Stars value={data.rating} />
                  <span className="text-sm font-bold text-slate-700 dark:text-slate-200">{data.rating || "New"}</span>
                  <span className="text-xs text-slate-400">({data.reviews_count} reviews)</span>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-2 mt-4">
              <div className="rounded-xl bg-slate-50 dark:bg-slate-800 p-3 text-center" data-testid="partner-stat-jobs">
                <Briefcase className="h-4 w-4 mx-auto text-primary-600" />
                <p className="text-base font-black text-slate-900 dark:text-white mt-1">{data.jobs_completed}</p>
                <p className="text-[10px] uppercase tracking-wider text-slate-400 font-bold">Jobs</p>
              </div>
              <div className="rounded-xl bg-slate-50 dark:bg-slate-800 p-3 text-center">
                <Star className="h-4 w-4 mx-auto text-amber-500" />
                <p className="text-base font-black text-slate-900 dark:text-white mt-1">{data.rating || "–"}</p>
                <p className="text-[10px] uppercase tracking-wider text-slate-400 font-bold">Rating</p>
              </div>
              <div className="rounded-xl bg-slate-50 dark:bg-slate-800 p-3 text-center">
                <ShieldCheck className="h-4 w-4 mx-auto text-emerald-500" />
                <p className="text-base font-black text-slate-900 dark:text-white mt-1">{data.verified ? "Yes" : "–"}</p>
                <p className="text-[10px] uppercase tracking-wider text-slate-400 font-bold">Verified</p>
              </div>
            </div>

            {(data.skills || []).length > 0 && (
              <div className="mt-4">
                <p className="text-[11px] uppercase tracking-wider font-bold text-slate-400 mb-1.5">Skills</p>
                <div className="flex flex-wrap gap-1.5">
                  {data.skills.slice(0, 10).map((s, i) => (
                    <span key={i} className="text-xs font-semibold px-2.5 py-1 rounded-full bg-primary-50 text-primary-700 dark:bg-primary-900/30 dark:text-primary-300 capitalize">{s}</span>
                  ))}
                </div>
              </div>
            )}

            {data.member_since && (
              <p className="text-xs text-slate-400 mt-3 flex items-center gap-1.5"><MapPin className="h-3.5 w-3.5" />
                {data.city ? `${data.city} · ` : ""}With us since {data.member_since}</p>
            )}

            <div className="mt-5">
              <p className="text-[11px] uppercase tracking-wider font-bold text-slate-400 mb-2">Recent Reviews</p>
              {(data.reviews || []).length === 0 ? (
                <p className="text-sm text-slate-400">No reviews yet.</p>
              ) : (
                <div className="space-y-2.5" data-testid="partner-reviews">
                  {data.reviews.slice(0, 20).map((rv, i) => (
                    <div key={i} className="rounded-xl border border-slate-100 dark:border-slate-800 p-3">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-bold text-slate-800 dark:text-slate-100">{rv.customer_name}</span>
                        <Stars value={rv.rating} />
                      </div>
                      {rv.comment && (
                        <p className="text-sm text-slate-600 dark:text-slate-300 mt-1 flex gap-1.5">
                          <Quote className="h-3.5 w-3.5 text-slate-300 shrink-0 mt-0.5" />{rv.comment}
                        </p>
                      )}
                      {rv.service_name && <p className="text-[11px] text-slate-400 mt-1">{rv.service_name}</p>}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
