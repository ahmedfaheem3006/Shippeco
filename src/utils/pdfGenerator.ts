// ═══════════════════════════════════════════════════════════
// src/utils/pdfGenerator.ts — Multi-theme + PDF WhatsApp share
// ═══════════════════════════════════════════════════════════
import type { Invoice, InvoiceTemplate } from './models'
import {
  formatCurrency,
  toEnglishDigits,
  computeInvoiceTotal,
  getTemplateStyle,
} from './invoiceTemplate'

function escapeHtml(str: string): string {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

function safe(val: any): string {
  if (val === undefined || val === null) return ''
  return toEnglishDigits(val)
}

function formatDate(raw: string | undefined | null): string {
  if (!raw) return ''
  try {
    const d = new Date(raw)
    if (isNaN(d.getTime())) return safe(String(raw).slice(0, 10))
    return `${safe(String(d.getDate()).padStart(2, '0'))}/${safe(String(d.getMonth() + 1).padStart(2, '0'))}/${safe(String(d.getFullYear()))}`
  } catch {
    return safe(String(raw).slice(0, 10))
  }
}

function buildDesc(inv: Record<string, any>): string {
  const parts: string[] = []
  if (inv.awb) parts.push('رقم البوليصة:' + safe(inv.awb))
  if (inv.invoice_number) parts.push('رقم الفاتورة:' + safe(inv.invoice_number))
  if (inv.weight) parts.push('الوزن: ' + safe(inv.weight) + ' كيلو')
  if (inv.dimensions) parts.push('أبعاد الشحنة: ' + safe(inv.dimensions))
  if (inv.final_weight) parts.push('الوزن النهائي: ' + safe(inv.final_weight) + ' كيلو')
  return parts.join('\n')
}

// ═══════════════════════════════════════════════════════════
// THEME-BASED HTML GENERATION
// ═══════════════════════════════════════════════════════════

function generateShippecTheme(inv: Invoice, tmpl: InvoiceTemplate, items: any[], total: number, paid: number, remaining: number): string {
  const desc = buildDesc(inv)
  return `
    <div class="top-bar" style="background:#2563eb;height:6px;width:100%"></div>
    <div style="display:flex;justify-content:space-between;align-items:flex-start;padding:20px 28px 16px;border-bottom:2px solid #e5e7eb">
      <div><div style="font-size:28px;font-weight:900;color:#111">فاتورة</div></div>
      <div style="text-align:left;display:flex;flex-direction:column;align-items:flex-end;gap:4px">
        ${tmpl.logoDataUrl
          ? `<img src="${tmpl.logoDataUrl}" style="height:60px;object-fit:contain" />`
          : `<div style="font-size:28px;font-weight:900;font-family:'Segoe UI',sans-serif"><span style="color:#2563eb">SHi</span>PP<span style="color:#f59e0b">E</span>C</div>`
        }
        <div style="font-size:11px;color:#444;text-align:right;line-height:1.5">
          <div style="font-weight:800;font-size:12px;color:#111">${escapeHtml(tmpl.companyAr || 'شيب بيك')}</div>
          ${tmpl.cr ? `<div>س.ج ${safe(tmpl.cr)}</div>` : ''}
          ${tmpl.address ? `<div>${escapeHtml(tmpl.address)}</div>` : ''}
          ${tmpl.phone ? `<div class="en">${safe(tmpl.phone)}</div>` : ''}
          ${tmpl.email ? `<div><a href="mailto:${tmpl.email}" style="color:#2563eb;text-decoration:none">${tmpl.email}</a></div>` : ''}
        </div>
      </div>
    </div>
    ${generateCommonBody(inv, tmpl, items, total, paid, remaining, desc, '#2563eb')}
    ${generateFooter(tmpl)}
  `
}

function generateClassicTheme(inv: Invoice, tmpl: InvoiceTemplate, items: any[], total: number, paid: number, remaining: number): string {
  const desc = buildDesc(inv)
  return `
    <div style="background:#1e293b;height:6px;width:100%"></div>
    <div style="display:flex;justify-content:space-between;align-items:flex-start;padding:20px 28px 16px;border-bottom:3px solid #1e293b">
      <div>
        <div style="font-size:28px;font-weight:900;color:#1e293b">فاتورة</div>
        <div class="en" style="font-size:12px;color:#64748b;font-weight:600">${escapeHtml(tmpl.companyEn || '')}</div>
      </div>
      <div style="text-align:left;display:flex;flex-direction:column;align-items:flex-end;gap:4px">
        ${tmpl.logoDataUrl ? `<img src="${tmpl.logoDataUrl}" style="height:60px;object-fit:contain" />` : ''}
        <div style="font-size:11px;color:#444;text-align:right;line-height:1.5">
          <div style="font-weight:800;font-size:13px;color:#1e293b">${escapeHtml(tmpl.companyAr || '')}</div>
          ${tmpl.vat ? `<div class="en" style="font-size:11px"><span style="color:#94a3b8">VAT:</span> ${safe(tmpl.vat)}</div>` : ''}
          ${tmpl.cr ? `<div class="en" style="font-size:11px"><span style="color:#94a3b8">CR:</span> ${safe(tmpl.cr)}</div>` : ''}
          ${tmpl.phone ? `<div class="en">${safe(tmpl.phone)}</div>` : ''}
          ${tmpl.email ? `<div style="color:#1e293b">${tmpl.email}</div>` : ''}
        </div>
      </div>
    </div>
    ${generateCommonBody(inv, tmpl, items, total, paid, remaining, desc, '#1e293b')}
    ${generateFooter(tmpl)}
  `
}

function generateModernTheme(inv: Invoice, tmpl: InvoiceTemplate, items: any[], total: number, paid: number, remaining: number): string {
  const desc = buildDesc(inv)
  return `
    <div style="background:linear-gradient(to right,#4f46e5,#7c3aed);height:8px;width:100%"></div>
    <div style="display:flex;justify-content:space-between;align-items:flex-start;padding:24px 28px 20px;border-bottom:2px solid #e0e7ff">
      <div>
        <div style="font-size:30px;font-weight:900;background:linear-gradient(to right,#4f46e5,#7c3aed);-webkit-background-clip:text;-webkit-text-fill-color:transparent">فاتورة</div>
        <div class="en" style="font-size:11px;color:#6366f1;font-weight:700;letter-spacing:2px;text-transform:uppercase">INVOICE</div>
      </div>
      <div style="text-align:left;display:flex;flex-direction:column;align-items:flex-end;gap:6px">
        ${tmpl.logoDataUrl ? `<img src="${tmpl.logoDataUrl}" style="height:55px;object-fit:contain" />` : ''}
        <div style="font-size:11px;color:#444;text-align:right;line-height:1.6">
          <div style="font-weight:800;font-size:13px;color:#4f46e5">${escapeHtml(tmpl.companyAr || '')}</div>
          ${tmpl.phone ? `<div class="en">${safe(tmpl.phone)}</div>` : ''}
          ${tmpl.email ? `<div style="color:#6366f1">${tmpl.email}</div>` : ''}
        </div>
      </div>
    </div>
    ${generateCommonBody(inv, tmpl, items, total, paid, remaining, desc, '#4f46e5')}
    ${generateFooter(tmpl)}
  `
}

function generateMinimalTheme(inv: Invoice, tmpl: InvoiceTemplate, items: any[], total: number, paid: number, remaining: number): string {
  const desc = buildDesc(inv)
  return `
    <div style="background:#111827;height:3px;width:100%"></div>
    <div style="display:flex;justify-content:space-between;align-items:center;padding:28px;border-bottom:1px solid #e5e7eb">
      <div style="font-size:24px;font-weight:900;color:#111827;letter-spacing:-0.5px">فاتورة</div>
      <div style="text-align:left;font-size:11px;color:#6b7280;line-height:1.6">
        <div style="font-weight:800;color:#111827">${escapeHtml(tmpl.companyAr || '')}</div>
        ${tmpl.phone ? `<div class="en">${safe(tmpl.phone)}</div>` : ''}
        ${tmpl.email ? `<div>${tmpl.email}</div>` : ''}
      </div>
    </div>
    ${generateCommonBody(inv, tmpl, items, total, paid, remaining, desc, '#111827')}
    ${generateFooter(tmpl)}
  `
}

// ═══ Shared body section (used by all themes) ═══
function generateCommonBody(inv: Invoice, _tmpl: InvoiceTemplate, items: any[], total: number, paid: number, remaining: number, desc: string, _accentColor: string): string {
  const receiverName = inv.receiver || inv.client || ''
  const receiverPhone = safe(inv.receiver_phone || inv.phone || '')
  const receiverAddress = inv.receiver_address || ''
  const receiverCountry = inv.receiver_country || ''

  const itemsRows = items.map((it: any) => `
    <tr style="border-bottom:1px solid #e5e7eb">
      <td style="padding:10px 8px;text-align:right;font-weight:700;color:#1e293b;font-size:12px;vertical-align:top;width:18%">${escapeHtml(it.type)}</td>
      <td style="padding:10px 8px;text-align:right;font-size:12px;color:#555;vertical-align:top;width:40%;white-space:pre-line;line-height:1.7">${escapeHtml(desc || it.details || '')}</td>
      <td style="padding:10px 8px;text-align:center;font-size:12px;width:10%">1</td>
      <td style="padding:10px 8px;text-align:center;font-size:12px;font-family:'Segoe UI',sans-serif;direction:ltr;width:16%">${formatCurrency(it.price)}</td>
      <td style="padding:10px 8px;text-align:center;font-size:12px;font-weight:700;font-family:'Segoe UI',sans-serif;direction:ltr;width:16%">${formatCurrency(it.price)}</td>
    </tr>
  `).join('')

  return `
    <div style="display:flex;justify-content:space-between;padding:16px 28px;gap:20px">
      <div style="flex:1">
        <div style="font-weight:800;font-size:14px;color:#111;margin-bottom:6px">فاتورة إلى:</div>
        <div style="font-weight:700;font-size:14px;color:#333">${escapeHtml(receiverName)}</div>
        ${receiverPhone ? `<div class="en" style="font-size:12px;color:#555">${receiverPhone}</div>` : ''}
        ${receiverAddress ? `<div style="font-size:12px;color:#555">${escapeHtml(receiverAddress)}</div>` : ''}
        ${receiverCountry ? `<div style="font-size:12px;color:#555">${escapeHtml(receiverCountry)}</div>` : ''}
      </div>
      <div style="text-align:left;font-size:12px;min-width:240px">
        <table style="border-collapse:collapse;width:100%">
          <tr><td style="padding:3px 8px;font-weight:700;color:#555;text-align:right;white-space:nowrap">رقم الفاتورة</td><td class="en" style="padding:3px 8px;font-weight:800;color:#111;text-align:left;direction:ltr">${safe(inv.invoice_number || inv.id)}</td></tr>
          <tr><td style="padding:3px 8px;font-weight:700;color:#555;text-align:right;white-space:nowrap">تاريخ الفاتورة</td><td class="en" style="padding:3px 8px;font-weight:800;color:#111;text-align:left;direction:ltr">${formatDate(inv.date)}</td></tr>
          ${inv.awb ? `<tr><td style="padding:3px 8px;font-weight:700;color:#555;text-align:right;white-space:nowrap">رقم بوليصة الشحن</td><td class="en" style="padding:3px 8px;font-weight:800;color:#111;text-align:left;direction:ltr">${safe(inv.awb)}</td></tr>` : ''}
        </table>
      </div>
    </div>

    <table style="width:calc(100% - 56px);margin:0 28px;border-collapse:collapse;border:1px solid #d1d5db">
      <thead>
        <tr style="background:#f3f4f6">
          <th style="border:1px solid #d1d5db;padding:8px 10px;font-weight:800;font-size:12px;color:#333;text-align:center">البند</th>
          <th style="border:1px solid #d1d5db;padding:8px 10px;font-weight:800;font-size:12px;color:#333;text-align:center">الوصف</th>
          <th style="border:1px solid #d1d5db;padding:8px 10px;font-weight:800;font-size:12px;color:#333;text-align:center">الكمية</th>
          <th style="border:1px solid #d1d5db;padding:8px 10px;font-weight:800;font-size:12px;color:#333;text-align:center">سعر الوحدة</th>
          <th style="border:1px solid #d1d5db;padding:8px 10px;font-weight:800;font-size:12px;color:#333;text-align:center">الإجمالي</th>
        </tr>
      </thead>
      <tbody>${itemsRows}</tbody>
      <tfoot>
        <tr style="background:#f9fafb">
          <td colspan="4" style="border:1px solid #d1d5db;padding:8px 10px;text-align:left;font-weight:800;font-size:13px">الإجمالي</td>
          <td style="border:1px solid #d1d5db;padding:8px 10px;text-align:center;font-weight:900;font-family:'Segoe UI',sans-serif;direction:ltr;font-size:13px">${formatCurrency(total)}</td>
        </tr>
      </tfoot>
    </table>

    <div style="padding:16px 28px">
      <table style="border-collapse:collapse;min-width:280px">
        <tr>
          <td style="padding:6px 12px;font-weight:800;color:#333;font-size:13px;background:#fef3c7;border-bottom:1px solid #e5e7eb">الإجمالي</td>
          <td class="en" style="padding:6px 12px;font-weight:900;color:#111;font-size:13px;text-align:left;direction:ltr;background:#fef3c7;border-bottom:1px solid #e5e7eb;min-width:100px">${formatCurrency(total)} ﷼</td>
        </tr>
        <tr>
          <td style="padding:6px 12px;font-weight:800;color:#555;font-size:13px;border-bottom:1px solid #e5e7eb">مدفوع</td>
          <td class="en" style="padding:6px 12px;font-weight:700;color:#555;font-size:13px;text-align:left;direction:ltr;border-bottom:1px solid #e5e7eb">${formatCurrency(paid)} ﷼</td>
        </tr>
        <tr>
          <td style="padding:6px 12px;font-weight:900;color:#dc2626;font-size:13px;background:#fee2e2;border-bottom:2px solid #ef4444">الرصيد المستحق</td>
          <td class="en" style="padding:6px 12px;font-weight:900;color:#dc2626;font-size:13px;text-align:left;direction:ltr;background:#fee2e2;border-bottom:2px solid #ef4444">${formatCurrency(remaining > 0 ? remaining : 0)} ﷼</td>
        </tr>
      </table>
    </div>
  `
}

function generateFooter(tmpl: InvoiceTemplate): string {
  return `
    <div style="padding:20px 28px">
      <div style="font-weight:800;font-size:14px;color:#111;text-align:center;margin-bottom:12px">شكراً لثقتكم ونتمنى لكم يوماً سعيداً!</div>
      <div style="font-size:11px;color:#555;line-height:1.8;text-align:center;margin-bottom:16px;padding:0 20px">
        ${escapeHtml(tmpl.companyAr || 'شيب بيك')} تقدم الخدمات اللوجستية ومتخصصة بالشحن الجوي لجميع دول العالم بجودة عالية وأسعار تنافسية، أيضاً متخصصون بشحن المواد الخطرة والسائلة، وتقديم خدمات التوزيع للمتاجر، وخدمات إدارة المتاجر الإلكترونية.
        ${tmpl.phone ? `<br/>للتواصل: <span style="direction:ltr;font-family:'Segoe UI',sans-serif">${safe(tmpl.phone)}</span>` : ''}
      </div>
      <div style="border-top:1px solid #e5e7eb;padding-top:12px">
        <div style="font-weight:800;font-size:13px;color:#111;margin-bottom:6px">الشروط والأحكام:</div>
        <div style="font-size:11px;color:#444;margin-bottom:6px">
          طلبكم لخدمات "${escapeHtml(tmpl.companyAr || 'شيب بيك')}" توافق باعتباركم "الشاحن"، نيابة عن نفسكم ونيابة عن مستلم الشحنة "المستلم"، وأي شخص آخر ذي صلة في الشحنة أن تطبق هذه الشروط والأحكام:
        </div>
        <ol style="font-size:10px;color:#555;line-height:1.8;padding-right:16px">
          <li>أن تكون جميع المعلومات المقدمة من قبل الشاحن أو ممثله تامه ودقيقة.</li>
          <li>أن لا تكون الشحنة من البضائع التي تحتوي على المواد الغير مقبولة مثل: سلع مقلدة وحيوانات وسبائك وعملات وأحجار كريمة وأسلحة ومتفجرات وذخيرة، وأيضاً مواد غير قانونية مثل المخدرات وغيرها من المواد المحظورة.</li>
          <li>في حال تأكيد وزن فعلي أو حجمي للقطعة الواحدة يجوز إعادة وزن أي قطعة وإعادة قياسها من قبل شيب بيك للتأكيد على صحة الحساب ويلتزم المستلم أو الشاحن بدفع إعادة الفارق في الوزن أو الرسوم الإضافية في حال وجود فرق في الوزن عن الوزن المقدم من الشاحن.</li>
        </ol>
      </div>
    </div>
  `
}

// ═══ Main HTML generator ═══
export function generateInvoiceHTML(inv: Invoice, tmpl: InvoiceTemplate): string {
  const { items, total } = computeInvoiceTotal(inv)
  const paid = parseFloat(String(inv.paid_amount || inv.partialPaid || 0)) || 0
  const remaining = total - paid
  const style = getTemplateStyle(tmpl.templateStyle)

  let themeContent = ''
  switch (style.key) {
    case 'modern':
      themeContent = generateModernTheme(inv, tmpl, items, total, paid, remaining)
      break
    case 'minimal':
      themeContent = generateMinimalTheme(inv, tmpl, items, total, paid, remaining)
      break
    case 'classic':
      themeContent = generateClassicTheme(inv, tmpl, items, total, paid, remaining)
      break
    case 'shippec':
    default:
      themeContent = generateShippecTheme(inv, tmpl, items, total, paid, remaining)
      break
  }

  return `<!DOCTYPE html>
<html dir="rtl" lang="ar">
<head>
<meta charset="UTF-8">
<title>فاتورة #${safe(inv.invoice_number || inv.id)}</title>
<style>
  @import url('https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700;800;900&display=swap');
  * { margin:0;padding:0;box-sizing:border-box }
  body { font-family:'Cairo','Segoe UI',sans-serif;background:#fff;color:#222;direction:rtl;font-size:13px;line-height:1.6 }
  .page { width:210mm;min-height:297mm;margin:0 auto;background:#fff }
  .en { font-family:'Segoe UI','Helvetica Neue',sans-serif;direction:ltr;unicode-bidi:embed }
  @media print {
    body { -webkit-print-color-adjust:exact;print-color-adjust:exact }
    .page { padding:0;width:100% }
  }
</style>
</head>
<body>
<div class="page">
${themeContent}
</div>
</body>
</html>`
}

// ═══ Download PDF ═══
export async function downloadInvoicePDF(inv: Invoice, tmpl: InvoiceTemplate) {
  const html = generateInvoiceHTML(inv, tmpl)
  
  // Try direct download using canvas -> jspdf
  try {
    const canvas = await htmlToCanvas(html)
    if (canvas) {
      const jspdf = (window as any).jspdf?.jsPDF || (window as any).jsPDF
      if (jspdf) {
        const pdf = new jspdf('p', 'mm', 'a4')
        const imgData = canvas.toDataURL('image/jpeg', 1.0)
        const pdfWidth = pdf.internal.pageSize.getWidth()
        const pdfHeight = pdf.internal.pageSize.getHeight()
        const imgWidth = pdfWidth
        const imgHeight = (canvas.height * imgWidth) / canvas.width
        
        let heightLeft = imgHeight
        let position = 0

        // First page
        pdf.addImage(imgData, 'JPEG', 0, position, imgWidth, imgHeight, undefined, 'FAST')
        heightLeft -= pdfHeight

        // Additional pages
        while (heightLeft > 0) {
          position = heightLeft - imgHeight
          pdf.addPage()
          pdf.addImage(imgData, 'JPEG', 0, position, imgWidth, imgHeight, undefined, 'FAST')
          heightLeft -= pdfHeight
        }

        const fileName = `invoice-${inv.invoice_number || inv.id}.pdf`
        pdf.save(fileName)
        return // Success!
      }
    }
  } catch (err) {
    console.warn('[PDF Download] Direct canvas download failed, falling back to print window:', err)
  }

  // Fallback: Original print window method (reliable)
  const printWindow = window.open('', '_blank', 'width=800,height=1100')
  if (!printWindow) {
    alert('يرجى السماح بالنوافذ المنبثقة لتحميل الـ PDF')
    return
  }
  printWindow.document.write(html)
  printWindow.document.close()
  printWindow.onload = () => {
    setTimeout(() => printWindow.print(), 600)
  }
}

// ═══ Share PDF via WhatsApp ═══
export async function shareInvoiceWhatsApp(inv: Invoice, tmpl: InvoiceTemplate) {
  const { total } = computeInvoiceTotal(inv)
  const paid = parseFloat(String(inv.paid_amount || inv.partialPaid || 0)) || 0
  const remaining = total - paid

  const phone = String(inv.phone || inv.receiver_phone || '').replace(/[^0-9+]/g, '')
  const cleanPhone = phone.startsWith('+')
    ? phone.slice(1)
    : phone.startsWith('0')
      ? '966' + phone.slice(1)
      : phone

  const fileName = `invoice-${safe(inv.invoice_number || inv.id)}.pdf`

  // ═══ Try Web Share API with file (works on mobile + WhatsApp) ═══
  if (navigator.share && navigator.canShare) {
    try {
      const html = generateInvoiceHTML(inv, tmpl)

      // Create a printable page in a hidden iframe and convert to PDF
      const canvas = await htmlToCanvas(html)
      if (canvas) {
        const pdfBlob = await canvasToPDFBlob(canvas, inv, tmpl)

        const file = new File([pdfBlob], fileName, { type: 'application/pdf' })

        if (navigator.canShare({ files: [file] })) {
          await navigator.share({
            title: `فاتورة #${safe(inv.invoice_number || inv.id)}`,
            text: `فاتورة #${safe(inv.invoice_number || inv.id)} — ${inv.client || ''} — ${formatCurrency(total)} ﷼`,
            files: [file],
          })
          return
        }
      }
    } catch (err) {
      console.warn('[WhatsApp Share] Web Share API failed:', err)
    }
  }

  // ═══ Fallback: Download PDF first, then open WhatsApp ═══
  // Step 1: Generate and auto-download the PDF
  const html = generateInvoiceHTML(inv, tmpl)
  const blob = new Blob([html], { type: 'text/html' })
  const htmlUrl = URL.createObjectURL(blob)

  // Open print dialog for PDF save
  const printWin = window.open('', '_blank', 'width=800,height=1100')
  if (printWin) {
    printWin.document.write(generateInvoiceHTML(inv, tmpl))
    printWin.document.close()

    printWin.onload = () => {
      setTimeout(() => {
        printWin.print()

        // After print dialog, open WhatsApp
        setTimeout(() => {
          const msg = [
            `\u{1F4C4} *فاتورة #${safe(inv.invoice_number || inv.id)}*`,
            `\u{1F464} ${inv.receiver || inv.client || '—'}`,
            `\u{1F4B0} الإجمالي: ${formatCurrency(total)} \u{FDFC}`,
            remaining > 0 ? `\u{1F534} المستحق: ${formatCurrency(remaining)} \u{FDFC}` : '\u{2705} مدفوعة بالكامل',
            '',
            '\u{1F4CE} الفاتورة PDF تم تحميلها — يرجى إرفاقها',
          ].join('\n')

          const cleanMsg = msg.replace(/\r/g, '').replace(/\n{3,}/g, '\n\n').trim()
          const encoded = encodeURIComponent(cleanMsg)
          const waUrl = cleanPhone
            ? `https://api.whatsapp.com/send/?phone=${cleanPhone}&text=${encoded}`
            : `https://api.whatsapp.com/send/?text=${encoded}`
          window.open(waUrl, '_blank')
        }, 1000)
      }, 600)
    }
  }

  URL.revokeObjectURL(htmlUrl)
}

// ═══ Helper: HTML to Canvas (for mobile PDF sharing) ═══
async function htmlToCanvas(html: string): Promise<HTMLCanvasElement | null> {
  try {
    // Try to use html2canvas if available
    const html2canvas = (window as any).html2canvas
    if (!html2canvas) return null

    const container = document.createElement('div')
    container.style.position = 'fixed'
    container.style.left = '-9999px'
    container.style.top = '0'
    container.style.width = '794px'
    container.innerHTML = html
    document.body.appendChild(container)

    const canvas = await html2canvas(container, {
      scale: 3,
      useCORS: true,
      logging: false,
    })

    document.body.removeChild(container)
    return canvas
  } catch {
    return null
  }
}

// ═══ Helper: Canvas to PDF Blob (using jsPDF if available) ═══
async function canvasToPDFBlob(canvas: HTMLCanvasElement, _inv: Invoice, _tmpl: InvoiceTemplate): Promise<Blob> {
  try {
    const jsPDF = (window as any).jspdf?.jsPDF || (window as any).jsPDF
    if (jsPDF) {
      const pdf = new jsPDF('p', 'mm', 'a4')
      const imgData = canvas.toDataURL('image/jpeg', 0.95)
      const pdfWidth = pdf.internal.pageSize.getWidth()
      const pdfHeight = (canvas.height * pdfWidth) / canvas.width
      pdf.addImage(imgData, 'JPEG', 0, 0, pdfWidth, pdfHeight)
      return pdf.output('blob')
    }
  } catch {}

  // Fallback: return the image as blob
  return new Promise((resolve) => {
    canvas.toBlob(
      (blob) => resolve(blob || new Blob([], { type: 'application/pdf' })),
      'image/png'
    )
  })
}