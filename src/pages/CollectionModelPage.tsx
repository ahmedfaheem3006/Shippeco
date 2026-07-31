import { useEffect, useState, useCallback } from 'react';
import { useAppLayout } from '../components/AppLayout/useAppLayout';
import { collectionService, CollectionSummaryData, CollectionInvoiceItem } from '../services/collectionService';
import {
  ClipboardCheck, Search, Filter, ShieldCheck, Clock, AlertTriangle, Zap,
  MessageCircle, CheckCircle2, RefreshCw, Loader2, Sparkles, UserCheck
} from 'lucide-react';
import toast from 'react-hot-toast';

export function CollectionModelPage() {
  useAppLayout();

  const [summary, setSummary] = useState<CollectionSummaryData | null>(null);
  const [invoices, setInvoices] = useState<CollectionInvoiceItem[]>([]);
  const [totalInvoices, setTotalInvoices] = useState(0);
  const [loading, setLoading] = useState(true);
  const [updatingId, setUpdatingId] = useState<number | null>(null);
  const [selectedCategories, setSelectedCategories] = useState<Record<number, string>>({});

  // Filters
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('ALL');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [page, setPage] = useState(1);

  const fetchSummary = useCallback(async () => {
    try {
      const data = await collectionService.getSummary();
      setSummary(data);
    } catch (err) {
      console.error('Failed to load collection summary:', err);
    }
  }, []);

  const fetchInvoices = useCallback(async () => {
    setLoading(true);
    try {
      const res = await collectionService.getInvoices({
        page,
        limit: 20,
        search,
        category: categoryFilter,
        paymentStatus: statusFilter,
      });
      setInvoices(res.invoices);
      setTotalInvoices(res.total);

      // Initialize selectedCategories state
      const initialMap: Record<number, string> = {};
      res.invoices.forEach((inv) => {
        initialMap[inv.id] = inv.collection_category || '';
      });
      setSelectedCategories(initialMap);
    } catch (err) {
      console.error('Failed to load collection invoices:', err);
      toast.error('حدث خطأ أثناء تحميل الفواتير');
    } finally {
      setLoading(false);
    }
  }, [page, search, categoryFilter, statusFilter]);

  useEffect(() => {
    fetchSummary();
  }, [fetchSummary]);

  useEffect(() => {
    fetchInvoices();
  }, [fetchInvoices]);

  const handleCategorySelectChange = (invoiceId: number, category: string) => {
    setSelectedCategories((prev) => ({ ...prev, [invoiceId]: category }));
  };

  const handleSaveCategory = async (invoiceId: number) => {
    const newCategory = selectedCategories[invoiceId] || null;
    setUpdatingId(invoiceId);
    try {
      const res = await collectionService.updateCategory(invoiceId, newCategory);
      toast.success(`تم حفظ الفئة (${newCategory || 'بدون فئة'}) وحساب فئة العميل بنجاح`);
      
      // Update local invoice state
      setInvoices((prev) =>
        prev.map((inv) =>
          inv.id === invoiceId ? { ...inv, collection_category: newCategory as any } : inv
        )
      );

      // Refresh summary cards
      fetchSummary();
    } catch (err) {
      console.error('Failed to update invoice category:', err);
      toast.error('فشل في حفظ الفئة');
    } finally {
      setUpdatingId(null);
    }
  };

  const generateWhatsAppLink = (inv: CollectionInvoiceItem) => {
    const rawPhone = (inv.phone || '').replace(/[^\d]/g, '');
    let formattedPhone = rawPhone;
    if (formattedPhone.startsWith('05')) {
      formattedPhone = '966' + formattedPhone.slice(1);
    } else if (formattedPhone.startsWith('5')) {
      formattedPhone = '966' + formattedPhone;
    }

    const cat = inv.collection_category || selectedCategories[inv.id] || 'B';
    const remaining = Number(inv.remaining || inv.total || 0).toLocaleString();

    let message = '';
    if (cat === 'A') {
      message = `أهلاً بك عزيزنا العميد المميز ${inv.client_name || ''} 🌟\n\nنود أن نذكركم بلطف بأن الفاتورة رقم (${inv.invoice_number}) بمبلغ قدره [ ${remaining} ريال ] مستحقة. يسعدنا ويزيدنا شرفاً التعامل معكم دائماً في Shippeco. ✨`;
    } else if (cat === 'B') {
      message = `مرحباً ${inv.client_name || ''} 👋\n\nنود تذكيركم بضرورة سداد الفاتورة رقم (${inv.invoice_number}) بمبلغ [ ${remaining} ريال ] (مر 7 أيام على تاريخ صدورها).\nشاكرين ومقدرين حسن تعاونكم معنا في Shippeco.`;
    } else if (cat === 'C') {
      message = `تنبيه سداد ⚠️\nعزيزنا العميل ${inv.client_name || ''}،\nيرجى التكرم بالعمل على سداد الفاتورة المستحقة رقم (${inv.invoice_number}) بمبلغ [ ${remaining} ريال ] (مر 3 أيام على تاريخ صدورها).\nشاكرين سرعتكم في السداد.`;
    } else {
      // D
      message = `تنبيه عاجل جداً 🚨\nعزيزنا العميل ${inv.client_name || ''}،\nيرجى سداد الفاتورة المستحقة رقم (${inv.invoice_number}) بـقيمة [ ${remaining} ريال ] فوراً لمتابعة الشحنة.\nشكراً لتعاونكم مع Shippeco.`;
    }

    return `https://wa.me/${formattedPhone}?text=${encodeURIComponent(message)}`;
  };

  const triggerAutoCheck = async () => {
    try {
      const res = await collectionService.triggerNotificationsCheck();
      toast.success(`تم فحص الجدولة وتم إرسال ${res.triggeredCount || 0} إشعار سداد للموظفين`);
    } catch (err) {
      toast.error('فشل في إجراء فحص الإشعارات');
    }
  };

  return (
    <div className="p-4 md:p-8 max-w-7xl mx-auto space-y-8 dir-rtl">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white dark:bg-slate-900 p-6 rounded-2xl border border-gray-100 dark:border-slate-800 shadow-sm">
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 rounded-2xl bg-gradient-to-tr from-indigo-600 to-violet-600 text-white flex items-center justify-center shadow-lg shadow-indigo-500/20 shrink-0">
            <ClipboardCheck size={28} />
          </div>
          <div>
            <h1 className="text-2xl font-black text-gray-900 dark:text-white tracking-tight">
              نموذج التحصيل وتصنيف الفواتير
            </h1>
            <p className="text-sm text-gray-500 dark:text-slate-400 mt-1 font-medium">
              تصنيف الفواتير والعملاء إلى 4 فئات (A, B, C, D) وإدارة إشعارات ومتابعات السداد التلقائية عبر واتساب
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={triggerAutoCheck}
            className="flex items-center gap-2 px-4 py-2.5 bg-indigo-50 dark:bg-indigo-950/50 text-indigo-600 dark:text-indigo-400 border border-indigo-200 dark:border-indigo-800 rounded-xl text-sm font-bold hover:bg-indigo-100 transition-all cursor-pointer"
          >
            <Zap size={16} /> فحص الإشعارات الآن
          </button>
          <button
            onClick={() => { fetchSummary(); fetchInvoices(); }}
            className="p-2.5 bg-gray-100 dark:bg-slate-800 text-gray-600 dark:text-slate-300 rounded-xl hover:bg-gray-200 transition-colors"
            title="تحديث البيانات"
          >
            <RefreshCw size={18} />
          </button>
        </div>
      </div>

      {/* 4 Summary Cards (KPIs) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
        {/* Tier A */}
        <div className="relative overflow-hidden bg-gradient-to-br from-purple-900 via-indigo-950 to-slate-900 text-white p-6 rounded-2xl border border-purple-800/50 shadow-xl">
          <div className="absolute top-0 right-0 p-4 opacity-10">
            <Sparkles size={100} />
          </div>
          <div className="flex items-center justify-between">
            <span className="px-3 py-1 bg-purple-500/20 text-purple-300 border border-purple-500/30 rounded-full text-xs font-bold flex items-center gap-1">
              <UserCheck size={12} /> فئة A (VIP)
            </span>
            <span className="text-[11px] text-purple-200 bg-purple-900/60 px-2 py-0.5 rounded">لا إشعارات</span>
          </div>
          <div className="mt-4">
            <div className="text-3xl font-black">{summary?.clientsCount?.A ?? 0} <span className="text-sm font-normal text-purple-300">عميل</span></div>
            <div className="text-xs text-purple-300 mt-1 flex items-center justify-between">
              <span>الفواتير: {summary?.invoicesCount?.A ?? 0}</span>
              <span className="font-mono font-bold text-amber-300">{Number(summary?.unpaidTotal?.A ?? 0).toLocaleString()} ريال باقي</span>
            </div>
          </div>
          <div className="mt-4 pt-3 border-t border-purple-800/50 text-[11px] text-purple-300">
            عملاء متميزون - عدم إرسال تنبيهات تلقائية للسداد
          </div>
        </div>

        {/* Tier B */}
        <div className="relative overflow-hidden bg-gradient-to-br from-emerald-900 via-teal-950 to-slate-900 text-white p-6 rounded-2xl border border-emerald-800/50 shadow-xl">
          <div className="absolute top-0 right-0 p-4 opacity-10">
            <Clock size={100} />
          </div>
          <div className="flex items-center justify-between">
            <span className="px-3 py-1 bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 rounded-full text-xs font-bold flex items-center gap-1">
              <Clock size={12} /> فئة B
            </span>
            <span className="text-[11px] text-emerald-200 bg-emerald-900/60 px-2 py-0.5 rounded">بعد 7 أيام</span>
          </div>
          <div className="mt-4">
            <div className="text-3xl font-black">{summary?.clientsCount?.B ?? 0} <span className="text-sm font-normal text-emerald-300">عميل</span></div>
            <div className="text-xs text-emerald-300 mt-1 flex items-center justify-between">
              <span>الفواتير: {summary?.invoicesCount?.B ?? 0}</span>
              <span className="font-mono font-bold text-amber-300">{Number(summary?.unpaidTotal?.B ?? 0).toLocaleString()} ريال باقي</span>
            </div>
          </div>
          <div className="mt-4 pt-3 border-t border-emerald-800/50 text-[11px] text-emerald-300">
            إرسال إشعار للموظفين بعد 7 أيام من تاريخ صدور الفاتورة
          </div>
        </div>

        {/* Tier C */}
        <div className="relative overflow-hidden bg-gradient-to-br from-amber-950 via-orange-950 to-slate-900 text-white p-6 rounded-2xl border border-amber-800/50 shadow-xl">
          <div className="absolute top-0 right-0 p-4 opacity-10">
            <AlertTriangle size={100} />
          </div>
          <div className="flex items-center justify-between">
            <span className="px-3 py-1 bg-amber-500/20 text-amber-300 border border-amber-500/30 rounded-full text-xs font-bold flex items-center gap-1">
              <AlertTriangle size={12} /> فئة C
            </span>
            <span className="text-[11px] text-amber-200 bg-amber-900/60 px-2 py-0.5 rounded">بعد 3 أيام</span>
          </div>
          <div className="mt-4">
            <div className="text-3xl font-black">{summary?.clientsCount?.C ?? 0} <span className="text-sm font-normal text-amber-300">عميل</span></div>
            <div className="text-xs text-amber-300 mt-1 flex items-center justify-between">
              <span>الفواتير: {summary?.invoicesCount?.C ?? 0}</span>
              <span className="font-mono font-bold text-amber-300">{Number(summary?.unpaidTotal?.C ?? 0).toLocaleString()} ريال باقي</span>
            </div>
          </div>
          <div className="mt-4 pt-3 border-t border-amber-800/50 text-[11px] text-amber-300">
            إرسال إشعار للموظفين بعد 3 أيام من تاريخ صدور الفاتورة
          </div>
        </div>

        {/* Tier D */}
        <div className="relative overflow-hidden bg-gradient-to-br from-rose-950 via-red-950 to-slate-900 text-white p-6 rounded-2xl border border-rose-800/50 shadow-xl">
          <div className="absolute top-0 right-0 p-4 opacity-10">
            <Zap size={100} />
          </div>
          <div className="flex items-center justify-between">
            <span className="px-3 py-1 bg-rose-500/20 text-rose-300 border border-rose-500/30 rounded-full text-xs font-bold flex items-center gap-1">
              <Zap size={12} /> فئة D
            </span>
            <span className="text-[11px] text-rose-200 bg-rose-900/60 px-2 py-0.5 rounded">فوراً في الحال</span>
          </div>
          <div className="mt-4">
            <div className="text-3xl font-black">{summary?.clientsCount?.D ?? 0} <span className="text-sm font-normal text-rose-300">عميل</span></div>
            <div className="text-xs text-rose-300 mt-1 flex items-center justify-between">
              <span>الفواتير: {summary?.invoicesCount?.D ?? 0}</span>
              <span className="font-mono font-bold text-amber-300">{Number(summary?.unpaidTotal?.D ?? 0).toLocaleString()} ريال باقي</span>
            </div>
          </div>
          <div className="mt-4 pt-3 border-t border-rose-800/50 text-[11px] text-rose-300">
            إرسال إشعار للموظفين في الحال من تاريخ صدور الفاتورة
          </div>
        </div>
      </div>

      {/* Filter & Search Bar */}
      <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-gray-100 dark:border-slate-800 shadow-sm space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
          {/* Search Input */}
          <div className="relative sm:col-span-2">
            <Search className="absolute right-3.5 top-3 text-gray-400" size={18} />
            <input
              type="text"
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1); }}
              placeholder="ابحث برقم الفاتورة، اسم العميل، أو رقم الجوال..."
              className="w-full bg-gray-50 dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl pr-10 pl-4 py-2.5 text-sm font-bold text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>

          {/* Category Filter */}
          <div>
            <select
              value={categoryFilter}
              onChange={(e) => { setCategoryFilter(e.target.value); setPage(1); }}
              className="w-full bg-gray-50 dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl px-3 py-2.5 text-sm font-bold text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              <option value="ALL">جميع الفئات</option>
              <option value="A">فئة A (VIP)</option>
              <option value="B">فئة B (7 أيام)</option>
              <option value="C">فئة C (3 أيام)</option>
              <option value="D">فئة D (فوراً)</option>
            </select>
          </div>

          {/* Status Filter */}
          <div>
            <select
              value={statusFilter}
              onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
              className="w-full bg-gray-50 dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl px-3 py-2.5 text-sm font-bold text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              <option value="ALL">جميع الحالات</option>
              <option value="unpaid">غير مدفوعة (مستحقة)</option>
              <option value="partial">مدفوعة جزئياً</option>
              <option value="paid">مدفوعة بالكامل</option>
            </select>
          </div>
        </div>
      </div>

      {/* Invoices Table */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-gray-100 dark:border-slate-800 shadow-sm overflow-hidden">
        <div className="p-4 border-b border-gray-100 dark:border-slate-800 flex justify-between items-center">
          <h2 className="text-lg font-bold text-gray-900 dark:text-white flex items-center gap-2">
            <Filter size={18} className="text-indigo-600 dark:text-indigo-400" />
            سجل الفواتير وتخصيص الفئات ({totalInvoices})
          </h2>
          <span className="text-xs text-gray-500 dark:text-slate-400">
            اختر الفئة لكل فاتورة ثم اضغط موافق لتحديث فئة العميل وسجل الداتا بيز
          </span>
        </div>

        {loading ? (
          <div className="p-12 text-center text-gray-500 dark:text-slate-400 flex flex-col items-center justify-center gap-3">
            <Loader2 size={32} className="animate-spin text-indigo-600" />
            <span>جاري تحميل بيانات الفواتير والفئات...</span>
          </div>
        ) : invoices.length === 0 ? (
          <div className="p-12 text-center text-gray-500 dark:text-slate-400">
            لا توجد فواتير مطابقة للبحث أو التصفية الحالية
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-right border-collapse text-sm">
              <thead>
                <tr className="bg-gray-50 dark:bg-slate-800/60 text-gray-500 dark:text-slate-400 text-xs font-bold uppercase tracking-wider border-b border-gray-100 dark:border-slate-800">
                  <th className="py-3.5 px-4">رقم الفاتورة</th>
                  <th className="py-3.5 px-4">العميل ورقم الجوال</th>
                  <th className="py-3.5 px-4">تاريخ الصدور</th>
                  <th className="py-3.5 px-4">المبلغ المتبقي</th>
                  <th className="py-3.5 px-4">حالة السداد</th>
                  <th className="py-3.5 px-4">تحديد فئة الفاتورة (A / B / C / D)</th>
                  <th className="py-3.5 px-4 text-center">تنبيه واتساب</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-slate-800 font-medium">
                {invoices.map((inv) => {
                  const currentSelected = selectedCategories[inv.id] ?? inv.collection_category ?? '';
                  const isSaved = (inv.collection_category || '') === currentSelected;

                  return (
                    <tr key={inv.id} className="hover:bg-gray-50/80 dark:hover:bg-slate-800/40 transition-colors">
                      <td className="py-3.5 px-4 font-mono font-bold text-gray-900 dark:text-white">
                        {inv.invoice_number}
                      </td>
                      <td className="py-3.5 px-4">
                        <div className="font-bold text-gray-900 dark:text-white">{inv.client_name || 'عميل نقدي'}</div>
                        <div className="text-xs text-gray-400 font-mono" dir="ltr">{inv.phone || '—'}</div>
                      </td>
                      <td className="py-3.5 px-4 text-gray-600 dark:text-slate-300 font-mono">
                        {inv.invoice_date ? new Date(inv.invoice_date).toLocaleDateString('ar-SA') : '—'}
                      </td>
                      <td className="py-3.5 px-4 font-mono font-bold text-indigo-600 dark:text-indigo-400">
                        {Number(inv.remaining || inv.total || 0).toLocaleString()} ريال
                      </td>
                      <td className="py-3.5 px-4">
                        {inv.payment_status === 1 ? (
                          <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-bold bg-green-100 text-green-700 dark:bg-green-950/60 dark:text-green-400">
                            خالصة المسدد
                          </span>
                        ) : inv.payment_status === 2 ? (
                          <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-bold bg-amber-100 text-amber-700 dark:bg-amber-950/60 dark:text-amber-400">
                            جزئي
                          </span>
                        ) : (
                          <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-bold bg-red-100 text-red-700 dark:bg-red-950/60 dark:text-red-400">
                            غير مسددة
                          </span>
                        )}
                      </td>

                      {/* Category Selector + OK Button */}
                      <td className="py-3.5 px-4">
                        <div className="flex items-center gap-2">
                          <select
                            value={currentSelected}
                            onChange={(e) => handleCategorySelectChange(inv.id, e.target.value)}
                            className={`text-xs font-bold rounded-lg px-2.5 py-1.5 border transition-all ${
                              currentSelected === 'A'
                                ? 'bg-purple-50 text-purple-700 border-purple-300 dark:bg-purple-950/50 dark:text-purple-300'
                                : currentSelected === 'B'
                                ? 'bg-emerald-50 text-emerald-700 border-emerald-300 dark:bg-emerald-950/50 dark:text-emerald-300'
                                : currentSelected === 'C'
                                ? 'bg-amber-50 text-amber-700 border-amber-300 dark:bg-amber-950/50 dark:text-amber-300'
                                : currentSelected === 'D'
                                ? 'bg-rose-50 text-rose-700 border-rose-300 dark:bg-rose-950/50 dark:text-rose-300'
                                : 'bg-gray-50 text-gray-700 border-gray-200 dark:bg-slate-800 dark:text-slate-300'
                            }`}
                          >
                            <option value="">-- اختر الفئة --</option>
                            <option value="A">فئة A (VIP)</option>
                            <option value="B">فئة B (بعد 7 أيام)</option>
                            <option value="C">فئة C (بعد 3 أيام)</option>
                            <option value="D">فئة D (في الحال)</option>
                          </select>

                          <button
                            onClick={() => handleSaveCategory(inv.id)}
                            disabled={updatingId === inv.id || (isSaved && Boolean(currentSelected))}
                            className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1 transition-all ${
                              updatingId === inv.id
                                ? 'bg-gray-200 text-gray-400 cursor-not-allowed'
                                : isSaved && Boolean(currentSelected)
                                ? 'bg-gray-100 text-gray-400 dark:bg-slate-800 dark:text-slate-500'
                                : 'bg-indigo-600 text-white shadow hover:bg-indigo-700 cursor-pointer'
                            }`}
                          >
                            {updatingId === inv.id ? (
                              <Loader2 size={12} className="animate-spin" />
                            ) : (
                              <CheckCircle2 size={12} />
                            )}
                            حفظ OK
                          </button>
                        </div>
                      </td>

                      {/* WhatsApp Button */}
                      <td className="py-3.5 px-4 text-center">
                        <a
                          href={generateWhatsAppLink(inv)}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-xl shadow-md transition-all cursor-pointer"
                          title="إرسال تنبيه سداد بالواتساب بحسب فئة الفاتورة"
                        >
                          <MessageCircle size={14} /> تنبيه
                        </a>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
