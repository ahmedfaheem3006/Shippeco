// ═══════════════════════════════════════════════════════════
// src/pages/InvoiceTemplatePage.tsx — FINAL (all TS errors fixed)
// ═══════════════════════════════════════════════════════════
import { useEffect, useId } from 'react'
import { useInvoiceTemplatePage } from '../hooks/useInvoiceTemplatePage'
import {
  formatCurrency,
  toEnglishDigits,
  getPaymentStatusLabel,
  TEMPLATE_STYLES,
  getTemplateStyle,
} from '../utils/invoiceTemplate'
import { downloadInvoicePDF, shareInvoiceWhatsApp } from '../utils/pdfGenerator'
import {
  Building2, Image as ImageIcon, FileText, Eye, Save, UploadCloud,
  Trash2, RotateCcw, RefreshCw, Search, CheckCircle2, AlertCircle,
  MapPin, Phone, Mail, Hash, CreditCard,
  Globe, Sparkles, X, Download, MessageCircle,
  Palette, Check, Loader2,
} from 'lucide-react'

function safe(val: any): string {
  if (val === undefined || val === null) return ''
  return toEnglishDigits(val)
}

function StatusBadge({ status }: { status: string }) {
  const s = getPaymentStatusLabel({ status } as any)
  return (
    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full border whitespace-nowrap"
      style={{ color: s.color, background: s.bg, borderColor: s.border }}>
      {s.label}
    </span>
  )
}

function fmtDate(raw: any): string {
  if (!raw) return ''
  try {
    const d = new Date(raw)
    if (isNaN(d.getTime())) return safe(String(raw).slice(0, 10))
    return `${safe(String(d.getDate()).padStart(2, '0'))}/${safe(String(d.getMonth() + 1).padStart(2, '0'))}/${safe(String(d.getFullYear()))}`
  } catch { return safe(String(raw).slice(0, 10)) }
}

function buildDesc(inv: Record<string, any>): string {
  const p: string[] = []
  if (inv.awb) p.push('رقم البوليصة:' + safe(inv.awb))
  if (inv.invoice_number) p.push('رقم الفاتورة:' + safe(inv.invoice_number))
  if (inv.weight) p.push('الوزن: ' + safe(inv.weight) + ' كيلو')
  if (inv.dimensions) p.push('أبعاد الشحنة: ' + safe(inv.dimensions))
  if (inv.final_weight) p.push('الوزن النهائي: ' + safe(inv.final_weight) + ' كيلو')
  return p.join('\n')
}

function PreviewHeader({ tmpl, themeKey }: { tmpl: any; accentColor: string; themeKey: string }) {
  const t = tmpl.template

  if (themeKey === 'modern') {
    return (
      <>
        <div className="h-2 w-full" style={{ background: 'linear-gradient(to right, #4f46e5, #7c3aed)' }} />
        <div className="flex justify-between items-start p-5 sm:p-7 border-b-2" style={{ borderColor: '#e0e7ff' }}>
          <div>
            <h2 className="text-2xl sm:text-3xl font-black" style={{ background: 'linear-gradient(to right, #4f46e5, #7c3aed)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>فاتورة</h2>
            <div className="text-[11px] font-bold tracking-widest uppercase" style={{ color: '#6366f1', fontFamily: "'Segoe UI', sans-serif" }}>INVOICE</div>
          </div>
          <div className="text-left flex flex-col items-end gap-1">
            {t.logoDataUrl ? <img src={t.logoDataUrl} alt="Logo" className="h-14 sm:h-16 object-contain" /> : null}
            <div className="text-[10px] sm:text-[11px] text-gray-600 text-right leading-relaxed mt-1">
              <div className="font-bold text-xs" style={{ color: '#4f46e5' }}>{t.companyAr || 'شيب بيك'}</div>
              {t.phone && <div dir="ltr" className="text-left">{safe(t.phone)}</div>}
              {t.email && <div style={{ color: '#6366f1' }}>{t.email}</div>}
            </div>
          </div>
        </div>
      </>
    )
  }

  if (themeKey === 'minimal') {
    return (
      <>
        <div className="h-[3px] w-full" style={{ background: '#111827' }} />
        <div className="flex justify-between items-center p-5 sm:p-7 border-b border-gray-200">
          <div className="text-2xl font-black" style={{ color: '#111827', letterSpacing: '-0.5px' }}>فاتورة</div>
          <div className="text-left text-[11px] text-gray-500 leading-relaxed">
            <div className="font-bold text-gray-900">{t.companyAr || ''}</div>
            {t.phone && <div dir="ltr" className="text-left">{safe(t.phone)}</div>}
            {t.email && <div>{t.email}</div>}
          </div>
        </div>
      </>
    )
  }

  if (themeKey === 'classic') {
    return (
      <>
        <div className="h-1.5 w-full" style={{ background: '#1e293b' }} />
        <div className="flex justify-between items-start p-5 sm:p-7" style={{ borderBottom: '3px solid #1e293b' }}>
          <div>
            <h2 className="text-2xl sm:text-3xl font-black" style={{ color: '#1e293b' }}>فاتورة</h2>
            <div className="text-xs text-slate-500 font-semibold" style={{ fontFamily: "'Segoe UI', sans-serif" }}>{t.companyEn || ''}</div>
          </div>
          <div className="text-left flex flex-col items-end gap-1">
            {t.logoDataUrl ? <img src={t.logoDataUrl} alt="Logo" className="h-14 sm:h-16 object-contain" /> : null}
            <div className="text-[10px] sm:text-[11px] text-gray-600 text-right leading-relaxed mt-1">
              <div className="font-bold text-xs" style={{ color: '#1e293b' }}>{t.companyAr || ''}</div>
              {t.vat && <div dir="ltr" className="text-left text-slate-500"><span className="text-slate-400">VAT:</span> {safe(t.vat)}</div>}
              {t.cr && <div dir="ltr" className="text-left text-slate-500"><span className="text-slate-400">CR:</span> {safe(t.cr)}</div>}
              {t.phone && <div dir="ltr" className="text-left">{safe(t.phone)}</div>}
              {t.email && <div style={{ color: '#1e293b' }}>{t.email}</div>}
            </div>
          </div>
        </div>
      </>
    )
  }

  return (
    <>
      <div className="h-1.5 bg-blue-600 w-full" />
      <div className="flex justify-between items-start p-5 sm:p-7 border-b-2 border-gray-200">
        <div><h2 className="text-2xl sm:text-3xl font-black text-gray-900">فاتورة</h2></div>
        <div className="text-left flex flex-col items-end gap-1">
          {t.logoDataUrl ? (
            <img src={t.logoDataUrl} alt="Logo" className="h-14 sm:h-16 object-contain" />
          ) : (
            <div className="text-xl sm:text-2xl font-black tracking-wide" style={{ fontFamily: "'Segoe UI', sans-serif" }}>
              <span className="text-blue-600">SHi</span>PP<span className="text-amber-500">E</span>C
            </div>
          )}
          <div className="text-[10px] sm:text-[11px] text-gray-600 text-right leading-relaxed mt-1">
            <div className="font-bold text-gray-900 text-xs">{t.companyAr || 'شيب بيك'}</div>
            {t.cr && <div>س.ج {safe(t.cr)}</div>}
            {t.address && <div>{t.address}</div>}
            {t.phone && <div dir="ltr" className="text-left">{safe(t.phone)}</div>}
            {t.email && <div className="text-blue-600">{t.email}</div>}
          </div>
        </div>
      </div>
    </>
  )
}

// ═══════════════════════════════════════════════════
// A4 PREVIEW — extracted as its own component to fix null checks
// ═══════════════════════════════════════════════════
function InvoicePreview({
  inv,
  items,
  total,
  tmpl,
  accentColor,
  themeKey,
}: {
  inv: Record<string, any>
  items: Array<{ type: string; details?: string; price: number }>
  total: number
  tmpl: any
  accentColor: string
  themeKey: string
}) {
  const paid = parseFloat(String(inv.paid_amount || inv.partialPaid || 0)) || 0
  const remaining = total - paid

  return (
    <div className="bg-white rounded-sm shadow-md text-black mx-auto font-cairo" style={{ width: '100%', maxWidth: '794px', minHeight: '900px' }}>

      <PreviewHeader tmpl={tmpl} accentColor={accentColor} themeKey={themeKey} />

      {/* Bill To + Meta */}
      <div className="flex justify-between items-start p-5 sm:p-7 gap-4">
        <div className="flex-1">
          <div className="font-extrabold text-sm text-gray-900 mb-1">فاتورة إلى:</div>
          <div className="font-bold text-sm text-gray-800">{inv.receiver || inv.client || '—'}</div>
          {(inv.receiver_phone || inv.phone) && (
            <div className="text-xs text-gray-600" dir="ltr" style={{ textAlign: 'right' }}>
              {safe(inv.receiver_phone || inv.phone)}
            </div>
          )}
          {inv.receiver_address && <div className="text-xs text-gray-600">{inv.receiver_address}</div>}
          {inv.receiver_country && <div className="text-xs text-gray-600">{inv.receiver_country}</div>}
        </div>
        <div className="text-left text-xs min-w-[200px]">
          <table className="w-full">
            <tbody>
              <tr>
                <td className="py-1 pr-3 font-bold text-gray-600 text-right whitespace-nowrap">رقم الفاتورة</td>
                <td className="py-1 font-extrabold text-gray-900 text-left font-inter" dir="ltr">{safe(inv.invoice_number || inv.id)}</td>
              </tr>
              <tr>
                <td className="py-1 pr-3 font-bold text-gray-600 text-right whitespace-nowrap">تاريخ الفاتورة</td>
                <td className="py-1 font-extrabold text-gray-900 text-left font-inter" dir="ltr">{fmtDate(inv.date)}</td>
              </tr>
              {inv.awb && (
                <tr>
                  <td className="py-1 pr-3 font-bold text-gray-600 text-right whitespace-nowrap">رقم بوليصة الشحن</td>
                  <td className="py-1 font-extrabold text-gray-900 text-left font-inter" dir="ltr">{safe(inv.awb)}</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Items Table */}
      <div className="px-5 sm:px-7">
        <table className="w-full border-collapse border border-gray-300 text-xs sm:text-sm">
          <thead>
            <tr style={{ background: accentColor + '12' }}>
              <th className="border border-gray-300 px-2 py-2 text-right font-extrabold" style={{ color: accentColor }}>البند</th>
              <th className="border border-gray-300 px-2 py-2 text-right font-extrabold" style={{ color: accentColor }}>الوصف</th>
              <th className="border border-gray-300 px-2 py-2 text-center font-extrabold w-16" style={{ color: accentColor }}>الكمية</th>
              <th className="border border-gray-300 px-2 py-2 text-center font-extrabold w-24" style={{ color: accentColor }}>سعر الوحدة</th>
              <th className="border border-gray-300 px-2 py-2 text-center font-extrabold w-24" style={{ color: accentColor }}>الإجمالي</th>
            </tr>
          </thead>
          <tbody>
            {items.map((it, idx) => (
              <tr key={idx}>
                <td className="border border-gray-300 px-2 py-2.5 font-bold text-gray-800 align-top" style={{ width: '18%' }}>{it.type}</td>
                <td className="border border-gray-300 px-2 py-2.5 text-gray-700 align-top whitespace-pre-line leading-relaxed" style={{ width: '40%' }}>{buildDesc(inv) || it.details || ''}</td>
                <td className="border border-gray-300 px-2 py-2.5 text-center" style={{ width: '10%' }}>1</td>
                <td className="border border-gray-300 px-2 py-2.5 text-center font-inter font-bold" dir="ltr" style={{ width: '16%' }}>{formatCurrency(it.price)}</td>
                <td className="border border-gray-300 px-2 py-2.5 text-center font-inter font-bold" dir="ltr" style={{ width: '16%' }}>{formatCurrency(it.price)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr style={{ background: accentColor + '08' }}>
              <td colSpan={4} className="border border-gray-300 px-2 py-2 text-left font-extrabold text-gray-800">الإجمالي</td>
              <td className="border border-gray-300 px-2 py-2 text-center font-black font-inter" dir="ltr">{formatCurrency(total)}</td>
            </tr>
          </tfoot>
        </table>
      </div>

      {/* Summary */}
      <div className="px-5 sm:px-7 py-4">
        <table className="min-w-[250px]">
          <tbody>
            <tr>
              <td className="py-1.5 pl-4 font-extrabold text-gray-800 text-sm border-b border-gray-200" style={{ background: '#fef3c7' }}>الإجمالي</td>
              <td className="py-1.5 pr-4 font-black text-gray-900 text-sm text-left font-inter border-b border-gray-200 min-w-[120px]" dir="ltr" style={{ background: '#fef3c7' }}>
                {formatCurrency(total)} <span className="font-cairo text-xs">﷼</span>
              </td>
            </tr>
            <tr>
              <td className="py-1.5 pl-4 font-extrabold text-gray-700 text-sm border-b border-gray-200">مدفوع</td>
              <td className="py-1.5 pr-4 font-bold text-gray-700 text-sm text-left font-inter border-b border-gray-200" dir="ltr">
                {formatCurrency(paid)} <span className="font-cairo text-xs">﷼</span>
              </td>
            </tr>
            <tr>
              <td className="py-1.5 pl-4 font-black text-red-700 text-sm border-b-2 border-red-400" style={{ background: '#fee2e2' }}>الرصيد المستحق</td>
              <td className="py-1.5 pr-4 font-black text-red-700 text-sm text-left font-inter border-b-2 border-red-400" dir="ltr" style={{ background: '#fee2e2' }}>
                {formatCurrency(remaining > 0 ? remaining : 0)} <span className="font-cairo text-xs">﷼</span>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* Total Bar */}
      <div className="px-5 sm:px-7">
        <div className="w-full sm:w-1/2 mr-auto text-white rounded-lg p-3 sm:p-4 flex justify-between items-center" style={{ background: accentColor }}>
          <span className="font-bold text-xs sm:text-sm">الإجمالي</span>
          <div className="font-inter font-black text-lg sm:text-xl">
            {formatCurrency(total)}
            <span className="text-[10px] sm:text-sm font-cairo font-normal opacity-80 mr-1">SAR</span>
          </div>
        </div>
      </div>

      {/* Thank You + Terms */}
      <div className="px-5 sm:px-7 py-4">
        <div className="text-center font-extrabold text-sm text-gray-900 mb-3">شكراً لثقتكم ونتمنى لكم يوماً سعيداً!</div>
        <p className="text-[10px] sm:text-[11px] text-gray-500 text-center leading-relaxed mb-4 px-4">
          {tmpl.template.companyAr || 'شيب بيك'} تقدم الخدمات اللوجستية ومتخصصة بالشحن الجوي لجميع دول العالم بجودة عالية وأسعار تنافسية، أيضاً متخصصون بشحن المواد الخطرة والسائلة، وتقديم خدمات التوزيع للمتاجر، وخدمات إدارة المتاجر الإلكترونية.
          {tmpl.template.phone && (
            <span className="block mt-1">للتواصل: <span dir="ltr" className="font-inter">{safe(tmpl.template.phone)}</span></span>
          )}
        </p>
        <div className="border-t border-gray-200 pt-3">
          <div className="font-extrabold text-xs text-gray-900 mb-1">الشروط والأحكام:</div>
          <p className="text-[10px] text-gray-600 mb-1 leading-relaxed">
            طلبكم لخدمات &quot;{tmpl.template.companyAr || 'شيب بيك'}&quot; توافق باعتباركم &quot;الشاحن&quot;، نيابة عن نفسكم ونيابة عن مستلم الشحنة &quot;المستلم&quot;، وأي شخص آخر ذي صلة في الشحنة أن تطبق هذه الشروط والأحكام:
          </p>
          <ol className="text-[9px] sm:text-[10px] text-gray-500 leading-relaxed list-decimal pr-4 space-y-0.5">
            <li>أن تكون جميع المعلومات المقدمة من قبل الشاحن أو ممثله تامه ودقيقة.</li>
            <li>أن لا تكون الشحنة من البضائع التي تحتوي على المواد الغير مقبولة مثل: سلع مقلدة وحيوانات وسبائك وعملات وأحجار كريمة وأسلحة ومتفجرات وذخيرة، وأيضاً مواد غير قانونية مثل المخدرات وغيرها من المواد المحظورة.</li>
            <li>في حال تأكيد وزن فعلي أو حجمي للقطعة الواحدة يجوز إعادة وزن أي قطعة وإعادة قياسها من قبل شيب بيك للتأكيد على صحة الحساب ويلتزم المستلم أو الشاحن بدفع إعادة الفارق في الوزن أو الرسوم الإضافية في حال وجود فرق في الوزن عن الوزن المقدم من الشاحن.</li>
          </ol>
        </div>
      </div>

      {/* Footer */}
      <div className="flex flex-wrap justify-center items-center gap-2 sm:gap-4 text-[8px] sm:text-xs font-semibold text-slate-400 px-5 sm:px-7 pb-5 font-inter pt-4 border-t border-slate-100">
        {tmpl.template.address && <span>{tmpl.template.address}</span>}
        {tmpl.template.address && tmpl.template.phone && <span className="w-1 h-1 rounded-full bg-slate-300 hidden sm:block" />}
        {tmpl.template.phone && <span dir="ltr">{safe(tmpl.template.phone)}</span>}
        {tmpl.template.phone && tmpl.template.email && <span className="w-1 h-1 rounded-full bg-slate-300 hidden sm:block" />}
        {tmpl.template.email && <span dir="ltr">{tmpl.template.email}</span>}
      </div>
    </div>
  )
}

// ═══════════════════════════════════════════════════
// MAIN PAGE COMPONENT
// ═══════════════════════════════════════════════════
export function InvoiceTemplatePage() {
  const tmpl = useInvoiceTemplatePage()
  const fileId = useId()

  useEffect(() => {
    void tmpl.refresh()
    void tmpl.loadInvoices()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const activeStyle = getTemplateStyle(tmpl.template.templateStyle)
  const accentColor = activeStyle.accentColor

  return (
    <div className="space-y-4 sm:space-y-6 animate-in fade-in duration-300 pb-24 lg:pb-0" dir="rtl">

      {/* ═══ Top Bar ═══ */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 sm:gap-4 bg-white dark:bg-slate-800 p-3 sm:p-4 rounded-2xl border border-gray-200 dark:border-slate-700 shadow-sm sticky top-0 sm:top-2 z-30">
        <div className="flex items-center gap-3 text-gray-900 dark:text-white">
          <div className="p-2 sm:p-2.5 bg-gradient-to-br from-blue-500/10 to-indigo-500/10 text-blue-600 dark:text-blue-400 rounded-xl border border-blue-500/20">
            <FileText size={20} />
          </div>
          <div>
            <h1 className="font-bold text-base sm:text-lg">قالب الفاتورة</h1>
            <p className="text-[10px] sm:text-xs text-gray-500 dark:text-gray-400 font-semibold hidden sm:block">إعدادات بيانات الشركة والمظهر العام للفواتير</p>
          </div>
        </div>
        <div className="flex items-center gap-2 w-full sm:w-auto">
          <button type="button" onClick={() => void tmpl.refresh()} disabled={tmpl.loading || tmpl.saving}
            className="flex-1 sm:flex-none flex justify-center items-center gap-2 bg-gray-100 dark:bg-slate-700 hover:bg-gray-200 dark:hover:bg-slate-600 text-gray-700 dark:text-gray-300 py-2 px-3 sm:px-4 rounded-xl font-bold text-xs sm:text-sm transition-all">
            <RefreshCw size={14} className={tmpl.loading ? 'animate-spin' : ''} />
            <span className="hidden sm:inline">تحميل</span>
          </button>
          <button type="button" onClick={() => void tmpl.save()} disabled={tmpl.loading || tmpl.saving}
            className="flex-1 sm:flex-none flex justify-center items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white py-2 px-4 sm:px-6 rounded-xl font-bold shadow-lg shadow-indigo-500/20 disabled:opacity-50 text-xs sm:text-sm transition-all">
            {tmpl.saving ? <RefreshCw size={16} className="animate-spin" /> : <Save size={16} />}
            حفظ التغييرات
          </button>
        </div>
      </div>

      {/* ═══ Messages ═══ */}
      {tmpl.error && (
        <div className="bg-red-50 dark:bg-red-900/20 flex items-center gap-2 border border-red-200 dark:border-red-800/30 text-red-600 dark:text-red-400 p-3 rounded-xl text-xs sm:text-sm font-bold">
          <AlertCircle size={16} /> {tmpl.error}
        </div>
      )}
      {tmpl.status && (
        <div className="bg-green-50 dark:bg-green-900/20 flex items-center gap-2 border border-green-200 dark:border-green-800/30 text-green-600 dark:text-green-400 p-3 rounded-xl text-xs sm:text-sm font-bold">
          <CheckCircle2 size={16} /> {tmpl.status}
        </div>
      )}

      {/* ═══ Main Layout ═══ */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 sm:gap-6 items-start">

        {/* ═══ LEFT: Settings ═══ */}
        <div className="flex flex-col gap-4 sm:gap-6">

          {/* Template Style */}
          <div className="bg-white dark:bg-slate-800 rounded-2xl border border-gray-200 dark:border-slate-700 shadow-sm overflow-hidden">
            <div className="flex items-center gap-2.5 p-4 sm:p-5 border-b border-gray-100 dark:border-slate-700 bg-gradient-to-l from-pink-50/50 dark:from-pink-950/20 to-transparent">
              <div className="p-2 bg-pink-100 dark:bg-pink-900/30 text-pink-600 dark:text-pink-400 rounded-lg"><Palette size={16} /></div>
              <h2 className="text-sm sm:text-base font-bold text-gray-900 dark:text-white">نمط القالب</h2>
            </div>
            <div className="p-4 sm:p-5 grid grid-cols-2 sm:grid-cols-4 gap-3">
              {TEMPLATE_STYLES.map((s) => {
                const isActive = tmpl.template.templateStyle === s.key
                return (
                  <button key={s.key} type="button" disabled={tmpl.saving}
                    onClick={() => tmpl.setTemplate((p: any) => ({ ...p, templateStyle: s.key }))}
                    className={`relative flex flex-col items-center gap-2 p-3 sm:p-4 rounded-xl border-2 transition-all ${isActive ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-900/20 ring-2 ring-indigo-500/20' : 'border-gray-200 dark:border-slate-700 hover:border-gray-300'}`}>
                    {isActive && <div className="absolute -top-2 -right-2 bg-indigo-600 text-white rounded-full p-0.5"><Check size={12} /></div>}
                    <div className="w-full h-16 rounded-lg overflow-hidden border border-gray-100 dark:border-slate-600" style={{ background: '#f8fafc' }}>
                      <div className="h-4 w-full" style={{ background: s.accentColor }} />
                      <div className="p-1.5 space-y-1">
                        <div className="h-1 w-3/4 rounded" style={{ background: s.accentColor, opacity: 0.3 }} />
                        <div className="h-1 w-1/2 rounded bg-gray-200" />
                      </div>
                    </div>
                    <div className="text-center">
                      <div className="text-xs font-bold text-gray-900 dark:text-white">{s.name}</div>
                      <div className="text-[9px] text-gray-500">{s.nameEn}</div>
                    </div>
                  </button>
                )
              })}
            </div>
          </div>

          {/* Company Data */}
          <div className="bg-white dark:bg-slate-800 rounded-2xl border border-gray-200 dark:border-slate-700 shadow-sm overflow-hidden">
            <div className="flex items-center gap-2.5 p-4 sm:p-5 border-b border-gray-100 dark:border-slate-700 bg-gradient-to-l from-indigo-50/50 dark:from-indigo-950/20 to-transparent">
              <div className="p-2 bg-indigo-100 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 rounded-lg"><Building2 size={16} /></div>
              <h2 className="text-sm sm:text-base font-bold text-gray-900 dark:text-white">بيانات الشركة</h2>
            </div>
            <div className="p-4 sm:p-5 grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
              {([
                { label: 'اسم الشركة (عربي)', key: 'companyAr', placeholder: 'شيب بيك', icon: Building2 },
                { label: 'اسم الشركة (إنجليزي)', key: 'companyEn', placeholder: 'SHIPPEC', icon: Globe, dir: 'ltr' as const },
                { label: 'الرقم الضريبي (VAT)', key: 'vat', placeholder: '300XXXXXXXXX003', icon: Hash, dir: 'ltr' as const },
                { label: 'الرقم التجاري (CR)', key: 'cr', placeholder: '2050174810', icon: CreditCard, dir: 'ltr' as const },
                { label: 'رقم الهاتف', key: 'phone', placeholder: '+966537366522', icon: Phone, dir: 'ltr' as const, inputMode: 'tel' as const },
                { label: 'البريد الإلكتروني', key: 'email', placeholder: 'info@shippec.com', icon: Mail, dir: 'ltr' as const, inputMode: 'email' as const },
              ]).map((f) => (
                <div key={f.key} className="flex flex-col gap-1.5">
                  <label className="text-[10px] sm:text-xs font-bold text-gray-500 dark:text-gray-400 flex items-center gap-1"><f.icon size={11} className="opacity-50" />{f.label}</label>
                  <input value={(tmpl.template as any)[f.key] || ''} onChange={(e) => tmpl.setTemplate((p: any) => ({ ...p, [f.key]: e.target.value }))}
                    placeholder={f.placeholder} dir={f.dir || 'rtl'} inputMode={f.inputMode} disabled={tmpl.saving}
                    className="w-full bg-gray-50 dark:bg-slate-900 border border-gray-200 dark:border-slate-700 rounded-xl px-3 sm:px-4 py-2.5 sm:py-3 text-xs sm:text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-500 transition-all disabled:opacity-50 placeholder:text-gray-400" />
                </div>
              ))}
              <div className="flex flex-col gap-1.5 sm:col-span-2">
                <label className="text-[10px] sm:text-xs font-bold text-gray-500 dark:text-gray-400 flex items-center gap-1"><MapPin size={11} className="opacity-50" />العنوان</label>
                <input value={tmpl.template.address} onChange={(e) => tmpl.setTemplate((p: any) => ({ ...p, address: e.target.value }))}
                  placeholder="حي الروضة 32256، الدمام" disabled={tmpl.saving}
                  className="w-full bg-gray-50 dark:bg-slate-900 border border-gray-200 dark:border-slate-700 rounded-xl px-3 sm:px-4 py-2.5 sm:py-3 text-xs sm:text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-500 transition-all disabled:opacity-50 placeholder:text-gray-400" />
              </div>
            </div>
          </div>

          {/* Logo */}
          <div className="bg-white dark:bg-slate-800 rounded-2xl border border-gray-200 dark:border-slate-700 shadow-sm overflow-hidden">
            <div className="flex items-center gap-2.5 p-4 sm:p-5 border-b border-gray-100 dark:border-slate-700 bg-gradient-to-l from-purple-50/50 dark:from-purple-950/20 to-transparent">
              <div className="p-2 bg-purple-100 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400 rounded-lg"><ImageIcon size={16} /></div>
              <h2 className="text-sm sm:text-base font-bold text-gray-900 dark:text-white">شعار الشركة</h2>
            </div>
            <div className="p-4 sm:p-5">
              <div className="flex flex-col sm:flex-row items-center gap-4 sm:gap-6">
                <div className="w-24 h-24 sm:w-28 sm:h-28 rounded-2xl bg-gray-50 dark:bg-slate-900 border-2 border-dashed border-gray-200 dark:border-slate-700 flex items-center justify-center overflow-hidden flex-shrink-0 relative group">
                  {tmpl.template.logoDataUrl ? (
                    <>
                      <img className="w-full h-full object-contain p-2" src={tmpl.template.logoDataUrl} alt="Logo" />
                      <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center rounded-2xl"><ImageIcon size={20} className="text-white" /></div>
                    </>
                  ) : (
                    <div className="flex flex-col items-center gap-1 text-gray-300 dark:text-slate-600"><Building2 size={28} /><span className="text-[9px] font-bold">لا يوجد شعار</span></div>
                  )}
                </div>
                <div className="flex-1 flex flex-col gap-2 text-center sm:text-right w-full">
                  <p className="text-[10px] sm:text-xs text-gray-500 dark:text-gray-400 font-bold">يُفضل PNG أو SVG بخلفية شفافة · الحد الأقصى 5 ميجابايت</p>
                  <div className="flex flex-wrap gap-2 justify-center sm:justify-start">
                    <label htmlFor={fileId} className="cursor-pointer inline-flex items-center gap-2 bg-indigo-50 dark:bg-indigo-900/20 hover:bg-indigo-100 border border-indigo-200 dark:border-indigo-800/30 text-indigo-600 dark:text-indigo-400 text-xs font-bold py-2 px-4 rounded-xl"><UploadCloud size={14} /> رفع صورة</label>
                    <input id={fileId} type="file" accept="image/*" className="hidden" disabled={tmpl.saving} onChange={(e) => { const f = e.target.files?.[0]; if (f) void tmpl.setLogoFile(f); e.target.value = '' }} />
                    {tmpl.template.logoDataUrl && (
                      <button type="button" onClick={() => tmpl.removeLogo()} disabled={tmpl.saving}
                        className="inline-flex items-center gap-2 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800/30 text-red-600 dark:text-red-400 text-xs font-bold py-2 px-4 rounded-xl hover:bg-red-100"><Trash2 size={14} /> إزالة</button>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Footer Note */}
          <div className="bg-white dark:bg-slate-800 rounded-2xl border border-gray-200 dark:border-slate-700 shadow-sm overflow-hidden">
            <div className="flex items-center gap-2.5 p-4 sm:p-5 border-b border-gray-100 dark:border-slate-700 bg-gradient-to-l from-amber-50/50 dark:from-amber-950/20 to-transparent">
              <div className="p-2 bg-amber-100 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400 rounded-lg"><Sparkles size={16} /></div>
              <h2 className="text-sm sm:text-base font-bold text-gray-900 dark:text-white">ملاحظة أسفل الفاتورة</h2>
            </div>
            <div className="p-4 sm:p-5 flex flex-col gap-3">
              <textarea rows={3} value={tmpl.template.note} onChange={(e) => tmpl.setTemplate((p: any) => ({ ...p, note: e.target.value }))}
                placeholder="شكراً لتعاملكم معنا..." disabled={tmpl.saving}
                className="w-full bg-gray-50 dark:bg-slate-900 border border-gray-200 dark:border-slate-700 rounded-xl px-3 sm:px-4 py-2.5 sm:py-3 text-xs sm:text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-500 transition-all disabled:opacity-50 resize-none placeholder:text-gray-400" />
              <button type="button" onClick={() => tmpl.restoreDefaults()} disabled={tmpl.saving}
                className="flex items-center gap-1.5 py-1.5 px-3 text-[10px] sm:text-xs font-bold text-gray-500 dark:text-gray-400 bg-gray-50 dark:bg-slate-900 hover:text-gray-900 rounded-lg border border-gray-200 dark:border-slate-700">
                <RotateCcw size={12} /> استعادة الافتراضي
              </button>
            </div>
          </div>
        </div>

        {/* ═══ RIGHT: Preview ═══ */}
        <div className="bg-white dark:bg-slate-800 rounded-2xl border border-gray-200 dark:border-slate-700 shadow-sm overflow-hidden xl:sticky xl:top-20 flex flex-col" style={{ maxHeight: 'calc(100vh - 6rem)' }}>

          {/* Preview Top Bar */}
          <div className="flex items-center justify-between p-4 sm:p-5 border-b border-gray-100 dark:border-slate-700 bg-gradient-to-l from-green-50/50 dark:from-green-950/20 to-transparent flex-shrink-0">
            <h2 className="text-sm sm:text-base font-bold text-gray-900 dark:text-white flex items-center gap-2"><Eye size={16} className="text-green-600 dark:text-green-400" />المعاينة الحية</h2>
            <div className="flex items-center gap-2">
              {tmpl.selectedInvoice && (
                <>
                  <button type="button" onClick={() => downloadInvoicePDF(tmpl.selectedInvoice!, tmpl.template)} className="flex items-center gap-1.5 bg-red-50 hover:bg-red-100 border border-red-200 text-red-600 text-[10px] sm:text-xs font-bold py-1.5 px-3 rounded-lg"><Download size={13} /><span className="hidden sm:inline">PDF</span></button>
                  <button type="button" onClick={() => void shareInvoiceWhatsApp(tmpl.selectedInvoice!, tmpl.template)} className="flex items-center gap-1.5 bg-green-50 hover:bg-green-100 border border-green-200 text-green-600 text-[10px] sm:text-xs font-bold py-1.5 px-3 rounded-lg"><MessageCircle size={13} /><span className="hidden sm:inline">واتساب</span></button>
                </>
              )}
              <span className="text-[9px] sm:text-xs bg-gray-100 dark:bg-slate-900 border border-gray-200 dark:border-slate-700 px-2 py-0.5 rounded-md text-gray-500 font-bold font-mono">A4</span>
            </div>
          </div>

          {/* Search + Dropdown */}
          <div className="p-3 sm:p-4 border-b border-gray-100 dark:border-slate-700 flex-shrink-0">
            <label className="text-[10px] sm:text-xs font-bold text-gray-500 dark:text-gray-400 flex items-center gap-1 mb-2">
              <Search size={11} /> اختر فاتورة لاختبار القالب
              {tmpl.invoicesLoading && <Loader2 size={11} className="animate-spin mr-1" />}
              <span className="text-gray-400 font-normal mr-1">({tmpl.allInvoices.length} فاتورة)</span>
            </label>
            <div className="relative">
              <Search size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input value={tmpl.invoiceQuery}
                onChange={(e) => { tmpl.setInvoiceQuery(e.target.value); tmpl.setSelectedInvoiceId(null) }}
                placeholder="ابحث بالاسم، رقم الفاتورة، AWB، الجوال..."
                disabled={tmpl.saving}
                className="w-full bg-gray-50 dark:bg-slate-900 border border-gray-200 dark:border-slate-700 rounded-xl px-3 sm:px-4 py-2 pr-9 sm:pr-10 text-xs sm:text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-500 placeholder:text-gray-400" />

              {!tmpl.selectedInvoice && (
                <div className="absolute top-[calc(100%+6px)] right-0 left-0 bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl shadow-xl max-h-[300px] overflow-y-auto z-20 divide-y divide-gray-100 dark:divide-slate-700/50">
                  {tmpl.filteredInvoices.length ? (
                    tmpl.filteredInvoices.map((inv: any) => (
                      <button key={String(inv.id)} type="button"
                        className="w-full text-right p-2.5 sm:p-3 hover:bg-gray-50 dark:hover:bg-slate-700/50 transition-colors flex items-center justify-between text-xs sm:text-sm"
                        onClick={() => {
                          tmpl.setSelectedInvoiceId(String(inv.id))
                          tmpl.setInvoiceQuery(`#${safe(inv.invoice_number || inv.id)} — ${inv.client}`)
                        }}>
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="font-mono text-[10px] text-gray-400">#{safe(inv.invoice_number || inv.id)}</span>
                          <span className="font-bold text-gray-900 dark:text-white truncate">{inv.client || '—'}</span>
                          <StatusBadge status={inv.status} />
                        </div>
                        <span className="font-mono font-bold text-indigo-600 text-xs flex-shrink-0 mr-2">{formatCurrency(inv.price)} SAR</span>
                      </button>
                    ))
                  ) : (
                    <div className="p-4 text-center text-gray-400 text-xs font-bold">
                      {tmpl.invoicesLoading ? 'جاري التحميل...' : 'لا توجد نتائج'}
                    </div>
                  )}
                </div>
              )}
            </div>

            {tmpl.selectedInvoice && (
              <div className="mt-2 space-y-2">
                <div className="flex items-center justify-between bg-indigo-50 dark:bg-indigo-900/20 border border-indigo-200 dark:border-indigo-800/30 rounded-lg px-3 py-2">
                  <div className="flex items-center gap-2 text-xs">
                    <span className="font-mono font-bold text-indigo-600">#{safe(tmpl.selectedInvoice.invoice_number || tmpl.selectedInvoice.id)}</span>
                    <span className="font-bold text-gray-700 dark:text-gray-300">{tmpl.selectedInvoice.client}</span>
                    <StatusBadge status={tmpl.selectedInvoice.status} />
                  </div>
                  <button type="button" onClick={() => { tmpl.setSelectedInvoiceId(null); tmpl.setInvoiceQuery('') }} className="text-gray-400 hover:text-red-500"><X size={14} /></button>
                </div>
                <div className="flex gap-2">
                  <button type="button" onClick={() => downloadInvoicePDF(tmpl.selectedInvoice!, tmpl.template)}
                    className="flex-1 flex items-center justify-center gap-2 bg-gradient-to-r from-red-500 to-red-600 hover:from-red-600 hover:to-red-700 text-white text-xs font-bold py-2.5 px-4 rounded-xl shadow-sm"><Download size={14} />تحميل PDF</button>
                  <button type="button" onClick={() => void shareInvoiceWhatsApp(tmpl.selectedInvoice!, tmpl.template)}
                    className="flex-1 flex items-center justify-center gap-2 bg-gradient-to-r from-green-500 to-green-600 hover:from-green-600 hover:to-green-700 text-white text-xs font-bold py-2.5 px-4 rounded-xl shadow-sm"><MessageCircle size={14} />إرسال واتساب</button>
                </div>
              </div>
            )}
          </div>

          {/* ═══ A4 Preview ═══ */}
          <div className="overflow-y-auto flex-1 p-2 sm:p-4 bg-gray-100/50 dark:bg-slate-900/50">
            {tmpl.preview ? (
              <InvoicePreview
                inv={tmpl.preview.inv}
                items={tmpl.preview.items}
                total={tmpl.preview.total}
                tmpl={tmpl}
                accentColor={accentColor}
                themeKey={activeStyle.key}
              />
            ) : (
              <div className="h-full min-h-[400px] flex flex-col items-center justify-center text-gray-400 dark:text-gray-500 py-20">
                <div className="p-4 bg-gray-100 dark:bg-slate-800 rounded-2xl mb-4">
                  <FileText size={36} className="opacity-40" />
                </div>
                <p className="font-bold text-xs sm:text-sm">اختر فاتورة لمعاينة القالب</p>
                <p className="text-[10px] text-gray-400 mt-1">ابحث أعلاه بالرقم أو اسم العميل</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}