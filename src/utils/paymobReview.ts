const REVIEW_TEXT: Record<string, string> = {
  unmatched_order: 'لا يوجد رابط دفع مرتبط بالعملية',
  amount_mismatch: 'مبلغ العملية لا يطابق مبلغ الرابط',
  currency_mismatch: 'عملة العملية لا تطابق عملة الرابط',
  unknown_integration: 'وسيلة دفع غير معتمدة',
  overpayment: 'مبلغ زائد عن المتبقي على الفواتير',
  invoice_missing: 'فاتورة مرتبطة غير موجودة',
  invoice_returned: 'فاتورة مرتبطة مرتجعة',
  reversal_after_collection: 'استرداد/إلغاء لعملية سبق تحصيلها',
}

/** Arabic text for the backend's review reason codes ("overpayment:60.00;invoice_missing:9"). */
export function describeReviewReason(reason: string | null | undefined): string {
  if (!reason) return ''
  return reason
    .split(';')
    .map((part) => {
      const [code, extra] = part.split(':')
      const text = REVIEW_TEXT[code] || code
      return extra && code === 'overpayment' ? `${text} (${extra} ر.س)` : text
    })
    .join(' — ')
}
