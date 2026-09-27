import React, { useState, useEffect } from 'react';
import { Send, Phone, MapPin, Package, Clock, CheckCircle2, User } from 'lucide-react';
import { quoteRequestsAdminService, type QuoteRequest } from '../services/quoteRequestsAdminService';

type FilterTab = 'all' | 'new' | 'reviewed';

export const QuoteRequestsPage: React.FC = () => {
  const [requests, setRequests] = useState<QuoteRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<FilterTab>('all');
  const [updatingId, setUpdatingId] = useState<number | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const status = filter === 'all' ? undefined : filter;
      const data = await quoteRequestsAdminService.list(status);
      setRequests(data);
    } catch (err) {
      console.error('Failed to load quote requests:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [filter]);

  const markReviewed = async (id: number) => {
    setUpdatingId(id);
    try {
      await quoteRequestsAdminService.setStatus(id, 'reviewed');
      await load();
    } catch (err) {
      console.error('Failed to update quote request status:', err);
    } finally {
      setUpdatingId(null);
    }
  };

  const filterTabs: { id: FilterTab; label: string }[] = [
    { id: 'all', label: 'الكل' },
    { id: 'new', label: 'جديدة' },
    { id: 'reviewed', label: 'تمت المراجعة' },
  ];

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-white dark:bg-slate-800 p-6 rounded-3xl border border-slate-200 dark:border-slate-700 shadow-sm">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white flex items-center gap-3">
            <div className="p-2.5 bg-indigo-600 text-white rounded-2xl shadow-lg shadow-indigo-500/20">
              <Send size={24} />
            </div>
            طلبات عرض السعر
          </h1>
          <p className="text-slate-500 dark:text-slate-400 mt-1 text-sm font-medium">
            طلبات عرض السعر الواردة من صفحة الشركة العامة
          </p>
        </div>
      </div>

      <div className="flex bg-white dark:bg-slate-800 p-1.5 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm w-fit">
        {filterTabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setFilter(tab.id)}
            className={`px-5 py-2 text-xs font-bold rounded-xl transition-all ${
              filter === tab.id
                ? 'bg-indigo-600 text-white shadow-md'
                : 'text-slate-500 hover:bg-slate-50 dark:hover:bg-slate-700'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex flex-col items-center justify-center py-20 gap-4">
          <div className="w-12 h-12 border-4 border-indigo-200 border-t-indigo-600 rounded-full animate-spin"></div>
          <p className="text-slate-400 font-bold">جاري تحميل الطلبات...</p>
        </div>
      ) : requests.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
          {requests.map((r) => (
            <div
              key={r.id}
              className="bg-white dark:bg-slate-800 rounded-3xl border border-slate-100 dark:border-slate-700 shadow-sm overflow-hidden flex flex-col"
            >
              <div className="p-6 flex-1 space-y-3">
                <div className="flex justify-between items-start">
                  <div className={`px-3 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-widest ${
                    r.status === 'new'
                      ? 'bg-amber-50 text-amber-600 dark:bg-amber-900/20 dark:text-amber-400'
                      : 'bg-green-50 text-green-600 dark:bg-green-900/20 dark:text-green-400'
                  }`}>
                    {r.status === 'new' ? 'جديد' : 'تمت المراجعة'}
                  </div>
                  <div className="text-[10px] font-bold text-slate-400 flex items-center gap-1">
                    <Clock size={12} />
                    {new Date(r.created_at).toLocaleDateString('ar-EG')}
                  </div>
                </div>

                <div className="flex items-center gap-2 text-sm font-bold text-slate-900 dark:text-white">
                  <User size={15} className="text-slate-400" />
                  {r.name}
                </div>
                <a href={`tel:${r.phone}`} className="flex items-center gap-2 text-sm text-indigo-600 dark:text-indigo-400 font-semibold hover:underline">
                  <Phone size={15} />
                  {r.phone}
                </a>
                <div className="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-300">
                  <MapPin size={14} className="text-slate-400 shrink-0" />
                  <span>
                    {r.origin_country}{r.origin_city ? ` (${r.origin_city})` : ''}
                    {' ← '}
                    {r.destination_country}{r.destination_city ? ` (${r.destination_city})` : ''}
                  </span>
                </div>
                <div className="flex items-start gap-2 text-xs text-slate-600 dark:text-slate-300">
                  <Package size={14} className="text-slate-400 shrink-0 mt-0.5" />
                  <span className="line-clamp-3">
                    {r.contents}
                    {r.weight_approx ? ` — تقريبًا ${r.weight_approx} ${r.weight_unit === 'lb' ? 'رطل' : 'كجم'}` : ''}
                  </span>
                </div>
                {r.extra_details && (
                  <p className="text-xs text-slate-500 dark:text-slate-400 border-t border-slate-100 dark:border-slate-700 pt-3 line-clamp-3">
                    {r.extra_details}
                  </p>
                )}
                {r.reviewed_by_name && (
                  <p className="text-[10px] text-slate-400 font-medium">راجعها: {r.reviewed_by_name}</p>
                )}
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
          ))}
        </div>
      ) : (
        <div className="bg-white dark:bg-slate-800 rounded-3xl border-2 border-dashed border-slate-200 dark:border-slate-700 p-20 flex flex-col items-center justify-center text-center">
          <div className="p-6 bg-slate-50 dark:bg-slate-900 rounded-full mb-4">
            <Send size={48} className="text-slate-300 dark:text-slate-600" />
          </div>
          <h3 className="text-xl font-bold text-slate-900 dark:text-white">لا توجد طلبات حاليًا</h3>
          <p className="text-slate-500 mt-2">ستظهر هنا طلبات عرض السعر الواردة من الصفحة العامة</p>
        </div>
      )}
    </div>
  );
};
