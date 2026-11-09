/**
 * 校验例句批次：node scripts/sent-check.mjs 000 | all
 */
import { readFileSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const DIR = join(ROOT, 'md', 'sent')
const manifest = JSON.parse(readFileSync(join(DIR, 'manifest.json'), 'utf8'))

const RANGE = { A1: [4, 15], A2: [5, 18], B1: [5, 20], B2: [6, 24], C1: [6, 26], C2: [6, 26] }
const CJK = /[\u3400-\u9fff\u3000-\u303f\uff01-\uff60]/

const norm = (s) =>
  s.toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/œ/g, 'oe').replace(/æ/g, 'ae')
    .replace(/[’‘]/g, "'")

function hit(word, text) {
  const w = norm(word)
  const t = norm(text)
  if (t.includes(w)) return true
  const stems = new Set()
  // 允许常见屈折：去掉 1~3 个词尾
  for (const cut of [1, 2, 3]) {
    if (w.length - cut >= 4) stems.add(w.slice(0, w.length - cut))
  }
  // 词首 5 字符（针对 longuement / longue 这类派生）
  if (w.length >= 7) stems.add(w.slice(0, w.length - 3))
  for (const s of stems) {
    if (new RegExp(`(^|[^a-z])${s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`).test(t)) return true
  }
  return false
}

const targets = process.argv[2] || 'all'
const batches = targets === 'all' ? manifest : manifest.filter((m) => m.batch === targets.padStart(3, '0'))

let failTotal = 0, warnTotal = 0, okBatches = 0
for (const m of batches) {
  const todoPath = join(DIR, 'todo', `batch_${m.batch}.tsv`)
  const outPath = join(DIR, 'out', `batch_${m.batch}.tsv`)
  const problems = []
  const warns = []
  if (!existsSync(outPath)) {
    console.log(`[MISSING] batch_${m.batch} 未产出（${m.file} ${m.level} ${m.count} 词）`)
    failTotal++
    continue
  }
  const todo = readFileSync(todoPath, 'utf8').split(/\r?\n/).filter((l) => l.trim())
  const out = readFileSync(outPath, 'utf8').replace(/^\uFEFF/, '').split(/\r?\n/).filter((l) => l.trim())

  if (out.length !== todo.length) problems.push(`行数不符：应为 ${todo.length}，实际 ${out.length}`)
  if (out[0] && /^(word|单词)/i.test(out[0])) problems.push('第 1 行像是表头，应删除')

  const n = Math.min(out.length, todo.length)
  const seenSentence = new Map()
  for (let i = 0; i < n; i++) {
    const tw = todo[i].split('\t')
    const oc = out[i].split('\t')
    const word = tw[1]
    if (oc.length !== 3) { problems.push(`第 ${i + 1} 行列数 ${oc.length}（应为 3）：${out[i].slice(0, 60)}`); continue }
    const [w2, fr, zh] = oc.map((x) => x.trim())
    if (w2 !== word) problems.push(`第 ${i + 1} 行词条不符：「${w2}」应作「${word}」`)
    if (!fr) problems.push(`第 ${i + 1} 行 ${word} 法语句为空`)
    if (!zh) problems.push(`第 ${i + 1} 行 ${word} 中文为空`)
    if (fr && CJK.test(fr)) problems.push(`第 ${i + 1} 行 ${word} 法语句混入中文：${fr}`)
    if (zh && !CJK.test(zh)) problems.push(`第 ${i + 1} 行 ${word} 中文行不含汉字：${zh}`)
    if (fr && /["“”]/.test(fr)) warns.push(`第 ${i + 1} 行 ${word} 法语句含引号`)
    if (fr && !hit(word, fr)) warns.push(`第 ${i + 1} 行 ${word} 法语句未找到目标词：${fr}`)
    const [lo, hi] = RANGE[m.level] || [5, 22]
    const wc = fr.split(/\s+/).filter(Boolean).length
    if (wc < lo || wc > hi) warns.push(`第 ${i + 1} 行 ${word} 长度 ${wc} 词，超出 ${m.level} 区间 ${lo}-${hi}`)
    if (fr) {
      if (seenSentence.has(fr)) warns.push(`第 ${i + 1} 行 ${word} 与第 ${seenSentence.get(fr)} 行例句完全相同`)
      else seenSentence.set(fr, i + 1)
    }
  }

  const tag = problems.length ? 'FAIL' : warns.length ? 'WARN' : 'OK  '
  if (problems.length) failTotal++
  else okBatches++
  warnTotal += warns.length
  console.log(`[${tag}] batch_${m.batch} ${m.file} ${m.level} ${m.count}词  问题${problems.length} 提示${warns.length}`)
  for (const p of problems.slice(0, 8)) console.log('   ✗ ' + p)
  for (const w of warns.slice(0, 6)) console.log('   · ' + w)
}
console.log(`\n汇总：批次 ${batches.length}，通过 ${okBatches}，失败 ${failTotal}，提示 ${warnTotal}`)
