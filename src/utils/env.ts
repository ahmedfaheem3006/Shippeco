type EnvName = 'VITE_WORKER_URL' | 'VITE_API_URL';

function readEnv(name: EnvName): string | undefined {
  const value = import.meta.env[name];
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed.length ? trimmed : undefined;
}

const apiUrl =
  readEnv('VITE_API_URL') ??
  'https://shippeco-backend-production.up.railway.app/api';

export const env = {
  /** Paymob Worker (only remaining Cloudflare dependency) */
  workerUrl:
    readEnv('VITE_WORKER_URL') ??
    'https://silent-paper-fd08.ibrahim-h-kh.workers.dev',

  /** Railway Backend API — single source of truth */
  apiUrl,

  /** @deprecated — redirects to apiUrl for backward compatibility */
  dbUrl: apiUrl,

  /** @deprecated — redirects to apiUrl for backward compatibility */
  daftraWorkerUrl: apiUrl,
} as const;