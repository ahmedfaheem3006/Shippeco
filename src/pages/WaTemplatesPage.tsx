import { useEffect, useMemo, useState } from 'react'
import { useWaTemplatesPage } from '../hooks/useWaTemplatesPage'
import {
  WA_TEMPLATE_META,
  WA_TEMPLATE_VARIABLES,
  defaultWaTemplates,
} from '../utils/whatsappTemplates'
import { openWhatsApp } from '../utils/whatsapp'
import styles from './WaTemplatesPage.module.css'
import {
  MessageCircle, Save, RotateCcw, RefreshCw,
  Search, CheckCircle2, AlertCircle, Sparkles,
  Smartphone, Copy, Send, Zap, Plus, X, Trash2,
} from 'lucide-react'

async function copyText(value: string) {
  try {
    await navigator.clipboard.writeText(value)
    return true
  } catch {
    return false
  }
}

function getStatusColor(status: string) {
  if (status === 'paid') return { bg: '#f0fdf4', color: '#16a34a', border: '#bbf7d0', label: 'مدفوعة' }
  if (status === 'partial') return { bg: '#fffbeb', color: '#d97706', border: '#fde68a', label: 'جزئية' }
  if (status === 'unpaid') return { bg: '#fef2f2', color: '#dc2626', border: '#fecaca', label: 'غير مدفوعة' }
  if (status === 'returned') return { bg: '#faf5ff', color: '#7c3aed', border: '#ddd6fe', label: 'مرتجعة' }
  return { bg: '#f3f4f6', color: '#6b7280', border: '#e5e7eb', label: status }
}

function getEditorIconStyle(tone: string) {
  if (tone === 'green') return { background: '#f0fdf4', color: '#16a34a', borderColor: '#bbf7d0' }
  if (tone === 'gold') return { background: '#fffbeb', color: '#d97706', borderColor: '#fde68a' }
  if (tone === 'red') return { background: '#fef2f2', color: '#dc2626', borderColor: '#fecaca' }
  return { background: '#eff6ff', color: '#2563eb', borderColor: '#bfdbfe' }
}

function getSmartBadgeClass(key: string) {
  if (key === 'paid') return styles.smartBadgeGreen
  if (key === 'collection') return styles.smartBadgeRed
  if (key === 'unpaid') return styles.smartBadgeYellow
  return styles.smartBadgeBlue
}

export function WaTemplatesPage() {
  const wa = useWaTemplatesPage()

  // ═══ New Template Inline State ═══
  const [showNewForm, setShowNewForm] = useState(false)
  const [newName, setNewName] = useState('')
  const [newType, setNewType] = useState('')
  const [newStatusMatch, setNewStatusMatch] = useState('')
  const [newTemplate, setNewTemplate] = useState('')
  const [savingNew, setSavingNew] = useState(false)

  useEffect(() => {
    void wa.refresh()
    void wa.loadInvoices()
  }, [wa.refresh, wa.loadInvoices])

  const activeMeta = useMemo(
    () => WA_TEMPLATE_META.find((m) => m.key === wa.activeKey) || WA_TEMPLATE_META[0],
    [wa.activeKey]
  )

  const handleCopyPreview = async () => {
    if (!wa.preview) return
    const ok = await copyText(wa.preview)
    if (ok) wa.notify('📋 تم نسخ الرسالة')
  }

  const handleSendWhatsApp = () => {
    if (!wa.selectedInvoice || !wa.preview) return
    const phone = wa.selectedInvoice.phone
    if (!phone) {
      wa.notify('⚠️ لا يوجد رقم جوال لهذا العميل')
      return
    }
    openWhatsApp(phone, wa.preview)
  }

  const handleCopyVariable = async (token: string) => {
    const ok = await copyText(token)
    if (ok) wa.notify(`📋 تم نسخ ${token}`)
  }

  const handleRestoreSingle = () => {
    const defaults = defaultWaTemplates()
    wa.updateTemplate(wa.activeKey, defaults[wa.activeKey])
    wa.notify('↩️ تم استعادة القالب الافتراضي')
  }

  // ═══ Create New Template Inline ═══
  const handleCreateNew = async () => {
    if (!newName.trim() || !newTemplate.trim()) return
    setSavingNew(true)
    try {
      await wa.createNewTemplate2({
        name: newName.trim(),
        type: newType.trim() || `custom_${Date.now()}`,
        template: newTemplate.trim(),
        status_match: newStatusMatch,
      })
      // Reset form
      setNewName('')
      setNewType('')
      setNewStatusMatch('')
      setNewTemplate('')
      setShowNewForm(false)
    } catch {
      // error handled in hook
    } finally {
      setSavingNew(false)
    }
  }

  // ═══ Is viewing a custom template? ═══
  const activeCustom = useMemo(() => {
    return wa.customTemplates.find(t => `custom_${t.id}` === wa.activeKey)
  }, [wa.activeKey, wa.customTemplates])

  return (
    <div className={styles.page}>

      {/* ═══ Top Bar ═══ */}
      <div className={styles.topBar}>
        <div className={styles.topBarInfo}>
          <div className={styles.topBarIcon}>
            <MessageCircle size={22} />
          </div>
          <div>
            <div className={styles.topBarTitle}>قوالب رسائل واتساب</div>
            <div className={styles.topBarSub}>
              تخصيص الرسائل التلقائية — يتم اختيار القالب تلقائياً حسب حالة الفاتورة
            </div>
          </div>
        </div>
        <div className={styles.topBarActions}>
          <button type="button" className={styles.btnGhost}
            onClick={() => void wa.refresh()} disabled={wa.loading || wa.saving}>
            <RefreshCw size={14} className={wa.loading ? 'animate-spin' : ''} />
            <span className={styles.btnText}>تحميل</span>
          </button>
          <button type="button" className={styles.btnSave}
            onClick={() => void wa.save()} disabled={wa.loading || wa.saving}>
            {wa.saving ? <RefreshCw size={16} className="animate-spin" /> : <Save size={16} />}
            حفظ الكل
          </button>
        </div>
      </div>

      {/* ═══ Status ═══ */}
      {wa.error && (
        <div className={styles.statusErr}><AlertCircle size={16} /> {wa.error}</div>
      )}
      {wa.status && (
        <div className={styles.statusOk}><CheckCircle2 size={16} /> {wa.status}</div>
      )}

      {/* ═══ Main Layout ═══ */}
      <div className={styles.mainLayout}>

        {/* ─── Left: Editor ─── */}
        <div className={styles.templatesCol}>

          {/* Tab Bar — built-in + custom templates */}
          <div className={styles.tabBar}>
            {WA_TEMPLATE_META.map((t) => (
              <button key={t.key} type="button"
                className={`${styles.tab} ${wa.activeKey === t.key ? styles.tabActive : ''}`}
                onClick={() => wa.setActiveKey(t.key)}>
                <span className={styles.tabIcon}>{t.icon}</span>
                <span className={styles.tabLabel}>{t.title}</span>
                {wa.smartActiveKey === t.key && wa.selectedInvoice && (
                  <Zap size={10} style={{ color: '#25d366' }} />
                )}
              </button>
            ))}
            {/* Custom templates as tabs */}
            {wa.customTemplates.map((t) => (
              <button key={`custom_${t.id}`} type="button"
                className={`${styles.tab} ${wa.activeKey === `custom_${t.id}` ? styles.tabActive : ''}`}
                onClick={() => wa.setActiveKey(`custom_${t.id}` as any)}>
                <span className={styles.tabIcon}>📝</span>
                <span className={styles.tabLabel}>{t.name}</span>
              </button>
            ))}
            {/* Add button */}
            <button type="button" className={styles.tabAdd}
              onClick={() => setShowNewForm(!showNewForm)}>
              {showNewForm ? <X size={14} /> : <Plus size={14} />}
              {showNewForm ? 'إلغاء' : 'جديد'}
            </button>
          </div>

          {/* ═══ New Template Form (Inline — same style as editor) ═══ */}
          {showNewForm && (
            <div className={`${styles.editorCard} ${styles.editorCardNew}`}>
              <div className={styles.editorHeader}>
                <div className={styles.editorHeaderInfo}>
                  <div className={styles.editorIcon} style={{ background: '#f5f3ff', color: '#7c3aed', borderColor: '#ddd6fe' }}>
                    ✨
                  </div>
                  <div>
                    <div className={styles.editorTitle}>إنشاء قالب واتساب جديد</div>
                    <div className={styles.editorSub}>أضف قالب مخصص — يتم حفظه في السيرفر مباشرة</div>
                  </div>
                </div>
              </div>

              <div className={styles.editorBody}>
                <div className={styles.newFormGrid}>
                  <div className={styles.newFormField}>
                    <label className={styles.newFormLabel}>
                      اسم القالب <span className={styles.newFormRequired}>*</span>
                    </label>
                    <input
                      className={styles.newFormInput}
                      value={newName}
                      onChange={(e) => setNewName(e.target.value)}
                      placeholder="مثال: رسالة ترحيب"
                    />
                  </div>
                  <div className={styles.newFormField}>
                    <label className={styles.newFormLabel}>المعرّف (type)</label>
                    <input
                      className={styles.newFormInput}
                      value={newType}
                      onChange={(e) => setNewType(e.target.value)}
                      placeholder="welcome"
                      dir="ltr"
                      style={{ textAlign: 'left' }}
                    />
                    <span className={styles.newFormHint}>اتركه فارغاً وسيتم إنشاؤه تلقائياً</span>
                  </div>
                </div>

                <div className={styles.newFormField}>
                  <label className={styles.newFormLabel}>
                    يُرسل عند <span className={styles.newFormHint}>(اختياري)</span>
                  </label>
                  <select
                    className={styles.newFormSelect}
                    value={newStatusMatch}
                    onChange={(e) => setNewStatusMatch(e.target.value)}
                  >
                    <option value="">— بدون ربط تلقائي —</option>
                    <option value="paid">عند الدفع الكامل (مدفوعة)</option>
                    <option value="partial">عند الدفع الجزئي (جزئية)</option>
                    <option value="unpaid">عند عدم الدفع (غير مدفوعة)</option>
                    <option value="returned">عند الإرجاع (مرتجعة)</option>
                  </select>
                </div>

                <div className={styles.newFormField}>
                  <label className={styles.newFormLabel}>
                    محتوى الرسالة <span className={styles.newFormRequired}>*</span>
                  </label>
                  <textarea
                    className={styles.textarea}
                    value={newTemplate}
                    onChange={(e) => setNewTemplate(e.target.value)}
                    placeholder={'مرحباً {اسم_العميل} 👋\n\nاكتب رسالتك هنا...'}
                    dir="auto"
                    style={{ minHeight: '160px' }}
                  />
                  <span className={styles.newFormHint}>
                    يمكنك استخدام المتغيرات مثل {'{اسم_العميل}'} و {'{المبلغ}'} وغيرها 👆
                  </span>
                </div>
              </div>

              <div className={styles.editorFooter}>
                <span className={styles.charCount}>
                  {newTemplate.length} حرف
                </span>
                <div className={styles.editorActions}>
                  <button type="button" className={styles.btnMini}
                    onClick={() => { setShowNewForm(false); setNewName(''); setNewType(''); setNewTemplate(''); setNewStatusMatch(''); }}>
                    <X size={11} /> إلغاء
                  </button>
                  <button type="button" className={styles.btnCreate}
                    onClick={() => void handleCreateNew()}
                    disabled={!newName.trim() || !newTemplate.trim() || savingNew}>
                    {savingNew
                      ? <RefreshCw size={13} className="animate-spin" />
                      : <Plus size={13} />}
                    إنشاء القالب
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* ═══ Active Template Editor ═══ */}
          {!showNewForm && (
            <>
              {/* Built-in template editor */}
              {!activeCustom ? (
                <div className={`${styles.editorCard} ${styles.editorCardActive}`}>
                  <div className={styles.editorHeader}>
                    <div className={styles.editorHeaderInfo}>
                      <div className={styles.editorIcon} style={getEditorIconStyle(activeMeta.tone)}>
                        {activeMeta.icon}
                      </div>
                      <div>
                        <div className={styles.editorTitle}>{activeMeta.title}</div>
                        <div className={styles.editorSub}>{activeMeta.sub}</div>
                      </div>
                    </div>
                    {activeMeta.statusMatch && (
                      <div className={styles.editorStatusBadge} style={{
                        background: getStatusColor(activeMeta.statusMatch).bg,
                        color: getStatusColor(activeMeta.statusMatch).color,
                        border: `1px solid ${getStatusColor(activeMeta.statusMatch).border}`,
                      }}>
                        يُرسل عند: {getStatusColor(activeMeta.statusMatch).label}
                      </div>
                    )}
                  </div>

                  <div className={styles.editorBody}>
                    <textarea className={styles.textarea}
                      value={wa.templates[wa.activeKey] || ''}
                      onChange={(e) => wa.updateTemplate(wa.activeKey, e.target.value)}
                      disabled={wa.loading || wa.saving} dir="auto"
                      placeholder="اكتب نص القالب هنا..." />
                  </div>

                  <div className={styles.editorFooter}>
                    <span className={styles.charCount}>
                      {(wa.templates[wa.activeKey] || '').length} حرف
                    </span>
                    <div className={styles.editorActions}>
                      <button type="button" className={styles.btnMini}
                        onClick={() => void copyText(wa.templates[wa.activeKey] || '').then(
                          (ok) => ok && wa.notify('📋 تم نسخ القالب'))}>
                        <Copy size={11} /> نسخ
                      </button>
                      <button type="button" className={styles.btnMini} onClick={handleRestoreSingle}>
                        <RotateCcw size={11} /> افتراضي
                      </button>
                    </div>
                  </div>
                </div>
              ) : (
                /* Custom template editor — same design */
                <div className={`${styles.editorCard} ${styles.editorCardActive}`}>
                  <div className={styles.editorHeader}>
                    <div className={styles.editorHeaderInfo}>
                      <div className={styles.editorIcon} style={{ background: '#f5f3ff', color: '#7c3aed', borderColor: '#ddd6fe' }}>
                        📝
                      </div>
                      <div>
                        <div className={styles.editorTitle}>{activeCustom.name}</div>
                        <div className={styles.editorSub}>
                          قالب مخصص · {activeCustom.type}
                          {activeCustom.is_active ? ' · ● نشط' : ' · ○ معطّل'}
                        </div>
                      </div>
                    </div>
                    <button type="button"
                      className={styles.btnDeleteCustom}
                      onClick={() => void wa.deleteTemplate(activeCustom.id)}
                      title="حذف القالب">
                      <Trash2 size={14} /> حذف
                    </button>
                  </div>

                  <div className={styles.editorBody}>
                    <textarea className={styles.textarea}
                      value={activeCustom.template}
                      onChange={(e) => void wa.updateCustomTemplate(activeCustom.id, { template: e.target.value })}
                      disabled={wa.loading || wa.saving} dir="auto"
                      placeholder="اكتب نص القالب هنا..." />
                  </div>

                  <div className={styles.editorFooter}>
                    <span className={styles.charCount}>
                      {activeCustom.template.length} حرف
                    </span>
                    <div className={styles.editorActions}>
                      <button type="button" className={styles.btnMini}
                        onClick={() => void copyText(activeCustom.template).then(
                          (ok) => ok && wa.notify('📋 تم نسخ القالب'))}>
                        <Copy size={11} /> نسخ
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </>
          )}

          {/* Variables Bar — moved here under editor */}
          <div className={styles.varsBar}>
            <div className={styles.varsHeader}>
              <Sparkles size={14} style={{ color: '#25d366' }} />
              <span>المتغيرات الديناميكية</span>
              <span className={styles.varsHeaderHint}>(اضغط للنسخ)</span>
            </div>
            <div className={styles.varsGrid}>
              {WA_TEMPLATE_VARIABLES.map((v) => (
                <button key={v.token} type="button" className={styles.varChip}
                  onClick={() => void handleCopyVariable(v.token)} title={v.label}>
                  <span className={styles.varToken}>{v.token}</span>
                  <span className={styles.varLabel}>— {v.label}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Footer */}
          <div className={styles.footerRow}>
            <button type="button" className={styles.btnGhost}
              onClick={() => wa.restoreDefaults()} disabled={wa.loading || wa.saving}>
              <RotateCcw size={13} /> استعادة جميع القوالب الافتراضية
            </button>
          </div>
        </div>

        {/* ─── Right: Preview ─── */}
        <div className={styles.previewCol}>

          {/* Search */}
          <div className={styles.searchCard}>
            <div className={styles.searchLabel}>
              <Search size={13} /> اختر فاتورة للمعاينة الحية
            </div>
            <div className={styles.searchWrap}>
              <Search size={14} className={styles.searchIcon} />
              <input className={styles.searchInput} value={wa.invoiceQuery}
                onChange={(e) => {
                  wa.setInvoiceQuery(e.target.value)
                  if (wa.selectedInvoiceId) wa.setSelectedInvoiceId(null)
                }}
                placeholder="ابحث بالاسم، الرقم، الجوال..." disabled={wa.loading} />

              {wa.invoiceQuery && !wa.selectedInvoice && (
                <div className={styles.suggest}>
                  {wa.filteredInvoices.length > 0 ? (
                    wa.filteredInvoices.map((inv) => {
                      const sc = getStatusColor(inv.status || 'unpaid')
                      return (
                        <button key={String(inv.id)} type="button" className={styles.suggestBtn}
                          onClick={() => {
                            wa.setSelectedInvoiceId(String(inv.id))
                            wa.setInvoiceQuery(`#${inv.invoice_number || inv.id} — ${inv.client}`)
                          }}>
                          <div>
                            <div className={styles.suggestName}>{inv.client || '—'}</div>
                            <div className={styles.suggestMeta}>
                              <span className={styles.suggestId}>#{inv.invoice_number || inv.id}</span>
                              <span className={styles.suggestStatus} style={{
                                background: sc.bg, color: sc.color,
                                border: `1px solid ${sc.border}`,
                              }}>{sc.label}</span>
                            </div>
                          </div>
                          <span className={styles.suggestPrice}>
                            {Number(inv.price || 0).toFixed(0)} ر.س
                          </span>
                        </button>
                      )
                    })
                  ) : (
                    <div className={styles.suggestEmpty}>لا توجد نتائج</div>
                  )}
                </div>
              )}
            </div>

            {/* Invoice Info */}
            {wa.selectedInvoice && (
              <>
                <div className={styles.invoiceInfo}>
                  <div className={styles.invoiceInfoItem}>
                    <span className={styles.invoiceInfoLabel}>العميل</span>
                    <span className={styles.invoiceInfoValue}>{wa.selectedInvoice.client || '—'}</span>
                  </div>
                  <div className={styles.invoiceInfoItem}>
                    <span className={styles.invoiceInfoLabel}>الرقم</span>
                    <span className={styles.invoiceInfoValueMono}>
                      #{wa.selectedInvoice.invoice_number || wa.selectedInvoice.id}
                    </span>
                  </div>
                  <div className={styles.invoiceInfoItem}>
                    <span className={styles.invoiceInfoLabel}>المبلغ</span>
                    <span className={styles.invoiceInfoValueMono}>
                      {Number(wa.selectedInvoice.price || 0).toFixed(2)} ر.س
                    </span>
                  </div>
                  <div className={styles.invoiceInfoItem}>
                    <span className={styles.invoiceInfoLabel}>الجوال</span>
                    <span className={styles.invoiceInfoValueMono} dir="ltr">
                      {wa.selectedInvoice.phone || '—'}
                    </span>
                  </div>
                </div>

                <div className={getSmartBadgeClass(wa.smartActiveKey)}>
                  <Zap size={12} />
                  {wa.smartTemplateLabel}
                </div>

                <button type="button" className={styles.btnMini} style={{ marginTop: '0.5rem' }}
                  onClick={() => { wa.setSelectedInvoiceId(null); wa.setInvoiceQuery('') }}>
                  <RotateCcw size={10} /> مسح الاختيار
                </button>
              </>
            )}
          </div>

          {/* Phone Preview */}
          <div className={styles.phoneFrame}>
            <div className={styles.phoneNotch}><div className={styles.phoneNotchDot} /></div>
            <div className={styles.phoneChatHeader}>
              <div className={styles.phoneChatAvatar}><Smartphone size={16} /></div>
              <div>
                <div className={styles.phoneChatName}>شيب بيك - Shippeco</div>
                <div className={styles.phoneChatStatus}>متصل الآن</div>
              </div>
            </div>
            <div className={styles.phoneChatBody}>
              {wa.preview ? (
                <div className={styles.phoneBubble}>
                  {wa.preview}
                  <div className={styles.phoneBubbleTime}>
                    {new Date().toLocaleTimeString('en-US', {
                      hour: '2-digit', minute: '2-digit', hour12: true,
                    })}
                    <CheckCircle2 size={11} style={{ color: '#53bdeb' }} />
                  </div>
                </div>
              ) : (
                <div className={styles.phoneBubbleEmpty}>
                  اختر فاتورة أعلاه لمعاينة الرسالة
                </div>
              )}
            </div>
          </div>

          {/* Actions */}
          {wa.selectedInvoice && wa.preview && (
            <div className={styles.previewActions}>
              <button type="button" className={styles.btnActionWa}
                onClick={handleSendWhatsApp} disabled={!wa.selectedInvoice?.phone}>
                <Send size={14} /> إرسال واتساب
              </button>
              <button type="button" className={styles.btnActionCopy}
                onClick={() => void handleCopyPreview()}>
                <Copy size={14} /> نسخ الرسالة
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}