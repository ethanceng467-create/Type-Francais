# Type Français · 打字背法语单词

基于开源项目 [TypeWords](https://github.com/zyronon/TypeWords)（GPL-3.0）改造的法语单词练习站：
保留原项目「跟写 / 默写 / 听写 / 自测 + 记忆曲线复习」全套机制，把学习语言换成法语，
并补上法语特有的重音符号、连字符与发音处理。

![首页](shots/10-home.png)

**在线体验**：<https://type-francais.app.workbuddy.host/?sharecode=SP6HHUII4C>

---

## 1. 和上游的关系

- 上游 `zyronon/TypeWords` 为 **GPL-3.0**。本项目是其衍生作品，**同样以 GPL-3.0 发布**：
  分发编译产物（部署上线、发安装包）时必须同时提供完整源码。
- 上游的 14 种界面语言、数据本地离线存储、键盘音效、Supabase 可选同步等能力均保留，
  法语版只替换「学习语言」这一层。上游原始 README 见 `README.upstream.md`。

## 2. 这次改了什么

### 2.1 词库（数据层）

| 变化 | 说明 |
| --- | --- |
| 新增 `data/fr/*.tsv` | 可直接用 Excel / WPS 编辑的词表源文件（Tab 分隔） |
| 新增 `scripts/build-fr-dict.mjs` | TSV → 词库 JSON + 词库索引，一条命令完成 |
| 新增 `public/dicts/fr/word/*.json` | 7 本词库、共 **1863 词**（见下表） |
| 改写 `public/list/word.json` | 只保留法语词库；`article.json` 置空，避免混入英文课文 |
| 删除 `public/dicts/en/` | 移除 CET-4 等英文词库（4.3 MB） |

词库按 DELF/DALF 六级切分，另加一本职场词：

| 词库 | 词数 | 来源文件 |
| --- | --- | --- |
| 法语 A1 · 入门 | 300 | `words-a1.tsv` + `words-a1-new.tsv` |
| 法语 A2 · 初级 | 300 | `words-a2-new.tsv` |
| 法语 B1 · 中级 | 350 | `words-b1-new.tsv` |
| 法语 B2 · 中高级 | 348 | `words-b2-new.tsv` |
| 法语 C1 · 高级 | 298 | `words-c1-new.tsv` |
| 法语 C2 · 精通 | 244 | `words-c2-new.tsv` |
| 法语 · 跨境电商 | 23 | `words-ecommerce.tsv` |

选词不是随手挑的：以 **Lexique 3.83**（法语词频数据库，47000 个词元）为底，
只保留实词（名词 / 动词 / 形容词 / 副词），剔除功能词、俚语与脏话、
以及「实词义只是功能词顺带释义」的同形词（如 *pour* 的"赞成票"义），
再按书面 + 口语频率加权排序切档。音标由 Lexique 的 SAMPA 编码统一转成标准 IPA
（`@` → `ɑ̃`、`°` → `ə`、`§` → `ɔ̃`、`5` → `ɛ̃`、`9` → `œ`、`8` → `ɥ`…），
中文释义逐条校对。

### 2.2 发音（语音层）

- `app/core/config/env.ts`：`PronunciationApi` 改到有道词典法语通道
  `https://dict.youdao.com/dictvoice?le=fr&audio=`（`le=fr` 是关键参数，不加会读成英语腔）。
- `app/core/hooks/sound.ts`：单词走上面的音源；例句仍用浏览器 TTS，
  默认语言 `en-US → fr-FR`，音色回退优先挑法语 voix（Amélie / Denise / Thomas…）。
- `app/components/setting/SoundSetting.vue`：TTS 音色列表只列 `fr*`，试听文本换成法语句子。

### 2.3 打字判定（最关键的适配）

法语的难点不是「多几个字母」，而是变音符号和输入方式：

1. **键盘放行规则**（`app/core/hooks/event.ts`）
   原实现用 `keyCode` 白名单（65–90 / 48–57…）判断「这是不是字符」，只覆盖 ASCII，
   `é ç ù î œ` 根本进不了打字流程。改为「任何可打印单字符即放行」。
2. **NFC 归一化 + 逐码位比较**（`app/core/composables/practice-words/visible-word-typing.ts`）
   `é` 可能来自 `U+00E9`（预组合），也可能是 `e + U+0301`（死键 / 组合重音），
   按 code unit 比较会误判。统一 `normalize('NFC')` 后用 `Array.from` 逐码位比对，
   顺带把 `l’école` 的弯引号统一成直引号。
3. **输入免打重音（默认开启）**——本项目的核心设定
   界面**照常显示正确拼写**（`école`、`sœur`、`garçon`），
   但键盘上只需要打基础字母：`ecole`、`soeur`、`garcon`。

   实现方式是把「显示串」和「比对串」拆开（`visible-word-typing.ts`）：

   - `foldCharacter()`：单字符折叠。`é è ê ë → e`、`ç → c`、`ù û ü → u`（走 NFD 去组合符号）；
     **`œ → oe`、`æ → ae`** 这类连字没有组合符号可拆，单独映射，所以 `sœur` 打 `soeur`。
   - `foldTypingWord()`：把单词拆成「显示字符 → 折叠下标区间」的段落表。
     `cœur` 的 `œ` 占折叠串的两位（`o`、`e`），`foldStart/foldEnd` 记录这层映射。
   - 打字状态机（`usePracticeWordTyping.ts`）全程用折叠串长度推进；
     渲染层（`WordTypingCore.vue`）再按区间映射回原字符，
     所以打 `o` 时 `œ` 显示为半透明绿（进行中），打完 `oe` 才整字变绿。

   设置 → 通用 → 「输入免打重音」可以关掉，关掉后 `ecole` 打 `école` 会判错。
4. **输入法上屏**（`compositionend`）
   中文 IME 或 macOS `Option+E` 死键上屏的字符会逐字送进打字流程；
   同时屏蔽 `key === 'Process'` 的假字符，避免把 "Process" 当成字母打进去。

### 2.4 界面与品牌

- `APP_NAME` → `Type Français`；站点标题、SEO 描述、首页文案、右栏演示卡片（改为 bonjour / ensemble / toujours / apprendre）全部法语化。
- 侧边栏 logo 改文字渐变渲染（`app/components/Logo.vue`），不再依赖写死 "Type Words" 的 PNG。
- 首页去掉微信小程序码与 `typewords.cc` 外链，避免指向不属于你的服务。

## 3. 跑起来

```bash
pnpm install      # Node 20+，仓库用 pnpm
pnpm dev          # 默认 http://localhost:3000
pnpm build        # 生产构建
pnpm generate     # 纯静态站点，产物在 .output/public
```

首次进「单词」页会弹 4 步新手引导，关掉 → 点词库卡片 → 学习 → 确认，即进入练习。

## 4. 怎么加词 / 扩词库

### 4.1 加几个词

编辑 `data/fr/` 下任意 TSV（Excel 打开即可）。表头决定列，最少需要前 4 列：

| 列 | 含义 | 示例 |
| --- | --- | --- |
| word | 法语词条，**不要含空格** | `aujourd'hui` |
| ipa | 国际音标，不带斜杠 | `oʒuʁdɥi` |
| pos | 词性 | `n.m.` / `v.` / `adj.` / `adv.` |
| cn | 中文释义 | 今天 |
| sentence | 法语例句 | Aujourd'hui, il fait beau. |
| sentence_cn | 例句翻译 | 今天天气很好。 |
| phrase | 常用搭配 | d'aujourd'hui |
| phrase_cn | 搭配翻译 | 今天的 |

新增的六级词表目前只填了前 4 列（无例句）。想补例句直接在后 4 列填内容，
脚本按表头读取，缺列会自动留空，不用改代码。

然后执行：

```bash
node scripts/build-fr-dict.mjs
```

会重新生成 `public/dicts/fr/word/*.json` 与 `public/list/word.json`，刷新页面即可生效。

> 为什么不能收录多词词条：这个项目的空格键是「确认进入下一词」，
> 含空格的词条（`au revoir`、`parce que`）会和空格键冲突。这类内容应放「文章」模块，
> 或拆成单词收录。脚本运行时会给出提示。

### 4.2 新增一本词库

在 `scripts/build-fr-dict.mjs` 顶部 `DICTS` 数组加一项指向新 TSV 即可：

```js
{
  files: ['words-b1-extra.tsv'],   // 可放多个文件，按顺序合并成一本词库
  slug: 'FR_B1X',
  enName: 'fr-b1-extra',
  name: '法语 B1 · 补充',
  description: '……',
  category: 'DELF 分级',
  tags: ['B1'],
  recommended: true,
}
```

`files` 是数组，所以同一级别可以拆成多个 TSV 维护（A1 就是 `words-a1.tsv` + `words-a1-new.tsv` 合并的）。

### 4.3 词库是怎么来的（可复现）

当前 1863 词的生成路径：

1. **底表**：[Lexique 3.83](http://www.lexique.org/)（`Lexique383.zip`，学术开源）。
   取 `islem=1` 的词元，保留 `cgram ∈ {NOM, VER, ADJ, ADV}`。
2. **过滤**：
   - 剔除功能词（`ne / pas / pour / comme …`）、俚语与脏话、缩写（`mme / mlle`）；
   - 剔除「实词义占比 < 20%」的同形词——`pour` 作为名词只有"赞成票"义，
     不该混进 A1 当名词背。
3. **分级**：`score = 2 × 书面频率 + 口语频率` 排序切档；
   C1/C2 从总排名 1300 之后取，并按书面频率加权，避开日常高频词。
4. **音标**：Lexique 的 `phon` 是 SAMPA 编码，映射成 IPA：
   `R→ʁ E→ɛ O→ɔ @→ɑ̃ °→ə 5→ɛ̃ §→ɔ̃ 1→œ̃ 2→ø 9→œ 8→ɥ S→ʃ Z→ʒ N→ɲ G→ŋ`。
   注意 `@` 是鼻化 `ɑ̃`、`°` 才是 `ə`，这两个最容易搞反。
5. **拼写还原**：Lexique 把 `cœur` 写成 `coeur`、`nœud` 写成 `noeud`，
   按规则表还原成连字（`moelle / moelleux / coefficient` 等真读 `wa` 的除外）。
6. **中文释义**：逐条人工校对，按「词性 + 简短释义」格式，一词一义为主。

想继续扩词（比如补到 3000+），照第 1–3 步重跑脚本生成候选，再补释义即可，
不用动前端代码。

## 5. 已知限制

- 词库 1863 词，按频率切档而非官方大纲。DELF 没有公开的官方词汇表，
  级别之间会有边界漂移（尤其 C1/C2 混入一些中频词），当作「难度递进」用比当「考试范围」用更合适。
- 六级词表暂未配例句（A1 与电商词有）。补例句可在 TSV 后 4 列填写。
- 「文章」模块目前为空（上游内置的是《新概念英语》）。法语文章需另做分词与标点处理。
- 单词发音依赖有道公开接口，稳定性不由我们控制。产品化建议**预生成 mp3**
  （edge-tts / Azure TTS 批量合成 2000 词 + 例句，放 `public/audio/fr/`），
  让 `usePlayWordAudio` 优先本地文件、失败再回退在线音源。
- 移动端沿用上游隐藏输入框方案；现在不需要打重音，软键盘体验反而更顺。
- 未做「词形变化识别」：练习目标是词条原形（动词不定式），不做变位形式匹配。

## 6. 后续可以做的

- [x] 词库扩容：DELF/DALF A1–C2 六级 + 跨境电商词（1863 词）
- [ ] 给 B1–C2 补例句与常用搭配（TSV 后 4 列，参考 A1 的填法）
- [ ] 词库继续扩容：专四 / 专八、主题词（商务 / 科技 / 文学）
- [ ] 动词变位专项（把变位形式作为独立练习单元）
- [ ] 预生成音频包，去掉第三方音源依赖
- [ ] 法语文章 / 听写模块（句级切分，处理省音词 `l'` `d'` 与标点）
- [ ] 部署（`pnpm generate` + 静态托管；GPL-3.0 需同时公开源码）

## 7. 截图

| 词库列表（7 本，1863 词） | 练习页（打 `garcon` 即通过，显示仍是 garçon） |
| --- | --- |
| ![词库](shots/30-dicts.png) | ![练习](shots/31-garcon.png) |

## 8. 许可

GPL-3.0，与上游一致。原始版权归 [zyronon](https://github.com/zyronon) 及 TypeWords 贡献者所有。
