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

function formatDate(date: string) {
  try {
    return new Date(date).toLocaleDateString('ar-SA')
  } catch {
    return date
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