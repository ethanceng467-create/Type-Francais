/**
 * 法语词库构建脚本
 * ------------------------------------------------------------------
 * 输入：data/fr/*.tsv（可用 Excel / WPS 直接编辑，Tab 分隔）
 * 输出：
 *   public/dicts/fr/word/<SLUG>.json   词条数据（项目原有 Word 结构）
 *   public/list/word.json              词库索引（首页词库列表读取）
 *   public/list/recommend_word.json    推荐词库
 *
 * 用法：node scripts/build-fr-dict.mjs
 *
 * TSV 列（第 1 行为表头，顺序固定）：
 *   word        法语词条（单个 token，不要含空格，如 aujourd'hui、peut-être）
 *   ipa         国际音标（不带斜杠）
 *   pos         词性（n.m. / n.f. / v. / adj. / adv. / prép. / conj. / num.）
 *   cn          中文释义
 *   sentence    法语例句
 *   sentence_cn 例句中文翻译
 *   phrase      常用搭配
 *   phrase_cn   搭配中文
 */
import { readFileSync, writeFileSync, readdirSync, mkdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '..')
const DATA_DIR = join(ROOT, 'data', 'fr')
const OUT_WORD_DIR = join(ROOT, 'public', 'dicts', 'fr', 'word')
const OUT_LIST_DIR = join(ROOT, 'public', 'list')

/**
 * 词库元信息
 * files 支持多个 TSV 合并成一个词库（例如 A1 的存量核心词 + 新补词表）
 * 级别对照：A1 入门 / A2 初级 / B1 中级 / B2 中高级 / C1 高级 / C2 精通
 */
const DICTS = [
  {
    files: ['words-fr-vie.tsv'],
    slug: 'FR_LIFE',
    enName: 'fr-theme-life',
    name: '法语 · 日常生活',
    description: '时间、天气、饮食、购物、出行、日常动作——最高频的生活场景词汇',
    category: '主题词库',
    tags: ['主题', '生活'],
    recommended: true,
  },
  {
    files: ['words-fr-maison.tsv'],
    slug: 'FR_HOME',
    enName: 'fr-theme-home',
    name: '法语 · 家居居住',
    description: '房屋、家具、家电、家务与租住，居家场景全覆盖',
    category: '主题词库',
    tags: ['主题', '家居'],
    recommended: false,
  },
  {
    files: ['words-fr-personne.tsv'],
    slug: 'FR_PEOPLE',
    enName: 'fr-theme-people',
    name: '法语 · 人物描写',
    description: '人体、外貌、性格、情绪、亲属与人际关系',
    category: '主题词库',
    tags: ['主题', '人物'],
    recommended: true,
  },
  {
    files: ['words-fr-campus.tsv'],
    slug: 'FR_CAMPUS',
    enName: 'fr-theme-campus',
    name: '法语 · 校园生活',
    description: '学校、课程、考试、师生与校园设施',
    category: '主题词库',
    tags: ['主题', '校园'],
    recommended: false,
  },
  {
    files: ['words-fr-travail.tsv'],
    slug: 'FR_WORK',
    enName: 'fr-theme-work',
    name: '法语 · 职场工作',
    description: '求职、职级、会议、薪酬、合同与商业往来（含电商运营）',
    category: '主题词库',
    tags: ['主题', '职场'],
    recommended: true,
  },
  {
    files: ['words-fr-loisir.tsv'],
    slug: 'FR_LEISURE',
    enName: 'fr-theme-leisure',
    name: '法语 · 休闲娱乐',
    description: '旅行、运动、影音、游戏、聚会与兴趣爱好',
    category: '主题词库',
    tags: ['主题', '休闲'],
    recommended: false,
  },
  {
    files: ['words-fr-societe.tsv'],
    slug: 'FR_SOCIAL',
    enName: 'fr-theme-social',
    name: '法语 · 社会',
    description: '政治、法律、经济、军事、宗教、媒体与公共事务',
    category: '主题词库',
    tags: ['主题', '社会'],
    recommended: false,
  },
  {
    files: ['words-fr-science.tsv'],
    slug: 'FR_SCIENCE',
    enName: 'fr-theme-science',
    name: '法语 · 科技与环境',
    description: '科学技术、生物医学、气候能源与自然灾害',
    category: '主题词库',
    tags: ['主题', '科技'],
    recommended: false,
  },
]

function parseTsv(raw) {
  const lines = raw.replace(/^\uFEFF/, '').split(/\r?\n/).filter(l => l.trim())
  if (!lines.length) return []
  const header = lines[0].split('\t').map(s => s.trim())
  return lines.slice(1).map((line, i) => {
    const cells = line.split('\t')
    const row = {}
    header.forEach((key, idx) => (row[key] = (cells[idx] ?? '').trim()))
    row.__line = i + 2
    return row
  })
}

const warnings = []
const seen = new Set()

function toWord(row, id) {
  const { word, ipa, pos, cn, sentence, sentence_cn, phrase, phrase_cn } = row
  if (!word) throw new Error(`第 ${row.__line} 行缺少单词`)
  if (/\s/.test(word)) {
    warnings.push(`"${word}"（第 ${row.__line} 行）含空格，打字练习会与空格键冲突，建议拆成单词或改到文章模块`)
  }
  const key = word.toLowerCase()
  if (seen.has(key)) warnings.push(`重复词条：${word}`)
  seen.add(key)
  return {
    id,
    word,
    // 项目原本区分英音/美音两个字段，法语只有一套标准音，两个字段写同一音标
    phonetic0: ipa,
    phonetic1: ipa,
    trans: [{ pos, cn }],
    sentences: sentence ? [{ c: sentence, cn: sentence_cn }] : [],
    phrases: phrase ? [{ c: phrase, cn: phrase_cn }] : [],
    synos: [],
    etymology: [],
    relWords: { root: '', rels: [] },
    inflections: null,
    langType: 'fr',
  }
}

mkdirSync(OUT_WORD_DIR, { recursive: true })
mkdirSync(OUT_LIST_DIR, { recursive: true })

const index = []
let dictId = 0

for (const meta of DICTS) {
  // 去重只在单个词库内部进行：不同词库之间重复（如 A1 与主题词库）是预期的
  seen.clear()
  const rows = []
  for (const file of meta.files) {
    const path = join(DATA_DIR, file)
    let raw
    try {
      raw = readFileSync(path, 'utf-8')
    } catch {
      console.warn(`跳过（文件不存在）：${file}`)
      continue
    }
    rows.push(...parseTsv(raw))
  }
  if (!rows.length) {
    console.warn(`跳过（无词条）：${meta.slug}`)
    continue
  }
  const words = rows.map((row, i) => toWord(row, i + 1))
  writeFileSync(join(OUT_WORD_DIR, `${meta.slug}.json`), JSON.stringify(words, null, 2), 'utf-8')
  console.log(`✓ ${meta.slug}.json  ${words.length} 词  ← ${meta.files.join(' + ')}`)

  index.push({
    id: ++dictId,
    enName: meta.enName,
    name: meta.name,
    description: meta.description,
    categoryId: dictId,
    url: `${meta.slug}.json`,
    length: words.length,
    language: 'fr',
    translateLanguage: 'zh-CN',
    version: 1,
    type: 'word',
    isDefault: false,
    recommended: meta.recommended,
    userId: '00000000-0000-0000-0000-000000000001',
    createdAt: '2026-11-07 00:00:00.000000',
    updatedAt: '2026-11-07 00:00:00.000000',
    cover: null,
    hidden: false,
    category: meta.category,
    tags: meta.tags,
  })
}

writeFileSync(join(OUT_LIST_DIR, 'word.json'), JSON.stringify(index, null, 2), 'utf-8')
writeFileSync(
  join(OUT_LIST_DIR, 'recommend_word.json'),
  JSON.stringify(index.filter(d => d.recommended), null, 2),
  'utf-8'
)

// 法语版暂不内置文章，避免英文课文混入
writeFileSync(join(OUT_LIST_DIR, 'article.json'), '[]\n', 'utf-8')
writeFileSync(join(OUT_LIST_DIR, 'recommend_article.json'), '[]\n', 'utf-8')

console.log(`\n共 ${index.length} 个词库 / ${index.reduce((s, d) => s + d.length, 0)} 词`)
if (warnings.length) {
  console.log('\n提示：')
  warnings.forEach(w => console.log('  · ' + w))
}
