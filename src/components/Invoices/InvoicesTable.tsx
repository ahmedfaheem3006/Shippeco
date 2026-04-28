import type { Invoice } from '../../utils/models'
import styles from './InvoicesTable.module.css'

type Props = {
  invoices: Invoice[]
}

function statusLabel(status: Invoice['status']) {
  if (status === 'paid') return 'مدفوعة'
  if (status === 'partial') return 'جزئية'
  if (status === 'returned') return 'مرتجعة'
  return 'غير مدفوعة'
}

function statusColor(status: Invoice['status']) {
  if (status === 'paid') return styles.statusPaid
  if (status === 'partial') return styles.statusPartial
  if (status === 'returned') return styles.statusReturned
  return styles.statusUnpaid
}

/**
 * Format date as dd/mm/yyyy (Gregorian)
 * Handles: "2026-02-11", "2026-02-11T00:00:00.000Z", etc.
 * Parses date parts directly to avoid UTC→local timezone shift.
 */
function formatDate(date: string): string {
  if (!date) return '—'
  const s = String(date).trim()
  if (!s) return '—'

  // Match yyyy-mm-dd at the start (covers both "2026-02-11" and "2026-02-11T...")
  const match = s.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (match) {
    const [, y, m, d] = match
    // Validate basic ranges
    const month = Number(m)
    const day = Number(d)
    const year = Number(y)
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31 && year >= 1900 && year <= 2100) {
      return `${d}/${m}/${y}`
    }
  }

  // Fallback: try to parse and format manually (local timezone)
  try {
    const parsed = new Date(s)
    if (isNaN(parsed.getTime())) return s

    const day = String(parsed.getDate()).padStart(2, '0')
    const month = String(parsed.getMonth() + 1).padStart(2, '0')
    const year = parsed.getFullYear()
    return `${day}/${month}/${year}`
  } catch {
    return s
  }
}

export function InvoicesTable({ invoices }: Props) {
  if (!invoices.length) {
    return <div className={styles.empty}>لا توجد فواتير مطابقة.</div>
  }

  return (
    <div className={styles.wrap}>
      <div className={styles.scroll}>
        <table className={styles.table}>
          <thead>
            <tr>
              {['رقم', 'العميل', 'الجوال', 'الناقل', 'المبلغ', 'المدفوع', 'المتبقي', 'الحالة', 'التاريخ'].map(
                (h) => (
                  <th key={h} className={styles.th}>
                    {h}
                  </th>
                ),
              )}
            </tr>
          </thead>
          <tbody>
            {invoices.map((inv) => {
              const price = Number(inv.price ?? 0)
              const paid = inv.status === 'paid' ? price : Number(inv.partialPaid ?? inv.partial_paid ?? 0)
              const remaining = inv.status === 'paid' ? 0 : Math.max(0, price - paid)

              return (
                <tr key={inv.id}>
                  <td className={[styles.td, styles.mono, styles.id].join(' ')}>
                    {inv.id}
                    {inv.daftra_id && (
                      <div className="text-[9px] text-indigo-500 mt-0.5">دفترة #{inv.daftra_id}</div>
                    )}
                  </td>
                  <td className={[styles.td, styles.client].join(' ')}>
                    {inv.client}
                  </td>
                  <td className={[styles.td, styles.muted].join(' ')}>
                    {inv.phone ?? '—'}
                  </td>
                  <td className={[styles.td, styles.muted].join(' ')}>
                    {inv.carrier ?? '—'}
                  </td>
                  <td className={[styles.td, styles.mono, styles.amount].join(' ')}>
                    {price.toFixed(2)}
                  </td>
                  <td className={[styles.td, styles.mono].join(' ')} style={{ color: paid > 0 ? '#16a34a' : undefined }}>
                    {paid.toFixed(2)}
                  </td>
                  <td className={[styles.td, styles.mono].join(' ')} style={{ color: remaining > 0 ? '#ef4444' : '#16a34a' }}>
                    {inv.status === 'returned' ? 'مرتجع' : remaining > 0 ? remaining.toFixed(2) : 'تم ✓'}
                  </td>
                  <td className={styles.td}>
                    <span className={statusColor(inv.status)}>
                      {statusLabel(inv.status)}
                    </span>
                  </td>
                  <td className={[styles.td, styles.muted].join(' ')}>
                    {formatDate(inv.date)}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}