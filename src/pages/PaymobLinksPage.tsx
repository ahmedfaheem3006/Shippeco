import { useState, useEffect, useCallback, useRef } from 'react';
import { createPaymentLink, checkPayment, pingPaymobWorker, paymobBackend } from '../services/paymobService';
import type { Invoice, PaymobLink, PaymobStats } from '../utils/models';
import { openWhatsApp } from '../utils/whatsapp';
import { buildPaymobWaMessage, safeAmountNumber } from '../utils/paymobLinks';
import { api } from '../utils/apiClient';
import {
  CreditCard, Link, Send, Copy, Search, RefreshCw,
  Trash2, X, Smartphone, User, FileText, CheckCircle2,
  AlertCircle, Check, CircleDollarSign, ExternalLink,
  Clock, Loader2, Eye,
} from 'lucide-react';

/* ═══ Helpers ═══ */
async function copyText(value: string) {
  if (!value) return false;
  let success = false;

  // Try direct fallback first on mobile
  if (window.innerWidth < 768) {
    try {
      const el = document.createElement('textarea');
      el.value = value; el.style.position = 'fixed'; el.style.left = '-9999px';
      document.body.appendChild(el); el.focus(); el.select(); 
      success = document.execCommand('copy');
      document.body.removeChild(el);
    } catch { success = false; }
  }

  if (!success) {
    try { 
      await navigator.clipboard.writeText(value); 
      success = true; 
    } catch {
      try {
        const el = document.createElement('textarea');
        el.value = value; el.style.position = 'fixed'; el.style.left = '-9999px';
        document.body.appendChild(el); el.select(); 
        success = document.execCommand('copy');
        document.body.removeChild(el);
      } catch { success = false; }
    }
  }
  return success;
}

function formatDate(d: string | null | undefined) {
  if (!d) return '—';
  try {
    return new Date(d).toLocaleString('ar-SA', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
  } catch { return d; }
}

function StatusPill({ status }: { status: string }) {
  const config: Record<string, { label: string; color: string }> = {
    paid:    { label: 'مدفوع',  color: 'text-green-600 bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800/30' },
    pending: { label: 'معلّق',   color: 'text-amber-600 bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800/30' },
    expired: { label: 'منتهي',  color: 'text-red-600 bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800/30' },
  };
  const c = config[status] || config.pending;
  return <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md border text-[10px] font-bold ${c.color}`}>{c.label}</span>;
}

/* ═══ Server-side invoice search ═══ */
async function searchInvoicesServer(query: string): Promise<Invoice[]> {
  if (!query || query.trim().length < 2) return [];
  try {
    const q = encodeURIComponent(query.trim());
    const result = await api.get<any>(`/invoices/light?search=${q}&limit=20`);
    const d = result?.data || result;
    const rows = d?.invoices || d?.rows || (Array.isArray(d) ? d : []);
    return rows.map((r: any) => ({
      id: r.id || r.invoice_number,
      invoice_number: r.invoice_number,
      client: r.client_name || r.client || '',
      phone: r.phone || '',
      price: Number(r.total || r.price || 0),
      total: Number(r.total || 0),
      remaining: Number(r.remaining || r.total || 0),
      paid_amount: Number(r.paid_amount || 0),
      status: r.status || 'unpaid',
      date: r.invoice_date || r.date || '',
      details: r.details || '',
      awb: r.awb || '',
    }));
  } catch (e) {
    console.warn('[Paymob] Invoice search failed:', e);
    return [];
  }
}

/* ═══ Local history (fallback when DB not ready) ═══ */
function loadLocalHistory(): PaymobLink[] {
  try {
    const raw = localStorage.getItem('paymob_links_history');
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

function saveLocalHistory(items: PaymobLink[]) {
  try {
    localStorage.setItem('paymob_links_history', JSON.stringify(items.slice(0, 50)));
  } catch {}
}

/* ═══════════════════════════════════════
   MAIN PAGE
   ═══════════════════════════════════════ */
export function PaymobLinksPage() {
  // Worker status
  const [workerStatus, setWorkerStatus] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Links (DB + local fallback)
  const [links, setLinks] = useState<PaymobLink[]>([]);
  const [linksTotal, setLinksTotal] = useState(0);
  const [linksLoading, setLinksLoading] = useState(false);
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [_stats, setStats] = useState<PaymobStats | null>(null);
  const [useLocalHistory, setUseLocalHistory] = useState(false);

  // Invoice search (server-side)
  const [invoiceQuery, setInvoiceQuery] = useState('');
  const [searchResults, setSearchResults] = useState<Invoice[]>([]);
  const [searching, setSearching] = useState(false);
  const [selectedInvoices, setSelectedInvoices] = useState<Invoice[]>([]);
  const [showDropdown, setShowDropdown] = useState(false);
  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Form
  const [clientName, setClientName] = useState('');
  const [clientPhone, setClientPhone] = useState('');
  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('خدمة شحن');
  const [integrationType, setIntegrationType] = useState<string>('PL');

  // Result
  const [result, setResult] = useState<{ url: string; orderId?: string | number } | null>(null);
  const [copiedUrl, setCopiedUrl] = useState<string | null>(null);
  const [checkingPayment, setCheckingPayment] = useState<string | null>(null);

  const loadLinks = useCallback(async (status?: string) => {
    setLinksLoading(true);
    try {
      // Try DB first
      const result = await paymobBackend.getLinks({ limit: 50, status: status || filterStatus });
      const dbLinks = result.links || [];
      const localLinks = loadLocalHistory();
      
      // Merge: DB links + local links (remove duplicates by payment_url)
      const allUrls = new Set(dbLinks.map((l: any) => l.payment_url || l.payment_link));
      const uniqueLocal = localLinks.filter(l => !allUrls.has(l.payment_url));
      const merged = [...dbLinks.map((l: any) => ({
        ...l,
        payment_url: l.payment_url || l.payment_link || '',
      })), ...uniqueLocal];
      
      // Sort by date
      merged.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
      
      // Filter by status if needed
      const filtered = (status && status !== 'all') 
        ? merged.filter(l => l.status === status)
        : merged;
      
      setLinks(filtered);
      setLinksTotal(filtered.length);
      setUseLocalHistory(dbLinks.length === 0);
    } catch {
      // DB failed — use local only
      const local = loadLocalHistory();
      const filtered = (status && status !== 'all')
        ? local.filter(l => l.status === (status || filterStatus))
        : local;
      setLinks(filtered);
      setLinksTotal(filtered.length);
      setUseLocalHistory(true);
    } finally {
      setLinksLoading(false);
    }
  }, [filterStatus]);

  const loadStats = useCallback(async () => {
    try {
      const s = await paymobBackend.getStats();
      if (s && Number(s.total) >= 0) setStats(s);
    } catch {}
  }, []);

  /* ── Init ── */
  useEffect(() => {
    void (async () => {
      // Ping worker
      try {
        const ping = await pingPaymobWorker();
        const ok = String(ping?.status || '').toLowerCase() === 'ok';
        setWorkerStatus({ ok, text: ok ? 'متصل' : 'غير متصل' });
      } catch { setWorkerStatus({ ok: false, text: 'غير متصل' }); }

      // Load initial data
      void loadLinks();
      void loadStats();
    })();
  }, [loadLinks, loadStats]); // Dependency on functions for safety

  // Polling for updates every 30s if there are pending links
  useEffect(() => {
    const hasPending = links.some(l => l.status === 'pending');
    if (!hasPending) return;

    const timer = setInterval(() => {
      void loadLinks();
      void loadStats();
    }, 30000);

    return () => clearInterval(timer);
  }, [links, loadLinks, loadStats]);

  useEffect(() => { 
    void loadLinks(filterStatus); 
  }, [filterStatus, loadLinks]);


  /* ── Server-side invoice search with debounce ── */
  const handleSearchChange = useCallback((value: string) => {
    setInvoiceQuery(value);
    setShowDropdown(true);

    // Clear previous timer
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);

    if (value.trim().length < 2) {
      setSearchResults([]);
      setSearching(false);
      return;
    }

    setSearching(true);

    // Debounce 400ms
    searchTimerRef.current = setTimeout(async () => {
      const results = await searchInvoicesServer(value);
      setSearchResults(results);
      setSearching(false);
    }, 400);
  }, []);

  /* ── Pick invoice ── */
  const onPickInvoice = (inv: Invoice) => {
    if (selectedInvoices.find(x => x.id === inv.id)) {
      setShowDropdown(false);
      setInvoiceQuery('');
      return;
    }
    
    const newSelected = [...selectedInvoices, inv];
    setSelectedInvoices(newSelected);
    
    if (newSelected.length === 1) {
      setClientName(inv.client || '');
      setClientPhone(inv.phone || '');
    }
    
    // Sum up total remaining
    const total = newSelected.reduce((sum, i) => sum + (i.remaining || i.total || 0), 0);
    setAmount(total.toFixed(2));
    
    setInvoiceQuery('');
    setShowDropdown(false);
    setSearchResults([]);
  };

  const onRemoveInvoice = (id: string | number) => {
    const newSelected = selectedInvoices.filter(x => x.id !== id);
    setSelectedInvoices(newSelected);
    const total = newSelected.reduce((sum, i) => sum + (i.remaining || i.total || 0), 0);
    setAmount(total.toFixed(2));
  };

  const onClearInvoices = () => {
    setSelectedInvoices([]);
    setInvoiceQuery('');
    setSearchResults([]);
    setAmount('');
  };

  /* ── Copy ── */
  const handleCopy = async (url: string) => {
    const ok = await copyText(url);
    if (ok) { setCopiedUrl(url); setTimeout(() => setCopiedUrl(null), 2000); }
  };

  /* ── Check Payment ── */
  const handleCheckPayment = async (orderId: string) => {
    setCheckingPayment(orderId);
    try {
      const res = await checkPayment(orderId);
      if (res.paid) { await loadLinks(); await loadStats(); }
      alert(res.paid ? `✅ مدفوع — ${res.paid_amount || 0} ر.س` : '⏳ لم يتم الدفع بعد');
    } catch (e) {
      alert('فشل التحقق: ' + (e instanceof Error ? e.message : String(e)));
    } finally { setCheckingPayment(null); }
  };

  const onCreate = async (sendWa: boolean) => {
    setError(null); setResult(null);

    const name = clientName.trim();
    const phone = clientPhone.trim();
    const amountNum = safeAmountNumber(amount);
    const desc = description.trim() || 'خدمة شحن';

    if (!name) return setError('أدخل اسم العميل');
    if (!phone) return setError('أدخل رقم الجوال');
    if (!amountNum || amountNum <= 0) return setError('أدخل مبلغاً صحيحاً');

    setBusy(true);
    try {
      // Create via Worker ONLY
      const res = await createPaymentLink({
        invoice_id: selectedInvoices.length === 1 ? String(selectedInvoices[0].id) : undefined,
        invoice_ids: selectedInvoices.length > 1 ? selectedInvoices.map(i => Number(i.id)) : undefined,
        amount: amountNum,
        client_name: name,
        client_phone: phone,
        description: desc.slice(0, 200),
        integration_type: integrationType,
      });

      const url = String(res?.payment_url || '').trim();
      if (!url) throw new Error(res?.error || 'تعذّر إنشاء رابط الدفع — تأكد من صحة رقم الجوال');

      // Refresh from DB immediately to show the new link
      await loadLinks();
      await loadStats();

      setResult({ url, orderId: res?.order_id });

      if (sendWa) {
        const msg = buildPaymobWaMessage({ name, amount: amountNum, description: desc, url });
        openWhatsApp(phone, msg);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'حدث خطأ');
    } finally { setBusy(false); }
  };

  /* ── Delete ── */
  const handleDelete = async (link: PaymobLink) => {
    if (!window.confirm('حذف هذا الرابط؟')) return;
    try {
      if (!useLocalHistory) {
        await paymobBackend.deleteLink(link.id);
      }
      // Remove from local too
      const local = loadLocalHistory().filter(l => l.payment_url !== link.payment_url);
      saveLocalHistory(local);
      await loadLinks();
      await loadStats();
    } catch {}
  };

  /* ═══ RENDER ═══ */
  return (
    <div className="space-y-6 animate-in fade-in duration-300 pb-20 lg:pb-0 font-cairo">

      {/* ═══ Header ═══ */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-white dark:bg-slate-800 p-4 rounded-2xl border border-gray-200 dark:border-slate-700 shadow-sm">
        <div className="flex items-center gap-3 text-gray-900 dark:text-white">
          <div className="p-2.5 bg-blue-500/10 text-blue-500 rounded-xl border border-blue-500/20"><CreditCard size={24} /></div>
          <div>
            <h1 className="font-bold text-lg">روابط دفع Paymob</h1>
            <p className="text-xs text-gray-500 dark:text-gray-400 font-semibold">إنشاء روابط دفع رقمية ومشاركتها عبر واتساب</p>
          </div>
        </div>
        {workerStatus && (
          <div className={`flex items-center gap-2 px-3 py-1.5 rounded-xl border text-xs font-bold ${
            workerStatus.ok
              ? 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800/30 text-green-600 dark:text-green-400'
              : 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800/30 text-red-600 dark:text-red-400'
          }`}>
            <span className="relative flex h-2 w-2">
              <span className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${workerStatus.ok ? 'bg-green-500' : 'bg-red-500'}`} />
              <span className={`relative inline-flex rounded-full h-2 w-2 ${workerStatus.ok ? 'bg-green-500' : 'bg-red-500'}`} />
            </span>
            بوابة Paymob: {workerStatus.text}
          </div>
        )}
      </div>

      {(() => {
        const localLinks = links || [];
        const totalCount = localLinks.length;
        const paidCount = localLinks.filter(l => l.status === 'paid').length;
        const pendingCount = localLinks.filter(l => l.status === 'pending').length;
        const pendingTotal = localLinks.filter(l => l.status === 'pending').reduce((sum, l) => sum + Number(l.amount || 0), 0);

        return (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { label: 'إجمالي الروابط', value: totalCount, color: 'text-gray-900 dark:text-white' },
              { label: 'معلّقة', value: pendingCount, color: 'text-amber-600' },
              { label: 'مدفوعة', value: paidCount, color: 'text-green-600' },
              { label: 'إجمالي المعلّق', value: `${pendingTotal.toLocaleString()} ر.س`, color: 'text-indigo-600' },
            ].map((s, i) => (
              <div key={i} className="bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl p-3 text-center">
                <div className={`text-xl font-bold font-inter ${s.color}`}>{s.value}</div>
                <div className="text-[10px] text-gray-500 font-bold">{s.label}</div>
              </div>
            ))}
          </div>
        );
      })()}

      <div className="flex flex-col xl:flex-row gap-6 items-start">

        {/* ═══ LEFT: Create Form ═══ */}
        <div className="w-full xl:w-7/12 bg-white dark:bg-slate-800 p-5 md:p-6 rounded-2xl border border-gray-200 dark:border-slate-700 shadow-sm flex flex-col gap-5 relative">

          <div className="flex justify-between items-center border-b border-gray-200 dark:border-slate-700 pb-3">
            <h2 className="text-base font-bold text-gray-900 dark:text-white flex items-center gap-2">
              <Link size={18} className="text-indigo-600 dark:text-indigo-400" /> تفاصيل رابط الدفع المباشر
            </h2>
            {selectedInvoices.length > 0 ? (
              <span className="text-xs font-bold text-indigo-600 bg-indigo-50 dark:bg-indigo-900/20 px-2 py-1 rounded-lg border border-indigo-100 dark:border-indigo-800/20 flex items-center gap-1">
                <FileText size={12} /> {selectedInvoices.length} فواتير مختارة
              </span>
            ) : (
              <span className="text-xs font-bold text-gray-500 bg-gray-50 dark:bg-slate-900 px-2 py-1 rounded-lg border border-gray-200 dark:border-slate-700 flex items-center gap-1">
                <Link size={12} /> دفع حر
              </span>
            )}
          </div>

          {/* ═══ Invoice Search (SERVER-SIDE) ═══ */}
          <div className="flex flex-col gap-2 relative z-20">
            <label className="text-xs font-bold text-gray-500 dark:text-gray-400">اختيار فاتورة مرجعية (اختياري)</label>
            <div className="relative">
              <Search size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400" />
              {searching && <Loader2 size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-indigo-500 animate-spin" />}
              <input
                value={invoiceQuery}
                onChange={(e) => handleSearchChange(e.target.value)}
                onFocus={() => setShowDropdown(true)}
                placeholder="ابحث برقم الفاتورة أو اسم العميل (حرفين على الأقل)..."
                className="w-full bg-gray-50 dark:bg-slate-900 border border-gray-200 dark:border-slate-700 rounded-xl px-4 py-3 pr-10 pl-10 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500/50 font-cairo transition-all disabled:opacity-50"
                disabled={busy}
              />

              {/* Dropdown */}
              {showDropdown && invoiceQuery.trim().length >= 2 && (
                <div className="absolute top-[calc(100%+4px)] right-0 left-0 bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl shadow-xl max-h-[250px] overflow-y-auto z-50 divide-y divide-gray-100 dark:divide-slate-700/50">
                  {searching ? (
                    <div className="p-4 text-center text-gray-400 text-xs font-bold flex items-center justify-center gap-2">
                      <Loader2 size={14} className="animate-spin" /> جاري البحث...
                    </div>
                  ) : searchResults.length ? (
                    searchResults.map((inv) => (
                      <button key={String(inv.id)} type="button" onClick={() => onPickInvoice(inv)}
                        className="w-full text-right p-3 hover:bg-gray-50 dark:hover:bg-slate-700/50 transition-colors flex items-center justify-between text-sm">
                        <span className="font-bold text-gray-900 dark:text-white flex items-center gap-2">
                          <span className="font-mono text-xs text-gray-400">#{inv.invoice_number || inv.id}</span>
                          <span>{inv.client}</span>
                          {selectedInvoices.find(x => x.id === inv.id) && <Check size={14} className="text-green-500" />}
                        </span>
                        <span className="font-mono font-bold text-yellow-600">{Number(inv.remaining || inv.price || 0).toFixed(2)} ر.س</span>
                      </button>
                    ))
                  ) : (
                    <div className="p-4 text-center text-gray-400 text-xs font-bold">لا توجد نتائج مطابقة</div>
                  )}
                </div>
              )}
            </div>

            {selectedInvoices.length > 0 && (
              <div className="flex flex-col gap-2 mt-1">
                <div className="flex flex-wrap gap-2">
                  {selectedInvoices.map((inv) => (
                    <span key={inv.id} className="text-[10px] font-bold text-indigo-600 bg-indigo-50 dark:bg-indigo-900/20 px-2 py-1 rounded-lg border border-indigo-100 dark:border-indigo-800/20 flex items-center gap-1">
                      #{inv.invoice_number || inv.id}
                      <button type="button" onClick={() => onRemoveInvoice(inv.id)} className="hover:text-red-500"><X size={10} /></button>
                    </span>
                  ))}
                  <button type="button" onClick={onClearInvoices} className="text-[10px] font-bold text-red-600 hover:underline">مسح الكل</button>
                </div>
                <div className="flex items-center gap-1.5 text-xs text-gray-500">
                  <CheckCircle2 size={14} className="text-indigo-500" />
                  <span>سيتم ربط {selectedInvoices.length} فواتير بهذا الرابط</span>
                </div>
              </div>
            )}
          </div>

          {/* Name + Phone */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-bold text-gray-500 dark:text-gray-400 flex items-center gap-1"><User size={12} /> اسم العميل *</label>
              <input value={clientName} onChange={(e) => setClientName(e.target.value)} placeholder="اسم العميل"
                className="w-full bg-gray-50 dark:bg-slate-900 border border-gray-200 dark:border-slate-700 rounded-xl px-4 py-3 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500/50 font-cairo transition-all disabled:opacity-50"
                disabled={busy} />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-bold text-gray-500 dark:text-gray-400 flex items-center gap-1"><Smartphone size={12} /> رقم الجوال *</label>
              <input value={clientPhone} onChange={(e) => setClientPhone(e.target.value)} placeholder="05XXXXXXXX" dir="ltr"
                className="w-full bg-gray-50 dark:bg-slate-900 border border-gray-200 dark:border-slate-700 rounded-xl px-4 py-3 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500/50 font-inter transition-all disabled:opacity-50 text-right"
                disabled={busy} />
            </div>
          </div>

          {/* Amount + Gateway */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-bold text-gray-500 dark:text-gray-400 flex items-center gap-1"><CircleDollarSign size={12} /> المبلغ (ريال) *</label>
              <input value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.00" inputMode="decimal" dir="ltr"
                className="w-full bg-gray-50 dark:bg-slate-900 border border-gray-200 dark:border-slate-700 rounded-xl px-4 py-3 text-sm font-bold text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500/50 font-inter transition-all disabled:opacity-50 text-right"
                disabled={busy} />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-bold text-gray-500 dark:text-gray-400 flex items-center gap-1"><CreditCard size={12} /> بوابة الدفع</label>
              <select value={integrationType} onChange={(e) => setIntegrationType(e.target.value)}
                className="w-full bg-gray-50 dark:bg-slate-900 border border-gray-200 dark:border-slate-700 rounded-xl px-4 py-3.5 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500/50 transition-all disabled:opacity-50"
                disabled={busy}>
                <option value="PL">رابط دفع سريع (PL)</option>
                <option value="WEB">بطاقة ائتمان مدى/فيزا (WEB)</option>
              </select>
            </div>
          </div>

          {/* Description */}
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-bold text-gray-500 dark:text-gray-400 flex items-center gap-1"><FileText size={12} /> تفاصيل العملية (الوصف)</label>
            <input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="خدمة شحن"
              className="w-full bg-gray-50 dark:bg-slate-900 border border-gray-200 dark:border-slate-700 rounded-xl px-4 py-3 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500/50 font-cairo transition-all disabled:opacity-50"
              disabled={busy} />
          </div>

          {/* Error */}
          {error && (
            <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800/30 text-red-600 dark:text-red-400 p-3 rounded-xl text-sm font-bold flex items-center gap-2">
              <AlertCircle size={18} /> {error}
            </div>
          )}

          {/* Buttons */}
          <div className="flex flex-col sm:flex-row gap-3 pt-1">
            <button type="button"
              className="flex-1 flex justify-center items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white py-3.5 rounded-xl font-bold shadow-lg shadow-indigo-500/20 transition-all disabled:opacity-50 text-sm"
              onClick={() => void onCreate(true)} disabled={busy || !workerStatus?.ok}>
              {busy ? <Loader2 className="animate-spin" size={18} /> : <Send size={18} />}
              إنشاء وإرسال عبر واتساب
            </button>
            <button type="button"
              className="sm:w-1/3 flex justify-center items-center gap-2 bg-gray-50 dark:bg-slate-900 border border-gray-200 dark:border-slate-700 text-gray-900 dark:text-white py-3.5 rounded-xl font-bold transition-all disabled:opacity-50 text-sm hover:bg-gray-100 dark:hover:bg-slate-800"
              onClick={() => void onCreate(false)} disabled={busy || !workerStatus?.ok}>
              <Link size={18} /> إنشاء فقط
            </button>
          </div>

          {/* Success */}
          {result && (
            <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800/30 rounded-xl p-4 mt-2">
              <h3 className="text-green-600 dark:text-green-400 font-bold text-sm flex items-center gap-2 mb-2">
                <CheckCircle2 size={18} /> تم توليد الرابط بنجاح
              </h3>
              <p className="font-mono text-xs text-gray-500 bg-white dark:bg-slate-800 p-2 rounded-lg border border-gray-200 dark:border-slate-700 break-all select-all font-bold mb-3">{result.url}</p>
              <div className="flex gap-2 flex-wrap">
                <button type="button"
                  className="flex-1 min-w-[100px] flex items-center justify-center gap-1.5 py-2 bg-gray-50 dark:bg-slate-900 text-gray-900 dark:text-white text-xs font-bold rounded-lg border border-gray-200 dark:border-slate-700 hover:bg-gray-100 transition-colors"
                  onClick={() => handleCopy(result.url)}>
                  {copiedUrl === result.url ? <Check size={14} className="text-green-500" /> : <Copy size={14} />}
                  {copiedUrl === result.url ? 'تم النسخ' : 'نسخ الرابط'}
                </button>
                <button type="button"
                  className="flex-1 min-w-[100px] flex items-center justify-center gap-1.5 py-2 bg-[#25d366]/10 text-[#25d366] text-xs font-bold rounded-lg border border-[#25d366]/30 hover:bg-[#25d366]/20 transition-colors"
                  onClick={() => {
                    const msg = buildPaymobWaMessage({ name: clientName.trim() || 'عزيزي العميل', amount: safeAmountNumber(amount) || 0, description: description.trim() || 'خدمة شحن', url: result.url });
                    openWhatsApp(clientPhone, msg);
                  }}>
                  <Send size={14} /> إرسال للعميل
                </button>
                <a href={result.url} target="_blank" rel="noopener noreferrer"
                  className="flex items-center justify-center gap-1.5 px-4 py-2 bg-blue-50 dark:bg-blue-900/20 text-blue-600 text-xs font-bold rounded-lg border border-blue-200 dark:border-blue-800/30 hover:bg-blue-100 transition-colors">
                  <ExternalLink size={14} /> فتح
                </a>
              </div>
            </div>
          )}
        </div>

        {/* ═══ RIGHT: History ═══ */}
        <div className="w-full xl:w-5/12 bg-white dark:bg-slate-800 p-5 md:p-6 rounded-2xl border border-gray-200 dark:border-slate-700 shadow-sm flex flex-col gap-4 max-h-[85vh] overflow-hidden">

          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 border-b border-gray-200 dark:border-slate-700 pb-3">
            <h2 className="text-base font-bold text-gray-900 dark:text-white flex items-center gap-2">
              <RefreshCw size={18} className="text-indigo-600 dark:text-indigo-400" /> سجل الروابط
            </h2>
            <div className="flex items-center gap-2">
              <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)}
                className="bg-gray-50 dark:bg-slate-900 border border-gray-200 dark:border-slate-700 rounded-lg px-2 py-1 text-xs font-bold text-gray-700 dark:text-gray-300">
                <option value="all">الكل</option>
                <option value="pending">معلّق</option>
                <option value="paid">مدفوع</option>
              </select>
              <button type="button" onClick={() => { void loadLinks(); void loadStats(); }}
                className="p-1.5 bg-gray-50 dark:bg-slate-900 border border-gray-200 dark:border-slate-700 rounded-lg text-gray-500 hover:text-gray-900 transition-colors" title="تحديث">
                <RefreshCw size={14} className={linksLoading ? 'animate-spin' : ''} />
              </button>
              <span className="text-xs font-bold text-gray-400 bg-gray-100 dark:bg-slate-700 px-2 py-1 rounded-lg">{linksTotal}</span>
            </div>
          </div>

          {useLocalHistory && links.length > 0 && (
            <div className="text-[10px] text-amber-600 bg-amber-50 dark:bg-amber-900/20 px-2 py-1 rounded-lg border border-amber-200 dark:border-amber-800/30 font-bold text-center">
              ⚠️ محفوظ محلياً — جدول الروابط في الباك اند غير متاح حالياً
            </div>
          )}

          <div className="overflow-y-auto flex-1 flex flex-col gap-3 pr-1 scrollbar-thin">
            {linksLoading ? (
              <div className="flex items-center justify-center py-10"><Loader2 size={24} className="animate-spin text-gray-400" /></div>
            ) : links.length ? (
              links.map((link, idx) => (
                <div key={link.id || idx} className={`bg-gray-50 dark:bg-slate-900 border rounded-xl p-3.5 flex flex-col gap-2 transition-colors ${
                  link.status === 'paid' ? 'border-green-200 dark:border-green-800/30' : 'border-gray-200 dark:border-slate-700 hover:border-indigo-200'
                }`}>
                  <div className="flex justify-between items-start gap-3">
                    <div className="overflow-hidden flex-1">
                      <div className="font-bold text-sm text-gray-900 dark:text-white truncate flex items-center gap-2 flex-wrap">
                        {link.client_name}
                        <span className="font-inter text-yellow-600">{Number(link.amount || 0).toFixed(2)} ر.س</span>
                        <StatusPill status={link.status} />
                      </div>
                      <div className="text-xs text-gray-500 font-semibold mt-1">
                        <span className="font-inter">{link.client_phone}</span>
                        {link.description ? ` — ${link.description}` : ''}
                        {link.invoice_id ? ` | فاتورة #${link.invoice_id}` : ''}
                      </div>
                      <div className="text-[10px] text-gray-400 mt-1 flex items-center gap-1">
                        <Clock size={10} /> {formatDate(link.created_at)}
                        {link.paid_at && <span className="text-green-500 mr-2">• مدفوع {formatDate(link.paid_at)}</span>}
                      </div>
                    </div>
                    <div className="flex flex-row gap-1.5 flex-shrink-0">
                      <button type="button" onClick={() => handleCopy(link.payment_url)} title="نسخ"
                        className="p-1.5 bg-white dark:bg-slate-800 text-gray-500 hover:text-gray-900 rounded-md border border-gray-200 dark:border-slate-700 transition-colors">
                        {copiedUrl === link.payment_url ? <Check size={14} className="text-green-500" /> : <Copy size={14} />}
                      </button>
                      <button type="button" title="واتساب"
                        className="p-1.5 bg-[#25d366]/10 text-[#25d366] rounded-md border border-[#25d366]/30 transition-colors"
                        onClick={() => {
                          const msg = buildPaymobWaMessage({ name: link.client_name, amount: Number(link.amount || 0), description: link.description || 'خدمة شحن', url: link.payment_url });
                          openWhatsApp(link.client_phone, msg);
                        }}>
                        <Send size={14} />
                      </button>
                      {link.status === 'pending' && link.paymob_order_id && (
                        <button type="button" title="فحص الدفع"
                          className="p-1.5 bg-amber-50 dark:bg-amber-900/20 text-amber-600 rounded-md border border-amber-200 dark:border-amber-800/30 transition-colors"
                          onClick={() => handleCheckPayment(link.paymob_order_id!)}
                          disabled={checkingPayment === link.paymob_order_id}>
                          {checkingPayment === link.paymob_order_id ? <Loader2 size={14} className="animate-spin" /> : <Eye size={14} />}
                        </button>
                      )}
                      <button type="button" title="حذف"
                        className="p-1.5 text-red-500 bg-red-50 dark:bg-red-900/20 rounded-md border border-red-200 dark:border-red-800/30 transition-colors"
                        onClick={() => handleDelete(link)}>
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                </div>
              ))
            ) : (
              <div className="flex flex-col items-center justify-center py-10 text-gray-500 dark:text-gray-400 opacity-60">
                <CreditCard size={40} className="mb-3" />
                <p className="text-sm font-bold">
                  {filterStatus === 'all' ? 'لم يتم إنشاء أي روابط حتى الآن' :
                   filterStatus === 'paid' ? 'لا توجد روابط مدفوعة' : 'لا توجد روابط معلّقة'}
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}