// 应用 AI 复核结果：修正词条 + 按场景分库，输出 8 本主题词库
// 用法：node scripts/merge-apply.mjs [--dry]
// 输入：md/sem/merge/all.tsv（去重后统一词表）、md/sem/out/*.tsv（AI 判定）、md/sem/todo/*.tsv
// 输出：data/fr-merged/words-fr-<scene>.tsv（8 个）、md/sem/fix-report.csv、md/sem/apply-stats.json
import fs from 'node:fs'
import path from 'node:path'

const ROOT = path.resolve(import.meta.dirname, '..')
const DRY = process.argv.includes('--dry')
const SRC = path.join(ROOT, 'md/sem/merge/all.tsv')
const OUT_DIR = path.join(ROOT, 'data/fr-merged')
const SCENES = ['vie', 'maison', 'personne', 'campus', 'travail', 'loisir', 'societe', 'science']

const POS_RE = /^(n\.m\.pl\.|n\.f\.pl\.|n\.m\.|n\.f\.|adj\.|adv\.|v\.|prép\.|conj\.|num\.|interj\.)$/

// —— 25 条「词性错误但建议未给词性」的人工判定表 ——
// key = 原词，value = { word?, pos, cn }
const MANUAL = {
  abrège: { word: 'abréger', pos: 'v.', cn: '缩短；删节' },
  abricot: { pos: 'n.m.', cn: '杏；杏子' },
  accessoire: { pos: 'n.m.', cn: '配件；附属品' },
  additif: { pos: 'n.m.', cn: '添加剂' },
  adjectif: { pos: 'n.m.', cn: '形容词' },
  aérée: { word: 'aéré', pos: 'adj.', cn: '通风的' },
  amateur: { pos: 'adj.', cn: '业余的；业余爱好者' },
  analgésique: { pos: 'n.m.', cn: '止痛药；止痛的' },
  anesthésiant: { pos: 'n.m.', cn: '麻醉的；麻醉剂' },
  artiste: { pos: 'n.m.', cn: '艺术家' },
  canadienne: { word: 'canadien', pos: 'n.m.', cn: '加拿大人；加拿大的' },
  complice: { pos: 'n.m.', cn: '同谋；同谋的' },
  comptable: { pos: 'n.m.', cn: '会计；会计的' },
  concurrence: { pos: 'n.f.', cn: '竞争' },
  cycliste: { pos: 'n.m.', cn: '骑车人；自行车的' },
  diplomate: { pos: 'n.m.', cn: '外交官' },
  éliminatoire: { pos: 'adj.', cn: '淘汰性的；淘汰赛的' },
  employé: { pos: 'n.m.', cn: '雇员；职员' },
  feint: { word: 'feinte', pos: 'n.f.', cn: '假动作' },
  final: { pos: 'adj.', cn: '最终的；最后的' },
  finlandais: { pos: 'adj.', cn: '芬兰的；芬兰人' },
  fondateur: { pos: 'n.m.', cn: '创始人；奠基的' },
  gagnante: { word: 'gagnant', pos: 'n.m.', cn: '获胜者；获胜的' },
  joueur: { pos: 'n.m.', cn: '玩家；运动员' },
  'sans-fil': { pos: 'n.m.', cn: '无线电；无绳电话' },
  alaise: { word: 'alèse', pos: 'n.f.', cn: '床垫套' },
  allas: { word: 'lilas', pos: 'n.m.', cn: '丁香' },
}

// 清洗释义：去掉括号注记（词性/词形/说明），保留纯净中文
function cleanCn(s) {
  const orig = (s || '').trim()
  let out = orig
    .replace(/[（(][^（）()]*[）)]/g, '')
    .replace(/\s{2,}/g, ' ')
    .trim()
  out = out
    .split('；')
    .map((x) => x.trim())
    .filter(Boolean)
    .join('；')
  out = out.replace(/；+/g, '；').replace(/^；|；$/g, '')
  return out || orig
}

// —— 词条修正后例句已不匹配的条目，重写例句 ——
// key = 修正后的新词形；value = [法语例句, 中文译文]
const SENT_FIX = {
  'alèse': ["L'alèse protège le matelas des taches et de l'humidité.", '床垫罩保护床垫，防污又防潮。'],
  'blanc': ['Le blanc est la couleur de la neige en hiver.', '白色是冬天雪的颜色。'],
  'cage': ["L'oiseau chante dans sa cage près de la fenêtre.", '鸟儿在窗边的笼子里唱歌。'],
  'comprimé': ["Le médecin m'a prescrit un comprimé contre la fièvre.", '医生给我开了一片退烧药。'],
  'condamné': ['Le condamné a demandé la clémence du tribunal.', '罪犯请求法庭从轻发落。'],
  'détaillé': ['Son rapport détaillé impressionne toute la direction.', '他详尽的报告让整个管理层印象深刻。'],
  'bronzer': ['Elle aime bronzer sur la plage pendant les vacances.', '她喜欢假期在沙滩上晒黑。'],
  'talc': ['Elle applique du talc sur les pieds de son bébé.', '她给宝宝脚上扑滑石粉。'],
  'viscère': ['Le foie est un viscère essentiel au corps humain.', '肝脏是人体重要的内脏。'],
  'protiste': ['Cet organisme unicellulaire est un protiste.', '这种单细胞生物属于原生生物。'],
  'porte': ['Il a fermé la porte du bureau avant de partir.', '他离开前关上了办公室的门。'],
  'rouillé': ['Le vieux vélo rouillé dort dans le garage humide.', '那辆生锈的旧自行车躺在潮湿的车库里。'],
  'feinte': ['Sa feinte a complètement trompé le défenseur adverse.', '他的假动作彻底晃过了对方后卫。'],
  'échoir': ['Le loyer échoit le cinq de chaque mois.', '房租每月五号到期。'],
  'muscardin': ["Le muscardin dort tout l'hiver dans un nid d'herbe.", '榛睡鼠整个冬天都在草巢里睡觉。'],
  'conservateur': ['Ce conservateur naturel garde les aliments frais plus longtemps.', '这种天然防腐剂能让食物保鲜更久。'],
  'ordonné': ['Son bureau est toujours parfaitement ordonné.', '他的办公桌总是整理得井井有条。'],
  'parfumé': ['Le gâteau parfumé à la cannelle sent très bon.', '加了桂皮的蛋糕闻起来很香。'],
  'privé': ['Il travaille dans un cabinet privé du centre-ville.', '他在市中心一家私人诊所工作。'],
  'tempéré': ['Ce vin tempéré accompagne parfaitement le poisson.', '这款温和的葡萄酒配鱼非常合适。'],
  'interviewé': ["Le candidat interviewé a répondu avec beaucoup d'assurance.", '被面试的候选人回答得很有把握。'],
  'antigel': ["Il faut ajouter de l'antigel dans le radiateur avant l'hiver.", '入冬前要给水箱加防冻液。'],
  'océanien': ['Ce pays océanien attire de nombreux touristes chaque année.', '这个大洋洲国家每年吸引很多游客。'],
  'éloigné': ['Ce village éloigné manque de transports publics.', '这个偏远的村子缺少公共交通。'],
  'chance': ["Il a eu la chance de trouver un emploi rapidement.", '他运气好，很快就找到了工作。'],
  'blues': ['Ce chanteur américain est passionné de blues.', '这位美国歌手热爱布鲁斯音乐。'],
  'lilas': ['Le lilas répand son parfum au début du printemps.', '丁香在早春散发芳香。'],
  'sortie': ['La sortie de secours se trouve à droite du couloir.', '安全出口在走廊右侧。'],
  'époque': ['À cette époque, les gens voyageaient beaucoup moins.', '那个年代人们旅行少得多。'],
}

// —— 读 AI 判定 ——
const todoDir = path.join(ROOT, 'md/sem/todo')
const outDir = path.join(ROOT, 'md/sem/out')
const verdict = new Map() // fold(word) -> {v, issue, sug, reason, sc}
const fold = (s) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()

for (const f of fs.readdirSync(outDir).filter((x) => /^batch_\d+\.tsv$/.test(x))) {
  const todo = fs.readFileSync(path.join(todoDir, f), 'utf8').replace(/^\uFEFF/, '').split(/\r?\n/).filter((l) => l.trim()).slice(1)
  const out = fs.readFileSync(path.join(outDir, f), 'utf8').replace(/^\uFEFF/, '').split(/\r?\n/).filter((l) => l.trim())
  todo.forEach((line, i) => {
    const t = line.split('\t')
    const o = (out[i] || '').split('\t')
    if (!o[0]) return
    verdict.set(fold(t[1]), { word: t[1], pos: t[2], cn: t[3], v: o[1], issue: o[2], sug: o[3], reason: o[4], sc: o[5] })
  })
}

// —— 解析建议释义 ——
// 返回 { word, pos, cn } 或 null（无法解析为完整结构）
function parseSuggest(sug, origWord, origPos) {
  const s = (sug || '').trim()
  if (!s) return null
  // 形如「abréger v. 缩短；删节」/「canadien n. 加拿大人」/「beau adj. 美丽的」
  const m = s.match(/^([A-Za-zÀ-ÿœŒæÆ'’-]+)\s+(n\.m\.pl\.|n\.f\.pl\.|n\.m\.|n\.f\.|n\.|adj\.|adv\.|v\.|prép\.|conj\.|num\.|interj\.)\s+(.+)$/)
  if (m) {
    const p = m[2] === 'n.' ? 'n.m.' : m[2]
    return { word: m[1], pos: p, cn: m[3].trim() }
  }
  // 形如「n. 艺术家」（无词形，仅词性）
  const m2 = s.match(/^(n\.m\.pl\.|n\.f\.pl\.|n\.m\.|n\.f\.|n\.|adj\.|adv\.|v\.|prép\.|conj\.|num\.|interj\.)\s+(.+)$/)
  if (m2) {
    const p = m2[1] === 'n.' ? 'n.m.' : m2[1]
    return { word: origWord, pos: p, cn: m2[2].trim() }
  }
  // 纯释义
  return { word: origWord, pos: origPos, cn: s }
}

// —— Lexique 词形库（用于判断原词形是否为变位/屈折，以及回填音标）——
const lexPath = path.join(ROOT, '..', 'md', 'ref', 'lex_cache.json')
let lexOld = null
if (fs.existsSync(lexPath)) {
  try { lexOld = JSON.parse(fs.readFileSync(lexPath, 'utf8')) } catch { lexOld = null }
}
const lexGet = (w) => {
  if (!lexOld) return ''
  const hit = lexOld[w] || lexOld[w.toLowerCase()]
  if (!hit) return ''
  return typeof hit === 'string' ? hit : hit.ipa || ''
}

// —— 读统一词表 ——
const lines = fs.readFileSync(SRC, 'utf8').replace(/^\uFEFF/, '').split(/\r?\n/).filter((l) => l.trim())
const head = lines[0].split('\t')
const idx = Object.fromEntries(head.map((h, i) => [h, i]))
const rows = lines.slice(1).map((l) => {
  const c = l.split('\t')
  return {
    key: c[idx.key], word: c[idx.word], ipa: c[idx.ipa], pos: c[idx.pos], cn: c[idx.cn],
    sentence: c[idx.sentence], sentence_cn: c[idx.sentence_cn], source: c[idx.source], dupSources: c[idx.dupSources],
  }
})

const report = []
const buckets = Object.fromEntries(SCENES.map((s) => [s, []]))
const remains = [] // 已存在词表：改词形后可能与已有词撞车
const stats = { total: rows.length, fixed: 0, changedWord: 0, changedPos: 0, changedCn: 0, byIssue: {}, sceneTotal: {}, dropped: [] }

for (const r of rows) {
  const v = verdict.get(r.key)
  let { word, ipa, pos, cn, sentence, sentence_cn } = r

  if (v) {
    stats.byIssue[v.issue || 'OK'] = (stats.byIssue[v.issue || 'OK'] || 0) + 1
  }

  // 1) 人工表优先
  const man = MANUAL[r.word]
  let sug = v ? parseSuggest(v.sug, r.word, r.pos) : null
  if (man) sug = { word: man.word || r.word, pos: man.pos, cn: man.cn }

  // 2) 应用修正（仅当判 PARTIAL / WRONG）
  if (sug && v && v.v !== 'OK') {
    const oldWord = word, oldPos = pos, oldCn = cn
    if (sug.word && sug.word !== word) { word = sug.word; stats.changedWord++ }
    if (sug.pos && sug.pos !== pos) { pos = sug.pos; stats.changedPos++ }
    if (sug.cn) sug.cn = cleanCn(sug.cn)
    if (sug.cn && sug.cn !== cn) { cn = sug.cn; stats.changedCn++ }
    if (word !== oldWord || pos !== oldPos || cn !== oldCn) {
      stats.fixed++
      report.push({ word: oldWord, newWord: word, oldPos, newPos: pos, oldCn, newCn: cn, verdict: v.v, issue: v.issue, reason: v.reason, source: r.source })
    }
  }

  // 3) 音标：词形变了则重新查 Lexique 缓存
  if (word !== r.word && word !== r.word) {
    // 占位，下面统一处理
  }

  // 4) 场景
  const sc = (v ? v.sc : 'vie').split(',').filter((s) => SCENES.includes(s))
  const scenes = sc.length ? sc : ['vie']
  const fixed = !!(sug && v && v.v !== 'OK' && (word !== r.word || pos !== r.pos || cn !== r.cn))

  // 5) 例句同步
  let sFr = sentence
  let sCn = sentence_cn
  if (fixed && SENT_FIX[word]) {
    ;[sFr, sCn] = SENT_FIX[word]
    stats.sentRewritten = (stats.sentRewritten || 0) + 1
  } else if (fixed && word !== r.word) {
    // 纯拼写修正（折叠后相同且原词形是规范拼写/查不到）→ 例句整词替换
    const foldSpell = (s) => s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/œ/g, 'oe')
    const oldEntry = lexOld[r.word]
    const isInflection = oldEntry && oldEntry.cgram === 'VER' && oldEntry.lem === false
    if (foldSpell(word) === foldSpell(r.word) && !isInflection && sFr) {
      const re = new RegExp(`(^|[^\\p{L}])${r.word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}([^\\p{L}]|$)`, 'giu')
      if (re.test(sFr)) {
        sFr = sFr.replace(re, (m, a, b) => a + word + b)
        stats.sentSpellFixed = (stats.sentSpellFixed || 0) + 1
      }
    }
  }

  const rec = { word, ipa, pos, cn, sentence: sFr, sentence_cn: sCn, src: r.source, fixed }
  for (const s of scenes) buckets[s].push(rec)
}

// —— 音标回填：词形变了的重新查 Lexique ——
let ipaFilled = 0
const ipaMap = new Map()
for (const item of report) {
  if (item.newWord === item.word) continue
  const ipa = lexGet(item.newWord)
  if (ipa) ipaMap.set(item.newWord, ipa)
}
for (const s of SCENES) {
  for (const rec of buckets[s]) {
    const ipa = ipaMap.get(rec.word)
    if (ipa && rec.ipa !== ipa) { rec.ipa = ipa; ipaFilled++ }
  }
}

// —— 同库去重（多归属 + 改词形撞车）：优先保留已修正的条目 ——
for (const s of SCENES) {
  const best = new Map() // fold(word) -> rec
  for (const r of buckets[s]) {
    const k = fold(r.word)
    const cur = best.get(k)
    if (!cur) { best.set(k, r); continue }
    // 已修正的优先；同状态时保留释义更长（更完整）的
    if (r.fixed && !cur.fixed) best.set(k, r)
    else if (r.fixed === cur.fixed && (r.cn || '').length > (cur.cn || '').length) best.set(k, r)
  }
  const before = buckets[s].length
  buckets[s] = [...best.values()]
  if (before !== buckets[s].length) stats.dropped.push(`${s}: 去重 ${before - buckets[s].length}`)
}

// —— 排序并输出 ——
fs.mkdirSync(OUT_DIR, { recursive: true })
const HEADER = ['word', 'ipa', 'pos', 'cn', 'sentence', 'sentence_cn', 'phrase', 'phrase_cn'].join('\t')
for (const s of SCENES) {
  const list = buckets[s].sort((a, b) => a.word.localeCompare(b.word, 'fr'))
  stats.sceneTotal[s] = list.length
  const body = list.map((r) => [r.word, r.ipa, r.pos, cleanCn(r.cn), r.sentence, r.sentence_cn, '', ''].join('\t'))
  if (!DRY) {
    fs.writeFileSync(path.join(OUT_DIR, `words-fr-${s}.tsv`), [HEADER, ...body].join('\n') + '\n', 'utf8')
  }
}

// —— 报告 ——
const esc = (x) => '"' + String(x ?? '').replace(/"/g, '""') + '"'
const csv = ['原词,新词,原词性,新词性,原释义,新释义,判定,问题类型,理由,来源']
  .concat(report.map((r) => [r.word, r.newWord, r.oldPos, r.newPos, r.oldCn, r.newCn, r.verdict, r.issue, r.reason, r.source].map(esc).join(',')))
  .join('\n')
if (!DRY) fs.writeFileSync(path.join(ROOT, 'md/sem/fix-report.csv'), '\ufeff' + csv, 'utf8')

fs.writeFileSync(path.join(ROOT, 'md/sem/apply-stats.json'), JSON.stringify({ ...stats, ipaFilled }, null, 1), 'utf8')

console.log(DRY ? '【预演，未写文件】' : '已完成')
console.log('总词条', stats.total, '| 实际修正', stats.fixed, '（改词形', stats.changedWord, '/ 改词性', stats.changedPos, '/ 改释义', stats.changedCn, '）')
console.log('问题类型分布:', JSON.stringify(stats.byIssue))
console.log('补音标', ipaFilled, '条')
console.log('各库词数：')
let sum = 0
for (const s of SCENES) { sum += stats.sceneTotal[s]; console.log('  ' + s.padEnd(10), stats.sceneTotal[s]) }
console.log('条目合计', sum, '（多归属导致大于唯一词数）')
if (stats.dropped.length) console.log('去重:', stats.dropped.join('; '))
