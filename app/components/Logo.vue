<script setup lang="ts">
import { useSettingStore } from '@/core/stores/setting.ts'
import { useRouter } from 'vue-router'
import { APP_NAME } from '@/core/config/env'

const settingStore = useSettingStore()
const router = useRouter()

function goHome() {
  router.push('/')
}
</script>

<template>
  <div class="center logo" @click="goHome" :title="APP_NAME">
    <span class="logo-text" :class="settingStore.theme === 'dark' && 'is-dark'">
      <span>Type</span>
      <span>Français</span>
    </span>
  </div>
</template>

<style scoped lang="scss">
.logo {
  cursor: pointer;
  user-select: none;
}

/* 原来用 png 图片写死 "Type Words"，法语版直接文字渲染，免去改图 */
.logo-text {
  font-family: 'Caveat', 'Segoe Script', 'Brush Script MT', cursive;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  font-size: 1.15rem;
  font-weight: 700;
  line-height: 1;
  letter-spacing: 0.3px;
  background: linear-gradient(90deg, #7c3aed 0%, #bd34fe 55%, #41d1ff 100%);
  -webkit-background-clip: text;
  background-clip: text;
  -webkit-text-fill-color: transparent;
  white-space: nowrap;
  gap: 1px;

  &.is-dark {
    filter: brightness(1.25);
  }
}
</style>
