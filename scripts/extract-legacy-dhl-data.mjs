import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const repoRoot = path.resolve(__dirname, '..', '..')
const legacyIndexPath = path.join(repoRoot, 'index.html')
const spaRoot = path.resolve(__dirname, '..')
const outDir = path.join(spaRoot, 'src', 'legacy')
const outPath = path.join(outDir, 'dhlData.ts')

const html = await fs.readFile(legacyIndexPath, 'utf8')

const jsStart = html.indexOf('<script>')
const jsEnd = html.lastIndexOf('</script>')
const js = jsStart >= 0 && jsEnd > jsStart ? html.slice(jsStart, jsEnd) : html

const countriesMatch = js.match(/var\s+COUNTRIES\s*=\s*(\[[\s\S]*?\]);/i)
if (!countriesMatch) throw new Error('Could not extract COUNTRIES from legacy index.html')

const goGreenMatch = js.match(/var\s+GOGREEN_RATE\s*=\s*([^;]+);/i)
if (!goGreenMatch) throw new Error('Could not extract GOGREEN_RATE from legacy index.html')

const rateMatches = [...js.matchAll(/var\s+(R_[A-Z0-9_]+)\s*=\s*({[\s\S]*?});/g)]
if (!rateMatches.length) throw new Error('Could not extract R_* tables from legacy index.html')

const wanted = new Set([
  'R_Z1',
  'R_Z2',
  'R_Z3',
  'R_Z4',
  'R_Z5_EXP',
  'R_Z5_IMP',
  'R_Z6_EXP',
  'R_Z6_IMP',
  'R_Z7',
  'R_QT',
])

const tables = rateMatches
  .map((m) => ({ name: m[1], value: m[2] }))
  .filter((t) => wanted.has(t.name))

if (tables.length !== wanted.size) {
  const have = new Set(tables.map((t) => t.name))
  const missing = [...wanted].filter((n) => !have.has(n))
  throw new Error(`Missing rate tables: ${missing.join(', ')}`)
}

const out = [
  'export type LegacyCountry = { ar: string; en: string; z: number }',
  '',
  `export const GOGREEN_RATE = ${goGreenMatch[1].trim()} as const`,
  '',
  `export const COUNTRIES = ${countriesMatch[1].trim()} as const satisfies readonly LegacyCountry[]`,
  '',
  ...tables.map((t) => `export const ${t.name} = ${t.value.trim()} as const`),
  '',
].join('\n')

await fs.mkdir(outDir, { recursive: true })
await fs.writeFile(outPath, out, 'utf8')
console.log(`Wrote ${outPath}`)

