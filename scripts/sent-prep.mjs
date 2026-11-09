/**
 * 拆批：把缺例句的词按文件导出成待生成清单
 * 输出 md/sent/todo/batch_<id>.tsv  +  md/sent/manifest.json
 */
import { readFileSync, writeFileSync, readdirSync, mkdirSync, rmSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const DATA = join(ROOT, 'data', 'fr')
const OUT = join(ROOT, 'md', 'sent')
rmSync(join(OUT, 'todo'), { recursive: true, force: true })
mkdirSync(join(OUT, 'todo'), { recursive: true })
mkdirSync(join(OUT, 'out'), { recursive: true })

// 词库 -> 难度档
const LEVEL = {
  'words-a1.tsv': 'A1',
  'words-a1-new.tsv': 'A1',
  'words-a2-new.tsv': 'A2',
  'words-b1-new.tsv': 'B1',
  'words-b2-new.tsv': 'B2',
  'words-c1-new.tsv': 'C1',
  'words-c2-new.tsv': 'C2',
  'words-ecommerce.tsv': 'B1',
  'words-fr-vie.tsv': 'A2',
  'words-fr-maison.tsv': 'A2',
  'words-fr-personne.tsv': 'A2',
  'words-fr-campus.tsv': 'B1',
  'words-fr-travail.tsv': 'B1',
  'words-fr-loisir.tsv': 'B1',
  'words-fr-societe.tsv': 'B1',
  'words-fr-science.tsv': 'B2',
}

const PER_BATCH = 120
const manifest = []
let bid = 0

for (const f of readdirSync(DATA).filter((x) => x.endsWith('.tsv')).sort()) {
  const raw = readFileSync(join(DATA, f), 'utf8').replace(/^\uFEFF/, '')
  const lines = raw.split(/\r?\n/).filter((l) => l.trim())
  const head = lines[0].split('\t')
  const iW = head.indexOf('word')
  const iP = head.indexOf('pos')
  const iC = head.indexOf('cn')
  const iS = head.indexOf('sentence')
  const level = LEVEL[f] || 'B1'

  const need = []
  lines.slice(1).forEach((line, i) => {
    const c = line.split('\t')
    const hasSent = iS >= 0 && c[iS] && c[iS].trim()
    if (!hasSent) need.push({ line: i + 2, word: (c[iW] || '').trim(), pos: (c[iP] || '').trim(), cn: (c[iC] || '').trim() })
  })

  for (let i = 0; i < need.length; i += PER_BATCH) {
    const chunk = need.slice(i, i + PER_BATCH)
    const id = String(bid++).padStart(3, '0')
    const body = chunk.map((x, k) => `${k + 1}\t${x.word}\t${x.pos}\t${x.cn}`).join('\n')
    writeFileSync(join(OUT, 'todo', `batch_${id}.tsv`), body + '\n', 'utf8')
    manifest.push({ batch: id, file: f, level, count: chunk.length })
  }
}

writeFileSync(join(OUT, 'manifest.json'), JSON.stringify(manifest, null, 2), 'utf8')
console.log('batches:', manifest.length, 'words:', manifest.reduce((a, b) => a + b.count, 0))
for (const m of manifest) console.log(m.batch, m.file.padEnd(24), m.level, m.count)
