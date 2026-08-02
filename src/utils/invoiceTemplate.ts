// ═══════════════════════════════════════════════════════════
// src/utils/invoiceTemplate.ts — UPDATED
// ═══════════════════════════════════════════════════════════
import type { Invoice, InvoiceTemplate } from './models'

/* ── Convert Arabic/Hindi digits to English ── */
export function toEnglishDigits(str: string | number): string {
  return String(str)
    .replace(/[\u0660-\u0669]/g, (c) => String(c.charCodeAt(0) - 0x0660))
    .replace(/[\u06F0-\u06F9]/g, (c) => String(c.charCodeAt(0) - 0x06F0))
}

/* ── Format currency with English digits ── */
export function formatCurrency(v: any): string {
  const n = parseFloat(toEnglishDigits(v)) || 0
  return n.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
}

export function formatCurrencyWithSAR(v: any): string {
  return formatCurrency(v) + ' SAR'
}

export function formatCurrencyWithRiyal(v: any): string {
  return formatCurrency(v) + ' ﷼'
}

/* ── Payment Status ── */
export function getPaymentStatusLabel(inv: { status?: string; payment_status?: number }) {
  const ps = inv.payment_status ?? inv.status
  const n = Number(ps)
  if (n === 2 || ps === 'paid')
    return { label: 'مدفوع', color: '#16a34a', bg: '#f0fdf4', border: '#bbf7d0' }
  if (n === 1 || ps === 'partial')
    return { label: 'جزئي', color: '#d97706', bg: '#fffbeb', border: '#fde68a' }
  if (n === 3 || ps === 'returned')
    return { label: 'مرتجع', color: '#dc2626', bg: '#fef2f2', border: '#fecaca' }
  return { label: 'غير مدفوع', color: '#6b7280', bg: '#f9fafb', border: '#e5e7eb' }
}

import { SHIPPEC_LOGO_BASE64 } from './shippecLogoBase64'

/* ── Defaults ── */
export const defaultInvoiceTemplate: InvoiceTemplate = {
  companyAr: 'شيب بيك - مؤسسة نور. خ. م. آل دهنيم',
  companyEn: 'SHIPPEC',
  vat: '',
  cr: '2050174810',
  phone: '+966537366522',
  email: 'info@shippec.com',
  address: 'الدمام - EDMA7540 - حي الروضة شارع الأمير متعب ابن عبدالعزيز',
  note: `(يجب عليك قراءة هذه الشروط بعناية قبل الموافقة على الالتزام بها ويجب عليك تحديد ما إذا كانت خدمات شيب بيك متوافقة مع ظروفك)
هام: حال تعذر تحصيل المبالغ منك من خلال الدفع الإلكتروني أو تحويل بنكي أو الدفع نقداً فإنك تمنح بموجبه الإذن لمؤسسة نور خالد آل دهنيم للخدمات اللوجستية بالترافع قضائياً للجهات المعنية

رقم الآيبان: SA4705000068204783026000
البنك: مصرف الإنماء
الاسم التجاري: مؤسسة نور خالد مكي آل دهنيم للخدمات اللوجستية`,
  logoDataUrl: SHIPPEC_LOGO_BASE64,
  templateStyle: 'shippec',
}

export function normalizeInvoiceTemplate(raw: any): InvoiceTemplate {
  if (!raw || typeof raw !== 'object') return { ...defaultInvoiceTemplate }
  
  const str = (v: any, fallback: string) => {
    if (v === undefined || v === null || String(v).trim() === '') return fallback
    return String(v)
  }

  return {
    companyAr: str(raw.companyAr || raw.company_name, defaultInvoiceTemplate.companyAr),
    companyEn: str(raw.companyEn || raw.company_name_en, defaultInvoiceTemplate.companyEn),
    vat: str(raw.vat || raw.tax_number, ''),
    cr: str(raw.cr || raw.commercial_reg, defaultInvoiceTemplate.cr),
    phone: str(raw.phone, defaultInvoiceTemplate.phone),
    email: str(raw.email, defaultInvoiceTemplate.email),
    address: str(raw.address, defaultInvoiceTemplate.address),
    note: str(raw.note || raw.footer_text, defaultInvoiceTemplate.note),
    logoDataUrl: raw.logoDataUrl || raw.logo_url || SHIPPEC_LOGO_BASE64,
    templateStyle: raw.templateStyle || 'shippec',
  }
}

/* ── Compute invoice total ── */
export interface InvoiceLineItem {
  type: string
  details?: string
  price: number
}

export function computeInvoiceTotal(inv: Invoice): {
  items: InvoiceLineItem[]
  total: number
} {
  const items: InvoiceLineItem[] = []
  const price = parseFloat(toEnglishDigits(inv.price)) || 0

  let parsedItems: any[] = []
  if (inv.items) {
    if (typeof inv.items === 'string') {
      try { parsedItems = JSON.parse(inv.items) } catch {}
    } else if (Array.isArray(inv.items)) {
      parsedItems = inv.items
    }
  }

  if (parsedItems.length > 0) {
    let sum = 0
    for (const it of parsedItems) {
      const itPrice = parseFloat(toEnglishDigits(it.price || it.amount || it.total || it.unit_price || 0)) || 0
      sum += itPrice
      
      // Split description if it contains " - " and details is missing
      const desc = it.type || it.description || 'بند'
      let t = desc
      let d = it.details || ''
      if (!it.details && desc.includes(' - ')) {
        const parts = desc.split(' - ')
        t = parts[0]
        d = parts.slice(1).join(' - ')
      }

      items.push({
        type: t,
        details: d,
        price: itPrice,
      })
    }
    // If the sum of items is less than the invoice total/price, prepend the base shipping charge
    const diff = price - sum
    if (diff > 0.1) {
      items.unshift({
        type: inv.itemType || (inv as any).shipping_type || (inv.carrier ? 'شحن دولي' : 'خدمة شحن'),
        details: '',
        price: diff,
      })
    }
  } else {
    items.push({
      type: inv.itemType || (inv as any).shipping_type || (inv.carrier ? 'شحن دولي' : 'خدمة شحن'),
      details: '',
      price,
    })
  }

  const total = items.reduce((s, i) => s + i.price, 0) || price
  return { items, total }
}

/* ── Template Styles ── */
export type TemplateStyleKey = 'shippec' | 'classic' | 'modern' | 'minimal'

export interface TemplateStyleConfig {
  key: TemplateStyleKey
  name: string
  nameEn: string
  description: string
  accentColor: string
}

export const TEMPLATE_STYLES: TemplateStyleConfig[] = [
  {
    key: 'shippec',
    name: 'شيب بيك',
    nameEn: 'Shippec',
    description: 'القالب الأصلي',
    accentColor: '#2563eb',
  },
  {
    key: 'classic',
    name: 'كلاسيكي',
    nameEn: 'Classic',
    description: 'تصميم تقليدي',
    accentColor: '#1e293b',
  },
  {
    key: 'modern',
    name: 'عصري',
    nameEn: 'Modern',
    description: 'تصميم حديث',
    accentColor: '#4f46e5',
  },
  {
    key: 'minimal',
    name: 'بسيط',
    nameEn: 'Minimal',
    description: 'نظيف ومبسط',
    accentColor: '#111827',
  },
]

export function getTemplateStyle(key?: string): TemplateStyleConfig {
  return TEMPLATE_STYLES.find((s) => s.key === key) || TEMPLATE_STYLES[0]
}