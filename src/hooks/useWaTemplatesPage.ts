import { useCallback, useMemo, useState } from 'react'
import { invoiceService } from '../services/invoiceService'
import type { Invoice } from '../utils/models'
import {
  applyWaTemplate,
  defaultWaTemplates,
  getSmartTemplateKey,
  getTemplateLabel,
  normalizeWaTemplates,
  WA_TEMPLATE_VARIABLES,
  type WaTemplateKey,
  type WaTemplates,
  writeWaTemplatesCache,
} from '../utils/whatsappTemplates'
import { formatWAPhone } from '../utils/whatsapp'

// ══ DB Template type ══
export interface DbTemplate {
  id: number
  name: string
  type: string
  template: string
  variables: string | null
  is_active: boolean
  created_by: number | null
  created_at: string
  updated_at: string
}

const BUILT_IN_TYPES = ['paid', 'unpaid', 'collection', 'payment_link']

export function useWaTemplatesPage() {
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [status, setStatus] = useState<string | null>(null)

  // ══ Built-in templates (key-value) ══
  const [templates, setTemplates] = useState<WaTemplates>(() => defaultWaTemplates())
  const [activeKey, setActiveKey] = useState<WaTemplateKey>('paid')

  // ══ ALL templates from DB (built-in + custom) ══
  const [allDbTemplates, setAllDbTemplates] = useState<DbTemplate[]>([])

  // ══ Invoice preview ══
  const [invoices, setInvoices] = useState<Invoice[]>([])
  const [invoiceQuery, setInvoiceQuery] = useState('')
  const [selectedInvoiceId, setSelectedInvoiceIdRaw] = useState<string | null>(null)

  // ══ New Template Modal ══
  const [newModalOpen, setNewModalOpen] = useState(false)
  const [newName, setNewName] = useState('')
  const [newType, setNewType] = useState('')
  const [newStatusMatch, setNewStatusMatch] = useState('')
  const [newTemplate, setNewTemplate] = useState('')
  const [savingNew, setSavingNew] = useState(false)

  // ══ Custom template being viewed ══
  const [viewingCustomId, setViewingCustomId] = useState<number | null>(null)

  // ══ Derived: custom (non-built-in) templates ══
  const customTemplates = useMemo(
    () => allDbTemplates.filter((t) => !BUILT_IN_TYPES.includes(t.type)),
    [allDbTemplates]
  )

  // ══ Load ALL templates from backend ══
  const refresh = useCallback(async () => {
    setLoading(true)
    setError(null)
    setStatus(null)
    try {
      const { api } = await import('../utils/apiClient')

      // Get all templates from DB
      const result = await api.get('/wa-templates')
      const list: DbTemplate[] = Array.isArray(result) ? result
        : Array.isArray(result?.data) ? result.data
        : []

      setAllDbTemplates(list)

      // Build key-value map for built-in templates
      const map: Record<string, string> = {}
      for (const t of list) {
        if (t.type && t.template && BUILT_IN_TYPES.includes(t.type)) {
          map[t.type] = t.template
        }
      }

      const next = normalizeWaTemplates(map)
      setTemplates(next)
      writeWaTemplatesCache(next)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'فشل تحميل القوالب')
    } finally {
      setLoading(false)
    }
  }, [])

  // ══ Load invoices from backend ══
  const loadInvoices = useCallback(async () => {
    try {
      const result = await invoiceService.getInvoicesLight({
        page: 1,
        limit: 200,
        sort_by: 'date',
        sort_dir: 'desc',
      })
      setInvoices(result.invoices ?? [])
    } catch {
      setInvoices([])
    }
  }, [])

  // ══ Save built-in templates to backend (bulk) ══
  const save = useCallback(async () => {
    setSaving(true)
    setError(null)
    setStatus(null)
    try {
      const { api } = await import('../utils/apiClient')

      try {
        await api.post('/wa-templates/bulk', { templates })
      } catch {
        // Fallback: settings
        await api.post('/settings', {
          key: 'shippec_wa_templates',
          value: JSON.stringify(templates),
        })
      }

      writeWaTemplatesCache(templates)
      setStatus('✅ تم حفظ قوالب واتساب بنجاح')
      setTimeout(() => setStatus(null), 3000)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'تعذّر حفظ القوالب')
    } finally {
      setSaving(false)
    }
  }, [templates])

  // ══ Create new custom template → POST to backend ══
  const createNewTemplate = useCallback(async () => {
    if (!newName.trim() || !newTemplate.trim()) return
    setSavingNew(true)
    setError(null)
    try {
      const { api } = await import('../utils/apiClient')

      const payload = {
        name: newName.trim(),
        type: newType.trim() || `custom_${Date.now()}`,
        template: newTemplate.trim(),
        variables: WA_TEMPLATE_VARIABLES.map((v) => v.token),
        is_active: true,
      }

      await api.post('/wa-templates', payload)

      // Reload ALL templates from backend
      await refresh()

      // Close modal + reset
      setNewModalOpen(false)
      setNewName('')
      setNewType('')
      setNewStatusMatch('')
      setNewTemplate('')
      setStatus('✅ تم إنشاء القالب الجديد بنجاح')
      setTimeout(() => setStatus(null), 3000)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'فشل في إنشاء القالب')
    } finally {
      setSavingNew(false)
    }
  }, [newName, newType, newTemplate, refresh])

  // ══ Delete template from backend ══
  const deleteTemplate = useCallback(async (id: number) => {
    if (!window.confirm('هل تريد حذف هذا القالب نهائياً؟')) return
    try {
      const { api } = await import('../utils/apiClient')
      await api.delete(`/wa-templates/${id}`)

      // Reload from backend
      await refresh()
      setStatus('🗑️ تم حذف القالب')
      setTimeout(() => setStatus(null), 3000)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'فشل في حذف القالب')
    }
  }, [refresh])

  // ══ Update single custom template on backend ══
  const updateCustomTemplate = useCallback(async (id: number, data: { name?: string; template?: string }) => {
    try {
      const { api } = await import('../utils/apiClient')
      await api.put(`/wa-templates/${id}`, data)
      await refresh()
      setStatus('✅ تم تحديث القالب')
      setTimeout(() => setStatus(null), 3000)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'فشل في تحديث القالب')
    }
  }, [refresh])

  // ══ Restore defaults ══
  const restoreDefaults = useCallback(() => {
    const d = defaultWaTemplates()
    setTemplates(d)
    setStatus('✅ تم استعادة القوالب الافتراضية (لم يتم الحفظ بعد)')
    setTimeout(() => setStatus(null), 3000)
  }, [])

  const notify = useCallback((message: string) => {
    setStatus(message)
    setTimeout(() => setStatus(null), 3000)
  }, [])

  // ══ Filtered invoices for search ══
  const filteredInvoices = useMemo(() => {
    const q = invoiceQuery.trim().toLowerCase()
    const list = invoices.filter((i) => !i.isDraft)
    if (!q) return list.slice(0, 20)
    return list
      .filter((i) => {
        const hay = [
          i.id, i.client, i.phone ?? '', i.awb ?? '',
          i.invoice_number ?? '', i.daftra_id ?? '',
        ].join(' ').toLowerCase()
        return hay.includes(q)
      })
      .slice(0, 20)
  }, [invoiceQuery, invoices])

  const selectedInvoice = useMemo(() => {
    if (!selectedInvoiceId) return null
    return invoices.find((i) => String(i.id) === String(selectedInvoiceId)) ?? null
  }, [invoices, selectedInvoiceId])

  // ══ Smart active key: auto-switch based on selected invoice ══
  const smartActiveKey = useMemo((): WaTemplateKey => {
    if (selectedInvoice) {
      return getSmartTemplateKey(selectedInvoice)
    }
    return activeKey
  }, [selectedInvoice, activeKey])

  // ══ Preview ══
  const preview = useMemo(() => {
    if (!selectedInvoice) return ''

    // If viewing a custom template, use its content
    if (viewingCustomId) {
      const custom = allDbTemplates.find((t) => t.id === viewingCustomId)
      if (custom) {
        const customTemplates: Partial<WaTemplates> = { [smartActiveKey]: custom.template } as any
        return applyWaTemplate(smartActiveKey, selectedInvoice, {
          ...templates,
          ...customTemplates,
        })
      }
    }

    return applyWaTemplate(smartActiveKey, selectedInvoice, templates)
  }, [smartActiveKey, selectedInvoice, templates, viewingCustomId, allDbTemplates])

  const smartTemplateLabel = useMemo(() => {
    if (viewingCustomId) {
      const custom = allDbTemplates.find((t) => t.id === viewingCustomId)
      return custom ? `📝 ${custom.name}` : getTemplateLabel(smartActiveKey)
    }
    return getTemplateLabel(smartActiveKey)
  }, [smartActiveKey, viewingCustomId, allDbTemplates])

  const formattedPhone = useMemo(() => {
    if (!selectedInvoice?.phone) return ''
    return formatWAPhone(selectedInvoice.phone)
  }, [selectedInvoice])

  // ══ Select invoice + auto-switch template ══
  const setSelectedInvoiceId = useCallback((id: string | null) => {
    setSelectedInvoiceIdRaw(id)
    setViewingCustomId(null) // Reset custom view
    if (id) {
      const inv = invoices.find((i) => String(i.id) === String(id))
      if (inv) {
        const smartKey = getSmartTemplateKey(inv)
        setActiveKey(smartKey)
      }
    }
  }, [invoices])

  const updateTemplate = useCallback((key: WaTemplateKey, value: string) => {
    setTemplates((prev) => ({ ...prev, [key]: value }))
  }, [])

  // ══ Preview a custom template ══
  const previewCustomTemplate = useCallback((id: number) => {
    setViewingCustomId(id)
  }, [])

    // ══ Create new template (inline version) ══
  const createNewTemplate2 = useCallback(async (input: {
    name: string;
    type: string;
    template: string;
    status_match?: string;
  }) => {
    setError(null)
    try {
      const { api } = await import('../utils/apiClient')

      const payload = {
        name: input.name,
        type: input.type,
        template: input.template,
        variables: WA_TEMPLATE_VARIABLES.map((v) => v.token),
        is_active: true,
      }

      await api.post('/wa-templates', payload)
      await refresh()

      setStatus('✅ تم إنشاء القالب الجديد بنجاح')
      setTimeout(() => setStatus(null), 3000)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'فشل في إنشاء القالب')
      throw e
    }
  }, [refresh])

  return {
    loading,
    saving,
    error,
    status,

    // Built-in templates
    templates,
    updateTemplate,
    activeKey,
    setActiveKey,
    smartActiveKey,
    smartTemplateLabel,
    refresh,
    save,
    restoreDefaults,
    createNewTemplate2,

    // All DB templates + custom
    allDbTemplates,
    customTemplates,

    // Invoice preview
    invoiceQuery,
    setInvoiceQuery,
    filteredInvoices,
    selectedInvoice,
    selectedInvoiceId: selectedInvoiceId,
    setSelectedInvoiceId,
    loadInvoices,
    preview,
    notify,
    formattedPhone,

    // New template modal
    newModalOpen,
    setNewModalOpen,
    newName,
    setNewName,
    newType,
    setNewType,
    newStatusMatch,
    setNewStatusMatch,
    newTemplate,
    setNewTemplate,
    savingNew,
    createNewTemplate,

    // Custom template actions
    deleteTemplate,
    updateCustomTemplate,
    viewingCustomId,
    previewCustomTemplate,
  }
}