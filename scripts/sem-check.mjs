// 校验「释义复核 + 场景归属」产物：6 列、行数、单词一致、枚举合法、场景值合法
// 用法：node scripts/sem-check.mjs [NNN|all]
import fs from 'node:fs'
import path from 'node:path'

const ROOT = path.resolve(import.meta.dirname, '..')
const TODO = path.join(ROOT, 'md/sem/todo')
const OUT = path.join(ROOT, 'md/sem/out')

const VERDICTS = new Set(['OK', 'PARTIAL', 'WRONG'])
const ISSUES = new Set(['义项缺失', '释义错误', '词性错误', '非规范词形', '释义含混', ''])
const SCENES = new Set(['vie', 'maison', 'personne', 'campus', 'travail', 'loisir', 'societe', 'science'])

const arg = process.argv[2] || 'all'
const names =
  arg === 'all'
    ? fs.existsSync(OUT)
      ? fs.readdirSync(OUT).filter((f) => /^batch_\d+\.tsv$/.test(f)).map((f) => f.replace('.tsv', '')).sort()
      : []
    : ['batch_' + String(arg).replace(/\D/g, '').padStart(3, '0')]

let totalFail = 0
let totalWarn = 0
const grand = { OK: 0, PARTIAL: 0, WRONG: 0 }
const sceneCount = {}
const badBatches = []

for (const name of names) {
  const todoPath = path.join(TODO, name + '.tsv')
  const outPath = path.join(OUT, name + '.tsv')
  if (!fs.existsSync(todoPath)) { console.log(`${name}: 缺输入`); continue }
  const todo = fs.readFileSync(todoPath, 'utf8').replace(/^\uFEFF/, '').split(/\r?\n/).slice(1).filter((l) => l.trim())
  const expWords = todo.map((l) => l.split('\t')[1])

  if (!fs.existsSync(outPath)) { console.log(`${name}: FAIL 未产出（应 ${expWords.length} 行）`); totalFail++; badBatches.push(name); continue }

  const out = fs.readFileSync(outPath, 'utf8').replace(/^\uFEFF/, '').split(/\r?\n/).filter((l) => l.trim())
  const fails = []
  const warns = []
  const cnt = { OK: 0, PARTIAL: 0, WRONG: 0 }

  if (out.length !== expWords.length) fails.push(`行数 ${out.length} ≠ 期望 ${expWords.length}`)

  const n = Math.min(out.length, expWords.length)
  for (let i = 0; i < n; i++) {
    const c = out[i].split('\t')
    const exp = expWords[i]
    const at = `第 ${i + 1} 行`
    if (c.length !== 6) {
      fails.push(`${at} 有 ${c.length} 列（需 6 列）：${out[i].slice(0, 40)}`)
      if (fails.length > 15) break
      continue
    }
    const [word, verdict, issue, suggest, reason, scenes] = c
    if (word !== exp) fails.push(`${at} 单词不一致：${word} ≠ ${exp}`)
    if (!VERDICTS.has(verdict)) fails.push(`${at} 判定非法：${verdict}`)
    else cnt[verdict]++
    if (!ISSUES.has(issue)) fails.push(`${at} 问题类型非法：${issue}`)

    // 场景校验
    const sc = scenes.trim()
    if (!sc) fails.push(`${at} 场景为空`)
    else {
      const list = sc.split(',')
      if (list.length > 3) fails.push(`${at} 场景过多（${list.length} 个）：${sc}`)
      if (sc.includes(' ')) fails.push(`${at} 场景含空格：${sc}`)
      for (const s of list) {
        if (!SCENES.has(s)) fails.push(`${at} 场景值非法：${s}`)
        else sceneCount[s] = (sceneCount[s] || 0) + 1
      }
      if (new Set(list).size !== list.length) fails.push(`${at} 场景重复：${sc}`)
    }

    if (verdict === 'OK') {
      if (issue || suggest.trim() || reason.trim()) warns.push(`${at} 判 OK 却填了附加信息`)
    } else {
      if (!issue) fails.push(`${at} ${verdict} 但未填问题类型`)
      if (!suggest.trim()) fails.push(`${at} ${verdict} 但未给建议释义`)
      if (!reason.trim()) fails.push(`${at} ${verdict} 但未给理由`)
      if (suggest.length > 30) warns.push(`${at} 建议释义过长（${suggest.length} 字）`)
      if (reason.length > 40) warns.push(`${at} 理由过长`)
    }
    if (fails.length > 15) break
  }

  grand.OK += cnt.OK; grand.PARTIAL += cnt.PARTIAL; grand.WRONG += cnt.WRONG
  totalFail += fails.length; totalWarn += warns.length

  const tag = fails.length ? 'FAIL' : 'PASS'
  console.log(`${name}: ${tag}  ${out.length}/${expWords.length}  OK ${cnt.OK} PARTIAL ${cnt.PARTIAL} WRONG ${cnt.WRONG}${warns.length ? '  WARN ' + warns.length : ''}`)
  for (const f of fails.slice(0, 6)) console.log('   ✗ ' + f)
  if (fails.length > 6) console.log(`   ... 另有 ${fails.length - 6} 处`)
  for (const w of warns.slice(0, 2)) console.log('   ! ' + w)
  if (fails.length) badBatches.push(name)
}

const sum = grand.OK + grand.PARTIAL + grand.WRONG
if (sum) {
  const p = (x) => ((x / sum) * 100).toFixed(1) + '%'
  console.log(`\n合计 ${names.length} 批 / ${sum} 词：OK ${grand.OK} (${p(grand.OK)})  PARTIAL ${grand.PARTIAL} (${p(grand.PARTIAL)})  WRONG ${grand.WRONG} (${p(grand.WRONG)})`)
  const sc = Object.entries(sceneCount).sort((a, b) => b[1] - a[1])
  console.log('场景分布：' + sc.map(([k, v]) => `${k} ${v}`).join('  '))
}
console.log(`FAIL ${totalFail} 处，WARN ${totalWarn} 处`)
if (badBatches.length) { console.log(`需要修：${badBatches.join(' ')}`); process.exitCode = 1 }
