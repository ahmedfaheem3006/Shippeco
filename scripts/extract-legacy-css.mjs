import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const repoRoot = path.resolve(__dirname, '..', '..')
const legacyIndexPath = path.join(repoRoot, 'index.html')
const spaRoot = path.resolve(__dirname, '..')
const outDir = path.join(spaRoot, 'src', 'legacy')
const outCssPath = path.join(outDir, 'legacy.css')

const html = await fs.readFile(legacyIndexPath, 'utf8')
const matches = [...html.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/gi)]

if (!matches.length) {
  throw new Error('Could not find any <style> blocks in legacy index.html')
}

await fs.mkdir(outDir, { recursive: true })
await fs.writeFile(
  outCssPath,
  matches.map((m) => m[1]).join('\n\n'),
  'utf8',
)
console.log(`Wrote ${outCssPath}`)
