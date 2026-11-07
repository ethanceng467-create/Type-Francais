<script setup lang="ts">
import type { Word } from '@/core/types/types.ts'
import { getDefaultWord } from '@/core/types/func.ts'
import { WordPlayTrigger, WordPracticeType } from '@/core/types/enum.ts'
import { useSettingStore } from '@/core/stores/setting.ts'
import { resetActiveWordPlayCount, usePlayBeep, usePlayCorrect, usePlayKeyboardAudio } from '@/core/hooks/sound.ts'
import { emitter, EventKey } from '@/core/utils/eventBus.ts'
import { onUnmounted, watch } from 'vue'
import Space from '@/components/article/Space.vue'
import { _nextTick, last } from '@/core/utils'
import { useOnKeyboardEventListener } from '@/core/hooks/event.ts'
import { Toast } from '@/base'
import { usePracticeWordTyping } from '@/core/composables/practice-words/usePracticeWordTyping.ts'
import {
  foldTypingWord,
  isSegmentTyped,
  isSegmentTyping,
  type TypingSegment,
} from '@/core/composables/practice-words/visible-word-typing.ts'

interface IProps {
  word: Word
  practiceType: WordPracticeType
  isWordMasked: boolean
  showWordResult: boolean
  showFullWord: boolean
  wordFontSize: number
  active?: boolean
}

const props = withDefaults(defineProps<IProps>(), {
  word: () => getDefaultWord(),
  showWordResult: false,
  active: true,
  showFullWord: false,
  isWordMasked: false,
  wordFontSize: 48,
})

const emit = defineEmits<{
  'update:showWordResult': [value: boolean]
  complete: []
  wrong: []
  play: [trigger: WordPlayTrigger]
}>()

const settingStore = useSettingStore()
const playBeep = usePlayBeep()
const playCorrect = usePlayCorrect()
const playKeyboardAudio = usePlayKeyboardAudio()

const typing = usePracticeWordTyping({
  getWord: () => props.word,
  getPracticeType: () => props.practiceType,
  getIsWordMasked: () => props.isWordMasked,
  getShowWordResult: () => props.showWordResult,
  getSettings: () => settingStore,
  setShowWordResult: value => emit('update:showWordResult', value),
  onComplete: () => emit('complete'),
  onWrong: () => emit('wrong'),
  onPlay: trigger => emit('play', trigger),
  onNotice: notice =>
    Toast.info($t(notice.type === 'delete-reinput' ? 'press_delete_reinput' : 'press_space_continue'), {
      duration: 2000,
    }),
  playBeep,
  playCorrect,
  playKeyboardAudio,
  resetWordPlayCount: resetActiveWordPlayCount,
})

const {
  input,
  wrong,
  wholeInputAttempt,
  inputLock,
  inputCharacterStates,
  isWordCorrect,
  typeCharacter,
  backspace,
  reset,
  setWordTestResult,
  clearDeferredTimers,
} = typing

/**
 * 打字区同时保留「正确拼写」和「键盘可输入形式」两套：
 * 显示 é / œ，比对用 e / oe。这样视觉上仍是 école，手上却只用打 ecole。
 */
const typingLayout = $computed(() => foldTypingWord(props.word.word, !!settingStore.ignoreAccent))

/** 当前显示字符段落是否已经打完整 */
function isSegmentDone(segment: TypingSegment) {
  return isSegmentTyped(segment, Array.from(input.value).length)
}

/** 该段所有折叠字符是否都打对了 */
function isSegmentRight(segment: TypingSegment) {
  const states = inputCharacterStates.value
  for (let i = segment.foldStart; i < segment.foldEnd; i++) {
    if (!states[i]?.isCorrect) return false
  }
  return true
}

function segmentClass(segment: TypingSegment) {
  const typedLength = Array.from(input.value).length
  if (isSegmentTyped(segment, typedLength)) return isSegmentRight(segment) ? 'input' : 'wrong'
  if (isSegmentTyping(segment, typedLength)) return 'input partial pending'
  return 'letter pending'
}

/** 遮罩（默写提示）时未输入的字符显示为下划线 */
function segmentText(segment: TypingSegment) {
  const masked = props.isWordMasked && !props.showFullWord && !isSegmentDone(segment)
  return masked ? '_' : segment.display
}

let cursor = $ref({ top: 0, left: 0 })
const typingWordRef = $ref<HTMLDivElement>()

function onTyping(event: KeyboardEvent) {
  if (event.code === 'Backspace') {
    backspace()
    return
  }
  typeCharacter({ key: event.key, code: event.code, shiftKey: event.shiftKey })
}

function checkCursorPosition() {
  _nextTick(() => {
    if (!typingWordRef) return
    const typingWordRect = typingWordRef.getBoundingClientRect()
    const measure = (el: Element | null) => {
      if (!el) return null
      const r = el.getBoundingClientRect()
      return { top: r.top - typingWordRect.top, left: r.left - typingWordRect.left }
    }
    // 光标停在第一个还没打完的字符上（œ 这类占两位的字符也要停住）
    const pending = typingWordRef.querySelector('.l.pending')
    const pendingPos = measure(pending)
    if (pendingPos) {
      cursor = pendingPos
      return
    }
    const inputList = typingWordRef.querySelectorAll('.l')
    if (inputList.length) {
      const lastRect = last(Array.from(inputList)).getBoundingClientRect()
      cursor = {
        top: lastRect.top - typingWordRect.top,
        left: lastRect.right - typingWordRect.left,
      }
      return
    }
    const dictationPos = measure(typingWordRef.querySelector('.dictation') ?? typingWordRef.querySelector('.letter'))
    if (dictationPos) cursor = dictationPos
  })
}

function resetTypingCore(trigger: WordPlayTrigger) {
  reset(trigger)
  checkCursorPosition()
}

function onResetWord() {
  resetTypingCore(WordPlayTrigger.ResetSameWord)
}

useOnKeyboardEventListener(
  () => {},
  () => {}
)

watch(
  () => props.word,
  () => resetTypingCore(WordPlayTrigger.NewWord),
  { immediate: true }
)

watch([input, () => props.showFullWord, () => props.practiceType], checkCursorPosition)

function deactivate() {
  clearDeferredTimers()
  emitter.off(EventKey.resetWord, onResetWord)
  emitter.off(EventKey.onTyping, onTyping)
}

watch(
  () => props.active,
  active => {
    deactivate()
    if (active) {
      emitter.on(EventKey.resetWord, onResetWord)
      emitter.on(EventKey.onTyping, onTyping)
      checkCursorPosition()
    }
  },
  { immediate: true }
)

onUnmounted(deactivate)

defineExpose({
  isWordRight: () => isWordCorrect.value,
  setWordTestResult,
})
</script>

<template>
  <div
    class="typing-core"
    ref="typingWordRef"
    :class="wrong || (wholeInputAttempt && inputLock && !isWordCorrect) ? 'is-wrong' : ''"
  >
    <!-- 默写模式 -->
    <div v-if="practiceType === WordPracticeType.Dictation">
      <div
        class="letter text-align-center w-full inline-block"
        v-opacity:noAnim="!isWordMasked || showWordResult || showFullWord"
      >
        {{ word.word }}
      </div>
      <div
        class="mt-2 min-w-120 pb-1 dictation"
        :style="{ minHeight: wordFontSize + 'px' }"
        :class="showWordResult ? (isWordCorrect ? 'right' : 'wrong') : ''"
      >
        <template v-for="i in input">
          <span class="l" v-if="i !== ' '">{{ i }}</span>
          <Space class="l" v-else :is-wrong="showWordResult ? !isWordCorrect : false" :is-wait="!showWordResult" />
        </template>
      </div>
    </div>

    <!-- 非默写模式 -->
    <template v-else>
      <template v-for="(segment, index) in typingLayout.segments" :key="index">
        <span v-if="segment.display === ' '" class="l" :class="segmentClass(segment)">
          <Space :is-wrong="isSegmentDone(segment) && !isSegmentRight(segment)" :is-wait="false" />
        </span>
        <span v-else class="l" :class="segmentClass(segment)">{{ segmentText(segment) }}</span>
      </template>
      <span class="wrong" v-if="wrong">{{ wrong }}</span>
    </template>

    <div
      v-if="active"
      class="cursor"
      :style="{
        top: cursor.top + 'px',
        left: cursor.left + 'px',
        height: wordFontSize + 'px',
      }"
    ></div>
  </div>
</template>

<style scoped lang="scss">
.dictation {
  border-bottom: 2px solid gray;
}

.typing-core {
  position: relative;

  &.is-wrong {
    animation: shake 0.82s cubic-bezier(0.36, 0.07, 0.19, 0.97) both;
  }

  .input,
  .right {
    color: rgb(22, 163, 74);
  }

  /* œ 打了一位、还差一位时的过渡态 */
  .input.partial {
    color: rgb(22, 163, 74);
    opacity: 0.45;
  }

  .wrong {
    color: rgba(red, 0.6);
  }
}
</style>
