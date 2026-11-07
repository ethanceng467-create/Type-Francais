import {onDeactivated, onMounted, onUnmounted, watch, type WatchSource} from 'vue'
import {emitter, EventKey} from '../utils/eventBus'
import {useSettingStore} from '../stores'
import {isMobile} from '../utils'

const CODE_TO_CHAR: Record<string, string> = {
  ...Object.fromEntries('ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('').map(c => [`Key${c}`, c.toLowerCase()])),
  ...Object.fromEntries(Array.from({ length: 10 }, (_, i) => [`Digit${i}`, String(i)])),
  ...Object.fromEntries(Array.from({ length: 10 }, (_, i) => [`Numpad${i}`, String(i)])),
  Minus: '-',
  Equal: '=',
  BracketLeft: '[',
  BracketRight: ']',
  Semicolon: ';',
  Quote: "'",
  Comma: ',',
  Period: '.',
  Slash: '/',
  Backslash: '\\',
  Space: ' ',
  Backspace: 'Backspace',
}

const SHIFT_CODE_TO_CHAR: Record<string, string> = {
  Digit1: '!',
  Digit2: '@',
  Digit3: '#',
  Digit4: '$',
  Digit5: '%',
  Digit6: '^',
  Digit7: '&',
  Digit8: '*',
  Digit9: '(',
  Digit0: ')',
  Minus: '_',
  Equal: '+',
  BracketLeft: '{',
  BracketRight: '}',
  Semicolon: ':',
  Quote: '"',
  Comma: '<',
  Period: '>',
  Slash: '?',
  Backslash: '|',
}

const CHAR_TO_CODE: Record<string, string> = {}
for (const [code, char] of Object.entries(CODE_TO_CHAR)) {
  CHAR_TO_CODE[char] = code
  if (code.startsWith('Key')) {
    CHAR_TO_CODE[char.toUpperCase()] = code
  }
}
for (const [code, char] of Object.entries(SHIFT_CODE_TO_CHAR)) {
  CHAR_TO_CODE[char] = code
}

function charToCode(char: string) {
  return CHAR_TO_CODE[char] ?? ''
}

function getSelectedText() {
  return window.getSelection().toString().trim()
}

export function useWindowClick(cb: (e: PointerEvent) => void) {
  const add = () => {
    emitter.on(EventKey.closeOther, cb)
    window.addEventListener('click', cb)
  }
  onMounted(add)
  // onActivated(add)

  const remove = () => {
    window.removeEventListener('click', cb)
  }
  onUnmounted(remove)
  onDeactivated(remove)
}

export function useEventListener(type: string, listener: EventListenerOrEventListenerObject) {
  const invokeListener = (event: KeyboardEvent) => {
    if (typeof listener === 'function') {
      return (listener as EventListener)(event)
    }
    if (listener && typeof (listener as EventListenerObject).handleEvent === 'function') {
      return (listener as EventListenerObject).handleEvent(event)
    }
  }

  let cleanup: (() => void) | null = null

  const add = () => {
    //chrome上，win的事件先触发，safari上input的事件先触发
    const emitWindowsKeys = new Set()
    const emitInputKeys = new Set()
    const cleanupFns: Array<() => void> = []
    const registerCleanup = (fn: () => void) => cleanupFns.push(fn)

    const performCleanup = () => {
      while (cleanupFns.length) {
        const fn = cleanupFns.pop()
        try {
          fn()
        } catch (err) {
          console.warn('[useEventListener] cleanup error', err)
        }
      }
    }

    if (type === 'keydown') {
      const ensureMobileInput = () => {
        let input = document.querySelector('#typing-listener') as HTMLInputElement | null
        if (!input) {
          input = document.createElement('input')
          input.id = 'typing-listener'
          input.type = 'text'
          input.autofocus = true
          input.autocomplete = 'off'
          input.autocapitalize = 'off'
          input.autocorrect = false
          input.spellcheck = false
          input.tabIndex = -1
          input.setAttribute('aria-hidden', 'true')
          Object.assign(input.style, {
            position: 'fixed',
            top: '50vh',
            left: '50vw',
            opacity: '0',
            pointerEvents: 'none',
            width: '1px',
            height: '1px',
            zIndex: '-1',
            // left: '-9999px',
          })
        }
        if (!input.parentNode) {
          document.body.appendChild(input)
        }
        setTimeout(() => {
          input.focus()
        }, 100)
        return input
      }

      const hiddenInput = ensureMobileInput()
      let isComposing = false

      const createSyntheticEvent = (payload: { key: string; code?: string; keyCode: number }) => {
        const base = {
          key: payload.key,
          code: payload.code ?? '',
          keyCode: payload.keyCode,
          which: payload.keyCode,
          ctrlKey: false,
          altKey: false,
          shiftKey: false,
          metaKey: false,
          repeat: false,
          isComposing: false,
          type,
          preventDefault() {},
          stopPropagation() {},
          stopImmediatePropagation() {},
        }
        return base as unknown as KeyboardEvent
      }

      const dispatchSyntheticKey = (payload: { key: string; code?: string; keyCode: number }) => {
        invokeListener(createSyntheticEvent(payload))
      }

      const handleCompositionStart = () => {
        // console.log('handleCompositionStart',Date.now())
        isComposing = true
        // 法语场景下用死键（Option+E 等）或输入法上屏是正常操作，不再提示
      }

      const handleCompositionEnd = (event: CompositionEvent) => {
        isComposing = false
        if (!event.data) {
          hiddenInput.value = ' '
          return
        }
        for (const char of event.data) {
          const keyCode = char === ' ' ? 32 : char.toUpperCase().charCodeAt(0)
          dispatchSyntheticKey({
            key: char,
            code: charToCode(char),
            keyCode,
          })
        }
        hiddenInput.value = ' '
      }

      const handleInput = (event: InputEvent) => {
        // console.log('handleInput',event,Date.now())
        if (isComposing) return
        const target = event.target as HTMLInputElement | null
        if (!target) return
        let char = ''
        let keyCode = -1
        if (event.inputType === 'deleteContentBackward') {
          char = 'Backspace'
          keyCode = 8
        } else {
          char = target?.value?.slice(-1) || (event as any).data?.slice(-1)
          keyCode = char === ' ' ? 32 : char.toUpperCase().charCodeAt(0)
        }
        if (emitWindowsKeys.has(char)) return
        // console.log('handleInput', Date.now(), emitWindowsKeys)
        emitInputKeys.add(char)
        setTimeout(() => emitInputKeys.delete(char), 30)
        dispatchSyntheticKey({ key: char, code: charToCode(char), keyCode })
        target.value = ' '
      }

      const handleFocusRequest = (event: MouseEvent | TouchEvent) => {
        const target = event.target as HTMLElement | null
        if (!target) return
        if (!window.location.pathname.includes('/practice')) return
        const typingWord = target.closest('#PracticeArea')
        if (!typingWord) return
        if (target.closest('input, textarea, select, [contenteditable="true"]')) return false
        if (!getSelectedText()) {
          window.setTimeout(() => hiddenInput.focus(), 160)
        }
      }

      const windowListener = (e: KeyboardEvent) => {
        // if (e.code in CODE_TO_CHAR && !e.ctrlKey && !e.metaKey) return
        // return
        // console.log('windowListener', Date.now(), e)
        if (e.key === 'Process') {
          // @ts-ignore
          // e.key = CODE_TO_CHAR[e.code]
          //todo 这里不能直接设置值，会报错，后续可以用合成事件优化
          return
        }
        if (emitInputKeys.has(e.key)) return
        // console.log('windowListener', Date.now(), emitInputKeys)
        invokeListener(e)
        emitWindowsKeys.add(e.key)
        setTimeout(() => emitWindowsKeys.delete(e.key), 30)
      }

      hiddenInput.addEventListener('compositionstart', handleCompositionStart)
      registerCleanup(() => hiddenInput.removeEventListener('compositionstart', handleCompositionStart))

      hiddenInput.addEventListener('compositionend', handleCompositionEnd)
      registerCleanup(() => hiddenInput.removeEventListener('compositionend', handleCompositionEnd))

      hiddenInput.addEventListener('input', handleInput, { capture: true })
      registerCleanup(() => hiddenInput.removeEventListener('input', handleInput, { capture: true }))

      window.addEventListener('click', handleFocusRequest)
      registerCleanup(() => window.removeEventListener('click', handleFocusRequest))

      window.addEventListener('touchstart', handleFocusRequest)
      registerCleanup(() => window.removeEventListener('touchstart', handleFocusRequest))

      window.addEventListener(type, windowListener, { capture: true })
      registerCleanup(() => window.removeEventListener(type, windowListener, { capture: true }))

      registerCleanup(() => hiddenInput.remove())
    } else {
      const windowListener = (event: Event) => invokeListener(event as KeyboardEvent)
      window.addEventListener(type, windowListener, { capture: true })
      registerCleanup(() => window.removeEventListener(type, windowListener, { capture: true }))
    }

    cleanup = () => {
      performCleanup()
      cleanup = null
    }
  }
  onMounted(add)

  const remove = () => {
    if (cleanup) cleanup()
  }

  onUnmounted(remove)
  onDeactivated(remove)
}

export function getShortcutKey(e: KeyboardEvent) {
  let shortcutKey = ''
  if (e.ctrlKey || e.metaKey) shortcutKey += 'Ctrl+'
  if (e.altKey) shortcutKey += 'Alt+'
  if (e.shiftKey) shortcutKey += 'Shift+'
  if (e.key !== 'Control' && e.key !== 'Alt' && e.key !== 'Shift') {
    if (e.keyCode >= 65 && e.keyCode <= 90) {
      shortcutKey += e.key.toUpperCase()
    } else {
      if (e.key === 'ArrowRight') {
        shortcutKey += '➡'
      } else if (e.key === 'ArrowLeft') {
        shortcutKey += '⬅'
      } else if (e.key === 'ArrowUp') {
        shortcutKey += '⬆'
      } else if (e.key === 'ArrowDown') {
        shortcutKey += '⬇'
      } else {
        //当空格为快捷键时，key为一个空字符，而代码里面写的快捷键是Space，导致匹配不上
        shortcutKey += e.key.trim() || e.code
      }
    }
  }
  shortcutKey = shortcutKey.trim()

  // console.log('key', shortcutKey)
  return shortcutKey
}

export function useStartKeyboardEventListener() {
  const settingStore = useSettingStore()

  useEventListener('keydown', (e: KeyboardEvent) => {
    // console.log('keydown', e)
    // debugger
    //解决无法复制、全选的问题
    if ((e.ctrlKey || e.metaKey) && ['KeyC', 'KeyA', 'KeyD'].includes(e.code)) return
    if (!window?.disableEventListener) {
      let shortcutKey = getShortcutKey(e)
      // console.log('shortcutKey', shortcutKey)

      let shortcutEvent = []
      for (let [k, v] of Object.entries(settingStore.shortcutKeyMap)) {
        if (v === shortcutKey) {
          // console.log('快捷键', k,emitter.all.has(k))
          //必须是已监听的事件，才拦截并触发
          //因为在自测时，才会监听 1234 四个键，平时如果也拦截会导致无法输入1234
          if (emitter.all.has(k) && emitter.all.get(k)?.length) {
            shortcutEvent.push(k)
          }
        }
      }
      // console.log('shortcutEvent', shortcutEvent, settingStore.shortcutKeyMap, emitter.all)
      if (shortcutEvent.length > 0) {
        e.preventDefault()
        shortcutEvent.map(s => emitter.emit(s, e))
      } else {
        // 输入区域放行规则：
        // 原实现用 keyCode 白名单（65-90/48-57…）判断，只覆盖 ASCII，
        // 法语重音字符（é è ê à ç ù î œ）走不进打字流程。这里改成
        // “任何可打印单字符”即放行，配合 Backspace / IME(229) 兜底。
        const isPrintableKey =
          typeof e.key === 'string' && Array.from(e.key).length === 1 && e.key !== '\u0000'
        if (
          (isPrintableKey || e.code === 'Backspace' || e.keyCode === 229) &&
          //当按下功能键时，不阻止事件传播
          !e.ctrlKey &&
          !e.altKey
        ) {
          if (e.keyCode === 229 && (e.key === 'Unidentified' || e.key === 'Process')) {
            // 软键盘 / 输入法（中文 IME、法语死键）在 keydown 阶段拿不到真实字符，
            // 等待 compositionend 事件再派发，避免把 'Process' 当成字符输入
            return
          }
          e.preventDefault()
          emitter.emit(EventKey.onTyping, e)
        } else {
          emitter.emit(EventKey.keydown, e)
        }
      }
    }
  })
  // 输入法 / 死键上屏后，把提交的字符逐个送给打字流程（法语 é 可用 Option+E 之类死键输入）
  useEventListener('compositionend', (e: CompositionEvent) => {
    if (window?.disableEventListener) return
    // 隐藏输入框（#typing-listener）已有自己的 composition 管线，避免重复上屏
    if ((e.target as HTMLElement | null)?.id === 'typing-listener') return
    const text = e?.data
    if (!text) return
    Array.from(text).forEach(ch => {
      emitter.emit(EventKey.onTyping, { key: ch, code: '', shiftKey: false } as unknown as KeyboardEvent)
    })
  })

  useEventListener('keyup', (e: KeyboardEvent) => {
    if (!window?.disableEventListener) {
      emitter.emit(EventKey.keyup, e)
    }
  })
}

export function useOnKeyboardEventListener(onKeyDown: (e: KeyboardEvent) => void, onKeyUp: (e: KeyboardEvent) => void) {
  const add = () => {
    emitter.on(EventKey.keydown, onKeyDown)
    emitter.on(EventKey.keyup, onKeyUp)
  }
  onMounted(add)
  // onActivated(add)

  const remove = () => {
    emitter.off(EventKey.keydown, onKeyDown)
    emitter.off(EventKey.keyup, onKeyUp)
  }
  onUnmounted(remove)
  onDeactivated(remove)
}

//因为如果用useStartKeyboardEventListener局部变量控制，当出现多个hooks时就不行了，所以用全局变量来控制
export function useDisableEventListener(watchVal: WatchSource<unknown>) {
  if (typeof window === 'undefined') return
  watch(
    watchVal,
    n => {
      window.disableEventListener = Boolean(n)
    },
    { immediate: true }
  )

  onUnmounted(() => {
    window.disableEventListener = false
  })
}
