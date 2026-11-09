/**
 * 修正 OCR 阶段遗留的畸形词条（拼写错误 / 词性错误），同步更新例句
 * 用法：node scripts/fix-entries.mjs [--dry]
 */
import { readFileSync, writeFileSync, readdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const DATA = join(ROOT, 'data', 'fr')
const DRY = process.argv.includes('--dry')

// 键 = 现有词条名；值为修正后的完整行内容。
// patchPos=true 表示只改词性/释义，保留原例句
const FIX = {
  // —— 拼写错误 ——
  'pèle-mêle': { word: 'pêle-mêle', ipa: 'pɛl mɛl', pos: 'adv.', cn: '杂乱地；乱七八糟地', fr: 'Il a tout laissé pêle-mêle sur son bureau avant de partir.', zh: '他走之前把东西乱七八糟地全留在办公桌上。' },
  'bas-cote': { word: 'bas-côté', ipa: 'bɑ kote', pos: 'n.m.', cn: '路边；人行道', fr: 'Les enfants marchent sur le bas-côté de la route.', zh: '孩子们走在路边上。' },
  'parte-savon': { word: 'porte-savon', ipa: 'pɔʁt savɔ̃', pos: 'n.m.', cn: '肥皂盒', fr: 'Le porte-savon est fixé au mur de la douche.', zh: '肥皂盒固定在淋浴间的墙上。' },
  'public-postage': { word: 'publipostage', ipa: 'pyblipɔstaʒ', pos: 'n.m.', cn: '直邮广告；群发邮件', fr: "Cette entreprise envoie un publipostage à ses anciens clients.", zh: '这家公司给老客户寄直邮广告。' },
  'anesthésie-logue': { word: 'anesthésiste', ipa: 'anɛstezist', pos: 'n.', cn: '麻醉师', fr: "L'anesthésiste est venu me voir avant l'opération.", zh: '手术前麻醉师来看过我。' },
  'nouveau-ne': { word: 'nouveau-né', ipa: 'nuvo ne', pos: 'n.m.', cn: '新生儿', fr: 'Le nouveau-né dort presque toute la journée.', zh: '新生儿几乎整天都在睡觉。' },
  'moisson-neuves-batteuses': { word: 'moissonneuse-batteuse', ipa: 'mwasønøz batøz', pos: 'n.f.', cn: '联合收割机', fr: 'La moissonneuse-batteuse traverse le champ de blé.', zh: '联合收割机穿过麦田。' },
  'post-docteur': { word: 'post-doctorat', ipa: 'pɔst dɔktɔʁa', pos: 'n.m.', cn: '博士后阶段', fr: 'Elle a fait un post-doctorat aux États-Unis après sa thèse.', zh: '她博士毕业后去美国做了博士后。' },
  'hache-viande': { word: 'hachoir', ipa: 'aʃwaʁ', pos: 'n.m.', cn: '绞肉机；斩拌机', fr: 'Passe la viande au hachoir pour faire des boulettes.', zh: '把肉放进绞肉机，好做肉丸。' },
  'pré-sale': { word: 'pré-salé', ipa: 'pʁe sale', pos: 'n.m.', cn: '海边牧草饲养的羊羔肉', fr: 'Le pré-salé de la baie est très réputé en Normandie.', zh: '海湾的羊羔肉在诺曼底很有名。' },
  "dos-diane": { word: "dos-d'âne", ipa: 'do dan', pos: 'n.m.', cn: '驼峰式路面；山脊形', fr: "La route passe par un dos-d'âne juste avant le village.", zh: '路在进村前要经过一段驼峰路面。' },
  'sous-développe': { word: 'sous-développé', ipa: 'su devlɔpe', pos: 'adj.', cn: '欠发达的', fr: 'Ce pays a longtemps été considéré comme sous-développé.', zh: '这个国家长期被视为欠发达国家。' },
  'queue-de-morue': { word: 'queue-de-pie', ipa: 'kø də pi', pos: 'n.f.', cn: '燕尾服', fr: 'Il porte une queue-de-pie pour la cérémonie.', zh: '他穿着燕尾服参加典礼。' },
  'maîtresse-poutre': { word: 'poutre', ipa: 'putʁ', pos: 'n.f.', cn: '梁；大梁', fr: "Une poutre en chêne soutient le plafond de la grange.", zh: '一根橡木大梁撑着谷仓的屋顶。' },
  'porte-bagage': { word: 'porte-bagages', ipa: 'pɔʁt baɡaʒ', pos: 'n.m.', cn: '行李架', fr: 'Mets ta valise dans le porte-bagages au-dessus de ton siège.', zh: '把箱子放到座位上方的行李架里。' },
  'états-unis': { word: 'États-Unis', ipa: 'etazyni', pos: 'n.m.pl.', cn: '美国', fr: 'Les États-Unis sont un pays très vaste.', zh: '美国是一个非常大的国家。' },

  // —— 词性 / 释义错误，拼写本身正确 ——
  'après-midi': { pos: 'n.m.', cn: '下午', keepSentence: true },
  'porte-parole': { pos: 'n.m.', cn: '发言人', fr: 'Le porte-parole du gouvernement a confirmé la nouvelle.', zh: '政府发言人证实了这一消息。' },
  'lève-vitre': { pos: 'n.m.', cn: '车窗摇把', keepSentence: true },
  'laisser-passer': { pos: 'n.m.', cn: '通行证', fr: "Présentez votre laisser-passer à l'entrée du bâtiment.", zh: '在大楼入口出示您的通行证。' },
  'capital-actions': { pos: 'n.m.', cn: '股本', fr: "La société a augmenté son capital-actions l'an dernier.", zh: '公司去年增加了股本。' },
  'biens-fonds': { pos: 'n.m.pl.', cn: '房地产；不动产', fr: 'Il a investi toute sa fortune dans des biens-fonds.', zh: '他把全部财产都投进了房地产。' },
  'fourgon-pompe': { pos: 'n.m.', cn: '消防车', keepSentence: true },
  'belle-de-jour': { pos: 'n.f.', cn: '牵牛花', fr: 'La belle-de-jour ouvre ses fleurs le matin.', zh: '牵牛花在早晨开花。' },
  'courge-éponge': { pos: 'n.f.', cn: '丝瓜；丝瓜络', keepSentence: true },
}

// —— 直接删除：词条本身错误且无对应合法词 ——
const DROP = new Set([
  'électoral-liste', 'forma-radio', 'électron-philo', 'investissement-risque',
  'parc-auto', 'carte-document', 'photo-pathogène', 'jaune-brun', 'sous-arbitre',
  'repas-aérien', 'riz-frits', 'pop-con',
])

const seen = new Set()
let fixed = 0, dropped = 0
const removedList = []

for (const f of readdirSync(DATA).filter((x) => x.endsWith('.tsv')).sort()) {
  const raw = readFileSync(join(DATA, f), 'utf8').replace(/^\uFEFF/, '')
  const lines = raw.split(/\r?\n/).filter((l) => l.trim())
  const head = lines[0].split('\t').map((h) => h.trim())
  const idx = (k) => head.indexOf(k)
  const out = [head.join('\t')]

  for (const line of lines.slice(1)) {
    const c = line.split('\t')
    const word = (c[idx('word')] || '').trim()
    const get = (k) => (idx(k) >= 0 ? (c[idx(k)] || '').trim() : '')

    if (DROP.has(word)) {
      dropped++
      removedList.push(`${f} :: ${word} (${get('cn')})`)
      continue
    }
    const fx = FIX[word]
    if (!fx) { out.push(line); continue }
    if (seen.has(word)) { out.push(line); continue }
    seen.add(word)

    const nw = fx.word || word
    const nipa = fx.ipa || get('ipa')
    const npos = fx.pos || get('pos')
    const ncn = fx.cn || get('cn')
    const nfr = fx.keepSentence ? get('sentence') : (fx.fr || get('sentence'))
    const nzh = fx.keepSentence ? get('sentence_cn') : (fx.zh || get('sentence_cn'))
    out.push([nw, nipa, npos, ncn, nfr, nzh, get('phrase'), get('phrase_cn')].join('\t'))
    fixed++
  }
  if (!DRY) writeFileSync(join(DATA, f), out.join('\n') + '\n', 'utf8')
  console.log(f.padEnd(26), 'rows=' + (out.length - 1))
}

console.log(`\n${DRY ? '[dry] ' : ''}修正 ${fixed} 条，删除 ${dropped} 条`)
console.log('已删除：')
for (const r of removedList) console.log('  - ' + r)
