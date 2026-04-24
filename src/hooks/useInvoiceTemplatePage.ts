// ═══════════════════════════════════════════════════════════
// src/hooks/useInvoiceTemplatePage.ts — FINAL FIX
// ═══════════════════════════════════════════════════════════
import { useCallback, useMemo, useState, useRef, useEffect } from 'react'
import type { Invoice, InvoiceTemplate, InvoiceStatus } from '../utils/models'
import {
  defaultInvoiceTemplate,
  computeInvoiceTotal,
  normalizeInvoiceTemplate,
} from '../utils/invoiceTemplate'
import { useSettingsStore } from './useSettingsStore'
import { useAuthStore } from './useAuthStore'

const API =
  import.meta.env.VITE_API_URL ||
  'https://shippeco-backend-production.up.railway.app/api'

function getAuthHeader(): Record<string, string> {
  const token = useAuthStore.getState().token
  return token
    ? { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' }
    : { 'Content-Type': 'application/json' }
}

async function apiFetch<T = any>(endpoint: string, opts?: RequestInit): Promise<T> {
  const res = await fetch(API + endpoint, {
    ...opts,
    headers: { ...getAuthHeader(), ...(opts?.headers || {}) },
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({ message: res.statusText }))
    throw new Error(err?.error?.message || err?.message || 'Request failed')
  }
  return res.json()
}

function mapStatus(ps: any, fallback?: string): InvoiceStatus {
  const n = Number(ps)
  if (n === 0) return 'unpaid'
  if (n === 1) return 'partial'
  if (n === 2) return 'paid'
  if (n === 3) return 'returned'
  if (fallback === 'paid') return 'paid'
  if (fallback === 'partial') return 'partial'
  if (fallback === 'returned') return 'returned'
  return 'unpaid'
}

function mapInvoice(inv: any): Invoice {
  const invStatus: InvoiceStatus = mapStatus(inv.payment_status, inv.status)
  return {
    id: String(inv.id || ''),
    invoice_number: String(inv.invoice_number || inv.daftra_id || inv.id || ''),
    client:
      inv.client_name || inv.client || inv.customer_name || inv.receiver || '',
    phone: String(inv.phone || inv.client_phone || inv.receiver_phone || ''),
    awb: String(inv.awb || ''),
    carrier: String(inv.carrier || 'DHL'),
    date: String(inv.invoice_date || inv.date || inv.created_at || ''),
    price: parseFloat(String(inv.total || inv.price || 0)) || 0,
    total: parseFloat(String(inv.total || inv.price || 0)) || 0,
    status: invStatus,
    daftra_id: inv.daftra_id ? String(inv.daftra_id) : undefined,
    paid_amount:
      parseFloat(String(inv.paid_amount || inv.partial_paid || 0)) || 0,
    partialPaid:
      parseFloat(String(inv.paid_amount || inv.partial_paid || 0)) || 0,
    remaining: parseFloat(String(inv.remaining || 0)) || 0,
    details: String(inv.details || ''),
    sender: String(inv.sender || ''),
    receiver: String(inv.receiver || inv.receiver_name || ''),
    sender_phone: String(inv.sender_phone || ''),
    receiver_phone: String(inv.receiver_phone || ''),
    sender_address: String(inv.sender_address || ''),
    receiver_address: String(inv.receiver_address || ''),
    receiver_country: String(inv.receiver_country || ''),
    weight: String(inv.weight || inv.final_weight || ''),
    final_weight: String(inv.final_weight || ''),
    dimensions: String(inv.dimensions || ''),
    items: inv.items_json || inv.items || [],
    isDraft: false,
  } as Invoice
}

export function useInvoiceTemplatePage() {
  const storeTemplate = useSettingsStore((s) => s.invoiceTemplate)
  const setStoreTemplate = useSettingsStore((s) => s.setInvoiceTemplate)

  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [status, setStatus] = useState<string | null>(null)

  const [template, setTemplate] = useState<InvoiceTemplate>(() => ({
    ...defaultInvoiceTemplate,
    ...(storeTemplate ?? {}),
  }))

  // ALL invoices (light list for browsing)
  const [allInvoices, setAllInvoices] = useState<Invoice[]>([])
  const [invoicesLoading, setInvoicesLoading] = useState(false)

  const [invoiceQuery, setInvoiceQuery] = useState('')
  const [selectedInvoiceId, setSelectedInvoiceId] = useState<string | null>(null)

  // Full invoice data for selected invoice
  const [selectedInvoiceFull, setSelectedInvoiceFull] = useState<Invoice | null>(null)

  const refreshCalledRef = useRef(false)
  const invoicesCalledRef = useRef(false)
  const storeTemplateRef = useRef(storeTemplate)

  useEffect(() => {
    storeTemplateRef.current = storeTemplate
  }, [storeTemplate])

  // ═══ Load template ═══
  const refresh = useCallback(async () => {
    if (refreshCalledRef.current) return
    refreshCalledRef.current = true
    setLoading(true)
    setError(null)
    try {
      let parsed: unknown = null
      try {
        const res = await apiFetch<any>('/settings')
        const obj = res?.data || res
        if (typeof obj?.shippec_template === 'string') {
          try { parsed = JSON.parse(obj.shippec_template) } catch {}
        }
      } catch {}
      if (!parsed) {
        try {
          const res = await apiFetch<any>('/invoice-template')
          const t = res?.data || res
          if (t && (t.company_name || t.companyAr)) {
            parsed = {
              companyAr: t.company_name || '',
              companyEn: t.company_name_en || '',
              vat: t.tax_number || '',
              cr: t.commercial_reg || '',
              phone: t.phone || '',
              email: t.email || '',
              address: t.address || '',
              note: t.footer_text || '',
              logoDataUrl: t.logo_url || undefined,
              templateStyle: t.template_style || 'shippec',
            }
          }
        } catch {}
      }
      const next = normalizeInvoiceTemplate(
        parsed ?? storeTemplateRef.current ?? defaultInvoiceTemplate
      )
      setTemplate(next)
      setStoreTemplate(next)
    } catch (e: any) {
      setError(e.message || 'فشل تحميل القالب')
    } finally {
      setLoading(false)
    }
  }, [setStoreTemplate])

  // ═══ Load 2000 invoices (newest first) using /invoices/light ═══
  const loadInvoices = useCallback(async () => {
    if (invoicesCalledRef.current) return
    invoicesCalledRef.current = true
    setInvoicesLoading(true)

    try {
      let list: any[] = []
      let page = 1
      let hasMore = true

      // Load up to 2000 invoices (40 pages × 50) sorted by date DESC
      while (hasMore && page <= 40) {
        try {
          const res = await apiFetch<any>(
            '/invoices/light?page=' + page + '&limit=50&sort_by=date&sort_dir=desc'
          )
          // /invoices/light returns { invoices: [...], pagination }
          const batch = res?.invoices || res?.data || (Array.isArray(res) ? res : [])
          if (batch.length === 0) {
            hasMore = false
          } else {
            list = list.concat(batch)
            // Stop if we got less than requested (last page)
            if (batch.length < 50) hasMore = false
            page++
          }
        } catch {
          // Fallback to regular endpoint on first page only
          if (page === 1) {
            try {
              const res = await apiFetch<any>(
                '/invoices?page=1&limit=50&sort_by=date&sort_dir=desc'
              )
              const data = res?.data || (Array.isArray(res) ? res : res?.invoices || [])
              list = data
            } catch {}
          }
          hasMore = false
        }
      }

      console.log('[InvoiceTemplate] Loaded ' + list.length + ' invoices (sorted by date DESC)')

      const mapped = list.map(mapInvoice)

      // Safety sort client-side (in case server didn't sort)
      mapped.sort((a, b) => {
        const dateA = new Date(a.date || 0).getTime()
        const dateB = new Date(b.date || 0).getTime()
        return dateB - dateA
      })

      setAllInvoices(mapped)
    } catch (e: any) {
      console.warn('[InvoiceTemplate] loadInvoices failed:', e.message)
      setAllInvoices([])
    } finally {
      setInvoicesLoading(false)
    }
  }, [])

  // ═══ Save ═══
  const save = useCallback(async () => {
    setSaving(true)
    setError(null)
    setStatus(null)
    try {
      let saved = false
      try {
        await apiFetch('/invoice-template', {
          method: 'PUT',
          body: JSON.stringify({
            company_name: template.companyAr,
            company_name_en: template.companyEn,
            tax_number: template.vat,
            commercial_reg: template.cr,
            phone: template.phone,
            email: template.email,
            address: template.address,
            footer_text: template.note,
            logo_url: template.logoDataUrl || null,
            template_style: template.templateStyle || 'shippec',
          }),
        })
        saved = true
      } catch {}
      try {
        await apiFetch('/settings', {
          method: 'POST',
          body: JSON.stringify({ key: 'shippec_template', value: JSON.stringify(template) }),
        })
        saved = true
      } catch {
        try {
          await apiFetch('/settings', {
            method: 'POST',
            body: JSON.stringify({ settings: { shippec_template: JSON.stringify(template) } }),
          })
          saved = true
        } catch {
          try {
            await apiFetch('/settings', {
              method: 'POST',
              body: JSON.stringify({ settings: [{ key: 'shippec_template', value: JSON.stringify(template) }] }),
            })
            saved = true
          } catch {}
        }
      }
      if (!saved) throw new Error('فشل في حفظ القالب')
      setStoreTemplate(template)
      setStatus('✅ تم حفظ قالب الفاتورة بنجاح')
      setTimeout(() => setStatus(null), 4000)
    } catch (e: any) {
      setError(e.message || 'تعذّر حفظ القالب')
    } finally {
      setSaving(false)
    }
  }, [setStoreTemplate, template])

  const restoreDefaults = useCallback(() => {
    setTemplate(defaultInvoiceTemplate)
    setStatus('✅ تم استعادة الافتراضية (لم يتم الحفظ بعد)')
    setTimeout(() => setStatus(null), 4000)
  }, [])

  const setLogoFile = useCallback(async (file: File | null) => {
    if (!file) return
    setStatus(null)
    setError(null)
    if (file.size > 5 * 1024 * 1024) { setError('أقل من 5MB'); return }
    if (!file.type.startsWith('image/')) { setError('ملف صورة فقط'); return }
    try {
      const buffer = await file.arrayBuffer()
      const bytes = new Uint8Array(buffer)
      let binary = ''
      for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i])
      setTemplate((p) => ({ ...p, logoDataUrl: `data:${file.type};base64,${btoa(binary)}` }))
      setStatus('✅ تم رفع الشعار')
      setTimeout(() => setStatus(null), 3000)
    } catch { setError('تعذّر قراءة الصورة') }
  }, [])

  const removeLogo = useCallback(() => {
    setTemplate((p) => ({ ...p, logoDataUrl: undefined }))
  }, [])

// ═══ Filter invoices — search across all fields ═══
const filteredInvoices = useMemo(() => {
  const q = invoiceQuery.trim().toLowerCase()
  // No search → show first 100 invoices (already sorted newest first)
  if (!q) return allInvoices.slice(0, 100)
  return allInvoices
    .filter((i) => {
      const text = [
        i.id, i.client, i.phone, i.awb, i.invoice_number,
        i.receiver, i.sender, i.daftra_id, i.carrier, i.details,
      ].filter(Boolean).join(' ').toLowerCase()
      return text.includes(q)
    })
    .slice(0, 100)
}, [invoiceQuery, allInvoices])

  // ═══ Selected invoice (from allInvoices) ═══
  const selectedInvoice = useMemo(() => {
    if (!selectedInvoiceId) return null
    // Try full data first, then fall back to light data
    if (selectedInvoiceFull && String(selectedInvoiceFull.id) === String(selectedInvoiceId)) {
      return selectedInvoiceFull
    }
    return allInvoices.find((i) => String(i.id) === String(selectedInvoiceId)) ?? null
  }, [allInvoices, selectedInvoiceId, selectedInvoiceFull])

  // ═══ When invoice is selected, load full data ═══
  useEffect(() => {
    if (!selectedInvoiceId) {
      setSelectedInvoiceFull(null)
      return
    }
    // Load full invoice data
    let cancelled = false
    ;(async () => {
      try {
        const res = await apiFetch<any>(`/invoices?page=1&limit=1&search=${selectedInvoiceId}`)
        if (cancelled) return
        let inv: any = null
        if (res?.data?.[0]) inv = res.data[0]
        else if (res?.invoices?.[0]) inv = res.invoices[0]
        else if (Array.isArray(res) && res[0]) inv = res[0]

        if (inv) {
          setSelectedInvoiceFull(mapInvoice(inv))
        }
      } catch {
        // Fall back to allInvoices data
      }
    })()
    return () => { cancelled = true }
  }, [selectedInvoiceId])

  const preview = useMemo(() => {
    if (!selectedInvoice) return null
    const { items, total } = computeInvoiceTotal(selectedInvoice)
    return { inv: selectedInvoice, items, total }
  }, [selectedInvoice])

  return {
    loading, saving, error, status,
    template, setTemplate,
    save, refresh, restoreDefaults,
    setLogoFile, removeLogo,
    invoiceQuery, setInvoiceQuery,
    filteredInvoices, invoicesLoading,
    selectedInvoice, selectedInvoiceId, setSelectedInvoiceId,
    loadInvoices, allInvoices, preview,
  }
}