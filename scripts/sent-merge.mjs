/**
 * 合并例句回词库 TSV（统一 8 列）
 * 用法：node scripts/sent-merge.mjs
 */
import { readFileSync, writeFileSync, readdirSync, mkdirSync, copyFileSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const DATA = join(ROOT, 'data', 'fr')
const SENT = join(ROOT, 'md', 'sent')
const BAK = join(ROOT, 'data', 'fr-bak')

if (!existsSync(BAK)) {
  mkdirSync(BAK, { recursive: true })
  for (const f of readdirSync(DATA).filter((x) => x.endsWith('.tsv'))) copyFileSync(join(DATA, f), join(BAK, f))
  console.log('已备份原始 TSV 到 data/fr-bak/')
}

const manifest = JSON.parse(readFileSync(join(SENT, 'manifest.json'), 'utf8'))

// 汇总所有批次的例句：file+word -> {fr, zh}，按出现顺序消费
const byFile = new Map()
for (const m of manifest) {
  const out = readFileSync(join(SENT, 'out', `batch_${m.batch}.tsv`), 'utf8')
    .replace(/^\uFEFF/, '').split(/\r?\n/).filter((l) => l.trim())
  const arr = out.map((l) => {
    const c = l.split('\t')
    return { w: (c[0] || '').trim(), fr: (c[1] || '').trim(), zh: (c[2] || '').trim() }
  })
  if (!byFile.has(m.file)) byFile.set(m.file, [])
  byFile.get(m.file).push(...arr)
}

const MISSING = []
let filled = 0
for (const f of readdirSync(DATA).filter((x) => x.endsWith('.tsv')).sort()) {
  const raw = readFileSync(join(DATA, f), 'utf8').replace(/^\uFEFF/, '')
  const lines = raw.split(/\r?\n/).filter((l) => l.trim())
  const head = lines[0].split('\t').map((h) => h.trim())
  const i = (k) => head.indexOf(k)
  const pool = byFile.get(f) || []
  let p = 0

  const outLines = ['word\tipa\tpos\tcn\tsentence\tsentence_cn\tphrase\tphrase_cn']
  for (const line of lines.slice(1)) {
    const c = line.split('\t')
    const get = (k) => (i(k) >= 0 ? (c[i(k)] || '').trim() : '')
    const word = get('word')
    let fr = get('sentence')
    let zh = get('sentence_cn')
    if (!fr) {
      // 从批次池按词条名顺序取（同名词条按出现顺序对齐）
      while (p < pool.length && pool[p].w !== word) p++
      if (p < pool.length) {
        fr = pool[p].fr
        zh = pool[p].zh
        p++
        filled++
      } else {
        MISSING.push(`${f} :: ${word}`)
      }
    }
    outLines.push([word, get('ipa'), get('pos'), get('cn'), fr || '', zh || '', get('phrase'), get('phrase_cn')].join('\t'))
  }
  writeFileSync(join(DATA, f), outLines.join('\n') + '\n', 'utf8')
  const missInFile = outLines.slice(1).filter((l) => !l.split('\t')[4]).length
  console.log(f.padEnd(26), 'rows=' + (outLines.length - 1), 'noSentence=' + missInFile)
}

console.log('\n新填入例句：', filled, ' 仍未填：', MISSING.length)
if (MISSING.length) console.log(MISSING.slice(0, 20).join('\n'))
