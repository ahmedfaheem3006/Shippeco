import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { useSettingsPage } from '../hooks/useSettingsPage';
import type { UserRecord } from '../utils/models';
import { openWhatsApp } from '../utils/whatsapp';
import { useAuthStore } from '../hooks/useAuthStore';
import {
  Settings, Smartphone, CreditCard, BookOpen,
  Users, Save, Link, Link2, Info,
  Trash2, Briefcase, Eye, User, Share2, FileText,
  AlertCircle, CheckCircle2, X, Shield, ChevronDown, Crown,
  UserX, Ban, RefreshCw, Clock, Database, Power,
  Loader2,
} from 'lucide-react';

/* ═══ Role & Status Configs ═══ */
const ROLE_CONFIG: Record<string, { label: string; icon: any; color: string }> = {
  admin:      { label: 'مدير النظام',   icon: Crown,    color: 'text-amber-600 bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800/30 dark:text-amber-400' },
  accountant: { label: 'محاسب',         icon: Briefcase, color: 'text-blue-600 bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800/30 dark:text-blue-400' },
  employee:   { label: 'موظف مبيعات',   icon: User,     color: 'text-green-600 bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800/30 dark:text-green-400' },
  viewer:     { label: 'مشاهد فقط',     icon: Eye,      color: 'text-slate-600 bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700 dark:text-slate-400' },
};

const STATUS_CONFIG: Record<string, { label: string; color: string; icon: any }> = {
  pending:  { label: 'بانتظار الموافقة', color: 'text-amber-700 bg-amber-100 dark:bg-amber-900/30 dark:text-amber-400 border-amber-200 dark:border-amber-700/30', icon: Shield },
  approved: { label: 'مفعّل',           color: 'text-green-700 bg-green-100 dark:bg-green-900/30 dark:text-green-400 border-green-200 dark:border-green-700/30', icon: CheckCircle2 },
  rejected: { label: 'مرفوض',           color: 'text-red-700 bg-red-100 dark:bg-red-900/30 dark:text-red-400 border-red-200 dark:border-red-700/30', icon: Ban },
};

function RoleBadge({ role }: { role: string }) {
  const info = ROLE_CONFIG[role] || ROLE_CONFIG.employee;
  const Icon = info.icon;
  return (
    <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border text-[11px] font-bold ${info.color}`}>
      <Icon size={12} /> {info.label}
    </span>
  );
}

function StatusBadge({ status }: { status: string }) {
  const info = STATUS_CONFIG[status] || STATUS_CONFIG.pending;
  const Icon = info.icon;
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md border text-[10px] font-bold uppercase ${info.color}`}>
      <Icon size={11} /> {info.label}
    </span>
  );
}

/* ═══ Role Dropdown (Portal-based) ═══ */
function RoleDropdown({ user, onChangeRole, disabled }: {
  user: UserRecord; onChangeRole: (id: number, role: string) => void; disabled: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; right: number } | null>(null);
  const btnRef = React.useRef<HTMLButtonElement>(null);
  const currentUser = useAuthStore((s) => s.user);

  if (user.id === (currentUser as any)?.id) return null;
  if (user.status !== 'approved') return null;

  const handleOpen = () => {
    if (!open && btnRef.current) {
      const rect = btnRef.current.getBoundingClientRect();
      setPos({
        top: rect.bottom + 4,
        right: window.innerWidth - rect.right,
      });
    }
    setOpen(!open);
  };

  // Close on scroll
  React.useEffect(() => {
    if (!open) return;
    const handleScroll = () => setOpen(false);
    const handleResize = () => setOpen(false);
    window.addEventListener('scroll', handleScroll, true);
    window.addEventListener('resize', handleResize);
    return () => {
      window.removeEventListener('scroll', handleScroll, true);
      window.removeEventListener('resize', handleResize);
    };
  }, [open]);

  return (
    <div className="relative">
      <button
        ref={btnRef}
        type="button"
        onClick={handleOpen}
        disabled={disabled}
        className="flex items-center gap-1 px-2.5 py-1.5 bg-gray-100 dark:bg-slate-800 border border-gray-200 dark:border-slate-700 hover:border-indigo-300 dark:hover:border-indigo-700 rounded-lg text-xs font-bold text-gray-700 dark:text-gray-300 transition-all disabled:opacity-50"
        title="تغيير الدور"
      >
        <Shield size={13} />
        <span className="hidden sm:inline">تغيير الدور</span>
        <ChevronDown size={13} className={`transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && pos && createPortal(
        <>
          {/* Backdrop */}
          <div className="fixed inset-0 z-[9998]" onClick={() => setOpen(false)} />
          {/* Dropdown Menu */}
          <div
            className="fixed w-52 bg-white dark:bg-slate-800 rounded-xl shadow-2xl border border-gray-200 dark:border-slate-700 z-[9999] overflow-hidden"
            style={{ top: pos.top, right: pos.right }}
          >
            {Object.entries(ROLE_CONFIG).map(([key, config]) => {
              const Icon = config.icon;
              const isActive = user.role === key;
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => {
                    if (!isActive) onChangeRole(user.id!, key);
                    setOpen(false);
                  }}
                  disabled={isActive}
                  className={`w-full flex items-center gap-2.5 px-4 py-3 text-xs font-bold transition-colors border-b border-gray-100 dark:border-slate-700/50 last:border-0 ${
                    isActive
                      ? 'bg-indigo-50 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-400 cursor-default'
                      : 'text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-slate-700/50 cursor-pointer'
                  }`}
                >
                  <Icon size={15} />
                  <span className="flex-1 text-right">{config.label}</span>
                  {isActive && <CheckCircle2 size={14} className="text-indigo-500" />}
                </button>
              );
            })}
          </div>
        </>,
        document.body
      )}
    </div>
  );
}

/* ═══ User Card ═══ */
function UserCard({ user, st }: { user: UserRecord; st: ReturnType<typeof useSettingsPage> }) {
  const currentUser = useAuthStore((s) => s.user);
  const isSelf = user.id === (currentUser as any)?.id;
  const isRejected = user.status === 'rejected';
  const isPending = user.status === 'pending';
  const isActive = (user as any).is_active !== false;

  return (
    <div className={`flex flex-col gap-3 p-4 rounded-2xl border transition-all ${
      isPending ? 'bg-amber-50/50 dark:bg-amber-900/10 border-amber-200 dark:border-amber-800/30' :
      isRejected ? 'bg-red-50/50 dark:bg-red-900/10 border-red-200 dark:border-red-800/30 opacity-60' :
      !isActive ? 'bg-gray-100 dark:bg-slate-900/50 border-gray-300 dark:border-slate-600 opacity-70' :
      'bg-gray-50 dark:bg-slate-900 border-gray-200 dark:border-slate-700 hover:border-indigo-200 dark:hover:border-indigo-800/30'
    }`}>
      {/* User Info */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <div className={`p-2 rounded-xl flex-shrink-0 ${
            isPending ? 'bg-amber-100 dark:bg-amber-900/30 text-amber-600' :
            isRejected ? 'bg-red-100 dark:bg-red-900/30 text-red-500' :
            !isActive ? 'bg-gray-200 dark:bg-slate-700 text-gray-500' :
            'bg-indigo-100 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400'
          }`}>
            {isRejected ? <UserX size={20} /> : !isActive ? <Power size={20} /> : <User size={20} />}
          </div>
          <div className="flex flex-col gap-0.5 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className={`font-bold text-sm ${isRejected ? 'line-through text-gray-400' : !isActive ? 'text-gray-500' : 'text-gray-900 dark:text-white'}`}>
                {user.name} {isSelf && <span className="text-[10px] text-indigo-500">(أنت)</span>}
              </span>
              <RoleBadge role={user.role} />
              <StatusBadge status={user.status || 'approved'} />
              {!isActive && user.status === 'approved' && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md border text-[10px] font-bold text-orange-600 bg-orange-50 dark:bg-orange-900/20 border-orange-200 dark:border-orange-800/30">
                  <Power size={10} /> معطّل
                </span>
              )}
            </div>
            <div className="font-mono text-[11px] text-gray-500 dark:text-gray-400 truncate">{user.username}</div>
            {(user as any).last_login && (
              <div className="text-[10px] text-gray-400 flex items-center gap-1">
                <Clock size={10} /> آخر دخول: {new Date((user as any).last_login).toLocaleDateString('ar-SA')}
              </div>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2 flex-shrink-0">
          {/* Toggle Active */}
          {!isSelf && user.status === 'approved' && (
            <button type="button"
              className={`p-2 rounded-lg transition-colors border ${
                isActive
                  ? 'text-orange-500 bg-orange-50 dark:bg-orange-900/20 border-orange-200 dark:border-orange-800/30 hover:bg-orange-100'
                  : 'text-green-500 bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800/30 hover:bg-green-100'
              }`}
              onClick={() => user.id && st.handleToggleActive(user.id, isActive)}
              disabled={st.loading || st.saving}
              title={isActive ? 'تعطيل الحساب' : 'تفعيل الحساب'}>
              <Power size={16} />
            </button>
          )}

          {/* Delete */}
          {!isSelf && (
            <button type="button"
              className="p-2 text-red-500 bg-red-50 dark:bg-red-900/20 rounded-lg transition-colors border border-transparent hover:border-red-200 dark:hover:border-red-800/30"
              onClick={() => {
                if (window.confirm(`تأكيد حذف "${user.name}"؟ لا يمكن التراجع.`)) {
                  user.id && st.handleDelete(user.id);
                }
              }}
              disabled={st.loading || st.saving}
              title="حذف الحساب">
              <Trash2 size={16} />
            </button>
          )}
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-2 flex-wrap">
        {isPending && (
          <>
            <button type="button"
              className="flex items-center gap-1 px-3 py-1.5 bg-green-600 hover:bg-green-700 text-white rounded-lg text-xs font-bold transition-colors shadow-sm"
              onClick={() => user.id && st.handleApprove(user.id)} disabled={st.loading || st.saving}>
              <CheckCircle2 size={14} /> قبول
            </button>
            <button type="button"
              className="flex items-center gap-1 px-3 py-1.5 bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 border border-red-200 dark:border-red-800/30 hover:bg-red-100 rounded-lg text-xs font-bold transition-colors"
              onClick={() => user.id && st.handleReject(user.id)} disabled={st.loading || st.saving}>
              <X size={14} /> رفض
            </button>
          </>
        )}
        {isRejected && (
          <button type="button"
            className="flex items-center gap-1 px-3 py-1.5 bg-green-50 dark:bg-green-900/20 text-green-600 dark:text-green-400 border border-green-200 dark:border-green-800/30 hover:bg-green-100 rounded-lg text-xs font-bold transition-colors"
            onClick={() => user.id && st.handleApprove(user.id)} disabled={st.loading || st.saving}>
            <CheckCircle2 size={14} /> إعادة القبول
          </button>
        )}
        {!isPending && !isRejected && (
          <RoleDropdown user={user} onChangeRole={st.handleChangeRole} disabled={st.loading || st.saving} />
        )}
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════
   MAIN SETTINGS PAGE
   ═══════════════════════════════════════ */
export function SettingsPage() {
  const nav = useNavigate();
  const st = useSettingsPage();
  const { refresh } = st;

  useEffect(() => { void refresh(); }, [refresh]);

  return (
    <div className="space-y-6 animate-in fade-in duration-300 pb-20 lg:pb-0 font-cairo">
      {/* ═══ Header ═══ */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-white dark:bg-slate-800 p-4 rounded-2xl border border-gray-200 dark:border-slate-700 shadow-sm">
        <div className="flex items-center gap-3 text-gray-900 dark:text-white">
          <div className="p-2.5 bg-indigo-50 dark:bg-indigo-900/20 text-indigo-600 dark:text-indigo-400 rounded-xl border border-indigo-100 dark:border-indigo-800/20">
            <Settings size={24} />
          </div>
          <div>
            <h1 className="font-bold text-lg">إعدادات النظام</h1>
            <p className="text-xs text-gray-500 dark:text-gray-400 font-semibold">تكوين وتخصيص إعدادات المنصة والبوابات المرتبطة</p>
          </div>
        </div>
        {st.saving && (
          <div className="flex items-center gap-2 text-xs font-bold text-indigo-600 dark:text-indigo-400">
            <Loader2 size={16} className="animate-spin" /> جاري الحفظ...
          </div>
        )}
      </div>

      {/* ═══ Status Messages ═══ */}
      {(st.error || st.status) && (
        <div className="flex flex-col gap-2">
          {st.error && (
            <div className="text-xs font-bold text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 p-3 rounded-xl border border-red-200 dark:border-red-800/30 flex items-center gap-2">
              <AlertCircle size={16} /> {st.error}
            </div>
          )}
          {st.status && (
            <div className="text-xs font-bold text-green-600 dark:text-green-400 bg-green-50 dark:bg-green-900/20 p-3 rounded-xl border border-green-200 dark:border-green-800/30 flex items-center gap-2">
              <CheckCircle2 size={16} /> {st.status}
            </div>
          )}
        </div>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 items-start">
        {/* ═══════════════ LEFT COLUMN ═══════════════ */}
        <div className="flex flex-col gap-6">

          {/* ── WhatsApp Number ── */}
          <div className="bg-white dark:bg-slate-800 p-5 md:p-6 rounded-2xl border border-gray-200 dark:border-slate-700 shadow-sm flex flex-col gap-4">
            <div className="flex items-center gap-3 border-b border-gray-200 dark:border-slate-700 pb-3">
              <div className="p-2 bg-[#25d366]/10 text-[#25d366] rounded-xl"><Smartphone size={20} /></div>
              <div>
                <h2 className="text-base font-bold text-gray-900 dark:text-white">رقم واتساب المتجر الموحد</h2>
                <div className="text-xs text-gray-500 dark:text-gray-400 font-bold">رقم واتساب بزنس لإرسال الفواتير وروابط الدفع</div>
              </div>
            </div>
            <div className="bg-gray-50 dark:bg-slate-900 border border-gray-200 dark:border-slate-700 rounded-xl p-3 text-xs font-bold text-gray-900 dark:text-white flex items-start gap-2">
              <Info size={16} className="text-[#25d366] flex-shrink-0 mt-0.5" />
              <p className="leading-relaxed"><span className="text-[#25d366]">تنبيه هام:</span> يجب أن يكون كل موظف مسجل دخوله في واتساب ويب بنفس هذا الرقم المتصل بالمنصة.</p>
            </div>
            <div className="flex flex-col gap-2">
              <label className="text-xs font-bold text-gray-500 dark:text-gray-400">رقم الجوال (بصيغة دولية)</label>
              <div className="flex flex-col sm:flex-row gap-3">
                <input
                  className="flex-1 bg-gray-50 dark:bg-slate-900 border border-gray-200 dark:border-slate-700 rounded-xl px-4 py-3 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500/50 font-inter transition-all disabled:opacity-50 text-left"
                  value={st.settings.storeWA}
                  onChange={(e) => st.setSettings({ ...st.settings, storeWA: e.target.value })}
                  placeholder="966XXXXXXXXX" dir="ltr"
                  disabled={st.loading || st.saving}
                />
                <button type="button"
                  className="sm:w-auto w-full flex justify-center items-center gap-2 bg-[#25d366]/10 hover:bg-[#25d366]/20 border border-[#25d366]/30 text-[#25d366] py-3 px-6 rounded-xl font-bold transition-all disabled:opacity-50 text-sm"
                  onClick={() => {
                    const ok = openWhatsApp(st.settings.storeWA, 'رسالة اختبار من منصة شيب بيك ✅');
                    if (!ok) window.alert('أدخل رقم واتساب المتجر بصيغة دولية');
                  }}
                  disabled={st.loading || st.saving}>
                  <Share2 size={16} /> اختبار
                </button>
              </div>
            </div>
          </div>

          {/* ── Paymob Settings ── */}
          <div className="bg-white dark:bg-slate-800 p-5 md:p-6 rounded-2xl border border-gray-200 dark:border-slate-700 shadow-sm flex flex-col gap-4">
            <div className="flex items-center gap-3 border-b border-gray-200 dark:border-slate-700 pb-3">
              <div className="p-2 bg-blue-500/10 text-blue-500 rounded-xl"><CreditCard size={20} /></div>
              <div>
                <h2 className="text-base font-bold text-gray-900 dark:text-white">بوابة الدفع (Paymob)</h2>
                <div className="text-xs text-gray-500 dark:text-gray-400 font-bold">Paymob KSA — ksa.paymob.com</div>
              </div>
            </div>

            <div className="flex flex-col gap-2">
              <label className="text-xs font-bold text-gray-500 dark:text-gray-400">وسيلة الدفع الافتراضية</label>
              <select
                className="w-full bg-gray-50 dark:bg-slate-900 border border-gray-200 dark:border-slate-700 rounded-xl px-4 py-3 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500/50 font-inter transition-all disabled:opacity-50"
                value={st.settings.currency}
                onChange={(e) => st.setSettings({ ...st.settings, currency: e.target.value })}
                disabled={st.loading || st.saving}>
                <option value="PL">رابط دفع سريع (Payment Link)</option>
                <option value="WEB">بطاقة ائتمان مدى/فيزا (Web Checkout)</option>
                <option value="APAY">Apple Pay</option>
              </select>
            </div>

            <div className="flex flex-col gap-2 mt-2">
              <label className="text-xs font-bold text-gray-500 dark:text-gray-400">ملاحظة الفاتورة الافتراضية</label>
              <textarea
                className="w-full bg-gray-50 dark:bg-slate-900 border border-gray-200 dark:border-slate-700 rounded-xl px-4 py-3 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500/50 font-cairo transition-all disabled:opacity-50 resize-y"
                rows={3}
                value={st.settings.invoiceNote}
                onChange={(e) => st.setSettings({ ...st.settings, invoiceNote: e.target.value })}
                placeholder="شكراً لتعاملكم معنا..."
                disabled={st.loading || st.saving}
              />
            </div>

            {/* Save + Test Buttons */}
            <div className="flex flex-col sm:flex-row gap-3 pt-2">
              <button type="button"
                className="flex-1 flex justify-center items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white py-3 rounded-xl font-bold shadow-lg shadow-indigo-500/20 transition-all disabled:opacity-50 text-sm"
                onClick={() => void st.savePlatformSettings()} disabled={st.loading || st.saving}>
                {st.saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />} حفظ التعديلات
              </button>
              <button type="button"
                className="flex-1 bg-gray-50 dark:bg-slate-900 border border-gray-200 dark:border-slate-700 text-gray-900 dark:text-white py-3 rounded-xl font-bold transition-all disabled:opacity-50 text-sm flex justify-center items-center gap-2"
                onClick={() => void st.testPaymob()} disabled={st.loading || st.saving}>
                <Link size={16} /> فحص الاتصال
              </button>
              <button type="button"
                className="flex-1 bg-gray-50 dark:bg-slate-900 border border-gray-200 dark:border-slate-700 text-gray-900 dark:text-white py-3 rounded-xl font-bold transition-all disabled:opacity-50 text-sm flex justify-center items-center gap-2"
                onClick={() => nav('/paymob-links')}>
                <CreditCard size={16} /> فتح الروابط
              </button>
            </div>

            {st.connPaymob && (
              <div className={`mt-1 p-3 text-xs font-bold rounded-xl border flex items-center gap-2 ${
                st.connPaymob.ok
                  ? 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800/30 text-green-600 dark:text-green-400'
                  : 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800/30 text-red-600 dark:text-red-400'
              }`}>
                {st.connPaymob.ok ? <CheckCircle2 size={14} /> : <AlertCircle size={14} />}
                بوابة Paymob: {st.connPaymob.text}
              </div>
            )}
          </div>

          {/* ── Daftra + Sync ── */}
          <div className="bg-white dark:bg-slate-800 p-5 md:p-6 rounded-2xl border border-gray-200 dark:border-slate-700 shadow-sm flex flex-col gap-4">
            <div className="flex items-center gap-3 border-b border-gray-200 dark:border-slate-700 pb-3">
              <div className="p-2 bg-green-50 dark:bg-green-900/20 text-green-600 dark:text-green-400 rounded-xl"><BookOpen size={20} /></div>
              <div>
                <h2 className="text-base font-bold text-gray-900 dark:text-white">منظومة دفترة + المزامنة</h2>
                <div className="text-xs text-gray-500 dark:text-gray-400 font-bold">مزامنة الفواتير المحاسبية — كل 15 دقيقة تلقائياً</div>
              </div>
            </div>

            {/* Sync Info */}
            {st.syncInfo && (
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-gray-50 dark:bg-slate-900 border border-gray-200 dark:border-slate-700 rounded-xl p-3 text-center">
                  <div className="text-2xl font-bold text-gray-900 dark:text-white font-inter">{st.syncInfo.total_invoices.toLocaleString()}</div>
                  <div className="text-[10px] text-gray-500 dark:text-gray-400 font-bold mt-1 flex items-center justify-center gap-1"><Database size={10} /> إجمالي الفواتير</div>
                </div>
                <div className="bg-gray-50 dark:bg-slate-900 border border-gray-200 dark:border-slate-700 rounded-xl p-3 text-center">
                  <div className="text-sm font-bold text-gray-900 dark:text-white font-inter">
                    {st.syncInfo.last_recent_sync
                      ? new Date(st.syncInfo.last_recent_sync).toLocaleString('ar-SA', { hour: '2-digit', minute: '2-digit', day: 'numeric', month: 'short' })
                      : '—'}
                  </div>
                  <div className="text-[10px] text-gray-500 dark:text-gray-400 font-bold mt-1 flex items-center justify-center gap-1"><Clock size={10} /> آخر مزامنة</div>
                </div>
              </div>
            )}

            <div className="flex flex-col sm:flex-row gap-3">
              <button type="button"
                className="flex-1 bg-gray-50 dark:bg-slate-900 border border-gray-200 dark:border-slate-700 text-gray-900 dark:text-white py-3 rounded-xl font-bold transition-all disabled:opacity-50 text-sm flex justify-center items-center gap-2"
                onClick={() => void st.testDaftra()} disabled={st.loading || st.saving}>
                <Link2 size={16} /> فحص الاتصال
              </button>
              <button type="button"
                className="flex-1 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800/30 text-green-600 dark:text-green-400 py-3 rounded-xl font-bold transition-all disabled:opacity-50 text-sm flex justify-center items-center gap-2 hover:bg-green-100"
                onClick={() => void st.triggerManualSync()} disabled={st.loading || st.saving}>
                <RefreshCw size={16} /> مزامنة يدوية الآن
              </button>
            </div>

            {st.connDaftra && (
              <div className={`p-3 text-xs font-bold rounded-xl border flex items-center gap-2 ${
                st.connDaftra.ok
                  ? 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800/30 text-green-600 dark:text-green-400'
                  : 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800/30 text-red-600 dark:text-red-400'
              }`}>
                {st.connDaftra.ok ? <CheckCircle2 size={14} /> : <AlertCircle size={14} />}
                {st.connDaftra.text}
              </div>
            )}
          </div>
        </div>

        {/* ═══════════════ RIGHT COLUMN ═══════════════ */}
        <div className="flex flex-col gap-6">

          {/* ── User Management ── */}
          <div className="bg-white dark:bg-slate-800 p-5 md:p-6 rounded-2xl border border-gray-200 dark:border-slate-700 shadow-sm flex flex-col gap-4">
            <div className="flex justify-between items-center border-b border-gray-200 dark:border-slate-700 pb-3">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-yellow-50 dark:bg-yellow-900/20 text-yellow-600 dark:text-yellow-500 rounded-xl"><Users size={20} /></div>
                <div>
                  <h2 className="text-base font-bold text-gray-900 dark:text-white">إدارة الحسابات</h2>
                  <div className="text-xs text-gray-500 dark:text-gray-400 font-bold">الموافقة وإدارة الصلاحيات والتفعيل</div>
                </div>
              </div>
              <span className="text-xs font-bold text-gray-400 bg-gray-100 dark:bg-slate-700 px-2.5 py-1 rounded-lg">{st.users.length} مستخدم</span>
            </div>

            <div className="flex flex-col gap-3 max-h-[600px] overflow-y-auto pr-1">
              {st.loading ? (
                <div className="flex items-center justify-center p-8 text-gray-400">
                  <Loader2 size={24} className="animate-spin" />
                </div>
              ) : st.users.length ? (
                st.users.map((u) => <UserCard key={u.id || u.username} user={u} st={st} />)
              ) : (
                <div className="flex flex-col items-center justify-center p-8 text-gray-500 dark:text-gray-400 border border-dashed border-gray-200 dark:border-slate-700 rounded-xl">
                  <Users size={32} className="mb-2 opacity-30" />
                  <span className="text-sm font-bold">لا يوجد مستخدمون</span>
                </div>
              )}
            </div>
          </div>

          {/* ── Quick Links ── */}
          <div className="grid grid-cols-2 gap-4">
            <button type="button"
              className="flex flex-col p-5 items-center justify-center gap-3 bg-gray-50 dark:bg-slate-900 border border-gray-200 dark:border-slate-700 hover:border-indigo-300 dark:hover:border-indigo-700 text-gray-900 dark:text-white rounded-2xl font-bold transition-all group"
              onClick={() => nav('/wa-templates')}>
              <div className="p-3 rounded-full bg-[#25d366]/10 text-[#25d366] group-hover:scale-110 transition-transform"><Smartphone size={24} /></div>
              <span className="text-xs text-center">تصميم رسائل القوالب</span>
            </button>
            <button type="button"
              className="flex flex-col p-5 items-center justify-center gap-3 bg-gray-50 dark:bg-slate-900 border border-gray-200 dark:border-slate-700 hover:border-indigo-300 dark:hover:border-indigo-700 text-gray-900 dark:text-white rounded-2xl font-bold transition-all group"
              onClick={() => nav('/invoice-template')}>
              <div className="p-3 rounded-full bg-blue-500/10 text-blue-500 group-hover:scale-110 transition-transform"><FileText size={24} /></div>
              <span className="text-xs text-center">تعديل مظهر الفواتير</span>
            </button>
          </div>

          {/* ── System Info ── */}
          <div className="bg-gray-50 dark:bg-slate-900 p-4 rounded-xl border border-gray-200 dark:border-slate-700 text-[10px] text-gray-400 font-mono space-y-1">
            <div>Backend: Railway — shippeco-backend-production</div>
            <div>Worker: Paymob KSA — silent-paper-fd08</div>
            <div>Sync: Cron كل 15 دقيقة {st.syncInfo?.cron_enabled ? '✅' : '❌'}</div>
          </div>
        </div>
      </div>
    </div>
  );
}