// 合并 DELF 分级词库 + 8 本主题词库 + 电商，去重后输出统一词表并拆批
// 去重规则：按「去重音折叠 + 小写」为键；同一键下保留信息最全的一条（释义长度优先，其次例句）
// 输出：
//   md/sem/merge/all.tsv        统一词表（9 列：key/word/ipa/pos/cn/sentence/sentence_cn/source/dupSources）
//   md/sem/todo/batch_NNN.tsv   AI 判定输入（4 列：idx/word/pos/cn）
//   md/sem/merge/stats.json     统计
import fs from 'node:fs'
import path from 'node:path'

const ROOT = path.resolve(import.meta.dirname, '..')
const DATA = path.join(ROOT, 'data/fr')
const MERGE = path.join(ROOT, 'md/sem/merge')
const TODO = path.join(ROOT, 'md/sem/todo')
const BATCH = 100

fs.rmSync(MERGE, { recursive: true, force: true })
fs.rmSync(TODO, { recursive: true, force: true })
fs.mkdirSync(MERGE, { recursive: true })
fs.mkdirSync(TODO, { recursive: true })

// 来源优先级：数字越小越优先（DELF 释义更准）
const PRIORITY = {
  'a1': 1, 'a1-new': 1, 'a2-new': 2, 'b1-new': 3, 'b2-new': 4, 'c1-new': 5, 'c2-new': 6,
  'fr-vie': 10, 'fr-maison': 10, 'fr-personne': 10, 'fr-campus': 10, 'fr-travail': 10,
  'fr-loisir': 10, 'fr-societe': 10, 'fr-science': 10,
  'ecommerce': 20,
}

const fold = (s) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()

const files = fs.readdirSync(DATA).filter((f) => f.endsWith('.tsv')).sort()
const rows = []
for (const f of files) {
  const name = f.replace(/^words-|\.tsv$/g, '')
  const txt = fs.readFileSync(path.join(DATA, f), 'utf8').replace(/^\uFEFF/, '')
  const lines = txt.split(/\r?\n/).filter((l) => l.trim())
  const head = lines[0].split('\t')
  const ix = (n) => head.indexOf(n)
  const [iW, iI, iP, iC, iS, iSC] = [ix('word'), ix('ipa'), ix('pos'), ix('cn'), ix('sentence'), ix('sentence_cn')]
  for (const line of lines.slice(1)) {
    const c = line.split('\t')
    const w = (c[iW] || '').trim()
    if (!w) continue
    rows.push({
      key: fold(w),
      word: w,
      ipa: iI >= 0 ? (c[iI] || '').trim() : '',
      pos: iP >= 0 ? (c[iP] || '').trim() : '',
      cn: iC >= 0 ? (c[iC] || '').trim() : '',
      sentence: iS >= 0 ? (c[iS] || '').trim() : '',
      sentence_cn: iSC >= 0 ? (c[iSC] || '').trim() : '',
      source: name,
      prio: PRIORITY[name] ?? 99,
    })
  }
}

// 同一键择优
const map = new Map()
for (const r of rows) {
  const cur = map.get(r.key)
  if (!cur) {
    map.set(r.key, { ...r, others: [] })
    continue
  }
  cur.others.push(r.source)
  const score = (x) => (x.cn ? 100 : 0) + x.cn.length + (x.sentence ? 50 : 0) + (x.ipa ? 10 : 0) - x.prio * 3
  if (score(r) > score(cur)) {
    const keepOthers = cur.others
    map.set(r.key, { ...r, others: keepOthers })
  }
}
// 去掉自引用并去重来源列表
for (const v of map.values()) v.others = [...new Set(v.others)].filter((s) => s !== v.source)

const all = [...map.values()].sort((a, b) => a.word.localeCompare(b.word, 'fr'))

// 输出统一词表
const head = ['key', 'word', 'ipa', 'pos', 'cn', 'sentence', 'sentence_cn', 'source', 'dupSources']
fs.writeFileSync(
  path.join(MERGE, 'all.tsv'),
  [head.join('\t')]
    .concat(all.map((r) => [r.key, r.word, r.ipa, r.pos, r.cn, r.sentence, r.sentence_cn, r.source, r.others.join(',')].join('\t')))
    .join('\n') + '\n',
  'utf8'
)

// 拆批（顺序即字母序，保证每批内难度分散但可复现）
const manifest = []
for (let i = 0, n = 0; i < all.length; i += BATCH, n++) {
  const chunk = all.slice(i, i + BATCH)
  const name = `batch_${String(n).padStart(3, '0')}`
  const tsv = ['idx\tword\tpos\tcn']
    .concat(chunk.map((r, k) => [k + 1, r.word, r.pos, r.cn].join('\t')))
    .join('\n')
  fs.writeFileSync(path.join(TODO, name + '.tsv'), tsv + '\n', 'utf8')
  manifest.push({ batch: name, count: chunk.length })
}
fs.writeFileSync(path.join(MERGE, 'manifest.json'), JSON.stringify(manifest, null, 1), 'utf8')

// 统计
const srcCount = {}
for (const r of rows) srcCount[r.source] = (srcCount[r.source] || 0) + 1
const stats = {
  rawRows: rows.length,
  unique: all.length,
  batches: manifest.length,
  bySourceRaw: srcCount,
  withSentence: all.filter((r) => r.sentence).length,
  withoutSentence: all.filter((r) => !r.sentence).length,
  withoutIpa: all.filter((r) => !r.ipa).length,
  crossDup: all.filter((r) => r.others.length).length,
  delfWon: all.filter((r) => r.prio <= 6).length,
  themaWon: all.filter((r) => r.prio === 10).length,
}
fs.writeFileSync(path.join(MERGE, 'stats.json'), JSON.stringify(stats, null, 1), 'utf8')

console.log('原始条目', stats.rawRows, '→ 去重后', stats.unique, '→ 批数', stats.batches)
console.log('有例句', stats.withSentence, '| 缺例句', stats.withoutSentence, '| 缺音标', stats.withoutIpa)
console.log('跨库重复词', stats.crossDup, '| 采用 DELF 释义', stats.delfWon, '| 采用主题库释义', stats.themaWon)
console.log('各来源原始条数：')
for (const [k, v] of Object.entries(srcCount).sort((a, b) => b[1] - a[1])) console.log('  ', k.padEnd(13), v)
