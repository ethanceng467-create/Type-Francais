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
    files: ['words-a1.tsv', 'words-a1-new.tsv'],
    slug: 'FR_A1',
    enName: 'fr-a1',
    name: '法语 A1 · 入门',
    description: 'DELF A1 高频核心词：问候、家庭、时间、日常动作，含音标与例句',
    category: 'DELF 分级',
    tags: ['A1', '入门'],
    recommended: true,
  },
  {
    files: ['words-a2-new.tsv'],
    slug: 'FR_A2',
    enName: 'fr-a2',
    name: '法语 A2 · 初级',
    description: 'DELF A2 常用词：生活场景、身体、情绪、基础抽象名词',
    category: 'DELF 分级',
    tags: ['A2', '初级'],
    recommended: true,
  },
  {
    files: ['words-b1-new.tsv'],
    slug: 'FR_B1',
    enName: 'fr-b1',
    name: '法语 B1 · 中级',
    description: 'DELF B1 进阶词：社会、工作、表达观点的动词与名词',
    category: 'DELF 分级',
    tags: ['B1', '中级'],
    recommended: true,
  },
  {
    files: ['words-b2-new.tsv'],
    slug: 'FR_B2',
    enName: 'fr-b2',
    name: '法语 B2 · 中高级',
    description: 'DELF B2 词汇：抽象概念、论证、情绪与评价类词汇',
    category: 'DELF 分级',
    tags: ['B2', '中高级'],
    recommended: true,
  },
  {
    files: ['words-c1-new.tsv'],
    slug: 'FR_C1',
    enName: 'fr-c1',
    name: '法语 C1 · 高级',
    description: 'DALF C1 词汇：文学描写、书面表达、精细语义区分',
    category: 'DELF 分级',
    tags: ['C1', '高级'],
    recommended: true,
  },
  {
    files: ['words-c2-new.tsv'],
    slug: 'FR_C2',
    enName: 'fr-c2',
    name: '法语 C2 · 精通',
    description: 'DALF C2 词汇：低频书面词、修辞与专业表达',
    category: 'DELF 分级',
    tags: ['C2', '精通'],
    recommended: true,
  },
  {
    files: ['words-ecommerce.tsv'],
    slug: 'FR_EC',
    enName: 'fr-ecommerce',
    name: '法语 · 跨境电商',
    description: '亚马逊 / Cdiscount 卖家日常高频词：订单、物流、售后、结算',
    category: '职场法语',
    tags: ['电商', '职场'],
    recommended: true,
  },
  // ── 词汇书《最好用最好记 15000 法语单词随身背》主题词库（按原书章节） ──
  {
    files: ['words-fr-vie.tsv'],
    slug: 'FR_LIFE',
    enName: 'fr-theme-life',
    name: '法语 · 基本生活',
    description: '时间、衣着、饮食、居住、出行——日常生活最常用的一批主题词',
    category: '主题词库',
    tags: ['主题', '生活'],
    recommended: true,
  },
  {
    files: ['words-fr-maison.tsv'],
    slug: 'FR_HOME',
    enName: 'fr-theme-home',
    name: '法语 · 生活设施',
    description: '家居、电器、公共设施与城市空间',
    category: '主题词库',
    tags: ['主题', '家居'],
    recommended: false,
  },
  {
    files: ['words-fr-personne.tsv'],
    slug: 'FR_PEOPLE',
    enName: 'fr-theme-people',
    name: '法语 · 人物与行为',
    description: '人物称谓、身体、性格、动作与社交',
    category: '主题词库',
    tags: ['主题', '人物'],
    recommended: false,
  },
  {
    files: ['words-fr-campus.tsv'],
    slug: 'FR_CAMPUS',
    enName: 'fr-theme-campus',
    name: '法语 · 校园',
    description: '学校、课程、学习与考试',
    category: '主题词库',
    tags: ['主题', '校园'],
    recommended: false,
  },
  {
    files: ['words-fr-travail.tsv'],
    slug: 'FR_WORK',
    enName: 'fr-theme-work',
    name: '法语 · 职场',
    description: '求职、办公室、职场百态与销售',
    category: '主题词库',
    tags: ['主题', '职场'],
    recommended: false,
  },
  {
    files: ['words-fr-loisir.tsv'],
    slug: 'FR_LEISURE',
    enName: 'fr-theme-leisure',
    name: '法语 · 休闲娱乐',
    description: '超市、健身运动、修身养性与放松',
    category: '主题词库',
    tags: ['主题', '休闲'],
    recommended: false,
  },
  {
    files: ['words-fr-societe.tsv'],
    slug: 'FR_SOCIAL',
    enName: 'fr-theme-social',
    name: '法语 · 社会',
    description: '政治、经济、宗教、文化艺术、传媒、法律、军事、航空航天、房地产',
    category: '主题词库',
    tags: ['主题', '社会'],
    recommended: false,
  },
  {
    files: ['words-fr-science.tsv'],
    slug: 'FR_SCIENCE',
    enName: 'fr-theme-science',
    name: '法语 · 科技与环境',
    description: '科技、环境保护、自然灾害、人为事故',
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
