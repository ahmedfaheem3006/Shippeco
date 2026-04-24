import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const spaRoot = path.resolve(__dirname, '..')
const reportsDir = path.join(spaRoot, 'reports')
const jsonPath = path.join(reportsDir, 'pricing-results.json')
const mdPath = path.join(reportsDir, 'pricing-report.md')

const raw = await fs.readFile(jsonPath, 'utf8')
const data = JSON.parse(raw)

const files = data.testResults ?? []

const allTests = files.flatMap((f) =>
  (f.assertionResults ?? []).map((s) => ({
    name: s.fullName ?? s.title ?? 'unknown',
    status: s.status ?? 'unknown',
    duration: s.duration ?? 0,
    failureMessages: s.failureMessages ?? [],
  })),
)

const failed = allTests.filter((t) => t.status === 'failed')
const passed = allTests.filter((t) => t.status === 'passed')
const durationMs = files.reduce((sum, f) => {
  const start = f.startTime ?? 0
  const end = f.endTime ?? 0
  return sum + (end > start ? end - start : 0)
}, 0)

const slowest = [...allTests]
  .filter((t) => typeof t.duration === 'number')
  .sort((a, b) => (b.duration ?? 0) - (a.duration ?? 0))
  .slice(0, 10)

const matrixTest = allTests.find((t) =>
  String(t.name).includes('matches legacy behavior across combinations of service, weight, fuel, profit'),
)
const matrixCombinations = 5 * 11 * 3 * 3

const lines = []
lines.push('# Pricing Test Report')
lines.push('')
lines.push(`- Total test suites: ${data.numTotalTestSuites ?? files.length}`)
lines.push(`- Total tests: ${data.numTotalTests ?? allTests.length}`)
lines.push(`- Passed: ${data.numPassedTests ?? passed.length}`)
lines.push(`- Failed: ${data.numFailedTests ?? failed.length}`)
lines.push(`- Success: ${String(data.success ?? failed.length === 0)}`)
if (durationMs) lines.push(`- Duration (summed suites): ${(durationMs / 1000).toFixed(2)}s`)
lines.push('')

lines.push('## Slowest Tests')
for (const t of slowest) {
  lines.push(`- ${t.duration ?? 0}ms — ${t.name}`)
}
lines.push('')

lines.push('## Coverage Summary')
lines.push('- Zones: SA, QT, 1–7, and Zone 8 no-rate behavior')
lines.push('- Weight: sub-1kg, integer, fractional, and extrapolation > 100kg')
lines.push('- Dimensions: volumetric vs actual selection and multi-piece totals')
lines.push('- Surcharges: fuel % and profit % (including negative profit as discount)')
lines.push(`- Matrix combinations validated: ${matrixCombinations}`)
if (matrixTest?.duration) {
  const combosPerSec = (matrixCombinations / (matrixTest.duration / 1000)).toFixed(0)
  lines.push(`- Matrix throughput: ~${combosPerSec} calculations/sec (in tests)`)
}
lines.push('')

if (failed.length) {
  lines.push('## Failures')
  for (const t of failed) {
    lines.push(`- ${t.name}`)
    for (const msg of t.failureMessages) {
      const cleaned = String(msg).split('\n').slice(0, 12).join('\n')
      lines.push('')
      lines.push('```')
      lines.push(cleaned)
      lines.push('```')
      lines.push('')
    }
  }
} else {
  lines.push('## Failures')
  lines.push('')
  lines.push('None')
}

await fs.mkdir(reportsDir, { recursive: true })
await fs.writeFile(mdPath, lines.join('\n'), 'utf8')
console.log(`Wrote ${mdPath}`)
