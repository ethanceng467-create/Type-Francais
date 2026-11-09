/**
 * 用 frdic.com 抓取结果校验词库释义
 * 用法：node scripts/frdic-check.mjs [--in md/frdic/report.json] [--csv md/frdic/issues.csv]
 *
 * 法语的助手的释义正文里，高频汉字被替换成了 <img>（抓取时记为 □）。
 * 因此只做三类可信判定，不做逐字精确比对：
 *   1. 词条存在性 —— 页面 200 且解析到词头
 *   2. 词性一致   —— frdic 的 cara 标签 vs 我们的 pos
 *   3. 释义可能缺失 —— 我们的每个义项都无法在 frdic 释义中模糊命中
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const args = process.argv.slice(2)
const argOf = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d }
const IN = argOf('--in', 'md/frdic/report.json')
const CSV = argOf('--csv', 'md/frdic/issues.csv')

if (!existsSync(join(ROOT, IN))) {
  console.error('找不到抓取结果：' + IN)
  process.exit(1)
}
const rows = JSON.parse(readFileSync(join(ROOT, IN), 'utf8'))

/* ---------- 工具 ---------- */
const norm = (s) => s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  .replace(/œ/g, 'oe').replace(/æ/g, 'ae').replace(/[’‘]/g, "'")

// 把 frdic 释义里的 □ 当通配符：我们释义的每个字，都要能在对应位置匹配上
const fuzzyHas = (haystack, needle) => {
  if (!needle) return true
  const h = haystack
  for (let i = 0; i + needle.length <= h.length; i++) {
    let ok = true
    for (let j = 0; j < needle.length; j++) {
      const hc = h[i + j], nc = needle[j]
      if (hc === '□') continue
      if (hc !== nc) { ok = false; break }
    }
    if (ok) return true
  }
  return false
}

// 我们的中文释义切成义项：按 ；; ，, 、/ 分
const splitCn = (cn) => cn.split(/[；;，,、/（）()]/).map((s) => s.trim()).filter((s) => s.length >= 1)

// 词性归一
const POS = {
  'n.m.': ['n. m', 'n.m', 'n. m.'],
  'n.f.': ['n. f', 'n.f', 'n. f.'],
  'n.': ['n.', 'n. m', 'n. f'],
  'v.': ['v.', 'v. t', 'v. i', 'v. pr', 'v. impers'],
  'adj.': ['a.', 'adj'],
  'adv.': ['adv'],
  'prép.': ['prép', 'prep'],
  'conj.': ['conj'],
  'num.': ['num'],
  'pron.': ['pron'],
}
function posMatch(ourPos, frPos) {
  if (!ourPos) return null
  const key = ourPos.trim()
  if (key.includes('pl')) return null // 复数标记不比
  const cands = POS[key] || [key.replace(/\./g, '')]
  const f = frPos.join(' | ').toLowerCase().replace(/\s+/g, ' ')
  return cands.some((c) => f.includes(c.toLowerCase()))
}

/* ---------- 分类 ---------- */
const buckets = { missing: [], posDiff: [], cnMissing: [], cnPartial: [], undecided: [], ok: [] }

for (const r of rows) {
  const f = r.frdic || {}
  if (!f.ok) { buckets.missing.push(r); continue }
  const defText = (f.defs || []).join(' ')
  const posFlag = posMatch(r.pos, f.pos || [])

  const items = splitCn(r.cn)
  const missingItems = []
  let undecided = 0
  for (const it of items) {
    if (it.length < 2) {
      // 单字义项：只认精确命中，被 □ 覆盖的算无法判定，不判错
      if (!defText.includes(it)) undecided++
      continue
    }
    if (!fuzzyHas(defText, it)) missingItems.push(it)
  }
  const judged = items.length - undecided
  const cnIssue = judged > 0 && missingItems.length === judged

  const rec = { word: r.word, file: r.file, pos: r.pos, cn: r.cn, frdicPos: (f.pos || []).join(','), frdicDef: defText.replace(/\s+/g, ' ').slice(0, 160), missing: missingItems.join('|'), ipa: f.ipa || '' }
  if (cnIssue) buckets.cnMissing.push(rec)
  else if (missingItems.length) buckets.cnPartial.push(rec)
  else if (judged === 0) buckets.undecided.push(rec)
  else buckets.ok.push(rec)

  if (posFlag === false) buckets.posDiff.push(rec)
}

/* ---------- 输出 ---------- */
const pct = (n) => ((n / rows.length) * 100).toFixed(1) + '%'
console.log(`样本 ${rows.length} 词`)
console.log(`  词条未收录      ${buckets.missing.length}  (${pct(buckets.missing.length)})`)
console.log(`  词性不符        ${buckets.posDiff.length}  (${pct(buckets.posDiff.length)})`)
console.log(`  释义全部对不上  ${buckets.cnMissing.length}  (${pct(buckets.cnMissing.length)})`)
console.log(`  释义部分对不上  ${buckets.cnPartial.length}  (${pct(buckets.cnPartial.length)})`)
console.log(`  释义吻合        ${buckets.ok.length}  (${pct(buckets.ok.length)})`)
console.log(`  无法判定(单字)  ${buckets.undecided.length}  (${pct(buckets.undecided.length)})`)

const esc = (s) => '"' + String(s == null ? '' : s).replace(/"/g, '""') + '"'
const lines = ['类型,单词,词库,我们的词性,我们的释义,法语助手词性,法语助手释义摘要,未命中的义项']
for (const r of buckets.missing) lines.push(['未收录', r.word, r.file, r.pos, r.cn, '', '', ''].map(esc).join(','))
for (const r of buckets.posDiff) lines.push(['词性不符', r.word, r.file, r.pos, r.cn, r.frdicPos, r.frdicDef, ''].map(esc).join(','))
for (const r of buckets.cnMissing) lines.push(['释义对不上', r.word, r.file, r.pos, r.cn, r.frdicPos, r.frdicDef, r.missing].map(esc).join(','))
for (const r of buckets.cnPartial) lines.push(['释义部分缺失', r.word, r.file, r.pos, r.cn, r.frdicPos, r.frdicDef, r.missing].map(esc).join(','))
writeFileSync(join(ROOT, CSV), '\uFEFF' + lines.join('\n') + '\n', 'utf8')
console.log(`\n明细已写入 ${CSV}（${lines.length - 1} 行）`)

// 各词库问题分布
const byFile = {}
for (const k of ['missing', 'posDiff', 'cnMissing']) {
  for (const r of buckets[k]) {
    byFile[r.file] = byFile[r.file] || { missing: 0, posDiff: 0, cnMissing: 0, total: 0 }
    byFile[r.file][k]++
  }
}
for (const r of rows) {
  byFile[r.file] = byFile[r.file] || { missing: 0, posDiff: 0, cnMissing: 0, total: 0 }
  byFile[r.file].total++
}
console.log('\n按词库：')
for (const [f, v] of Object.entries(byFile).sort()) {
  console.log(`  ${f.padEnd(26)} 未收录 ${String(v.missing).padStart(4)} | 词性 ${String(v.posDiff).padStart(4)} | 释义 ${String(v.cnMissing).padStart(4)}  / 共 ${v.total}`)
}
