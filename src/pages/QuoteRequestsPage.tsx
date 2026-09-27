import React, { useState, useEffect } from 'react';
import { Send, Phone, MapPin, Package, Clock, CheckCircle2, User, FileText, ClipboardList, PhoneCall, Tag } from 'lucide-react';
import { quoteRequestsAdminService, type QuoteRequest } from '../services/quoteRequestsAdminService';
import type { ShipmentParty } from '../services/quoteRequestService';

type StatusFilter = 'all' | 'new' | 'reviewed';
type TypeFilter = 'all' | 'contact' | 'waybill';

function statusBadge(r: QuoteRequest) {
  if (r.status === 'reviewed') return { label: 'تمت المراجعة', cls: 'bg-green-50 text-green-600 dark:bg-green-900/20 dark:text-green-400' };
  // A waybill request is never auto-issued — until staff handle it, it's
  // explicitly "awaiting review", not "issued".
  if (r.request_type === 'waybill') return { label: 'بانتظار المراجعة', cls: 'bg-amber-50 text-amber-700 dark:bg-amber-900/20 dark:text-amber-400' };
  return { label: 'جديد', cls: 'bg-blue-50 text-blue-600 dark:bg-blue-900/20 dark:text-blue-400' };
}

function packagesSummary(r: QuoteRequest): string | null {
  if (r.packages && r.packages.length) {
    return r.packages
      .map((p) => `${p.weight_kg} kg${p.length_cm ? ` (${p.length_cm}×${p.width_cm}×${p.height_cm} cm)` : ''}`)
      .join(' + ');
  }
  // Rows saved by the older single-weight form.
  if (r.weight_approx) return `${r.weight_approx} ${r.weight_unit === 'lb' ? 'lb' : 'kg'}`;
  return null;
}

function PartyLine({ title, party }: { title: string; party: ShipmentParty }) {
  return (
    <div className="text-xs text-slate-600 dark:text-slate-300 bg-slate-50 dark:bg-slate-900/40 rounded-xl p-3">
      <div className="font-bold text-slate-800 dark:text-slate-100 mb-1">{title}</div>
      <div>{party.name} — <a href={`tel:${party.phone}`} className="text-indigo-600 dark:text-indigo-400"><bdi dir="ltr">{party.phone}</bdi></a></div>
      <div>{party.address_line}، {party.city}{party.postal_code ? <> — <bdi dir="ltr">{party.postal_code}</bdi></> : null}</div>
    </div>
  );
}

export const QuoteRequestsPage: React.FC = () => {
  const [requests, setRequests] = useState<QuoteRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('all');
  const [updatingId, setUpdatingId] = useState<number | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const data = await quoteRequestsAdminService.list(statusFilter === 'all' ? undefined : statusFilter);
      setRequests(data);
    } catch (err) {
      console.error('Failed to load requests:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [statusFilter]);

  const markReviewed = async (id: number) => {
    setUpdatingId(id);
    try {
      await quoteRequestsAdminService.setStatus(id, 'reviewed');
      await load();
    } catch (err) {
      console.error('Failed to update request status:', err);
    } finally {
      setUpdatingId(null);
    }
  };

  const visible = requests.filter((r) => typeFilter === 'all' || (r.request_type ?? 'contact') === typeFilter);

  const tabs = <T extends string>(items: { id: T; label: string }[], value: T, onChange: (v: T) => void) => (
    <div className="flex bg-white dark:bg-slate-800 p-1.5 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm w-fit">
      {items.map((tab) => (
        <button
          key={tab.id}
          onClick={() => onChange(tab.id)}
          className={`px-4 py-2 text-xs font-bold rounded-xl transition-all ${
            value === tab.id ? 'bg-indigo-600 text-white shadow-md' : 'text-slate-500 hover:bg-slate-50 dark:hover:bg-slate-700'
          }`}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-white dark:bg-slate-800 p-6 rounded-3xl border border-slate-200 dark:border-slate-700 shadow-sm">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white flex items-center gap-3">
            <div className="p-2.5 bg-indigo-600 text-white rounded-2xl shadow-lg shadow-indigo-500/20">
              <Send size={24} />
            </div>
            طلبات الشحن والتواصل
          </h1>
          <p className="text-slate-500 dark:text-slate-400 mt-1 text-sm font-medium">
            طلبات «تواصلوا معي» وطلبات إصدار البوليصة الواردة من صفحة الشركة العامة — لا تُصدر أي بوليصة تلقائيًا.
          </p>
        </div>
      </div>

      <div className="flex flex-wrap gap-3">
        {tabs<StatusFilter>(
          [
            { id: 'all', label: 'كل الحالات' },
            { id: 'new', label: 'جديدة / بانتظار المراجعة' },
            { id: 'reviewed', label: 'تمت المراجعة' },
          ],
          statusFilter,
          setStatusFilter
        )}
        {tabs<TypeFilter>(
          [
            { id: 'all', label: 'كل الأنواع' },
            { id: 'contact', label: 'طلبات تواصل' },
            { id: 'waybill', label: 'طلبات إصدار بوليصة' },
          ],
          typeFilter,
          setTypeFilter
        )}
      </div>

      {loading ? (
        <div className="flex flex-col items-center justify-center py-20 gap-4">
          <div className="w-12 h-12 border-4 border-indigo-200 border-t-indigo-600 rounded-full animate-spin"></div>
          <p className="text-slate-400 font-bold">جاري تحميل الطلبات...</p>
        </div>
      ) : visible.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
          {visible.map((r) => {
            const badge = statusBadge(r);
            const isWaybill = r.request_type === 'waybill';
            const pkg = packagesSummary(r);
            return (
              <div key={r.id} className="bg-white dark:bg-slate-800 rounded-3xl border border-slate-100 dark:border-slate-700 shadow-sm overflow-hidden flex flex-col">
                <div className="p-6 flex-1 space-y-3">
                  <div className="flex justify-between items-start gap-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={`px-3 py-1.5 rounded-xl text-[10px] font-black ${badge.cls}`}>{badge.label}</span>
                      <span className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl text-[10px] font-black bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300">
                        {isWaybill ? <ClipboardList size={11} /> : <PhoneCall size={11} />}
                        {isWaybill ? 'طلب إصدار بوليصة' : 'طلب تواصل'}
                      </span>
                    </div>
                    <div className="text-[10px] font-bold text-slate-400 flex items-center gap-1 shrink-0">
                      <Clock size={12} />
                      {new Date(r.created_at).toLocaleDateString('ar-EG')}
                    </div>
                  </div>

                  <div className="flex items-center gap-2 text-sm font-bold text-slate-900 dark:text-white">
                    <User size={15} className="text-slate-400" />
                    {r.name}
                  </div>
                  <a href={`tel:${r.phone}`} className="flex items-center gap-2 text-sm text-indigo-600 dark:text-indigo-400 font-semibold hover:underline" dir="ltr">
                    <Phone size={15} />
                    {r.phone}
                  </a>

                  {r.service_name && (
                    <div className="flex items-center gap-2 text-xs font-bold text-indigo-700 dark:text-indigo-300">
                      <Tag size={14} className="shrink-0" />
                      الخدمة: {r.service_name}
                    </div>
                  )}

                  {(r.origin_country || r.destination_country) && (
                    <div className="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-300">
                      <MapPin size={14} className="text-slate-400 shrink-0" />
                      <span>
                        {r.origin_country || '—'}{r.origin_city ? ` (${r.origin_city})` : ''}
                        {' ← '}
                        {r.destination_country || '—'}{r.destination_city ? ` (${r.destination_city})` : ''}
                      </span>
                    </div>
                  )}

                  {(r.shipment_type || pkg) && (
                    <div className="flex items-start gap-2 text-xs text-slate-600 dark:text-slate-300">
                      {r.shipment_type === 'document' ? <FileText size={14} className="text-slate-400 shrink-0 mt-0.5" /> : <Package size={14} className="text-slate-400 shrink-0 mt-0.5" />}
                      <span>
                        {r.shipment_type === 'document' ? 'مستندات' : r.shipment_type === 'package' ? `طرد × ${r.packages?.length ?? 1}` : ''}
                        {pkg ? <> — <bdi dir="ltr">{pkg}</bdi></> : null}
                      </span>
                    </div>
                  )}

                  {r.contents && <p className="text-xs text-slate-600 dark:text-slate-300 line-clamp-3">المحتويات: {r.contents}</p>}

                  {isWaybill && r.sender && <PartyLine title="المرسل" party={r.sender} />}
                  {isWaybill && r.receiver && <PartyLine title="المستلم" party={r.receiver} />}

                  {r.declared_value && (
                    <p className="text-xs text-slate-600 dark:text-slate-300" dir="rtl">
                      القيمة المصرّح بها: <bdi dir="ltr">{r.declared_value} {r.declared_currency}</bdi>
                    </p>
                  )}
                  {r.customs_info && <p className="text-xs text-slate-500 dark:text-slate-400">معلومات جمركية: {r.customs_info}</p>}
                  {r.extra_details && (
                    <p className="text-xs text-slate-500 dark:text-slate-400 border-t border-slate-100 dark:border-slate-700 pt-3 line-clamp-3">{r.extra_details}</p>
                  )}
                  {r.reviewed_by_name && <p className="text-[10px] text-slate-400 font-medium">راجعها: {r.reviewed_by_name}</p>}
                </div>

                {r.status === 'new' && (
                  <div className="px-6 py-4 bg-slate-50/50 dark:bg-slate-900/30 border-t border-slate-50 dark:border-slate-700">
                    <button
                      onClick={() => markReviewed(r.id)}
                      disabled={updatingId === r.id}
                      className="w-full flex items-center justify-center gap-2 text-xs font-bold text-green-600 dark:text-green-400 hover:bg-green-50 dark:hover:bg-green-900/20 py-2 rounded-xl transition-colors disabled:opacity-50"
                    >
                      <CheckCircle2 size={14} />
                      {updatingId === r.id ? 'جارِ التحديث...' : 'تمييز كمُراجَع'}
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      ) : (
        <div className="bg-white dark:bg-slate-800 rounded-3xl border-2 border-dashed border-slate-200 dark:border-slate-700 p-20 flex flex-col items-center justify-center text-center">
          <div className="p-6 bg-slate-50 dark:bg-slate-900 rounded-full mb-4">
            <Send size={48} className="text-slate-300 dark:text-slate-600" />
          </div>
          <h3 className="text-xl font-bold text-slate-900 dark:text-white">لا توجد طلبات حاليًا</h3>
          <p className="text-slate-500 mt-2">ستظهر هنا الطلبات الواردة من صفحة الشركة العامة</p>
        </div>
      )}
    </div>
  );
};
