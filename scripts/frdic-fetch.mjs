/**
 * 法语助手（frdic.com）词条抓取 + 解析
 * 用法：node scripts/frdic-fetch.mjs [--limit N] [--out file]
 * 仅用于校验本项目词库释义，限速串行请求。
 */
import { readFileSync, writeFileSync, readdirSync, existsSync, mkdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const CACHE = join(ROOT, 'md', 'frdic')
mkdirSync(CACHE, { recursive: true })

const args = process.argv.slice(2)
const argOf = (k, d) => {
  const i = args.indexOf(k)
  return i >= 0 ? args[i + 1] : d
}
const LIMIT = Number(argOf('--limit', '0')) || 0
const OUT = argOf('--out', 'md/frdic/report.json')
const SLEEP = Number(argOf('--sleep', '1000'))
const CONC = Number(argOf('--conc', '3'))

const stripTags = (s) =>
  s.replace(/<img[^>]*class="dictimgtoword"[^>]*>/g, '\u25A1')
    .replace(/<br\s*\/?>/g, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/[ \t]+/g, ' ')
    .trim()

/** 解析一个词条页 */
function parse(html) {
  const res = { ok: false, ipa: '', pos: [], defs: [], imgChars: 0, raw: '' }
  const head = html.match(/<h1 class="explain-Word">([\s\S]*?)<\/h1>/)
  if (!head) return res
  res.ok = true

  const ipa = html.match(/<SPAN class=Phonitic>([\s\S]*?)<\/SPAN>/i)
  if (ipa) res.ipa = stripTags(ipa[1]).replace(/[[\]]/g, '')

  const block = html.match(/<div id="ExpFCchild" class="expDiv">([\s\S]*?)<div class="expHead"/)
    || html.match(/<div id="ExpFCchild" class="expDiv">([\s\S]{0,8000})/)
  if (block) {
    const b = block[1]
    res.imgChars = (b.match(/dictimgtoword/g) || []).length
    res.raw = stripTags(b).slice(0, 600)
    // 词性标签
    res.pos = [...b.matchAll(/<span class="cara">([\s\S]*?)<\/span>/g)].map((m) => stripTags(m[1]))
    // 释义行：<span class="exp">…</span>（不含例句 内层 trans）
    res.defs = [...b.matchAll(/<span class="exp">([\s\S]*?)<\/span>/g)]
      .map((m) => stripTags(m[1]))
      .filter(Boolean)
  }
  return res
}

const cachePath = (w) => join(CACHE, encodeURIComponent(w) + '.json')

async function fetchOne(word) {
  const cp = cachePath(word)
  if (existsSync(cp)) return JSON.parse(readFileSync(cp, 'utf8'))
  const url = `https://www.frdic.com/dicts/fr/${encodeURIComponent(word)}`
  const r = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0 Safari/537.36',
      'Accept-Language': 'zh-CN,zh;q=0.9',
    },
  })
  const html = await r.text()
  const data = { word, status: r.status, ...parse(html) }
  if (r.status === 200) writeFileSync(cp, JSON.stringify(data), 'utf8')
  return data
}

// 收集词库全部词
const files = readdirSync(join(ROOT, 'data', 'fr')).filter((f) => f.endsWith('.tsv'))
const wanted = []
for (const f of files) {
  const lines = readFileSync(join(ROOT, 'data', 'fr', f), 'utf8').replace(/^\uFEFF/, '').split(/\r?\n/).filter(Boolean)
  for (const line of lines.slice(1)) {
    const c = line.split('\t')
    if (c[0]) wanted.push({ word: c[0].trim(), cn: (c[3] || '').trim(), pos: (c[2] || '').trim(), file: f })
  }
}
const uniq = new Map()
for (const w of wanted) if (!uniq.has(w.word)) uniq.set(w.word, w)
const list = [...uniq.values()].slice(0, LIMIT || undefined)
console.log(`待抓取 ${list.length} 词（去重后共 ${uniq.size}）`)

const out = []
let done = 0, miss = 0
const flush = () => writeFileSync(join(ROOT, OUT), JSON.stringify(out, null, 1), 'utf8')

async function worker(queue) {
  while (queue.length) {
    const item = queue.shift()
    if (!item) break
    let d
    try {
      d = await fetchOne(item.word)
    } catch (e) {
      d = { word: item.word, status: -1, ok: false, error: String(e.message) }
    }
    if (!d.ok) miss++
    out.push({ ...item, frdic: d })
    done++
    if (done % 100 === 0) {
      console.log(`  ${done}/${list.length}  未命中 ${miss}`)
      flush()
    }
    await new Promise((r) => setTimeout(r, SLEEP))
  }
}

const queue = [...list]
await Promise.all(Array.from({ length: CONC }, () => worker(queue)))
flush()
console.log(`完成 ${done}，未命中 ${miss}，报告 ${OUT}`)
