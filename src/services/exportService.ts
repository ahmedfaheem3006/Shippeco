/**
 * Server-side Excel/CSV exports. The file is built and streamed by the
 * backend from the database (every matching row, not the page on screen);
 * the browser only receives the finished file and saves it.
 */
import { useAuthStore } from '../hooks/useAuthStore'
import { env } from '../utils/env'
import { downloadBlob } from '../utils/download'
import type { ExportFormat } from '../utils/exportPeriods'

export type ExportParams = Record<string, string | number | boolean | undefined | null>

export class ExportError extends Error {
  readonly status: number
  constructor(message: string, status: number) {
    super(message)
    this.name = 'ExportError'
    this.status = status
  }
}

function buildUrl(endpoint: string, params: ExportParams): string {
  const qs = new URLSearchParams()
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null || v === '' || v === false) continue
    qs.set(k, v === true ? '1' : String(v))
  }
  const q = qs.toString()
  return `${env.apiUrl}${endpoint}${q ? `?${q}` : ''}`
}

function authHeaders(): Record<string, string> {
  const token = useAuthStore.getState().token
  return token ? { Authorization: `Bearer ${token}` } : {}
}

async function readError(res: Response): Promise<ExportError> {
  let message = ''
  try {
    const body = await res.json()
    message = body?.error?.message || body?.message || ''
  } catch { /* not JSON */ }
  if (!message) {
    if (res.status === 401) message = 'انتهت الجلسة، سجّل الدخول مرة أخرى'
    else if (res.status === 403) message = 'ليست لديك صلاحية لتصدير هذه البيانات'
    else if (res.status === 429) message = 'يوجد طلب تصدير قيد التنفيذ، انتظر قليلًا ثم حاول مرة أخرى'
    else message = 'تعذّر تجهيز ملف التصدير، حاول مرة أخرى'
  }
  return new ExportError(message, res.status)
}

/** How many rows the export would contain (dialog preview). */
export async function fetchExportCount(endpoint: string, params: ExportParams, signal?: AbortSignal): Promise<number> {
  const res = await fetch(buildUrl(endpoint, { ...params, count_only: 1 }), { headers: authHeaders(), signal })
  if (!res.ok) throw await readError(res)
  const body = await res.json()
  return Number(body?.data?.count ?? 0)
}

export function filenameFromDisposition(header: string | null): string | null {
  if (!header) return null
  const star = /filename\*=UTF-8''([^;]+)/i.exec(header)
  if (star) {
    try { return decodeURIComponent(star[1].trim()) } catch { /* fall through */ }
  }
  const plain = /filename="?([^";]+)"?/i.exec(header)
  return plain ? plain[1].trim() : null
}

/**
 * Downloads the export and hands it to the browser's save dialog.
 * `onProgress` receives the bytes received so far (the server streams).
 */
export async function downloadExport(
  endpoint: string,
  params: ExportParams,
  format: ExportFormat,
  opts: { fallbackName: string; signal?: AbortSignal; onProgress?: (bytes: number) => void },
): Promise<{ filename: string; bytes: number }> {
  const res = await fetch(buildUrl(endpoint, { ...params, format }), { headers: authHeaders(), signal: opts.signal })
  if (!res.ok) throw await readError(res)

  const chunks: BlobPart[] = []
  let bytes = 0
  if (res.body) {
    const reader = res.body.getReader()
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      chunks.push(value)
      bytes += value.byteLength
      opts.onProgress?.(bytes)
    }
  } else {
    const buf = await res.arrayBuffer()
    chunks.push(buf)
    bytes = buf.byteLength
  }
  if (bytes === 0) throw new ExportError('وصل ملف فارغ من الخادم، حاول مرة أخرى', 500)

  const filename = filenameFromDisposition(res.headers.get('Content-Disposition')) || opts.fallbackName
  const type = format === 'xlsx'
    ? 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    : 'text/csv;charset=utf-8'
  downloadBlob(filename, new Blob(chunks, { type }))
  return { filename, bytes }
}
