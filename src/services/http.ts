export type HttpErrorInfo = {
  status: number
  url: string
  bodyText?: string
}

export class HttpError extends Error {
  info: HttpErrorInfo

  constructor(message: string, info: HttpErrorInfo) {
    super(message)
    this.name = 'HttpError'
    this.info = info
  }
}

export type RequestOptions = {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'
  headers?: Record<string, string>
  body?: unknown
  signal?: AbortSignal
}

export async function requestJson<T>(url: string, options: RequestOptions = {}): Promise<T> {
  const token = localStorage.getItem('token')
  const headers: Record<string, string> = {
    Accept: 'application/json',
    ...(options.body ? { 'Content-Type': 'application/json' } : undefined),
    ...(options.headers ?? {}),
  }

  if (token) {
    headers['Authorization'] = `Bearer ${token}`
  }

  const res = await fetch(url, {
    method: options.method ?? (options.body ? 'POST' : 'GET'),
    headers,
    body: options.body ? JSON.stringify(options.body) : undefined,
    signal: options.signal,
  })

  if (!res.ok) {
    const bodyText = await res.text().catch(() => undefined)
    throw new HttpError(`HTTP ${res.status}`, { status: res.status, url, bodyText })
  }

  return (await res.json()) as T
}
