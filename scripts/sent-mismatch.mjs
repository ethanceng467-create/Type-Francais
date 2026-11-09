// 诊断：词条被修正后，例句是否还匹配
import fs from 'node:fs'
import path from 'node:path'

const ROOT = path.resolve(import.meta.dirname, '..')
const lex = JSON.parse(fs.readFileSync(path.join(ROOT, '..', 'md', 'ref', 'lex_cache.json'), 'utf8'))

// 读修正报告
const csv = fs.readFileSync(path.join(ROOT, 'md/sem/fix-report.csv'), 'utf8').replace(/^\uFEFF/, '')
const lines = csv.split(/\r?\n/).filter((l) => l.trim()).slice(1)
const rows = lines.map((l) => {
  const a = []
  let cur = '', q = false
  for (const ch of l) {
    if (ch === '"') { q = !q; continue }
    if (ch === ',' && !q) { a.push(cur); cur = ''; continue }
    cur += ch
  }
  a.push(cur)
  return { w: a[0], nw: a[1], op: a[2], np: a[3], oc: a[4], nc: a[5], vd: a[6], iss: a[7] }
})

// 读输出词库
const idx = new Map()
for (const f of ['vie', 'maison', 'personne', 'campus', 'travail', 'loisir', 'societe', 'science']) {
  const p = path.join(ROOT, 'data/fr-merged', `words-fr-${f}.tsv`)
  if (!fs.existsSync(p)) continue
  for (const l of fs.readFileSync(p, 'utf8').split(/\r?\n/).filter((x) => x.trim()).slice(1)) {
    const c = l.split('\t')
    if (!idx.has(c[0])) idx.set(c[0], { f, ipa: c[1], pos: c[2], cn: c[3], sent: c[4], sentCn: c[5] })
  }
}

const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
const wordRe = (w) => new RegExp(`(^|[^\\p{L}])${esc(w)}([^\\p{L}]|$)`, 'iu')

const risky = []
for (const r of rows) {
  if (r.w === r.nw && r.op === r.np) continue // 只改释义，例句不受影响
  const rec = idx.get(r.nw)
  if (!rec) continue
  const hasNew = wordRe(r.nw).test(rec.sent || '')
  const posChanged = r.op !== r.np
  const wChanged = r.w !== r.nw
  if (posChanged && !hasNew) {
    risky.push({ ...r, sent: rec.sent, sentCn: rec.sentCn, f: rec.f, why: '词性变了且例句不含新词形' })
    continue
  }
  if (wChanged && !hasNew) {
    const e = lex[r.w]
    const isInflexion = e && e.cgram === 'VER' && e.lem === false
    if (!isInflexion) risky.push({ ...r, sent: rec.sent, sentCn: rec.sentCn, f: rec.f, why: '词形变了且例句不含新词形' })
  }
}

console.log('例句可能与新词条不匹配:', risky.length)
for (const r of risky) {
  console.log(`[${r.f}] ${r.w}(${r.op}) ${r.oc}  =>  ${r.nw}(${r.np}) ${r.nc}`)
  console.log(`   ${r.why}`)
  console.log(`   例句: ${r.sent}`)
  console.log(`   译:   ${r.sentCn}`)
}

fs.writeFileSync(path.join(ROOT, 'md/sem/sent-mismatch.json'), JSON.stringify(risky, null, 1), 'utf8')
