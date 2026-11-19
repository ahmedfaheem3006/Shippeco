/** Shared pieces of the tracking list and the tracking details page. */
import React from 'react';
import { Clock, MapPin, PenLine } from 'lucide-react';
import type { TrackingDetails, TrackingEvent, TrackingItem } from '../../services/shipmentTracking.service';
import { JOURNEY_STEPS, formatLocal, journeyStage, needsAction, placeLabel, statusBadge, timeAgo } from './trackingUtils';

export const Field: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
  <div className="min-w-0">
    <div className="text-[10px] font-bold text-slate-400">{label}</div>
    <div className="text-sm font-bold text-slate-800 dark:text-slate-100 break-words">{children}</div>
  </div>
);

/** Milestones worth highlighting in the timeline (from the Backend's normalized status only). */
const MILESTONE: Partial<Record<NonNullable<TrackingEvent['normalized_status']>, string>> = {
  PRE_TRANSIT: 'تم استلام بيانات الشحنة', PICKED_UP: 'تم الاستلام من المرسل', CUSTOMS: 'في الجمارك',
  OUT_FOR_DELIVERY: 'خرجت للتسليم', DELIVERED: 'تم التسليم', EXCEPTION: 'استثناء', ON_HOLD: 'معلّقة',
};

export function EventRow({ e, first }: { e: TrackingEvent; first: boolean }) {
  const badge = statusBadge(e.normalized_status);
  const local = e.event_date && e.event_time ? formatLocal(`${e.event_date} ${e.event_time}`, e.gmt_offset) : null;
  const attention = e.normalized_status === 'EXCEPTION' || e.normalized_status === 'ON_HOLD';
  const milestone = e.normalized_status ? MILESTONE[e.normalized_status] : undefined;
  return (
    <li className="relative ps-8 pb-5 last:pb-0" data-event-code={e.raw_status ?? ''}>
      <span className="absolute start-[9px] top-3 bottom-0 w-px bg-slate-200 dark:bg-slate-700" aria-hidden="true" />
      <span className={`absolute start-0 top-1.5 w-[19px] h-[19px] rounded-full ring-4 ring-white dark:ring-slate-800 ${first || milestone ? badge.dot : 'bg-slate-300 dark:bg-slate-600'}`} aria-hidden="true" />
      <div className={`rounded-2xl border p-3 min-w-0 ${attention ? 'border-red-100 bg-red-50/50 dark:border-red-900/40 dark:bg-red-900/10' : first ? 'border-indigo-100 bg-indigo-50/30 dark:border-indigo-900/40 dark:bg-indigo-900/10' : 'border-slate-100 dark:border-slate-700'}`}>
        <div className="flex flex-wrap items-center gap-2 justify-between">
          <span className="text-sm font-extrabold text-slate-900 dark:text-white break-words" dir="ltr">{e.description || '—'}</span>
          <span className={`px-2 py-0.5 rounded-lg text-[10px] font-black border ${badge.cls}`}>
            {milestone ?? badge.label}{e.raw_status ? <span className="font-mono opacity-70"> · {e.raw_status}</span> : null}
          </span>
        </div>
        <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-slate-500 dark:text-slate-400">
          <span className="flex items-center gap-1"><MapPin size={12} /> <span dir="ltr">{e.location || placeLabel(null, e.city, e.country_code)}</span></span>
          {local && (
            <span className="flex items-center gap-1 tabular-nums">
              <Clock size={12} /> {local.date} · {local.time}{local.offset ? <span className="opacity-70" dir="ltr"> ({local.offset})</span> : null}
            </span>
          )}
          {e.signed_by && <span className="flex items-center gap-1"><PenLine size={12} /> المستلم: <span dir="ltr">{e.signed_by}</span></span>}
        </div>
        {(e.remark || e.next_steps) && (
          <div className="mt-2 space-y-1 text-[11px] leading-relaxed" dir="ltr">
            {e.remark && <p className="text-slate-700 dark:text-slate-200 font-semibold">{e.remark}</p>}
            {e.next_steps && <p className="text-slate-500 dark:text-slate-400">{e.next_steps}</p>}
          </div>
        )}
      </div>
    </li>
  );
}

export function Journey({ d }: { d: TrackingDetails }) {
  const stage = journeyStage(d);
  return (
    <div aria-label="مراحل رحلة الشحنة">
      <ol className="grid grid-cols-5 gap-1">
        {JOURNEY_STEPS.map((label, i) => {
          const done = d.last_synced_at || d.normalized_status ? i <= stage : false;
          const current = done && i === stage;
          return (
            <li key={label} className="flex flex-col items-center text-center min-w-0" aria-current={current ? 'step' : undefined}>
              <div className={`h-1.5 w-full rounded-full ${done ? (needsAction(d) && current ? 'bg-red-500' : 'bg-indigo-500') : 'bg-slate-200 dark:bg-slate-700'}`} />
              <span className={`mt-1.5 text-[10px] sm:text-[11px] font-bold leading-tight ${current ? 'text-indigo-700 dark:text-indigo-300' : done ? 'text-slate-700 dark:text-slate-200' : 'text-slate-400'}`}>{label}</span>
            </li>
          );
        })}
      </ol>
      <p className="mt-2 text-[10px] text-slate-400">المراحل محسوبة من نقاط تتبع DHL، وليست موقعًا مباشرًا (GPS).</p>
    </div>
  );
}

const FRESH: Record<string, { label: string; dot: string }> = {
  current: { label: 'محدّثة', dot: 'bg-green-500' },
  stale: { label: 'قديمة', dot: 'bg-amber-500' },
  pending: { label: 'لم تُزامن بعد', dot: 'bg-slate-400' },
  unknown: { label: 'غير معروفة', dot: 'bg-slate-300' },
};
export function Freshness({ t }: { t: Pick<TrackingItem, 'freshness' | 'last_synced_at'> }) {
  const f = FRESH[t.freshness ?? (t.last_synced_at ? 'current' : 'pending')] ?? FRESH.unknown;
  return (
    <span className="inline-flex items-center gap-1.5 text-[11px] text-slate-500 dark:text-slate-400 whitespace-nowrap" title={f.label}>
      <span className={`w-2 h-2 rounded-full ${f.dot}`} aria-hidden="true" />
      {t.last_synced_at ? timeAgo(t.last_synced_at) : f.label}
      <span className="sr-only">({f.label})</span>
    </span>
  );
}
