import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'
import { loadEnv } from 'vite'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const dbTarget = (env.VITE_DB_URL || 'https://broad-glade-c30a.ibrahim-h-kh.workers.dev').trim()

  return {
    base: '/',
    plugins: [react()],
    build: {
      // Needed by scripts/prerender.mjs to resolve hashed asset URLs
      // (e.g. the logo) when it bundles PublicHomePage.tsx separately.
      manifest: true,
    },
    server: {
      proxy: {
        '/db': {
          target: dbTarget,
          changeOrigin: true,
          secure: true,
        },
      },
    },
    test: {
      environment: 'jsdom',
      setupFiles: ['src/test/setup.ts'],
      include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
      exclude: ['e2e/**', 'node_modules/**', 'dist/**'],
    },
  }
})
