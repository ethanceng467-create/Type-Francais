export interface PracticeInputCharacterState {
  character: string
  isCorrect: boolean
}

export interface PracticeKeyboardInput {
  key: string
  code: string
  shiftKey: boolean
}

const SHIFT_FULL_WIDTH_CHARACTER_CODE_MAP: Record<string, string[]> = {
  '！': ['Digit1'],
  '￥': ['Digit4'],
  '…': ['Digit6'],
  '（': ['Digit9'],
  '—': ['Minus'],
  '？': ['Slash'],
  '》': ['Period'],
  '《': ['Comma'],
  '“': ['Quote'],
  '”': ['Quote'],
  '：': ['Semicolon'],
  '）': ['Digit0'],
}

const FULL_WIDTH_CHARACTER_CODE_MAP: Record<string, string[]> = {
  '、': ['Slash'],
  '。': ['Period'],
  '，': ['Comma'],
  '‘': ['Quote'],
  '’': ['Quote'],
  '；': ['Semicolon'],
  '【': ['BracketLeft'],
  '】': ['BracketRight'],
}

/**
 * 统一成 NFC 单码位形式，并把弯引号统一成直引号。
 * 法语里 é 既可能是 U+00E9（预组合），也可能是 e + U+0301（组合重音）：
 * 用死键（Option+E）、系统法语键盘、或从别处粘贴时两者会混用，逐字符比较会误判。
 * l’école → l'école 也在这里统一。
 */
export function normalizePracticeCharacter(char: string): string {
  if (!char) return char
  return char.normalize('NFC').replace(/[\u2018\u2019]/g, "'")
}

/** 去掉变音符号：é→e、ç→c、ù→u。注意 œ / æ 是独立字母，不处理 */
export function stripDiacritics(char: string): string {
  return char.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
}

/**
 * 连字（合体字母）没有组合重音可以拆，必须显式展开成基础字母。
 * 法语里 c&oelig;ur 打 coeur、s&oelig;ur 打 soeur、&aelig; 系列同理。
 */
const LIGATURE_FOLD_MAP: Record<string, string> = {
  'œ': 'oe',
  'Œ': 'OE',
  'æ': 'ae',
  'Æ': 'AE',
}

/** 单个显示字符折叠成"键盘上打得出的字符"，可能变长（œ → oe） */
export function foldCharacter(char: string): string {
  if (!char) return char
  const ligature = LIGATURE_FOLD_MAP[char]
  if (ligature) return ligature
  const folded = stripDiacritics(char.normalize('NFC'))
  // 纯组合符号折叠后为空时保底返回原字符，避免吞字
  return folded || char
}

export interface TypingSegment {
  /** 界面上显示的字符（保留正确拼写，如 é / œ） */
  display: string
  /** 该字符在折叠串里的起始下标（含） */
  foldStart: number
  /** 该字符在折叠串里的结束下标（不含） */
  foldEnd: number
}

export interface FoldedTypingWord {
  /** 实际用于逐字比对的串：école → ecole，cœur → coeur */
  folded: string
  /** 显示字符与折叠下标的对应关系，用于把输入进度映射回显示 */
  segments: TypingSegment[]
}

/**
 * 把单词拆成「显示字符 → 折叠下标」的映射。
 * 不忽略重音时每个字符只占 1 位；忽略重音时 œ 占 2 位（o、e）。
 */
export function foldTypingWord(word: string, ignoreAccent = true): FoldedTypingWord {
  const chars = Array.from(normalizePracticeCharacter(word))
  const segments: TypingSegment[] = []
  let folded = ''

  for (const char of chars) {
    const piece = ignoreAccent ? foldCharacter(char) : char
    const foldStart = folded.length
    folded += piece
    segments.push({ display: char, foldStart, foldEnd: folded.length })
  }

  return { folded, segments }
}

/** 取用于打字比对的串（忽略重音时返回折叠串） */
export function getPracticeTarget(word: string, ignoreAccent = true): string {
  if (!ignoreAccent) return normalizePracticeCharacter(word)
  return foldTypingWord(word, true).folded
}

/** 判断某个显示字符是否已经被输入完整（用折叠长度判定，兼容 œ 占两位） */
export function isSegmentTyped(segment: TypingSegment, typedLength: number): boolean {
  return typedLength >= segment.foldEnd
}

/** 判断某个显示字符是否正在输入（部分折叠字符已打） */
export function isSegmentTyping(segment: TypingSegment, typedLength: number): boolean {
  return typedLength > segment.foldStart && typedLength < segment.foldEnd
}

export function normalizePracticeInputCharacter(event: PracticeKeyboardInput, targetCharacter = ''): string {
  const characterCodeMap = event.shiftKey ? SHIFT_FULL_WIDTH_CHARACTER_CODE_MAP : FULL_WIDTH_CHARACTER_CODE_MAP
  if (characterCodeMap[targetCharacter]?.includes(event.code)) {
    return targetCharacter
  }
  return normalizePracticeCharacter(event.key)
}

/**
 * @param ignoreCase   忽略大小写
 * @param ignoreAccent 忽略变音符号（é 打成 e 也算对），给还没有法语键盘的学习者用
 */
export function isPracticeCharacterCorrect(
  input: string,
  target: string | undefined,
  ignoreCase: boolean,
  ignoreAccent = false
): boolean {
  if (target === undefined) return false

  const a = normalizePracticeCharacter(input)
  const b = normalizePracticeCharacter(target)

  if (!ignoreAccent) {
    if (!ignoreCase) return a === b
    // sensitivity: 'accent' = 忽略大小写，但区分重音
    return a.localeCompare(b, undefined, { sensitivity: 'accent', usage: 'search' }) === 0
  }

  const sa = stripDiacritics(ignoreCase ? a.toLowerCase() : a)
  const sb = stripDiacritics(ignoreCase ? b.toLowerCase() : b)
  return sa === sb
}

export function getPracticeInputCharacterStates(
  input: string,
  target: string,
  ignoreCase: boolean,
  ignoreAccent = false
): PracticeInputCharacterState[] {
  // 用 Array.from 按码位切分，避免把组合字符拆坏
  const targetChars = Array.from(normalizePracticeCharacter(target))
  return Array.from(normalizePracticeCharacter(input)).map((character, index) => ({
    character,
    isCorrect: isPracticeCharacterCorrect(character, targetChars[index], ignoreCase, ignoreAccent),
  }))
}

export function getFirstWrongCharacterIndex(
  input: string,
  target: string,
  ignoreCase: boolean,
  ignoreAccent = false
): number {
  return getPracticeInputCharacterStates(input, target, ignoreCase, ignoreAccent).findIndex(item => !item.isCorrect)
}

export function isWholePracticeInputComplete(input: string, target: string): boolean {
  return Array.from(normalizePracticeCharacter(input)).length === Array.from(normalizePracticeCharacter(target)).length
}

export function isWholePracticeInputCorrect(
  input: string,
  target: string,
  ignoreCase: boolean,
  ignoreAccent = false
): boolean {
  return (
    isWholePracticeInputComplete(input, target) &&
    getFirstWrongCharacterIndex(input, target, ignoreCase, ignoreAccent) === -1
  )
}

export function getWholeInputAfterWrongBackspace(input: string, target: string, ignoreCase: boolean): string {
  const firstWrongIndex = getFirstWrongCharacterIndex(input, target, ignoreCase)
  return firstWrongIndex === -1
    ? Array.from(input).slice(0, -1).join('')
    : Array.from(input).slice(0, firstWrongIndex).join('')
}
