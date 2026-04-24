import type { InvoiceStatus } from '../../utils/models'
import styles from './InvoicesFilters.module.css'

type Props = {
  query: string
  status: InvoiceStatus | 'all'
  onChange: (next: { query: string; status: InvoiceStatus | 'all' }) => void
}

export function InvoicesFilters({ query, status, onChange }: Props) {
  return (
    <div className={styles.row}>
      <select
        className={[styles.control, styles.select].join(' ')}
        value={status}
        onChange={(e) => onChange({ query, status: e.target.value as InvoiceStatus | 'all' })}
      >
        <option value="all">كل الحالات</option>
        <option value="paid">مدفوعة</option>
        <option value="partial">جزئية</option>
        <option value="unpaid">غير مدفوعة</option>
        <option value="returned">مرتجعة</option>
      </select>
      <input
        className={[styles.control, styles.search].join(' ')}
        value={query}
        onChange={(e) => onChange({ query: e.target.value, status })}
        placeholder="بحث بالعميل / الجوال / AWB / رقم الفاتورة / المرسل / المستلم"
      />
    </div>
  )
}