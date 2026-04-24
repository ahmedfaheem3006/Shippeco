export function parseCsv(text: string) {
  const rows: string[][] = []
  let row: string[] = []
  let cell = ''
  let inQuotes = false

  const pushCell = () => {
    row.push(cell)
    cell = ''
  }

  const pushRow = () => {
    if (row.length === 1 && row[0] === '' && rows.length === 0) return
    rows.push(row)
    row = []
  }

  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    const next = i + 1 < text.length ? text[i + 1] : ''

    if (ch === '"' && inQuotes && next === '"') {
      cell += '"'
      i++
      continue
    }

    if (ch === '"') {
      inQuotes = !inQuotes
      continue
    }

    if (!inQuotes && (ch === ',' || ch === ';' || ch === '\t')) {
      pushCell()
      continue
    }

    if (!inQuotes && (ch === '\n' || ch === '\r')) {
      if (ch === '\r' && next === '\n') i++
      pushCell()
      pushRow()
      continue
    }

    cell += ch
  }

  pushCell()
  pushRow()

  const header = rows.shift() ?? []
  const keys = header.map((h) => String(h ?? '').trim())

  const out: Record<string, string>[] = []
  for (const r of rows) {
    if (r.every((c) => !String(c ?? '').trim())) continue
    const obj: Record<string, string> = {}
    for (let i = 0; i < keys.length; i++) {
      const k = keys[i]
      if (!k) continue
      obj[k] = String(r[i] ?? '').trim()
    }
    out.push(obj)
  }
  return out
}

