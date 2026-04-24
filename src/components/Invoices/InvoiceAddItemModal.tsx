import { useMemo, useState } from 'react'
import type { Invoice, InvoiceItem } from '../../utils/models'
import { X, Save, PlusCircle, Tag, AlignLeft, Calculator } from 'lucide-react'

type Props = {
  open: boolean
  invoice: Invoice | null
  onClose: () => void
  onSave: (nextInvoice: Invoice) => void
  saving?: boolean
}

const ITEM_FIXED_PRICES: Record<string, number> = { 'تغيير عنوان': 56 }

function getInvItems(inv: Invoice): InvoiceItem[] {
  let items: unknown = inv.items
  if (typeof items === 'string') {
    try { items = JSON.parse(items) } catch { items = [] }
  }
  if (Array.isArray(items) && items.length) {
    return (items as any[]).map((it: any) => ({
      type: it.type || it.description || 'بند',
      details: it.details || it.description || '',
      price: Number(it.price || it.total || it.unit_price || 0),
    }))
  }
  return [{
    type: inv.itemType || 'شحن دولي',
    details: inv.details || '',
    price: Number(inv.price || 0),
  }]
}

export function InvoiceAddItemModal({ open, invoice, onClose, onSave, saving }: Props) {
  const [type, setType] = useState('تغيير عنوان')
  const [details, setDetails] = useState('')
  const [price, setPrice] = useState('56')

  const fixed = ITEM_FIXED_PRICES[type] !== undefined

  const itemsPreview = useMemo(() => {
    if (!invoice) return { items: [], total: 0 }
    const existing = getInvItems(invoice)
    const p = Number(price) || 0
    const all = [...existing, { type, details: details.trim() || undefined, price: p }]
    const total = all.reduce((s, it) => s + (Number(it.price) || 0), 0)
    return { items: all, total }
  }, [details, invoice, price, type])

  if (!open || !invoice) return null

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200" role="dialog" aria-modal="true" data-testid="invoice-add-item-modal">
      <div className="bg-gray-50 dark:bg-slate-900 w-full max-w-[500px] rounded-2xl shadow-xl flex flex-col overflow-hidden border border-gray-200 dark:border-slate-700">
        
        {/* Header */}
        <div className="flex items-center justify-between p-4 sm:p-5 border-b border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800">
          <div className="flex items-center gap-3">
             <div className="p-2.5 bg-indigo-50 dark:bg-indigo-900/20 text-indigo-600 dark:text-indigo-400 rounded-xl border border-indigo-100 dark:border-indigo-800/20 hidden sm:block">
               <PlusCircle size={24} />
             </div>
             <div>
                <h2 className="font-bold text-gray-900 dark:text-white text-base sm:text-lg">إضافة بند إضافي</h2>
                <div className="text-xs text-gray-500 dark:text-gray-400 font-bold mt-0.5">تسجيل تكلفة جديدة على الفاتورة #{invoice.id}</div>
             </div>
          </div>
          <button type="button" className="text-gray-500 dark:text-gray-400 bg-gray-50 dark:bg-slate-900 hover:bg-red-50 dark:bg-red-900/20 border border-gray-200 dark:border-slate-700 hover:border-red-200 dark:border-red-800/30 hover:text-red-600 dark:text-red-400 transition-colors p-2 rounded-xl" onClick={onClose} aria-label="Close" disabled={Boolean(saving)}>
            <X size={20} />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 p-4 sm:p-5 flex flex-col gap-5">
           
           <div className="flex flex-col gap-4">
              <div className="flex flex-col gap-1.5">
                 <label className="text-xs font-bold text-gray-500 dark:text-gray-400 flex items-center gap-1.5"><Tag size={14}/> تصنيف وبناء البند الجديد</label>
                 <select
                   className="w-full bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl px-4 py-3 text-sm font-bold text-gray-900 dark:text-white focus:ring-2 focus:ring-indigo-500/50 outline-none"
                   value={type}
                   disabled={Boolean(saving)}
                   onChange={(e) => {
                     const next = e.target.value
                     setType(next)
                     const fp = ITEM_FIXED_PRICES[next]
                     if (fp !== undefined) setPrice(String(fp))
                   }}
                 >
                   <option value="تغيير عنوان">رسوم تغيير عنوان التسليم</option>
                   <option value="فرق وزن">مطالبة وتحديث وزن زائد</option>
                   <option value="توصيل">أجور خدمات توصيل المشاوير</option>
                   <option value="شحن دولي">بوليصة شحن دولي</option>
                   <option value="شحن داخلي">بوليصة شحن داخلي</option>
                   <option value="أخرى">خدمات مخصصة أخرى</option>
                 </select>
              </div>

              <div className="flex flex-col gap-1.5">
                 <label className="text-xs font-bold text-gray-500 dark:text-gray-400 flex items-center gap-1.5"><AlignLeft size={14}/> تفاصيل وشرح البند (اختياري)</label>
                 <input
                   className="w-full bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl px-4 py-3 text-sm text-gray-900 dark:text-white focus:ring-2 focus:ring-indigo-500/50 outline-none"
                   value={details}
                   disabled={Boolean(saving)}
                   onChange={(e) => setDetails(e.target.value)}
                   placeholder="السبب أو التوضيح..."
                 />
              </div>

              <div className="flex flex-col gap-1.5">
                 <label className="text-xs font-bold text-gray-500 dark:text-gray-400 flex items-center gap-1.5"><Calculator size={14}/> التسعيرة المستحقة (ريال سعودي)</label>
                 <input
                   className={`w-full bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl px-4 py-3 text-lg font-mono font-bold focus:ring-2 focus:ring-indigo-500/50 outline-none ${fixed ? 'text-gray-500 dark:text-gray-400 bg-gray-50 dark:bg-slate-900/80' : 'text-yellow-600 dark:text-yellow-500'}`}
                   value={price}
                   disabled={Boolean(saving)}
                   onChange={(e) => setPrice(e.target.value)}
                   inputMode="decimal"
                   readOnly={fixed}
                   placeholder="0.00"
                 />
              </div>
           </div>

           <div className="bg-white dark:bg-slate-800 rounded-xl border border-gray-200 dark:border-slate-700 overflow-hidden mt-2">
              <div className="bg-gray-50 dark:bg-slate-700/50 px-3 py-2 border-b border-gray-200 dark:border-slate-700 text-xs font-bold text-gray-500 dark:text-gray-400">
                 معاينة شكل الفاتورة بعد الإضافة
              </div>
              <div className="flex flex-col">
                 {itemsPreview.items.map((it, idx) => {
                   const isNew = idx === itemsPreview.items.length - 1;
                   return (
                     <div key={`${it.type}-${idx}`} className={`p-3 border-b border-gray-200/50 dark:border-slate-700/50 last:border-b-0 flex items-center justify-between gap-4 ${isNew ? 'bg-indigo-50/50 dark:bg-indigo-900/10 animate-in fade-in' : ''}`}>
                       <div className="flex flex-col gap-0.5">
                         <span className="text-sm font-bold text-gray-900 dark:text-white">{it.type} {isNew && <span className="text-[10px] ml-1 bg-green text-white px-1.5 py-0.5 rounded uppercase">NEW</span>}</span>
                         {it.details && <span className="text-xs text-gray-500 dark:text-gray-400 truncate max-w-[200px]">{it.details}</span>}
                       </div>
                       <div className="font-mono font-bold text-gray-900 dark:text-white shrink-0">
                         {Number(it.price || 0).toFixed(2)}
                       </div>
                     </div>
                   )
                 })}
              </div>
              <div className="bg-yellow-50 dark:bg-yellow-900/20 px-3 py-3 border-t border-yellow-200 dark:border-yellow-800/20 flex items-center justify-between">
                 <span className="text-sm font-bold text-yellow-600 dark:text-yellow-500">الإجمالي المتوقع المُحدث</span>
                 <span className="font-mono font-black text-lg text-yellow-600 dark:text-yellow-500">
                   {itemsPreview.total.toFixed(2)} ر.س
                 </span>
              </div>
           </div>

        </div>

        {/* Footer */}
        <div className="p-4 border-t border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 flex items-center justify-end gap-3">
          <button type="button" className="px-5 py-2.5 text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:text-white text-sm font-bold rounded-xl hover:bg-gray-50 dark:bg-slate-900 transition-colors disabled:opacity-50" onClick={onClose} disabled={Boolean(saving)}>
            إلغاء التعديل
          </button>
          <button
            type="button"
            className="px-6 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white hover:bg-indigo-600 hover:bg-indigo-700 text-white/90 shadow-lg shadow-indigo-500/20 text-white text-sm font-bold rounded-xl flex items-center gap-2 transition-transform active:scale-95 disabled:opacity-50"
            data-testid="invoice-add-item-submit"
            disabled={Boolean(saving)}
            onClick={() => {
              const p = Number(price) || 0
              if (!p) return
              const nextItems = itemsPreview.items.map((it) => ({ ...it, price: Number(it.price) || 0 }))
              const nextTotal = nextItems.reduce((s, it) => s + (Number(it.price) || 0), 0)
              const next: Invoice = {
                ...invoice,
                items: nextItems,
                price: nextTotal,
              }
              onSave(next)
            }}
          >
            {saving ? <div className="w-4 h-4 rounded-full border-2 border-white/30 border-t-white animate-spin"></div> : <Save size={16} />}
            ادراج وتثبيت البند
          </button>
        </div>

      </div>
    </div>
  )
}
