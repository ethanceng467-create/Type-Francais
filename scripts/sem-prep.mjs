// 拆批：把全部词条按「词库轮转」混排成若干批，供 AI 语义复核
// 输出 md/sem/todo/batch_NNN.tsv（5 列：序号 / 单词 / 词性 / 我们的释义 / 现有例句）
import fs from 'node:fs'
import path from 'node:path'

const ROOT = path.resolve(import.meta.dirname, '..')
const DATA = path.join(ROOT, 'data/fr')
const OUT = path.join(ROOT, 'md/sem/todo')
const BATCH = 100

fs.rmSync(OUT, { recursive: true, force: true })
fs.mkdirSync(OUT, { recursive: true })

const files = fs
  .readdirSync(DATA)
  .filter((f) => f.endsWith('.tsv'))
  .sort()

// 读每个文件成数组
const books = []
for (const f of files) {
  const txt = fs.readFileSync(path.join(DATA, f), 'utf8').replace(/^\uFEFF/, '')
  const lines = txt.split(/\r?\n/).filter((l) => l.trim())
  const head = lines[0].split('\t')
  const iW = head.indexOf('word')
  const iP = head.indexOf('pos')
  const iC = head.indexOf('cn')
  const iS = head.indexOf('sentence')
  const rows = []
  for (const line of lines.slice(1)) {
    const c = line.split('\t')
    const w = (c[iW] || '').trim()
    if (!w) continue
    rows.push({ word: w, pos: (c[iP] || '').trim(), cn: (c[iC] || '').trim(), sent: iS >= 0 ? (c[iS] || '').trim() : '' })
  }
  books.push({ file: f.replace(/^words-|\.tsv$/g, ''), rows })
}

// 轮转取值：每轮每个词库各取 1 条，直到取完
const queue = []
let round = 0
let alive = books.filter((b) => b.rows.length)
while (alive.length) {
  for (const b of alive) {
    const r = b.rows[round]
    if (r) queue.push({ ...r, book: b.file })
  }
  round++
  alive = alive.filter((b) => b.rows.length > round)
}

// 切批
let n = 0
const manifest = []
for (let i = 0; i < queue.length; i += BATCH) {
  const chunk = queue.slice(i, i + BATCH)
  const name = `batch_${String(n).padStart(3, '0')}`
  const tsv = ['idx\tword\tpos\tcn\tsentence']
    .concat(chunk.map((r, k) => [k + 1, r.word, r.pos, r.cn, r.sent].join('\t')))
    .join('\n')
  fs.writeFileSync(path.join(OUT, name + '.tsv'), tsv + '\n', 'utf8')
  manifest.push({ batch: name, count: chunk.length, books: [...new Set(chunk.map((c) => c.book))] })
  n++
}

fs.writeFileSync(path.join(ROOT, 'md/sem/manifest.json'), JSON.stringify(manifest, null, 1), 'utf8')
const byBook = {}
for (const r of queue) byBook[r.book] = (byBook[r.book] || 0) + 1
console.log('总词数', queue.length, '批数', n)
console.log('各词库：')
for (const [k, v] of Object.entries(byBook).sort((a, b) => b[1] - a[1])) console.log('  ', k.padEnd(14), v)
console.log('首批发书:', manifest[0].books.join(','))
