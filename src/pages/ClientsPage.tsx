import { useState, useCallback } from "react";
import {
  useClientsPage,
  SEGMENT_LABELS,
  SEGMENT_COLORS,
} from "../hooks/useClientsPage";
import type { ClientRecord, ClientProfileInvoice } from "../services/dbService";
import { openWhatsApp } from "../utils/whatsapp";
import { createPaymentLink } from "../services/paymobService";
import { downloadInvoicePDF } from "../utils/pdfGenerator";
import { useSettingsStore } from "../hooks/useSettingsStore";
import {
  Users,
  Download,
  FileSpreadsheet,
  RefreshCw,
  Search,
  CheckCircle2,
  AlertTriangle,
  AlertCircle,
  X,
  ChevronLeft,
  ChevronRight,
  CircleDollarSign,
  Package,
  TrendingUp,
  ArrowUpDown,
  Star,
  Activity,
  Moon,
  UserX,
  UserPlus,
  MapPin,
  Phone,
  Mail,
  Calendar,
  Filter,
  MessageCircle,
  Eye,
  ArrowUp,
  ArrowDown,
  BarChart3,
  Loader2,
  ArrowRight,
  FileText,
  Send,
  CreditCard,
  Building2,
  FileDown,
  Inbox,
  Trash2,
} from "lucide-react";

/* ══════════════════════════════════════════════ */
/*                    Helpers                     */
/* ══════════════════════════════════════════════ */

/** Safe number — prevents NaN everywhere */
function safe(v: any): number {
  const n = typeof v === 'number' ? v : parseFloat(v);
  return isNaN(n) || !isFinite(n) ? 0 : n;
}

function formatSar(v: any) {
  const n = safe(v);
  return (
    n.toLocaleString("en-US", {
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }) + " SAR"
  );
}

function formatNum(v: any) {
  const n = safe(v);
  return Math.round(n).toLocaleString("en-US");
}

/* ══════════════════════════════════════════════════════
 * UNIFIED CALCULATION LOGIC — matches SQL exactly
 * ══════════════════════════════════════════════════════ */

function realStatus(inv: ClientProfileInvoice): string {
  if (inv.status === "returned") return "returned";
  if (inv.status === "paid") return "paid";
  if (inv.status === "partial") return "partial";
  if (inv.status === "unpaid") return "unpaid";
  // Fallback: auto-detect from payment_status number
  const ps = (inv as any).payment_status;
  if (ps === 3) return "returned";
  if (ps === 2) return "paid";
  if (ps === 1) return "partial";
  // Fallback from amounts
  const price = safe(inv.price);
  const paid = safe(inv.partial_paid);
  if (paid > 0 && paid < price) return "partial";
  if (paid >= price && price > 0) return "paid";
  return "unpaid";
}

function realPaid(inv: ClientProfileInvoice): number {
  const st = realStatus(inv);
  const price = safe(inv.price);
  const partialPaid = safe(inv.partial_paid);
  if (st === "paid") return price;
  if (st === "partial") return Math.min(price, Math.max(0, partialPaid));
  return 0;
}

function realRemaining(inv: ClientProfileInvoice): number {
  const st = realStatus(inv);
  const price = safe(inv.price);
  const partialPaid = safe(inv.partial_paid);
  if (st === "unpaid") return price;
  if (st === "partial") return Math.max(0, price - partialPaid);
  return 0;
}

function realRevenue(inv: ClientProfileInvoice): number {
  const st = realStatus(inv);
  if (st === "returned") return 0;
  return safe(inv.price);
}

function statusBadge(status: string) {
  const map: Record<string, { icon: JSX.Element; label: string; cls: string }> =
    {
      paid: {
        icon: <CheckCircle2 size={11} />,
        label: "مدفوعة",
        cls: "bg-green-50 dark:bg-green-900/20 text-green-600 dark:text-green-400 border-green-200 dark:border-green-800/30",
      },
      partial: {
        icon: <AlertTriangle size={11} />,
        label: "جزئية",
        cls: "bg-yellow-50 dark:bg-yellow-900/20 text-yellow-600 dark:text-yellow-500 border-yellow-200 dark:border-yellow-800/30",
      },
      returned: {
        icon: <ArrowDown size={11} />,
        label: "مرتجع",
        cls: "bg-purple-50 dark:bg-purple-900/20 text-purple-600 dark:text-purple-400 border-purple-200 dark:border-purple-800/30",
      },
      unpaid: {
        icon: <AlertCircle size={11} />,
        label: "غير مدفوعة",
        cls: "bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 border-red-200 dark:border-red-800/30",
      },
    };
  const s = map[status] || map.unpaid;
  return (
    <span
      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold border ${s.cls}`}
    >
      {s.icon} {s.label}
    </span>
  );
}

function waLink(phone: string) {
  return `https://wa.me/${(phone || "").replace(/[^0-9+]/g, "").replace(/^0/, "966")}`;
}

/* ══════════════════════════════════════════════ */
/*         SEGMENT LABELS — extended             */
/* ══════════════════════════════════════════════ */

const EXTENDED_SEGMENT_LABELS: Record<string, string> = {
  ...SEGMENT_LABELS,
  no_invoices: "بدون فواتير",
};

const EXTENDED_SEGMENT_COLORS: Record<string, string> = {
  ...SEGMENT_COLORS,
  no_invoices:
    "text-slate-500 dark:text-slate-400 bg-slate-50 dark:bg-slate-800/30 border-slate-200 dark:border-slate-700",
};

/* ══════════════════════════════════════════════ */
/*              PDF GENERATION                    */
/* ══════════════════════════════════════════════ */

async function generateUnpaidClientPDF(
  client: ClientRecord,
  unpaidInvoices: ClientProfileInvoice[],
  totalUnpaid: number,
) {
  const sorted = [...unpaidInvoices].sort((a, b) => {
    if ((b.date || '') > (a.date || '')) return 1;
    if ((b.date || '') < (a.date || '')) return -1;
    return 0;
  });

  const today = new Date().toLocaleDateString('ar-SA', {
    year: 'numeric', month: 'long', day: 'numeric',
  });

  const statusMap: Record<string, { label: string; color: string; bg: string }> = {
    partial: { label: 'جزئية', color: '#D97706', bg: '#FFFBEB' },
    unpaid:  { label: 'غير مدفوعة', color: '#DC2626', bg: '#FEF2F2' },
  };

  const rows = sorted.map((inv, idx) => {
    const st   = realStatus(inv);
    const paid = realPaid(inv);
    const rem  = realRemaining(inv);
    const si   = statusMap[st] || statusMap.unpaid;
    return `
      <tr style="border-bottom:1px solid #E2E8F0;${idx % 2 === 1 ? 'background:#FFF5F5;' : ''}">
        <td style="padding:10px 12px;font-family:'Inter',monospace;font-weight:700;color:#4F46E5;font-size:12px;">#${inv.daftra_id || inv.id}</td>
        <td style="padding:10px 12px;font-size:11px;color:#64748B;">${(inv.date || '').slice(0, 10)}</td>
        <td style="padding:10px 12px;"><span style="display:inline-block;padding:2px 8px;border-radius:6px;font-size:10px;font-weight:700;color:${si.color};background:${si.bg};">${si.label}</span></td>
        <td style="padding:10px 12px;font-size:11px;color:#64748B;">${inv.awb || '—'}</td>
        <td style="padding:10px 12px;font-family:'Inter',monospace;font-weight:700;font-size:12px;color:#1E293B;">${safe(inv.price).toLocaleString('en-US')} SAR</td>
        <td style="padding:10px 12px;font-family:'Inter',monospace;font-weight:700;font-size:12px;color:#10B981;">${paid > 0 ? paid.toLocaleString('en-US') + ' SAR' : '—'}</td>
        <td style="padding:10px 12px;font-family:'Inter',monospace;font-weight:800;font-size:12px;color:#EF4444;">${rem.toLocaleString('en-US')} SAR</td>
      </tr>`;
  }).join('');

  const html = `<!DOCTYPE html>
<html dir="rtl" lang="ar">
<head>
<meta charset="UTF-8">
<title>كشف فواتير غير مدفوعة — ${client.name}</title>
<style>
  @import url('https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700;800&family=Inter:wght@400;600;700;800&display=swap');
  * { margin:0; padding:0; box-sizing:border-box; }
  body { font-family:'Cairo','Inter',sans-serif; background:#fff; color:#1E293B; }
  @page { size:A4; margin:12mm; }
  @media print { body { -webkit-print-color-adjust:exact; print-color-adjust:exact; } }
</style>
</head>
<body style="padding:32px;">

<!-- Header -->
<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:24px;padding-bottom:16px;border-bottom:3px solid #EF4444;">
  <div>
    <h1 style="font-size:24px;font-weight:800;color:#EF4444;">كشف الفواتير غير المدفوعة</h1>
    <p style="font-size:12px;color:#64748B;margin-top:4px;">تاريخ الإصدار: ${today}</p>
  </div>
  <div style="text-align:left;">
    <div style="font-size:20px;font-weight:900;color:#4F46E5;">شيب بك</div>
    <div style="font-size:11px;color:#94A3B8;">SHIPPECO — Shipping Management</div>
  </div>
</div>

<!-- Client Summary -->
<div style="background:#FEF2F2;border:1px solid #FECACA;border-radius:12px;padding:16px 20px;margin-bottom:20px;display:flex;justify-content:space-between;align-items:center;">
  <div>
    <div style="font-size:11px;color:#EF4444;font-weight:700;margin-bottom:4px;">العميل</div>
    <div style="font-size:18px;font-weight:800;color:#1E293B;">${client.name}</div>
    ${client.phone ? `<div style="font-size:12px;color:#64748B;margin-top:4px;">${client.phone}</div>` : ''}
  </div>
  <div style="text-align:center;">
    <div style="font-size:11px;color:#EF4444;font-weight:700;margin-bottom:4px;">عدد الفواتير المستحقة</div>
    <div style="font-size:28px;font-weight:900;color:#DC2626;">${sorted.length}</div>
  </div>
  <div style="text-align:left;">
    <div style="font-size:11px;color:#EF4444;font-weight:700;margin-bottom:4px;">إجمالي المستحق</div>
    <div style="font-size:24px;font-weight:900;color:#DC2626;font-family:'Inter',monospace;">${Math.round(totalUnpaid).toLocaleString('en-US')} SAR</div>
  </div>
</div>

<!-- Table -->
<table style="width:100%;border-collapse:collapse;margin-bottom:24px;">
  <thead>
    <tr style="background:#FEF2F2;border-bottom:2px solid #FECACA;">
      <th style="padding:10px 12px;text-align:right;font-size:11px;font-weight:700;color:#EF4444;">رقم الفاتورة</th>
      <th style="padding:10px 12px;text-align:right;font-size:11px;font-weight:700;color:#EF4444;">التاريخ</th>
      <th style="padding:10px 12px;text-align:right;font-size:11px;font-weight:700;color:#EF4444;">الحالة</th>
      <th style="padding:10px 12px;text-align:right;font-size:11px;font-weight:700;color:#EF4444;">رقم البوليصة</th>
      <th style="padding:10px 12px;text-align:right;font-size:11px;font-weight:700;color:#EF4444;">الإجمالي</th>
      <th style="padding:10px 12px;text-align:right;font-size:11px;font-weight:700;color:#EF4444;">المدفوع</th>
      <th style="padding:10px 12px;text-align:right;font-size:11px;font-weight:700;color:#EF4444;">المتبقي</th>
    </tr>
  </thead>
  <tbody>${rows}</tbody>
</table>

<!-- Footer Total -->
<div style="display:flex;justify-content:flex-end;">
  <div style="background:#FEF2F2;border:2px solid #EF4444;border-radius:12px;padding:16px 28px;text-align:center;min-width:220px;">
    <div style="font-size:12px;font-weight:700;color:#EF4444;margin-bottom:6px;">إجمالي المبالغ المستحقة</div>
    <div style="font-size:26px;font-weight:900;color:#DC2626;font-family:'Inter',monospace;">${Math.round(totalUnpaid).toLocaleString('en-US')} SAR</div>
    <div style="font-size:11px;color:#94A3B8;margin-top:6px;">يُرجى السداد في أقرب وقت ممكن</div>
  </div>
</div>

</body>
</html>`;

  // --- Direct Download via html2canvas ---
  try {
    const html2canvas = (window as any).html2canvas;
    const jspdf = (window as any).jspdf?.jsPDF || (window as any).jsPDF;

    if (html2canvas && jspdf) {
      const container = document.createElement('div');
      container.style.position = 'fixed';
      container.style.left = '-9999px';
      container.style.top = '0';
      container.style.width = '794px'; // A4 width in pixels
      container.innerHTML = html;
      document.body.appendChild(container);

      const canvas = await html2canvas(container, {
        scale: 3, // Higher resolution for crystal clear text
        useCORS: true,
        logging: false,
        backgroundColor: '#ffffff',
      });

      document.body.removeChild(container);

      const imgData = canvas.toDataURL('image/jpeg', 1.0);
      const pdf = new jspdf('p', 'mm', 'a4');
      const pdfWidth = pdf.internal.pageSize.getWidth();
      const pdfHeight = pdf.internal.pageSize.getHeight();
      const imgWidth = pdfWidth;
      const imgHeight = (canvas.height * imgWidth) / canvas.width;
      
      let heightLeft = imgHeight;
      let position = 0;

      // First page
      pdf.addImage(imgData, 'JPEG', 0, position, imgWidth, imgHeight, undefined, 'FAST');
      heightLeft -= pdfHeight;

      // Additional pages if needed
      while (heightLeft > 0) {
        position = heightLeft - imgHeight;
        pdf.addPage();
        pdf.addImage(imgData, 'JPEG', 0, position, imgWidth, imgHeight, undefined, 'FAST');
        heightLeft -= pdfHeight;
      }

      pdf.save(`unpaid-invoices-${client.name}-${today}.pdf`);
      return;
    }
  } catch (err) {
    console.warn('[PDF Download] Failed, falling back to print window:', err);
  }

  // Fallback: Original print window method
  const pw = window.open('', '_blank', 'width=900,height=1200');
  if (!pw) { alert('يرجى السماح بالنوافذ المنبثقة'); return; }
  pw.document.write(html);
  pw.document.close();
  pw.onload = () => { setTimeout(() => pw.print(), 600); };
}

async function generateClientPDF(
  client: ClientRecord,
  invoices: ClientProfileInvoice[],
) {
  const allInvs = [...invoices].sort((a, b) => {
    if ((b.date || "") > (a.date || "")) return 1;
    if ((b.date || "") < (a.date || "")) return -1;
    return 0;
  });

  // ✅ Use safe() for ALL calculations — NO NaN possible
  const totalAmount = allInvs.reduce((s, i) => s + realRevenue(i), 0);
  const totalPaid = allInvs.reduce((s, i) => s + realPaid(i), 0);
  const totalRemaining = allInvs.reduce((s, i) => s + realRemaining(i), 0);

  const roundedAmount = Math.round(totalAmount * 100) / 100;
  const roundedPaid = Math.round(totalPaid * 100) / 100;
  const roundedRemaining = Math.round(totalRemaining * 100) / 100;

  const unpaidCount = allInvs.filter((i) => {
    const st = realStatus(i);
    return st === "unpaid" || st === "partial";
  }).length;

  const today = new Date().toLocaleDateString("ar-SA", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  const statusMap: Record<string, { label: string; color: string; bg: string }> = {
    paid: { label: "مدفوعة", color: "#059669", bg: "#ECFDF5" },
    partial: { label: "جزئية", color: "#D97706", bg: "#FFFBEB" },
    unpaid: { label: "غير مدفوعة", color: "#DC2626", bg: "#FEF2F2" },
    returned: { label: "مرتجع", color: "#7C3AED", bg: "#F5F3FF" },
  };

  const invoiceRows = allInvs
    .map((inv, idx) => {
      const st = realStatus(inv);
      const paid = realPaid(inv);
      const remaining = realRemaining(inv);
      const stInfo = statusMap[st] || statusMap.unpaid;
      return `
      <tr style="border-bottom:1px solid #E2E8F0;${idx % 2 === 1 ? "background:#F8FAFC;" : ""}">
        <td style="padding:10px 12px;font-family:'Inter',monospace;font-weight:700;color:#4F46E5;font-size:12px;">#${inv.daftra_id || inv.id}</td>
        <td style="padding:10px 12px;font-size:11px;color:#64748B;">${(inv.date || "").slice(0, 10)}</td>
        <td style="padding:10px 12px;">
          <span style="display:inline-block;padding:2px 8px;border-radius:6px;font-size:10px;font-weight:700;color:${stInfo.color};background:${stInfo.bg};">${stInfo.label}</span>
        </td>
        <td style="padding:10px 12px;font-size:11px;color:#64748B;">${inv.awb || "—"}</td>
        <td style="padding:10px 12px;font-family:'Inter',monospace;font-weight:700;font-size:12px;color:#1E293B;">${safe(inv.price).toLocaleString("en-US")} SAR</td>
        <td style="padding:10px 12px;font-family:'Inter',monospace;font-weight:700;font-size:12px;color:#10B981;">${paid > 0 ? paid.toLocaleString("en-US") + " SAR" : "—"}</td>
        <td style="padding:10px 12px;font-family:'Inter',monospace;font-weight:800;font-size:12px;color:${remaining > 0 ? "#EF4444" : "#94A3B8"};">${remaining > 0 ? remaining.toLocaleString("en-US") + " SAR" : "✔"}</td>
      </tr>`;
    })
    .join("");

  const html = `<!DOCTYPE html>
<html dir="rtl" lang="ar">
<head>
<meta charset="UTF-8">
<title>كشف حساب — ${client.name}</title>
<style>
  @import url('https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700;800&family=Inter:wght@400;600;700;800&display=swap');
  * { margin:0; padding:0; box-sizing:border-box; }
  body { font-family:'Cairo','Inter',sans-serif; background:#fff; color:#1E293B; }
  @page { size:A4; margin:12mm; }
  @media print { body { -webkit-print-color-adjust:exact; print-color-adjust:exact; } }
</style>
</head>
<body style="padding:32px;">

<!-- Header -->
<div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:24px;border-bottom:3px solid #4F46E5;padding-bottom:16px;">
  <div>
    <h1 style="font-size:28px;font-weight:800;color:#1E293B;margin-bottom:4px;">
      <span style="color:#4F46E5;">شيب</span> بيك
    </h1>
    <p style="font-size:10px;color:#64748B;font-weight:600;">SHiPPEC — Shipping Management</p>
    <p style="font-size:10px;color:#64748B;margin-top:4px;">
      شيب بيك - مؤسسة نور . خ . م . آل دهنيم<br>
      س.ج 2050174810 | المملكة العربية السعودية<br>
      الدمام، حي الروضة 32256<br>
      +966537366522 | info@shippec.com
    </p>
  </div>
  <div style="text-align:left;">
    <div style="font-size:11px;color:#64748B;font-weight:600;">التاريخ: ${today}</div>
    <div style="font-size:11px;color:#64748B;">إجمالي الفواتير: ${allInvs.length}</div>
  </div>
</div>

<!-- Client Info -->
<div style="background:#F8FAFC;border:1px solid #E2E8F0;border-radius:12px;padding:16px;margin-bottom:20px;">
  <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:12px;">
    <div>
      <p style="font-size:10px;color:#64748B;font-weight:700;margin-bottom:3px;">العميل</p>
      <p style="font-size:18px;font-weight:800;color:#1E293B;">${client.name}</p>
      <p style="font-size:11px;color:#64748B;margin-top:2px;">
        ${client.phone ? "📱 " + client.phone : ""}
        ${client.city ? " | 📍 " + client.city : ""}
        ${client.email ? " | ✉️ " + client.email : ""}
      </p>
    </div>
    <div style="display:flex;gap:12px;text-align:center;flex-wrap:wrap;">
      <div style="background:#fff;border:1px solid #E2E8F0;border-radius:10px;padding:10px 16px;">
        <p style="font-size:20px;font-weight:800;color:#EF4444;font-family:'Inter',monospace;">${roundedRemaining.toLocaleString("en-US")}</p>
        <p style="font-size:10px;color:#64748B;font-weight:700;">SAR المبلغ المستحق</p>
      </div>
      <div style="background:#fff;border:1px solid #E2E8F0;border-radius:10px;padding:10px 16px;">
        <p style="font-size:20px;font-weight:800;color:#10B981;font-family:'Inter',monospace;">${roundedPaid.toLocaleString("en-US")}</p>
        <p style="font-size:10px;color:#64748B;font-weight:700;">SAR المدفوع فعلاً</p>
      </div>
      <div style="background:#fff;border:1px solid #E2E8F0;border-radius:10px;padding:10px 16px;">
        <p style="font-size:20px;font-weight:800;color:#4F46E5;font-family:'Inter',monospace;">${unpaidCount}</p>
        <p style="font-size:10px;color:#64748B;font-weight:700;">فاتورة مستحقة</p>
      </div>
    </div>
  </div>
</div>

<!-- Invoices Table -->
<table style="width:100%;border-collapse:collapse;font-size:12px;margin-bottom:20px;">
  <thead>
    <tr style="background:#4F46E5;color:#fff;">
      <th style="padding:10px 12px;text-align:right;font-weight:700;font-size:10px;letter-spacing:0.5px;">رقم الفاتورة</th>
      <th style="padding:10px 12px;text-align:right;font-weight:700;font-size:10px;">التاريخ</th>
      <th style="padding:10px 12px;text-align:right;font-weight:700;font-size:10px;">الحالة</th>
      <th style="padding:10px 12px;text-align:right;font-weight:700;font-size:10px;">رقم البوليصة</th>
      <th style="padding:10px 12px;text-align:right;font-weight:700;font-size:10px;">الإجمالي</th>
      <th style="padding:10px 12px;text-align:right;font-weight:700;font-size:10px;">المدفوع</th>
      <th style="padding:10px 12px;text-align:right;font-weight:700;font-size:10px;">المتبقي</th>
    </tr>
  </thead>
  <tbody>
    ${invoiceRows}
  </tbody>
</table>

<!-- Totals -->
<div style="display:flex;justify-content:flex-end;margin-bottom:24px;">
  <div style="width:320px;border:2px solid #4F46E5;border-radius:12px;overflow:hidden;">
    <div style="display:flex;justify-content:space-between;padding:10px 14px;border-bottom:1px solid #E2E8F0;">
      <span style="font-weight:700;color:#64748B;font-size:12px;">إجمالي الفواتير</span>
      <span style="font-weight:800;font-family:'Inter',monospace;font-size:13px;color:#1E293B;">${roundedAmount.toLocaleString("en-US")} SAR</span>
    </div>
    <div style="display:flex;justify-content:space-between;padding:10px 14px;border-bottom:1px solid #E2E8F0;">
      <span style="font-weight:700;color:#10B981;font-size:12px;">إجمالي المدفوع</span>
      <span style="font-weight:800;font-family:'Inter',monospace;font-size:13px;color:#10B981;">${roundedPaid.toLocaleString("en-US")} SAR</span>
    </div>
    <div style="display:flex;justify-content:space-between;padding:12px 14px;background:#FEF2F2;">
      <span style="font-weight:800;color:#EF4444;font-size:13px;">الرصيد المستحق</span>
      <span style="font-weight:900;font-family:'Inter',monospace;font-size:17px;color:#EF4444;">${roundedRemaining.toLocaleString("en-US")} SAR</span>
    </div>
  </div>
</div>

<!-- Footer -->
<div style="border-top:2px solid #E2E8F0;padding-top:14px;text-align:center;">
  <p style="font-size:11px;color:#64748B;font-weight:600;line-height:1.8;">
    شكراً لتفضلكم ونتمنى لكم يوماً سعيداً!<br>
    شيب بيك تقدم الخدمات اللوجستية ومتخصصة بالشحن الجوي لجميع دول العالم<br>
    بجودة عالية وأسعار تنافسية — أيضاً مختصون بشحن المواد الخطرة والسائلة<br>
    للتواصل: +966537366522 | www.shippec.com
  </p>
</div>

</body>
</html>`;

  // --- Direct Download via html2canvas ---
  try {
    const html2canvas = (window as any).html2canvas;
    const jspdf = (window as any).jspdf?.jsPDF || (window as any).jsPDF;

    if (html2canvas && jspdf) {
      const container = document.createElement('div');
      container.style.position = 'fixed';
      container.style.left = '-9999px';
      container.style.top = '0';
      container.style.width = '794px'; 
      container.innerHTML = html;
      document.body.appendChild(container);

      const canvas = await html2canvas(container, {
        scale: 3, // Higher resolution
        useCORS: true,
        logging: false,
        backgroundColor: '#ffffff',
      });

      document.body.removeChild(container);

      const imgData = canvas.toDataURL('image/jpeg', 1.0);
      const pdf = new jspdf('p', 'mm', 'a4');
      const pdfWidth = pdf.internal.pageSize.getWidth();
      const pdfHeight = pdf.internal.pageSize.getHeight();
      const imgWidth = pdfWidth;
      const imgHeight = (canvas.height * imgWidth) / canvas.width;
      
      let heightLeft = imgHeight;
      let position = 0;

      // First page
      pdf.addImage(imgData, 'JPEG', 0, position, imgWidth, imgHeight, undefined, 'FAST');
      heightLeft -= pdfHeight;

      // Additional pages
      while (heightLeft > 0) {
        position = heightLeft - imgHeight;
        pdf.addPage();
        pdf.addImage(imgData, 'JPEG', 0, position, imgWidth, imgHeight, undefined, 'FAST');
        heightLeft -= pdfHeight;
      }

      pdf.save(`statement-${client.name}-${today}.pdf`);
      return;
    }
  } catch (err) {
    console.warn('[PDF Download] Failed, falling back to print window:', err);
  }

  const win = window.open("", "_blank", "width=900,height=1100");
  if (!win) return;
  win.document.write(html);
  win.document.close();
  win.onload = () => {
    setTimeout(() => win.print(), 600);
  };
}

/* ══════════════════════════════════════════════ */
/*               Sub Components                  */
/* ══════════════════════════════════════════════ */

function SegmentBadge({ segment }: { segment: string }) {
  const cls = EXTENDED_SEGMENT_COLORS[segment] || EXTENDED_SEGMENT_COLORS.no_invoices;
  const label = EXTENDED_SEGMENT_LABELS[segment] || segment;
  const icons: Record<string, JSX.Element> = {
    vip: <Star size={11} />,
    active: <Activity size={11} />,
    dormant: <Moon size={11} />,
    defaulter: <UserX size={11} />,
    new: <UserPlus size={11} />,
    regular: <Users size={11} />,
    no_invoices: <Inbox size={11} />,
  };
  return (
    <span
      className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-bold border ${cls}`}
    >
      {icons[segment] || <Inbox size={11} />} {label}
    </span>
  );
}

function CollectionBar({
  rate,
  size = "sm",
}: {
  rate: number;
  size?: "sm" | "lg";
}) {
  const safeRate = Math.min(Math.max(safe(rate), 0), 100);
  const color =
    safeRate >= 80
      ? "bg-green-500"
      : safeRate >= 50
        ? "bg-yellow-500"
        : safeRate >= 25
          ? "bg-orange-500"
          : "bg-red-500";
  const h = size === "lg" ? "h-3" : "h-1.5";
  return (
    <div className="flex items-center gap-2 min-w-[80px]">
      <div
        className={`flex-1 ${h} bg-gray-100 dark:bg-slate-700 rounded-full overflow-hidden`}
      >
        <div
          className={`h-full ${color} rounded-full transition-all duration-500`}
          style={{ width: `${safeRate}%` }}
        />
      </div>
      <span
        className={`font-bold font-inter text-gray-500 dark:text-gray-400 text-left ${size === "lg" ? "text-sm w-12" : "text-[10px] w-8"}`}
      >
        {safeRate.toFixed(0)}%
      </span>
    </div>
  );
}

function SortHeader({
  label,
  field,
  currentSort,
  currentOrder,
  onToggle,
}: {
  label: string;
  field: string;
  currentSort: string;
  currentOrder: string;
  onToggle: (f: any) => void;
}) {
  const isActive = currentSort === field;
  return (
    <button
      className={`flex items-center gap-1 text-[10px] uppercase font-bold tracking-wider transition-colors whitespace-nowrap ${isActive ? "text-indigo-600 dark:text-indigo-400" : "text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"}`}
      onClick={() => onToggle(field)}
      type="button"
    >
      {label}
      {isActive ? (
        currentOrder === "desc" ? (
          <ArrowDown size={11} />
        ) : (
          <ArrowUp size={11} />
        )
      ) : (
        <ArrowUpDown size={11} className="opacity-30" />
      )}
    </button>
  );
}

function Pagination({
  page,
  pages,
  total,
  onPage,
}: {
  page: number;
  pages: number;
  total: number;
  onPage: (p: number) => void;
}) {
  if (pages <= 1) return null;
  return (
    <div className="flex items-center justify-between px-4 py-3 border-t border-gray-200 dark:border-slate-700 bg-gray-50/50 dark:bg-slate-900/30">
      <span className="text-xs font-bold text-gray-500 dark:text-gray-400">
        صفحة <span className="font-inter">{page}</span> من{" "}
        <span className="font-inter">{pages}</span> •{" "}
        <span className="font-inter">{formatNum(total)}</span> عميل
      </span>
      <div className="flex items-center gap-1">
        <button
          className="p-1.5 rounded-lg border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 disabled:opacity-30 transition-colors"
          onClick={() => onPage(page - 1)}
          disabled={page <= 1}
          type="button"
        >
          <ChevronRight size={16} />
        </button>
        {Array.from({ length: Math.min(pages, 5) }, (_, i) => {
          let p: number;
          if (pages <= 5) p = i + 1;
          else if (page <= 3) p = i + 1;
          else if (page >= pages - 2) p = pages - 4 + i;
          else p = page - 2 + i;
          return (
            <button
              key={p}
              className={`w-8 h-8 rounded-lg text-xs font-bold transition-colors ${p === page ? "bg-indigo-600 text-white" : "bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 text-gray-600 dark:text-gray-400 hover:bg-gray-50"}`}
              onClick={() => onPage(p)}
              type="button"
            >
              {p}
            </button>
          );
        })}
        <button
          className="p-1.5 rounded-lg border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 disabled:opacity-30 transition-colors"
          onClick={() => onPage(page + 1)}
          disabled={page >= pages}
          type="button"
        >
          <ChevronLeft size={16} />
        </button>
      </div>
    </div>
  );
}

function KpiCard({
  label,
  value,
  icon: Icon,
  colorClass,
  bgClass,
}: {
  label: string;
  value: string;
  icon: any;
  colorClass: string;
  bgClass: string;
}) {
  return (
    <div className="bg-white dark:bg-slate-800 rounded-2xl p-4 border border-gray-200 dark:border-slate-700 shadow-sm">
      <div className="flex items-center justify-between mb-2">
        <span className="text-[11px] font-bold text-gray-500 dark:text-gray-400 leading-tight">
          {label}
        </span>
        <div className={`p-2 rounded-lg ${bgClass}`}>
          <Icon size={16} />
        </div>
      </div>
      <p className={`text-lg xl:text-xl font-bold font-inter ${colorClass}`}>
        {value}
      </p>
    </div>
  );
}

function ClientCard({
  client,
  onOpen,
}: {
  client: ClientRecord;
  onOpen: () => void;
}) {
  return (
    <div
      className="bg-white dark:bg-slate-800 rounded-xl border border-gray-200 dark:border-slate-700 p-4 shadow-sm hover:shadow-md transition-all cursor-pointer active:scale-[0.98]"
      onClick={onOpen}
    >
      <div className="flex items-start justify-between mb-2">
        <div className="flex-1 min-w-0">
          <h3 className="font-bold text-gray-900 dark:text-white truncate text-sm">
            {client.name}
          </h3>
          {client.phone && (
            <p className="text-xs text-gray-500 font-inter mt-0.5">
              {client.phone}
            </p>
          )}
        </div>
        <SegmentBadge segment={client.segment} />
      </div>
      <div className="grid grid-cols-3 gap-2 mt-3">
        <div className="text-center">
          <p className="text-sm font-bold font-inter text-indigo-600 dark:text-indigo-400">
            {safe(client.total_invoices)}
          </p>
          <p className="text-[10px] text-gray-400">فاتورة</p>
        </div>
        <div className="text-center">
          <p className="text-xs font-bold font-inter text-yellow-600">
            {formatSar(client.total_revenue)}
          </p>
          <p className="text-[10px] text-gray-400">إيرادات</p>
        </div>
        <div className="text-center">
          <p className="text-xs font-bold font-inter text-red-600">
            {formatSar(client.total_remaining)}
          </p>
          <p className="text-[10px] text-gray-400">متبقي</p>
        </div>
      </div>
      <div className="mt-3 pt-2 border-t border-gray-100 dark:border-slate-700">
        <CollectionBar rate={safe(client.collection_rate)} />
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════ */
/*         FULL-PAGE Client Profile              */
/* ══════════════════════════════════════════════ */

function ClientProfilePage({
  profile,
  loading,
  onClose,
  cli,
}: {
  profile: any;
  loading: boolean;
  onClose: () => void;
  cli: any;
}) {
  const [invoiceFilter, setInvoiceFilter] = useState<string>("all");
  const [selectedInvs, setSelectedInvs] = useState<string[]>([]);
  const [creatingLink, setCreatingLink] = useState(false);
  const invoiceTemplate = useSettingsStore(s => s.invoiceTemplate);
  const client: ClientRecord | null = profile?.client || null;
  const allInvoices: ClientProfileInvoice[] = profile?.invoices || [];
  const monthly: Array<{ month: string; revenue: number; count: number }> =
    profile?.monthly || [];
  const statusBreakdown: Array<{
    status: string;
    count: number;
    total: number;
    paid: number;
  }> = profile?.status_breakdown || [];

  const invoices =
    invoiceFilter === "all"
      ? allInvoices
      : allInvoices.filter((inv) => realStatus(inv) === invoiceFilter);
  const unpaidInvoices = allInvoices.filter((inv) => {
    const st = realStatus(inv);
    return st === "unpaid" || st === "partial";
  });
  const totalUnpaid = unpaidInvoices.reduce(
    (sum, inv) => sum + realRemaining(inv),
    0,
  );

  const maxRevenue = Math.max(...monthly.map((m) => safe(m.revenue)), 1);

  const handlePDF = useCallback(async () => {
    if (client) await generateClientPDF(client, allInvoices);
  }, [client, allInvoices]);

  const handleUnpaidPDF = useCallback(async () => {
    if (client && unpaidInvoices.length > 0)
      await generateUnpaidClientPDF(client, unpaidInvoices, totalUnpaid);
  }, [client, unpaidInvoices, totalUnpaid]);

  const toggleSelect = (id: string) => {
    setSelectedInvs(prev => 
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    );
  };

  const toggleAll = () => {
    if (selectedInvs.length === invoices.length) {
      setSelectedInvs([]);
    } else {
      setSelectedInvs(invoices.map(i => i.id));
    }
  };

  const handleBulkPaymob = async () => {
    if (!client || selectedInvs.length === 0 || creatingLink) return;
    
    const selectedData = allInvoices.filter(i => selectedInvs.includes(i.id));
    const total = selectedData.reduce((sum, i) => sum + realRemaining(i), 0);
    
    if (total <= 0) {
      alert("المبلغ الإجمالي يجب أن يكون أكبر من صفر");
      return;
    }

    setCreatingLink(true);
    try {
      const res = await createPaymentLink({
        invoice_ids: selectedInvs.map(id => Number(id)),
        amount: total,
        client_name: client.name,
        client_phone: client.phone || '0500000000',
        description: `دفع ${selectedInvs.length} فواتير للعميل ${client.name}`
      });

      const url = res.payment_url_full || res.payment_url;
      if (url) {
        window.open(url, '_blank');
        setSelectedInvs([]);
      }
    } catch (err: any) {
      alert(err.message || "فشل إنشاء الرابط");
    } finally {
      setCreatingLink(false);
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-4">
        <Loader2 size={36} className="animate-spin text-indigo-500" />
        <p className="text-sm font-bold text-gray-500">
          جاري تحميل بيانات العميل...
        </p>
      </div>
    );
  }
  if (!client) {
    return (
      <div className="flex flex-col items-center justify-center py-32 px-4 text-center animate-in fade-in duration-300">
        <div className="w-20 h-20 bg-gray-100 dark:bg-slate-800 rounded-full flex items-center justify-center mb-6">
          <UserX size={32} className="text-gray-400" />
        </div>
        <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">
          لم يتم العثور على بيانات العميل
        </h2>
        <p className="text-gray-500 max-w-md mx-auto mb-8 leading-relaxed">
          عذراً، لا يمكننا العثور على أي بيانات مسجلة لهذا العميل. قد يكون الاسم مسجلاً بشكل مختلف أو لا توجد فواتير مرتبطة به.
        </p>
        <button
          onClick={onClose}
          className="flex items-center gap-2 px-6 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-bold transition-all shadow-lg shadow-indigo-500/20"
        >
          <ArrowRight size={18} />
          العودة لقائمة العملاء
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-5 animate-in fade-in duration-300">
      {/* Back */}
      <button
        onClick={onClose}
        className="flex items-center gap-2 text-sm font-bold text-gray-500 hover:text-indigo-600 transition-colors"
        type="button"
      >
        <ArrowRight size={18} /> العودة لقائمة العملاء
      </button>

      {/* Client Header */}
      <div className="bg-white dark:bg-slate-800 rounded-2xl border border-gray-200 dark:border-slate-700 shadow-sm overflow-hidden">
        <div className="h-2 bg-gradient-to-l from-indigo-500 via-purple-500 to-pink-500" />
        <div className="p-5 md:p-6">
          <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
            <div className="flex items-start gap-4">
              <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-white font-bold text-2xl shadow-lg shadow-indigo-500/20 flex-shrink-0">
                {(client.name || "?")[0]}
              </div>
              <div>
                <h1 className="text-xl md:text-2xl font-bold text-gray-900 dark:text-white">
                  {client.name}
                </h1>
                <div className="flex flex-wrap items-center gap-3 mt-2">
                  {client.phone && (
                    <span className="flex items-center gap-1.5 text-sm text-gray-500 font-inter">
                      <Phone size={14} className="text-gray-400" />{" "}
                      {client.phone}
                    </span>
                  )}
                  {client.email && (
                    <span className="flex items-center gap-1.5 text-sm text-gray-500">
                      <Mail size={14} className="text-gray-400" />{" "}
                      {client.email}
                    </span>
                  )}
                  {client.city && (
                    <span className="flex items-center gap-1.5 text-sm text-gray-500">
                      <MapPin size={14} className="text-gray-400" />{" "}
                      {client.city}
                      {client.state ? ` - ${client.state}` : ""}
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-3 mt-3">
                  <SegmentBadge segment={client.segment} />
                  {client.created_at && (
                    <span className="flex items-center gap-1 text-xs text-gray-400 font-inter">
                      <Calendar size={12} /> عميل منذ{" "}
                      {(client.created_at || "").slice(0, 10)}
                    </span>
                  )}
                  {client.daftra_id && (
                    <span className="flex items-center gap-1 text-xs text-gray-400 font-inter">
                      <Building2 size={12} /> دفترة #{client.daftra_id}
                    </span>
                  )}
                </div>
              </div>
            </div>
            {/* Actions */}
            <div className="flex items-center gap-2 flex-shrink-0 flex-wrap">
              {/* Management Actions */}
              <div className="flex items-center gap-1.5 ml-2 pl-2 border-l border-gray-200 dark:border-slate-700">
                <button
                  type="button"
                  onClick={() => {
                    if (client.total_invoices > 0) {
                      window.alert("لا يمكن حذف عميل لديه فواتير مرتبطة. يرجى حذف الفواتير أولاً.");
                      return;
                    }
                    if (window.confirm(`هل أنت متأكد من حذف العميل "${client.name}" نهائياً؟`)) {
                      void cli.deleteClient(client.id);
                    }
                  }}
                  className="p-2.5 rounded-xl bg-gray-100 dark:bg-slate-700 text-gray-600 dark:text-gray-300 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-900/20 dark:hover:text-red-400 transition-all"
                  title="حذف العميل"
                >
                  <Trash2 size={18} />
                </button>
              </div>

              <button
                onClick={handlePDF}
                className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-red-500 hover:bg-red-600 text-white text-sm font-bold transition-colors shadow-lg shadow-red-500/20"
                type="button"
              >
                <FileDown size={16} />
                <span className="hidden sm:inline">كشف حساب PDF</span>
                <span className="sm:hidden">PDF</span>
              </button>
              {unpaidInvoices.length > 0 && (
                <button
                  onClick={handleUnpaidPDF}
                  className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-rose-700 hover:bg-rose-800 text-white text-sm font-bold transition-colors shadow-lg shadow-rose-700/20"
                  type="button"
                  title={`${unpaidInvoices.length} فاتورة غير مدفوعة — إجمالي ${Math.round(totalUnpaid).toLocaleString('en-US')} SAR`}
                >
                  <FileDown size={16} />
                  <span className="hidden sm:inline">فواتير غير مدفوعة PDF</span>
                  <span className="sm:hidden">غير مدفوعة</span>
                </button>
              )}
              {client.phone && (
                <a
                  href={waLink(client.phone)}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-green-500 hover:bg-green-600 text-white text-sm font-bold transition-colors shadow-lg shadow-green-500/20"
                >
                  <MessageCircle size={16} />
                  <span className="hidden sm:inline">واتساب</span>
                </a>
              )}
              {unpaidInvoices.length > 0 && client.phone && (
                <button
                  type="button"
                  onClick={() => {
                    const msg = [
                      `مرحباً ${client.name}،`,
                      '',
                      'نود تذكيركم بالمبالغ المستحقة:',
                      '',
                      ...unpaidInvoices.slice(0, 10).map(
                        (inv) =>
                          `• فاتورة #${inv.daftra_id || inv.id} — ${formatSar(safe(inv.price))} (${realStatus(inv) === 'partial' ? `مدفوع ${formatSar(realPaid(inv))}` : 'غير مدفوعة'})`,
                      ),
                      '',
                      `الإجمالي المتبقي: ${formatSar(totalUnpaid)}`,
                      '',
                      'شكراً لتعاملكم معنا \u{1F64F}',
                      'شيب بك للشحن',
                    ].join('\n');
                    openWhatsApp(client.phone!, msg);
                  }}
                  className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-orange-500 hover:bg-orange-600 text-white text-sm font-bold transition-colors shadow-lg shadow-orange-500/20"
                >
                  <Send size={16} />
                  <span className="hidden sm:inline">مطالبة واتساب</span>
                  <span className="sm:hidden">مطالبة</span>
                </button>
              )}
              {unpaidInvoices.length > 0 && client.phone && (
                <button
                  type="button"
                  onClick={() => {
                    const msg = [
                      `مرحباً ${client.name}،`,
                      '',
                      'مرفق كشف حساب بالفواتير المستحقة.',
                      '',
                      `الإجمالي المتبقي: ${formatSar(totalUnpaid)}`,
                      '',
                      'نرجو التكرم بسداد المبلغ في أقرب وقت.',
                      '',
                      'شكراً لتعاملكم — شيب بك للشحن \u{1F4E6}',
                    ].join('\n');
                    openWhatsApp(client.phone!, msg);
                  }}
                  className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-indigo-500 hover:bg-indigo-600 text-white text-sm font-bold transition-colors shadow-lg shadow-indigo-500/20"
                >
                  <FileText size={16} />
                  <span className="hidden sm:inline">إرسال كشف</span>
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Financial KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
        <div className="bg-white dark:bg-slate-800 rounded-2xl p-4 border border-gray-200 dark:border-slate-700 shadow-sm text-center">
          <Package size={20} className="mx-auto mb-2 text-blue-500" />
          <p className="text-2xl font-bold font-inter text-gray-900 dark:text-white">
            {safe(client.total_invoices)}
          </p>
          <p className="text-[11px] font-bold text-gray-500">فاتورة</p>
        </div>
        <div className="bg-white dark:bg-slate-800 rounded-2xl p-4 border border-gray-200 dark:border-slate-700 shadow-sm text-center">
          <CircleDollarSign size={20} className="mx-auto mb-2 text-yellow-500" />
          <p className="text-lg font-bold font-inter text-yellow-600">
            {formatSar(client.total_revenue)}
          </p>
          <p className="text-[11px] font-bold text-gray-500">الإيرادات</p>
        </div>
        <div className="bg-white dark:bg-slate-800 rounded-2xl p-4 border border-gray-200 dark:border-slate-700 shadow-sm text-center">
          <CheckCircle2 size={20} className="mx-auto mb-2 text-green-500" />
          <p className="text-lg font-bold font-inter text-green-600">
            {formatSar(client.total_paid)}
          </p>
          <p className="text-[11px] font-bold text-gray-500">المحصّل</p>
        </div>
        <div className="bg-white dark:bg-slate-800 rounded-2xl p-4 border border-gray-200 dark:border-slate-700 shadow-sm text-center">
          <AlertTriangle size={20} className="mx-auto mb-2 text-red-500" />
          <p className="text-lg font-bold font-inter text-red-600">
            {formatSar(client.total_remaining)}
          </p>
          <p className="text-[11px] font-bold text-gray-500">المتبقي</p>
        </div>
        <div className="bg-white dark:bg-slate-800 rounded-2xl p-4 border border-gray-200 dark:border-slate-700 shadow-sm text-center">
          <TrendingUp size={20} className="mx-auto mb-2 text-indigo-500" />
          <p className="text-lg font-bold font-inter text-indigo-600">
            {safe(client.collection_rate).toFixed(1)}%
          </p>
          <p className="text-[11px] font-bold text-gray-500">نسبة التحصيل</p>
        </div>
        <div className="bg-white dark:bg-slate-800 rounded-2xl p-4 border border-gray-200 dark:border-slate-700 shadow-sm text-center">
          <CreditCard size={20} className="mx-auto mb-2 text-purple-500" />
          <p className="text-lg font-bold font-inter text-purple-600">
            {formatSar(client.avg_invoice)}
          </p>
          <p className="text-[11px] font-bold text-gray-500">متوسط الفاتورة</p>
        </div>
      </div>

      {/* Collection Progress */}
      <div className="bg-white dark:bg-slate-800 rounded-2xl border border-gray-200 dark:border-slate-700 shadow-sm p-5">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-bold text-gray-900 dark:text-white flex items-center gap-2">
            <TrendingUp size={16} className="text-indigo-500" /> معدل التحصيل
          </h3>
          <span className="text-lg font-bold font-inter text-indigo-600">
            {safe(client.collection_rate).toFixed(1)}%
          </span>
        </div>
        <CollectionBar rate={safe(client.collection_rate)} size="lg" />
        <div className="flex items-center justify-between mt-3 text-xs text-gray-500 flex-wrap gap-2">
          <div className="flex items-center gap-3">
            {statusBreakdown.map((sb, idx) => (
              <span key={`${sb.status}-${idx}`} className="flex items-center gap-1.5">
                {statusBadge(sb.status)}
                <span className="font-inter font-bold">{safe(sb.count)}</span>
              </span>
            ))}
          </div>
          <div className="flex items-center gap-3 font-inter text-[11px]">
            <span>
              أول فاتورة:{" "}
              <strong>{(client.first_invoice_date || "—").slice(0, 10)}</strong>
            </span>
            <span>
              آخر فاتورة:{" "}
              <strong>{(client.last_invoice_date || "—").slice(0, 10)}</strong>
            </span>
          </div>
        </div>
      </div>

      {/* Monthly Revenue Chart */}
      {monthly.length > 0 && (
        <div className="bg-white dark:bg-slate-800 rounded-2xl border border-gray-200 dark:border-slate-700 shadow-sm p-5">
          <h3 className="text-sm font-bold text-gray-900 dark:text-white flex items-center gap-2 mb-4">
            <BarChart3 size={16} className="text-indigo-500" /> الإيرادات الشهرية
          </h3>
          <div className="flex items-end gap-3 h-40">
            {monthly
              .slice(0, 12)
              .reverse()
              .map((m) => {
                const pct = (safe(m.revenue) / maxRevenue) * 100;
                return (
                  <div
                    key={m.month}
                    className="flex-1 flex flex-col items-center gap-1.5 group cursor-pointer"
                    title={`${m.month}: ${formatSar(m.revenue)} (${safe(m.count)} فاتورة)`}
                  >
                    <span className="text-[10px] font-bold font-inter text-indigo-600 dark:text-indigo-400 opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap">
                      {formatSar(m.revenue)}
                    </span>
                    <div
                      className="w-full relative flex items-end justify-center"
                      style={{ height: "120px" }}
                    >
                      <div
                        className="w-full max-w-[40px] bg-gradient-to-t from-indigo-600 to-indigo-400 dark:from-indigo-500 dark:to-indigo-300 rounded-t-lg transition-all duration-500 group-hover:from-indigo-700 group-hover:to-indigo-500"
                        style={{ height: `${Math.max(pct, 4)}%` }}
                      />
                    </div>
                    <div className="text-center">
                      <span className="text-[10px] font-inter text-gray-400 block">
                        {(m.month || "").slice(5)}
                      </span>
                      <span className="text-[9px] font-inter text-gray-300 dark:text-gray-600">
                        {safe(m.count)}
                      </span>
                    </div>
                  </div>
                );
              })}
          </div>
        </div>
      )}

      {/* Invoices Table */}
      <div className="bg-white dark:bg-slate-800 rounded-2xl border border-gray-200 dark:border-slate-700 shadow-sm overflow-hidden">
        <div className="p-4 border-b border-gray-200 dark:border-slate-700 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <h3 className="text-sm font-bold text-gray-900 dark:text-white flex items-center gap-2">
            <FileText size={16} className="text-indigo-500" /> فواتير العميل (
            {allInvoices.length})
          </h3>
          <div className="flex items-center gap-2 flex-wrap">
            {["all", "paid", "partial", "unpaid", "returned"].map((f) => {
              const labels: Record<string, string> = {
                all: "الكل",
                paid: "مدفوعة",
                partial: "جزئية",
                unpaid: "غير مدفوعة",
                returned: "مرتجع",
              };
              const count =
                f === "all"
                  ? allInvoices.length
                  : allInvoices.filter((inv) => realStatus(inv) === f).length;
              if (f !== "all" && count === 0) return null;
              return (
                <button
                  key={f}
                  onClick={() => setInvoiceFilter(f)}
                  className={`px-2.5 py-1 rounded-lg text-[11px] font-bold border transition-all ${invoiceFilter === f ? "bg-indigo-600 text-white border-indigo-600" : "bg-gray-50 dark:bg-slate-900 text-gray-600 dark:text-gray-400 border-gray-200 dark:border-slate-700 hover:border-indigo-300"}`}
                  type="button"
                >
                  {labels[f]} ({count})
                </button>
              );
            })}
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-right border-collapse">
            <thead className="bg-gray-50/80 dark:bg-slate-900/50 border-b border-gray-200 dark:border-slate-700">
              <tr className="text-[10px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                <th className="p-3 w-10 text-center">
                  <input 
                    type="checkbox" 
                    className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                    checked={invoices.length > 0 && selectedInvs.length === invoices.length}
                    onChange={toggleAll}
                  />
                </th>
                <th className="p-3">رقم الفاتورة</th>
                <th className="p-3">التاريخ</th>
                <th className="p-3">الحالة</th>
                <th className="p-3">الإجمالي</th>
                <th className="p-3">المدفوع</th>
                <th className="p-3">المتبقي</th>
                <th className="p-3">البوليصة</th>
                <th className="p-3">الناقل</th>
                <th className="p-3">المستلم</th>
                <th className="p-3">تحميل</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-slate-700/50">
              {invoices.length > 0 ? (
                invoices.slice(0, 200).map((inv) => {
                  const st = realStatus(inv);
                  const paid = realPaid(inv);
                  const remaining = realRemaining(inv);
                  return (
                    <tr
                      key={inv.id}
                      className={`transition-colors ${selectedInvs.includes(inv.id) ? 'bg-indigo-50/30 dark:bg-indigo-900/10' : 'hover:bg-gray-50/50 dark:hover:bg-slate-700/30'}`}
                      onClick={() => toggleSelect(inv.id)}
                    >
                      <td className="p-3 text-center" onClick={(e) => e.stopPropagation()}>
                        <input 
                          type="checkbox" 
                          className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                          checked={selectedInvs.includes(inv.id)}
                          onChange={() => toggleSelect(inv.id)}
                        />
                      </td>
                      <td className="p-3">
                        <span className="font-inter font-bold text-sm text-indigo-600 dark:text-indigo-400">
                          #{inv.daftra_id || inv.id}
                        </span>
                      </td>
                      <td className="p-3 font-inter text-xs text-gray-500">
                        {(inv.date || "").slice(0, 10)}
                      </td>
                      <td className="p-3">{statusBadge(st)}</td>
                      <td className="p-3 font-inter font-bold text-sm text-gray-800 dark:text-gray-200">
                        {formatSar(inv.price)}
                      </td>
                      <td className="p-3 font-inter font-bold text-sm text-green-600 dark:text-green-400">
                        {paid > 0 ? formatSar(paid) : "—"}
                      </td>
                      <td className="p-3">
                        <span
                          className={`font-inter font-bold text-sm ${remaining > 0 ? "text-red-600 dark:text-red-400" : "text-gray-300 dark:text-gray-600"}`}
                        >
                          {remaining > 0 ? formatSar(remaining) : "0"}
                        </span>
                      </td>
                      <td className="p-3 font-inter text-xs text-gray-500">
                        {inv.awb || "—"}
                      </td>
                      <td className="p-3 text-xs text-gray-500">
                        {inv.carrier || "DHL"}
                      </td>
                      <td className="p-3 text-xs text-gray-500 max-w-[150px] truncate">
                        {inv.receiver || "—"}
                      </td>
                      <td className="p-3" onClick={(e) => e.stopPropagation()}>
                        <button
                          onClick={() => {
                            if (invoiceTemplate) {
                              void downloadInvoicePDF(inv as any, invoiceTemplate);
                            } else {
                              alert("يرجى ضبط قالب الفاتورة في الإعدادات أولاً");
                            }
                          }}
                          className="p-1.5 rounded-lg bg-red-50 hover:bg-red-100 text-red-600 border border-red-100 transition-colors"
                          title="تحميل PDF"
                        >
                          <FileDown size={14} />
                        </button>
                      </td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td
                    colSpan={9}
                    className="p-10 text-center text-gray-400 text-sm font-bold"
                  >
                    لا توجد فواتير بهذا الفلتر
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {invoices.length > 0 && (() => {
          const footerRevenue = invoices.reduce((s, i) => s + realRevenue(i), 0);
          const footerPaid = invoices.reduce((s, i) => s + realPaid(i), 0);
          const footerRemaining = invoices.reduce((s, i) => s + realRemaining(i), 0);
          return (
            <div className="p-4 border-t border-gray-200 dark:border-slate-700 bg-gray-50/50 dark:bg-slate-900/30 flex flex-wrap items-center justify-between gap-4 text-sm font-bold">
              <div className="flex items-center gap-4">
                <span className="text-gray-500">
                  الإيرادات:{" "}
                  <span className="font-inter text-gray-800 dark:text-gray-200">
                    {formatSar(footerRevenue)}
                  </span>
                </span>
                <span className="text-gray-500">
                  مدفوع:{" "}
                  <span className="font-inter text-green-600">
                    {formatSar(footerPaid)}
                  </span>
                </span>
                <span className="text-gray-500">
                  متبقي:{" "}
                  <span className="font-inter text-red-600">
                    {formatSar(footerRemaining)}
                  </span>
                </span>
              </div>

              {selectedInvs.length > 0 && (
                <button
                  onClick={handleBulkPaymob}
                  disabled={creatingLink}
                  className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl shadow-lg shadow-indigo-500/20 transition-all active:scale-95 disabled:opacity-50"
                >
                  {creatingLink ? <Loader2 size={16} className="animate-spin" /> : <CreditCard size={16} />}
                  <span>إنشاء رابط دفع ({selectedInvs.length})</span>
                  <span className="font-inter border-r border-indigo-400 pr-2 mr-2">
                    {formatSar(invoices.filter(i => selectedInvs.includes(i.id)).reduce((s, i) => s + realRemaining(i), 0))}
                  </span>
                </button>
              )}
            </div>
          );
        })()}
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════ */
/*              MAIN PAGE COMPONENT              */
/* ══════════════════════════════════════════════ */

export function ClientsPage() {
  const cli = useClientsPage();

  if (cli.showProfile) {
    return (
      <ClientProfilePage
        profile={cli.profile}
        loading={cli.profileLoading}
        onClose={cli.closeProfile}
        cli={cli}
      />
    );
  }

  return (
    <div className="space-y-5 animate-in fade-in duration-300">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
            <Users className="text-indigo-600 dark:text-indigo-400" size={28} />{" "}
            إدارة العملاء
          </h1>
          <p className="text-sm text-gray-500 mt-0.5 font-inter">
            {formatNum(cli.totals.clients)} عميل •{" "}
            {formatNum(cli.totals.invoices)} فاتورة
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            className="flex items-center gap-2 px-3.5 py-2 text-sm font-bold rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white shadow-lg shadow-indigo-500/20 disabled:opacity-50"
            onClick={() => void cli.syncClients()}
            disabled={cli.syncing}
            type="button"
          >
            <RefreshCw
              size={16}
              className={cli.syncing ? "animate-spin" : ""}
            />
            <span className="hidden sm:inline">
              {cli.syncing ? "جاري المزامنة..." : "مزامنة من دفترة"}
            </span>
            <span className="sm:hidden">{cli.syncing ? "..." : "مزامنة"}</span>
          </button>
          <button
            className="flex items-center gap-1.5 px-3 py-2 text-sm font-bold rounded-xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-gray-700 dark:text-gray-300 hover:bg-gray-50 disabled:opacity-50"
            onClick={() => void cli.exportClients("xlsx")}
            disabled={cli.loading || !cli.clients.length}
            type="button"
          >
            <FileSpreadsheet size={15} />
            <span className="hidden sm:inline">Excel</span>
          </button>
          <button
            className="flex items-center gap-1.5 px-3 py-2 text-sm font-bold rounded-xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-gray-700 dark:text-gray-300 hover:bg-gray-50 disabled:opacity-50"
            onClick={() => void cli.exportClients("csv")}
            disabled={cli.loading || !cli.clients.length}
            type="button"
          >
            <Download size={15} />
            <span className="hidden sm:inline">CSV</span>
          </button>
          <button
            className="flex items-center gap-1.5 px-3 py-2 text-sm font-bold rounded-xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-gray-700 dark:text-gray-300 hover:bg-gray-50 disabled:opacity-50"
            onClick={() => void cli.refresh()}
            disabled={cli.loading}
            type="button"
          >
            <RefreshCw
              size={15}
              className={cli.loading ? "animate-spin" : ""}
            />
            <span className="hidden sm:inline">تحديث</span>
          </button>
        </div>
      </div>

      {cli.syncMessage && (
        <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800/30 text-green-700 dark:text-green-400 px-4 py-2.5 rounded-xl text-sm font-bold flex items-center gap-2">
          <CheckCircle2 size={16} />
          <span className="flex-1">{cli.syncMessage}</span>
        </div>
      )}
      {cli.error && (
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800/30 text-red-700 dark:text-red-400 px-4 py-2.5 rounded-xl text-sm font-bold flex items-center gap-2">
          <AlertCircle size={16} />
          <span className="flex-1">{cli.error}</span>
        </div>
      )}

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
        <KpiCard
          label="إجمالي العملاء"
          value={formatNum(cli.totals.clients)}
          icon={Users}
          colorClass="text-indigo-600 dark:text-indigo-400"
          bgClass="text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-900/20"
        />
        <KpiCard
          label="إجمالي الفواتير"
          value={formatNum(cli.totals.invoices)}
          icon={Package}
          colorClass="text-blue-600 dark:text-blue-400"
          bgClass="text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/20"
        />
        <KpiCard
          label="إجمالي الإيرادات"
          value={formatSar(cli.totals.revenue)}
          icon={CircleDollarSign}
          colorClass="text-yellow-600 dark:text-yellow-400"
          bgClass="text-yellow-600 dark:text-yellow-400 bg-yellow-50 dark:bg-yellow-900/20"
        />
        <KpiCard
          label="المحصّل"
          value={formatSar(cli.totals.paid)}
          icon={CheckCircle2}
          colorClass="text-green-600 dark:text-green-400"
          bgClass="text-green-600 dark:text-green-400 bg-green-50 dark:bg-green-900/20"
        />
        <KpiCard
          label="المتبقي"
          value={formatSar(cli.totals.remaining)}
          icon={AlertTriangle}
          colorClass="text-red-600 dark:text-red-400"
          bgClass="text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20"
        />
        <KpiCard
          label="نسبة التحصيل"
          value={safe(cli.totals.collection_rate).toFixed(1) + "%"}
          icon={TrendingUp}
          colorClass="text-emerald-600 dark:text-emerald-400"
          bgClass="text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-900/20"
        />
      </div>

      {/* Segments — FIXED: shows ALL segments including no_invoices */}
      {cli.segments.length > 0 && (
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => {
              cli.setSegment("all");
              cli.setPage(1);
            }}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition-all ${cli.segment === "all" ? "bg-indigo-600 text-white border-indigo-600" : "bg-white dark:bg-slate-800 text-gray-600 border-gray-200 dark:border-slate-700 hover:border-indigo-300"}`}
            type="button"
          >
            الكل ({formatNum(cli.totals.clients)})
          </button>
          {cli.segments.map((s) => {
            const segLabel = EXTENDED_SEGMENT_LABELS[s.segment] || s.segment;
            const segColor = EXTENDED_SEGMENT_COLORS[s.segment] || "";
            return (
              <button
                key={s.segment}
                onClick={() => {
                  cli.setSegment(s.segment);
                  cli.setPage(1);
                }}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition-all flex items-center gap-1 ${cli.segment === s.segment ? "bg-indigo-600 text-white border-indigo-600" : `bg-white dark:bg-slate-800 border-gray-200 dark:border-slate-700 hover:border-indigo-300 ${segColor.split(" ").slice(0, 2).join(" ")}`}`}
                type="button"
              >
                {segLabel} ({formatNum(s.count)})
              </button>
            );
          })}
        </div>
      )}

      {/* Search */}
      <div className="bg-white dark:bg-slate-800 rounded-2xl border border-gray-200 dark:border-slate-700 shadow-sm p-3">
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search
              size={18}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none"
            />
            <input
              type="text"
              placeholder="بحث بالاسم، الجوال، البريد، أو المدينة..."
              className="w-full bg-gray-50 dark:bg-slate-900 border border-gray-200 dark:border-slate-700 rounded-xl py-2.5 pr-10 pl-3 text-sm text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/30 transition-all"
              value={cli.search}
              onChange={(e) => cli.setSearch(e.target.value)}
            />
            {cli.search && (
              <button
                className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                onClick={() => cli.setSearch("")}
                type="button"
              >
                <X size={16} />
              </button>
            )}
          </div>
          {cli.cities.length > 0 && (
            <div className="relative flex-shrink-0">
              <MapPin
                size={14}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none"
              />
              <select
                className="appearance-none bg-gray-50 dark:bg-slate-900 border border-gray-200 dark:border-slate-700 rounded-xl py-2.5 pr-9 pl-8 text-sm font-bold text-gray-700 dark:text-gray-300 focus:outline-none focus:ring-2 focus:ring-indigo-500/30 cursor-pointer min-w-[140px]"
                value={cli.city}
                onChange={(e) => {
                  cli.setCity(e.target.value);
                  cli.setPage(1);
                }}
              >
                <option value="all">كل المدن</option>
                {cli.cities.map((c) => (
                  <option key={c.city} value={c.city}>
                    {c.city} ({c.count})
                  </option>
                ))}
              </select>
              <Filter
                size={14}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none"
              />
            </div>
          )}
        </div>
      </div>

      {/* Table */}
      <div className="bg-white dark:bg-slate-800 rounded-2xl border border-gray-200 dark:border-slate-700 shadow-sm overflow-hidden">
        <div className="hidden lg:block overflow-x-auto">
          <table className="w-full text-right border-collapse">
            <thead className="bg-gray-50/80 dark:bg-slate-900/50 border-b border-gray-200 dark:border-slate-700">
              <tr>
                <th className="p-3 text-[10px] font-bold text-gray-500 uppercase tracking-wider">
                  العميل
                </th>
                <th className="p-3">
                  <SortHeader
                    label="الفواتير"
                    field="invoices"
                    currentSort={cli.sort}
                    currentOrder={cli.sortOrder}
                    onToggle={cli.toggleSort}
                  />
                </th>
                <th className="p-3">
                  <SortHeader
                    label="الإيرادات"
                    field="revenue"
                    currentSort={cli.sort}
                    currentOrder={cli.sortOrder}
                    onToggle={cli.toggleSort}
                  />
                </th>
                <th className="p-3">
                  <SortHeader
                    label="المدفوع"
                    field="paid"
                    currentSort={cli.sort}
                    currentOrder={cli.sortOrder}
                    onToggle={cli.toggleSort}
                  />
                </th>
                <th className="p-3">
                  <SortHeader
                    label="المتبقي"
                    field="remaining"
                    currentSort={cli.sort}
                    currentOrder={cli.sortOrder}
                    onToggle={cli.toggleSort}
                  />
                </th>
                <th className="p-3">
                  <SortHeader
                    label="التحصيل"
                    field="collection"
                    currentSort={cli.sort}
                    currentOrder={cli.sortOrder}
                    onToggle={cli.toggleSort}
                  />
                </th>
                <th className="p-3 text-[10px] font-bold text-gray-500 uppercase tracking-wider">
                  التصنيف
                </th>
                <th className="p-3">
                  <SortHeader
                    label="آخر فاتورة"
                    field="recent"
                    currentSort={cli.sort}
                    currentOrder={cli.sortOrder}
                    onToggle={cli.toggleSort}
                  />
                </th>
                <th className="p-3 w-10"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-slate-700/50">
              {cli.loading && !cli.clients.length ? (
                <tr>
                  <td colSpan={9} className="p-12 text-center">
                    <Loader2
                      size={28}
                      className="animate-spin text-indigo-500 mx-auto mb-2"
                    />
                    <p className="font-bold text-sm text-gray-400">
                      جاري التحميل...
                    </p>
                  </td>
                </tr>
              ) : cli.clients.length === 0 ? (
                <tr>
                  <td colSpan={9} className="p-12 text-center">
                    <Users size={32} className="text-gray-300 mx-auto mb-2" />
                    <p className="font-bold text-sm text-gray-400">
                      {cli.search || cli.segment !== "all" || cli.city !== "all"
                        ? "لا توجد نتائج مطابقة"
                        : 'اضغط "مزامنة من دفترة" لجلب البيانات'}
                    </p>
                  </td>
                </tr>
              ) : (
                cli.clients.map((c) => (
                  <tr
                    key={c.id}
                    className="transition-colors cursor-pointer group hover:bg-gray-50/50 dark:hover:bg-slate-700/30"
                    onClick={() => cli.openProfile(c.id, c.name)}
                  >
                    <td className="p-3">
                      <div className="min-w-[140px]">
                        <p className="font-bold text-sm text-gray-900 dark:text-white truncate max-w-[200px] group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors">
                          {c.name}
                        </p>
                        <div className="flex items-center gap-2 mt-0.5">
                          {c.phone && (
                            <span className="text-[10px] font-inter text-gray-400">
                              {c.phone}
                            </span>
                          )}
                          {c.city && (
                            <span className="text-[10px] text-gray-400 flex items-center gap-0.5">
                              <MapPin size={9} />
                              {c.city}
                            </span>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="p-3">
                      <span className="font-inter font-bold text-sm text-gray-700 dark:text-gray-300">
                        {safe(c.total_invoices)}
                      </span>
                      {safe(c.total_invoices) > 0 && (
                        <div className="flex items-center gap-1 mt-0.5 text-[9px] font-inter">
                          <span className="text-green-500">{safe(c.paid_count)}</span>
                          <span className="text-yellow-500">{safe(c.partial_count)}</span>
                          <span className="text-red-500">{safe(c.unpaid_count)}</span>
                          {safe(c.returned_count) > 0 && (
                            <span className="text-purple-500">{safe(c.returned_count)}</span>
                          )}
                        </div>
                      )}
                    </td>
                    <td className="p-3">
                      <span className="font-inter font-bold text-sm text-yellow-600 dark:text-yellow-500">
                        {formatSar(c.total_revenue)}
                      </span>
                    </td>
                    <td className="p-3">
                      <span className="font-inter font-bold text-sm text-green-600 dark:text-green-400">
                        {formatSar(c.total_paid)}
                      </span>
                    </td>
                    <td className="p-3">
                      <span
                        className={`font-inter font-bold text-sm ${safe(c.total_remaining) > 0 ? "text-red-600 dark:text-red-400" : "text-gray-400"}`}
                      >
                        {formatSar(c.total_remaining)}
                      </span>
                    </td>
                    <td className="p-3">
                      <CollectionBar rate={safe(c.collection_rate)} />
                    </td>
                    <td className="p-3">
                      <SegmentBadge segment={c.segment} />
                    </td>
                    <td className="p-3">
                      <span className="text-xs font-inter text-gray-500">
                        {(c.last_invoice_date || "—").slice(0, 10)}
                      </span>
                    </td>
                    <td className="p-3">
                      <button
                        className="p-1.5 rounded-lg text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 dark:hover:text-indigo-400 dark:hover:bg-indigo-900/20 transition-colors opacity-0 group-hover:opacity-100"
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          cli.openProfile(c.id, c.name);
                        }}
                      >
                        <Eye size={16} />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Mobile Cards */}
        <div className="lg:hidden">
          {cli.loading && !cli.clients.length ? (
            <div className="p-12 text-center">
              <Loader2
                size={28}
                className="animate-spin text-indigo-500 mx-auto mb-2"
              />
              <p className="font-bold text-sm text-gray-400">جاري التحميل...</p>
            </div>
          ) : cli.clients.length === 0 ? (
            <div className="p-12 text-center">
              <Users size={32} className="text-gray-300 mx-auto mb-2" />
              <p className="font-bold text-sm text-gray-400">
                {cli.search ? "لا توجد نتائج" : "اضغط مزامنة"}
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-3">
              {cli.clients.map((c) => (
                <ClientCard
                  key={c.id}
                  client={c}
                  onOpen={() => cli.openProfile(c.id, c.name)}
                />
              ))}
            </div>
          )}
        </div>

        <Pagination
          page={cli.pagination.page}
          pages={cli.pagination.pages}
          total={cli.pagination.total}
          onPage={cli.setPage}
        />
      </div>

      {/* Top Clients */}
      {cli.topClients.length > 0 && (
        <div className="bg-white dark:bg-slate-800 rounded-2xl border border-gray-200 dark:border-slate-700 shadow-sm overflow-hidden">
          <div className="p-4 border-b border-gray-200 dark:border-slate-700 bg-gray-50/50 dark:bg-slate-900/30">
            <h3 className="font-bold text-gray-900 dark:text-white flex items-center gap-2 text-sm">
              <Star size={16} className="text-yellow-500" /> أعلى 5 عملاء
            </h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-right border-collapse">
              <thead className="bg-gray-50/50 dark:bg-slate-900/30 border-b border-gray-200 dark:border-slate-700">
                <tr className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">
                  <th className="p-3">#</th>
                  <th className="p-3">العميل</th>
                  <th className="p-3">الفواتير</th>
                  <th className="p-3">الإيرادات</th>
                  <th className="p-3">المدفوع</th>
                  <th className="p-3">المتبقي</th>
                  <th className="p-3">التحصيل</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-slate-700/50">
                {cli.topClients.map((c: any, i: number) => (
                  <tr
                    key={i}
                    className="hover:bg-gray-50/50 dark:hover:bg-slate-700/30 cursor-pointer"
                    onClick={() => cli.openProfile(c.id || "", c.name)}
                  >
                    <td className="p-3">
                      <span
                        className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${i === 0 ? "bg-yellow-100 text-yellow-600" : i === 1 ? "bg-gray-100 text-gray-500" : i === 2 ? "bg-orange-100 text-orange-600" : "bg-gray-50 text-gray-400"}`}
                      >
                        {i + 1}
                      </span>
                    </td>
                    <td className="p-3 font-bold text-sm text-gray-900 dark:text-white">
                      {c.name}
                    </td>
                    <td className="p-3 font-inter font-bold">
                      {safe(c.total_invoices)}
                    </td>
                    <td className="p-3 font-inter font-bold text-yellow-600">
                      {formatSar(c.total_revenue)}
                    </td>
                    <td className="p-3 font-inter font-bold text-green-600">
                      {formatSar(c.total_paid)}
                    </td>
                    <td className="p-3 font-inter font-bold text-red-600">
                      {formatSar(c.total_remaining)}
                    </td>
                    <td className="p-3">
                      <CollectionBar rate={safe(c.collection_rate)} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}