import { useEffect, useState, useCallback } from 'react';
import { useAppLayout } from '../components/AppLayout/useAppLayout';
import { expenseService, type ExpenseItem, type ExpenseSummaryData } from '../services/expenseService';
import {
  CreditCard, Plus, Search, Filter, Trash2, Edit3,
  Briefcase, Box, AlertTriangle, TrendingDown,
  X, Loader2, ChevronLeft, ChevronRight
} from 'lucide-react';
import toast from 'react-hot-toast';

export function ExpensesPage() {
  useAppLayout();

  const [summary, setSummary] = useState<ExpenseSummaryData | null>(null);
  const [expenses, setExpenses] = useState<ExpenseItem[]>([]);
  const [totalExpenses, setTotalExpenses] = useState(0);
  const [totalAmountSum, setTotalAmountSum] = useState(0);
  const [loading, setLoading] = useState(true);

  // Filters
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('ALL');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [page, setPage] = useState(1);

  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingExpense, setEditingExpense] = useState<ExpenseItem | null>(null);
  const [saving, setSaving] = useState(false);

  // Form Fields
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState<'salaries' | 'assets' | 'waste' | 'operational' | 'other'>('operational');
  const [amount, setAmount] = useState('');
  const [expenseDate, setExpenseDate] = useState(new Date().toISOString().slice(0, 10));
  const [paymentMethod, setPaymentMethod] = useState('cash');
  const [recipient, setRecipient] = useState('');
  const [notes, setNotes] = useState('');

  const fetchSummary = useCallback(async () => {
    try {
      const data = await expenseService.getSummary();
      setSummary(data);
    } catch (err) {
      console.error('Failed to load expense summary:', err);
    }
  }, []);

  const fetchExpenses = useCallback(async () => {
    setLoading(true);
    try {
      const res = await expenseService.getExpenses({
        page,
        limit: 25,
        category: categoryFilter,
        search,
        startDate,
        endDate,
      });
      setExpenses(res.expenses);
      setTotalExpenses(res.total);
      setTotalAmountSum(res.totalAmount);
    } catch (err) {
      console.error('Failed to load expenses:', err);
      toast.error('حدث خطأ أثناء تحميل المصروفات');
    } finally {
      setLoading(false);
    }
  }, [page, search, categoryFilter, startDate, endDate]);

  useEffect(() => {
    fetchSummary();
  }, [fetchSummary]);

  useEffect(() => {
    fetchExpenses();
  }, [fetchExpenses]);

  const openCreateModal = () => {
    setEditingExpense(null);
    setTitle('');
    setCategory('operational');
    setAmount('');
    setExpenseDate(new Date().toISOString().slice(0, 10));
    setPaymentMethod('cash');
    setRecipient('');
    setNotes('');
    setIsModalOpen(true);
  };

  const openEditModal = (item: ExpenseItem) => {
    setEditingExpense(item);
    setTitle(item.title || '');
    setCategory(item.category || 'operational');
    setAmount(item.amount ? item.amount.toString() : '');
    setExpenseDate(item.expense_date ? item.expense_date.slice(0, 10) : new Date().toISOString().slice(0, 10));
    setPaymentMethod(item.payment_method || 'cash');
    setRecipient(item.recipient || '');
    setNotes(item.notes || '');
    setIsModalOpen(true);
  };

  const handleSaveExpense = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !amount || Number(amount) <= 0) {
      toast.error('يرجى ملء جميع الحقول المطلوبة بمبلغ صحيح');
      return;
    }

    setSaving(true);
    try {
      const payload = {
        title: title.trim(),
        category,
        amount: Number(amount),
        expense_date: expenseDate,
        payment_method: paymentMethod,
        recipient: recipient.trim() || null,
        notes: notes.trim() || null,
        attachment_url: null,
      };

      if (editingExpense) {
        await expenseService.updateExpense(editingExpense.id, payload);
        toast.success('تم تحديث بيانات المصروف بنجاح');
      } else {
        await expenseService.createExpense(payload);
        toast.success('تم تسجيل المصروف الجديد بنجاح');
      }

      setIsModalOpen(false);
      fetchSummary();
      fetchExpenses();
    } catch (err) {
      console.error('Failed to save expense:', err);
      toast.error('حدث خطأ أثناء حفظ المصروف');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteExpense = async (id: number) => {
    if (!window.confirm('هل أنت تأكد من إرادة حذف هذا المصروف؟')) return;

    try {
      await expenseService.deleteExpense(id);
      toast.success('تم حذف المصروف بنجاح');
      fetchSummary();
      fetchExpenses();
    } catch (err) {
      console.error('Failed to delete expense:', err);
      toast.error('فشل في حذف المصروف');
    }
  };

  const getCategoryLabel = (cat: string) => {
    switch (cat) {
      case 'salaries':
        return { label: 'رواتب وأجور', color: 'bg-blue-100 text-blue-800 dark:bg-blue-950/60 dark:text-blue-300' };
      case 'assets':
        return { label: 'أشياء جمادية ومعدات', color: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300' };
      case 'waste':
        return { label: 'هوالك وتالف وخسائر', color: 'bg-rose-100 text-rose-800 dark:bg-rose-950/60 dark:text-rose-300' };
      case 'operational':
        return { label: 'تشغيلية وإدارية', color: 'bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300' };
      default:
        return { label: 'مصروفات أخرى', color: 'bg-gray-100 text-gray-800 dark:bg-slate-800 dark:text-slate-300' };
    }
  };

  return (
    <div className="p-4 md:p-8 max-w-7xl mx-auto space-y-8 dir-rtl">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white dark:bg-slate-900 p-6 rounded-2xl border border-gray-100 dark:border-slate-800 shadow-sm">
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 rounded-2xl bg-gradient-to-tr from-emerald-600 to-teal-600 text-white flex items-center justify-center shadow-lg shadow-emerald-500/20 shrink-0">
            <CreditCard size={28} />
          </div>
          <div>
            <h1 className="text-2xl font-black text-gray-900 dark:text-white tracking-tight">
              إدارة المصروفات والنفقات
            </h1>
            <p className="text-sm text-gray-500 dark:text-slate-400 mt-1 font-medium">
              تتبع وقيد مصروفات الشركة من الرواتب والأشياء الجمادية والأصول والهوالك والتالف بكل سرعة ودقة
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={openCreateModal}
            className="flex items-center gap-2 px-5 py-3 bg-gradient-to-r from-emerald-600 to-teal-600 text-white rounded-xl text-sm font-bold shadow-lg shadow-emerald-500/25 hover:from-emerald-700 hover:to-teal-700 transition-all cursor-pointer"
          >
            <Plus size={18} /> إضافة مصروف جديد
          </button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
        {/* Card 1: Month Total */}
        <div className="bg-white dark:bg-slate-900 p-6 rounded-2xl border border-gray-100 dark:border-slate-800 shadow-sm">
          <div className="flex items-center justify-between text-gray-400 mb-3">
            <span className="text-xs font-bold uppercase tracking-wider text-gray-500 dark:text-slate-400">إجمالي هذا الشهر</span>
            <div className="w-9 h-9 rounded-xl bg-emerald-50 text-emerald-600 dark:bg-emerald-950/60 dark:text-emerald-400 flex items-center justify-center">
              <TrendingDown size={20} />
            </div>
          </div>
          <div className="text-3xl font-black text-gray-900 dark:text-white">
            {Number(summary?.totalThisMonth || 0).toLocaleString()} <span className="text-sm font-bold text-gray-500">ريال</span>
          </div>
          <div className="text-xs text-gray-400 mt-2">إجمالي جميع نفقات الشهر الحالي</div>
        </div>

        {/* Card 2: Salaries */}
        <div className="bg-white dark:bg-slate-900 p-6 rounded-2xl border border-gray-100 dark:border-slate-800 shadow-sm">
          <div className="flex items-center justify-between text-gray-400 mb-3">
            <span className="text-xs font-bold uppercase tracking-wider text-gray-500 dark:text-slate-400">الرواتب والأجور</span>
            <div className="w-9 h-9 rounded-xl bg-blue-50 text-blue-600 dark:bg-blue-950/60 dark:text-blue-400 flex items-center justify-center">
              <Briefcase size={20} />
            </div>
          </div>
          <div className="text-3xl font-black text-gray-900 dark:text-white">
            {Number(summary?.categoryBreakdown?.salaries?.sum || 0).toLocaleString()} <span className="text-sm font-bold text-gray-500">ريال</span>
          </div>
          <div className="text-xs text-blue-600 dark:text-blue-400 mt-2 font-bold">
            {summary?.categoryBreakdown?.salaries?.count || 0} عمليات مسجلة
          </div>
        </div>

        {/* Card 3: Assets & Equipment */}
        <div className="bg-white dark:bg-slate-900 p-6 rounded-2xl border border-gray-100 dark:border-slate-800 shadow-sm">
          <div className="flex items-center justify-between text-gray-400 mb-3">
            <span className="text-xs font-bold uppercase tracking-wider text-gray-500 dark:text-slate-400">جماد ومعدات وأصول</span>
            <div className="w-9 h-9 rounded-xl bg-purple-50 text-purple-600 dark:bg-purple-950/60 dark:text-purple-400 flex items-center justify-center">
              <Box size={20} />
            </div>
          </div>
          <div className="text-3xl font-black text-gray-900 dark:text-white">
            {Number(summary?.categoryBreakdown?.assets?.sum || 0).toLocaleString()} <span className="text-sm font-bold text-gray-500">ريال</span>
          </div>
          <div className="text-xs text-purple-600 dark:text-purple-400 mt-2 font-bold">
            {summary?.categoryBreakdown?.assets?.count || 0} عمليات مسجلة
          </div>
        </div>

        {/* Card 4: Waste & Damage */}
        <div className="bg-white dark:bg-slate-900 p-6 rounded-2xl border border-gray-100 dark:border-slate-800 shadow-sm">
          <div className="flex items-center justify-between text-gray-400 mb-3">
            <span className="text-xs font-bold uppercase tracking-wider text-gray-500 dark:text-slate-400">الهوالك والتالف</span>
            <div className="w-9 h-9 rounded-xl bg-rose-50 text-rose-600 dark:bg-rose-950/60 dark:text-rose-400 flex items-center justify-center">
              <AlertTriangle size={20} />
            </div>
          </div>
          <div className="text-3xl font-black text-rose-600 dark:text-rose-400">
            {Number(summary?.categoryBreakdown?.waste?.sum || 0).toLocaleString()} <span className="text-sm font-bold text-gray-500">ريال</span>
          </div>
          <div className="text-xs text-rose-500 mt-2 font-bold">
            {summary?.categoryBreakdown?.waste?.count || 0} حالات تلف/هالك
          </div>
        </div>
      </div>

      {/* Filter & Search Bar */}
      <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-gray-100 dark:border-slate-800 shadow-sm space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-5 gap-4">
          {/* Search Input */}
          <div className="relative md:col-span-2">
            <Search className="absolute right-3.5 top-3 text-gray-400" size={18} />
            <input
              type="text"
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1); }}
              placeholder="ابحث باسم المصروف، المستلم، أو البيان..."
              className="w-full bg-gray-50 dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl pr-10 pl-4 py-2.5 text-sm font-bold text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
            />
          </div>

          {/* Category Filter */}
          <div>
            <select
              value={categoryFilter}
              onChange={(e) => { setCategoryFilter(e.target.value); setPage(1); }}
              className="w-full bg-gray-50 dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl px-3 py-2.5 text-sm font-bold text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
            >
              <option value="ALL">جميع التصنيفات</option>
              <option value="salaries">الرواتب والأجور</option>
              <option value="assets">أشياء جمادية ومعدات</option>
              <option value="waste">هوالك وتالف وخسائر</option>
              <option value="operational">تشغيلية وإدارية</option>
              <option value="other">أخرى</option>
            </select>
          </div>

          {/* Start Date */}
          <div>
            <input
              type="date"
              value={startDate}
              onChange={(e) => { setStartDate(e.target.value); setPage(1); }}
              className="w-full bg-gray-50 dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl px-3 py-2.5 text-sm font-bold text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
            />
          </div>

          {/* End Date */}
          <div>
            <input
              type="date"
              value={endDate}
              onChange={(e) => { setEndDate(e.target.value); setPage(1); }}
              className="w-full bg-gray-50 dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl px-3 py-2.5 text-sm font-bold text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
            />
          </div>
        </div>
      </div>

      {/* Expenses Table */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-gray-100 dark:border-slate-800 shadow-sm overflow-hidden">
        <div className="p-4 border-b border-gray-100 dark:border-slate-800 flex justify-between items-center">
          <h2 className="text-lg font-bold text-gray-900 dark:text-white flex items-center gap-2">
            <Filter size={18} className="text-emerald-600 dark:text-emerald-400" />
            سجل المصروفات ({totalExpenses})
          </h2>
          <div className="text-sm font-bold text-emerald-600 dark:text-emerald-400">
            مجموع المعروض: {Number(totalAmountSum).toLocaleString()} ريال
          </div>
        </div>

        {loading ? (
          <div className="p-12 text-center text-gray-500 dark:text-slate-400 flex flex-col items-center justify-center gap-3">
            <Loader2 size={32} className="animate-spin text-emerald-600" />
            <span>جاري تحميل بيانات المصروفات...</span>
          </div>
        ) : expenses.length === 0 ? (
          <div className="p-12 text-center text-gray-500 dark:text-slate-400">
            لا توجد مصروفات مسجلة تطابق التصفية الحالية
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-right border-collapse text-sm">
              <thead>
                <tr className="bg-gray-50 dark:bg-slate-800/60 text-gray-500 dark:text-slate-400 text-xs font-bold uppercase tracking-wider border-b border-gray-100 dark:border-slate-800">
                  <th className="py-3.5 px-4">تاريخ المصروف</th>
                  <th className="py-3.5 px-4">بيان المصروف</th>
                  <th className="py-3.5 px-4">التصنيف</th>
                  <th className="py-3.5 px-4">المبلغ</th>
                  <th className="py-3.5 px-4">المستلم / الموظف</th>
                  <th className="py-3.5 px-4">طريقة الدفع</th>
                  <th className="py-3.5 px-4 text-center">الإجراءات</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-slate-800 font-medium">
                {expenses.map((exp) => {
                  const catBadge = getCategoryLabel(exp.category);

                  return (
                    <tr key={exp.id} className="hover:bg-gray-50/80 dark:hover:bg-slate-800/40 transition-colors">
                      <td className="py-3.5 px-4 text-gray-600 dark:text-slate-300 font-mono text-xs">
                        {exp.expense_date ? new Date(exp.expense_date).toLocaleDateString('ar-SA') : '—'}
                      </td>
                      <td className="py-3.5 px-4">
                        <div className="font-bold text-gray-900 dark:text-white">{exp.title}</div>
                        {exp.notes && <div className="text-xs text-gray-400 mt-0.5">{exp.notes}</div>}
                      </td>
                      <td className="py-3.5 px-4">
                        <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-bold ${catBadge.color}`}>
                          {catBadge.label}
                        </span>
                      </td>
                      <td className="py-3.5 px-4 font-mono font-bold text-emerald-600 dark:text-emerald-400 text-base">
                        {Number(exp.amount).toLocaleString()} ريال
                      </td>
                      <td className="py-3.5 px-4 text-gray-700 dark:text-slate-300">
                        {exp.recipient || '—'}
                      </td>
                      <td className="py-3.5 px-4 text-xs font-bold text-gray-500 dark:text-slate-400">
                        {exp.payment_method === 'cash' ? 'نقدي (كاش)' : exp.payment_method === 'bank_transfer' ? 'تحويل بنكي' : 'بطاقة / شبكة'}
                      </td>
                      <td className="py-3.5 px-4 text-center">
                        <div className="flex items-center justify-center gap-2">
                          <button
                            onClick={() => openEditModal(exp)}
                            className="p-1.5 text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-950/50 rounded-lg transition-colors"
                            title="تعديل المصروف"
                          >
                            <Edit3 size={16} />
                          </button>
                          <button
                            onClick={() => handleDeleteExpense(exp.id)}
                            className="p-1.5 text-red-600 hover:bg-red-50 dark:hover:bg-red-950/50 rounded-lg transition-colors"
                            title="حذف المصروف"
                          >
                            <Trash2 size={16} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination Bar */}
        {totalExpenses > 0 && (
          <div className="p-4 border-t border-gray-100 dark:border-slate-800 flex flex-col sm:flex-row items-center justify-between gap-4 bg-gray-50/50 dark:bg-slate-800/30">
            <div className="text-xs font-bold text-gray-500 dark:text-slate-400">
              عرض الصفحة <span className="text-gray-900 dark:text-white font-mono">{page}</span> من{' '}
              <span className="text-gray-900 dark:text-white font-mono">{Math.max(1, Math.ceil(totalExpenses / 25))}</span> (إجمالي {totalExpenses} مصروف)
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1}
                className="px-3 py-1.5 rounded-lg text-xs font-bold border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-gray-700 dark:text-slate-200 disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-100 dark:hover:bg-slate-700 transition-colors flex items-center gap-1 cursor-pointer"
              >
                <ChevronRight size={14} /> السابق
              </button>

              {/* Page Numbers */}
              <div className="flex items-center gap-1">
                {Array.from({ length: Math.min(5, Math.ceil(totalExpenses / 25)) }, (_, i) => {
                  const totalPages = Math.ceil(totalExpenses / 25);
                  let pNum = page;
                  if (totalPages <= 5) {
                    pNum = i + 1;
                  } else if (page <= 3) {
                    pNum = i + 1;
                  } else if (page >= totalPages - 2) {
                    pNum = totalPages - 4 + i;
                  } else {
                    pNum = page - 2 + i;
                  }

                  return (
                    <button
                      key={pNum}
                      onClick={() => setPage(pNum)}
                      className={`w-8 h-8 rounded-lg text-xs font-bold flex items-center justify-center transition-colors cursor-pointer ${
                        page === pNum
                          ? 'bg-emerald-600 text-white shadow-md'
                          : 'bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 text-gray-700 dark:text-slate-200 hover:bg-gray-100 dark:hover:bg-slate-700'
                      }`}
                    >
                      {pNum}
                    </button>
                  );
                })}
              </div>

              <button
                onClick={() => setPage((p) => Math.min(Math.ceil(totalExpenses / 25), p + 1))}
                disabled={page >= Math.ceil(totalExpenses / 25)}
                className="px-3 py-1.5 rounded-lg text-xs font-bold border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-gray-700 dark:text-slate-200 disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-100 dark:hover:bg-slate-700 transition-colors flex items-center gap-1 cursor-pointer"
              >
                التالي <ChevronLeft size={14} />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Add / Edit Expense Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-800 rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden animate-in zoom-in-95 duration-150">
            <div className="p-6 border-b border-gray-100 dark:border-slate-800 flex items-center justify-between bg-gray-50/50 dark:bg-slate-800/50">
              <h3 className="text-lg font-bold text-gray-900 dark:text-white flex items-center gap-2">
                <CreditCard size={20} className="text-emerald-600" />
                {editingExpense ? 'تعديل بيانات المصروف' : 'قيد مصروف جديد'}
              </h3>
              <button
                onClick={() => setIsModalOpen(false)}
                className="text-gray-400 hover:text-gray-600 dark:hover:text-slate-200 p-1 rounded-lg"
              >
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleSaveExpense} className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-bold text-gray-700 dark:text-slate-300 mb-1.5">
                  عنوان المصروف / البيان *
                </label>
                <input
                  type="text"
                  required
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="مثال: راتب موظف، شراء كراتين شحن، إصلاح طابعة..."
                  className="w-full bg-gray-50 dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl px-3 py-2.5 text-sm font-bold text-gray-900 dark:text-white focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-gray-700 dark:text-slate-300 mb-1.5">
                    التصنيف *
                  </label>
                  <select
                    value={category}
                    onChange={(e) => setCategory(e.target.value as any)}
                    className="w-full bg-gray-50 dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl px-3 py-2.5 text-sm font-bold text-gray-900 dark:text-white focus:ring-2 focus:ring-emerald-500"
                  >
                    <option value="operational">تشغيلية وإدارية</option>
                    <option value="salaries">رواتب وأجور</option>
                    <option value="assets">أشياء جمادية ومعدات</option>
                    <option value="waste">هوالك وتالف وخسائر</option>
                    <option value="other">أخرى</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-gray-700 dark:text-slate-300 mb-1.5">
                    المبلغ (بالريال) *
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    required
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    placeholder="0.00"
                    className="w-full bg-gray-50 dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl px-3 py-2.5 text-sm font-bold text-gray-900 dark:text-white focus:ring-2 focus:ring-emerald-500 font-mono"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-gray-700 dark:text-slate-300 mb-1.5">
                    تاريخ المصروف
                  </label>
                  <input
                    type="date"
                    value={expenseDate}
                    onChange={(e) => setExpenseDate(e.target.value)}
                    className="w-full bg-gray-50 dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl px-3 py-2.5 text-sm font-bold text-gray-900 dark:text-white focus:ring-2 focus:ring-emerald-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-gray-700 dark:text-slate-300 mb-1.5">
                    طريقة الدفع
                  </label>
                  <select
                    value={paymentMethod}
                    onChange={(e) => setPaymentMethod(e.target.value)}
                    className="w-full bg-gray-50 dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl px-3 py-2.5 text-sm font-bold text-gray-900 dark:text-white focus:ring-2 focus:ring-emerald-500"
                  >
                    <option value="cash">نقدي (كاش)</option>
                    <option value="bank_transfer">تحويل بنكي</option>
                    <option value="card">بطاقة / شبكة</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-700 dark:text-slate-300 mb-1.5">
                  المستلم / الموظف (اختياري)
                </label>
                <input
                  type="text"
                  value={recipient}
                  onChange={(e) => setRecipient(e.target.value)}
                  placeholder="اسم الشخص المستلم أو الموظف"
                  className="w-full bg-gray-50 dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl px-3 py-2.5 text-sm font-bold text-gray-900 dark:text-white focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-700 dark:text-slate-300 mb-1.5">
                  ملاحظات إضافية (اختياري)
                </label>
                <textarea
                  rows={2}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="أي تفاصيل أو ملاحظات إضافية..."
                  className="w-full bg-gray-50 dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl px-3 py-2.5 text-sm font-bold text-gray-900 dark:text-white focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              <div className="pt-4 flex items-center justify-end gap-3 border-t border-gray-100 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2.5 text-sm font-bold text-gray-600 dark:text-slate-400 hover:bg-gray-100 dark:hover:bg-slate-800 rounded-xl transition-colors"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-6 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-sm font-bold shadow-lg shadow-emerald-500/25 flex items-center gap-2 transition-all cursor-pointer"
                >
                  {saving && <Loader2 size={16} className="animate-spin" />}
                  حفظ المصروف
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
