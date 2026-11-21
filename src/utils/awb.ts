/**
 * The ONE way SHIPPEC shows a DHL AWB: the stored string, exactly —
 * "6606077671", never "660 607 7671". No digit grouping, no locale number
 * formatting (never Number()/Intl — a leading zero would be lost), so what
 * is read, copied, searched and used in file names is the same value.
 */
export function displayAwb(awb: unknown): string {
  if (awb === null || awb === undefined) return '';
  return String(awb).trim();
}
