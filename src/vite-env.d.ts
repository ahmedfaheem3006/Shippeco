interface ImportMetaEnv {
  readonly VITE_WORKER_URL?: string
  readonly VITE_DB_URL?: string
  readonly VITE_DAFTRA_WORKER_URL?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
