<script setup lang="ts">
import { inject, ref } from 'vue'
import { narrationKey, narrationRates } from '../lib/narration'
import Icon from './Icon.vue'

const narration = inject(narrationKey)!
const { state } = narration
const dialog = ref<HTMLDialogElement>()
function open() { dialog.value?.showModal() }
function close() { dialog.value?.close() }
function closeOnBackdrop(event: MouseEvent) {
  if (event.target !== dialog.value) return
  const rect = dialog.value!.getBoundingClientRect()
  if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) close()
}
defineExpose({ open })
</script>

<template>
  <dialog ref="dialog" class="narration-settings" aria-labelledby="narration-settings-title" @click="closeOnBackdrop">
    <div class="dialog-body">
      <div class="dialog-handle" aria-hidden="true" />
      <header class="dialog-heading">
        <h2 id="narration-settings-title">듣기 설정</h2>
        <button type="button" class="close-button" aria-label="듣기 설정 닫기" @click="close"><Icon name="close" :size="21" /></button>
      </header>
      <p class="settings-label">재생 속도</p>
      <div class="size-options" role="group" aria-label="재생 속도 선택">
        <button v-for="rate in narrationRates" :key="rate.value" type="button" :class="{ selected: state.rate === rate.value }" :aria-pressed="state.rate === rate.value" @click="narration.setRate(rate.value)">
          <span class="size-sample rate-sample" aria-hidden="true">{{ rate.value }}배</span><span>{{ rate.label }}</span>
        </button>
      </div>
      <section class="music-setting" aria-labelledby="narration-autoplay-title">
        <div class="music-setting-copy">
          <h3 id="narration-autoplay-title">다음 화 이어 듣기</h3>
          <p id="narration-autoplay-note">한 화가 끝나면 다음 화를 이어서 들려 드려요</p>
        </div>
        <button type="button" class="music-toggle" role="switch" aria-labelledby="narration-autoplay-title" aria-describedby="narration-autoplay-note" :aria-checked="state.autoplay" @click="narration.setAutoplay(!state.autoplay)">
          <span class="switch-track" aria-hidden="true"><span /></span>
        </button>
      </section>
      <p class="narration-music-note"><Icon name="music" :size="16" />듣는 동안에는 배경음악이 꺼져요</p>
      <button type="button" class="settings-done" @click="close">설정 마치기</button>
    </div>
  </dialog>
</template>
