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

/* ── Defaults ── */
export const defaultInvoiceTemplate: InvoiceTemplate = {
  companyAr: 'شيب بيك - مؤسسة نور . خ . م . آل دهشيم',
  companyEn: 'SHIPPEC',
  vat: '',
  cr: '2050174810',
  phone: '+966537366522',
  email: 'info@shippec.com',
  address: 'حي الروضة 32256، الدمام، المملكة العربية السعودية',
  note: 'شكراً لثقتكم ونتمنى لكم يوماً سعيداً!',
  logoDataUrl: undefined,
  templateStyle: 'shippec',
}

export function normalizeInvoiceTemplate(raw: any): InvoiceTemplate {
  if (!raw || typeof raw !== 'object') return { ...defaultInvoiceTemplate }
  return {
    companyAr: raw.companyAr || raw.company_name || defaultInvoiceTemplate.companyAr,
    companyEn: raw.companyEn || raw.company_name_en || defaultInvoiceTemplate.companyEn,
    vat: raw.vat || raw.tax_number || '',
    cr: raw.cr || raw.commercial_reg || defaultInvoiceTemplate.cr,
    phone: raw.phone || defaultInvoiceTemplate.phone,
    email: raw.email || defaultInvoiceTemplate.email,
    address: raw.address || defaultInvoiceTemplate.address,
    note: raw.note ?? raw.footer_text ?? defaultInvoiceTemplate.note,
    logoDataUrl: raw.logoDataUrl || raw.logo_url || undefined,
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
    for (const it of parsedItems) {
      items.push({
        type: it.description || it.type || it.name || 'فرق وزن أو أبعاد',
        details: it.details || it.notes || '',
        price: parseFloat(toEnglishDigits(it.price || it.amount || 0)) || 0,
      })
    }
  } else {
    items.push({
      type: inv.carrier ? 'فرق وزن أو أبعاد' : 'خدمة شحن',
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