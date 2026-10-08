<script setup lang="ts">
import { computed, inject, onBeforeUnmount, ref } from 'vue'
import { clock, spokenTime } from '../../shared/narration-cues.mjs'
import { narrationKey, narrationRates } from '../lib/narration'
import Icon from './Icon.vue'
import NarrationSettings from './NarrationSettings.vue'

const narration = inject(narrationKey)!
const { state, track } = narration
const settings = ref<InstanceType<typeof NarrationSettings>>()
const root = ref<HTMLElement>()
const duration = computed(() => track.value?.duration ?? 0)
const rate = computed(() => narrationRates.find(option => option.value === state.rate)?.label ?? '보통')
function seek(event: Event) { narration.seek(Number((event.target as HTMLInputElement).value)) }
// The controls close when listening stops or the episode ends; keyboard focus moves to what comes next.
onBeforeUnmount(() => {
  if (!root.value?.contains(document.activeElement)) return
  setTimeout(() => (document.querySelector<HTMLElement>('.narration-next-go') ?? document.querySelector<HTMLElement>('.narration-tool'))?.focus({ preventScroll: true }))
})
</script>

<template>
  <section ref="root" class="narration-dock" aria-label="듣기 조작">
    <button v-if="!state.follow && state.away" type="button" class="narration-return" @click="narration.returnToCue()">
      <Icon :name="state.away < 0 ? 'up' : 'down'" :size="18" :stroke="2" />지금 듣는 곳으로
    </button>
    <p v-if="state.failed" class="narration-error" role="alert">
      소리를 불러오지 못했어요 <button type="button" class="text-link" @click="narration.retry()">다시 시도</button>
    </p>
    <div class="narration-progress">
      <span aria-hidden="true">{{ clock(state.time) }}</span>
      <input type="range" min="0" :max="duration" step="1" :value="state.time" aria-label="재생 위치" :aria-valuetext="`${spokenTime(duration)} 중 ${spokenTime(state.time)}`" @input="seek">
      <span aria-hidden="true">{{ clock(duration) }}</span>
    </div>
    <div class="narration-controls">
      <button type="button" :aria-label="`재생 속도 ${rate}, 바꾸기`" @click="settings?.open()">
        <span class="narration-rate">{{ rate }}</span><span>속도</span>
      </button>
      <button type="button" @click="narration.previousSentence()"><Icon name="replay" :size="26" /><span>이전 문장</span></button>
      <button type="button" class="narration-toggle" :aria-label="state.playing ? '일시 정지' : '재생'" :aria-busy="state.waiting" @click="narration.toggle()">
        <span v-if="state.waiting && state.playing" class="narration-spinner" aria-hidden="true" />
        <Icon v-else-if="state.playing" name="pause" :size="26" :stroke="3" />
        <Icon v-else name="play" :size="26" filled :stroke="1.6" />
      </button>
      <button type="button" @click="narration.nextSentence()"><Icon name="forward" :size="26" /><span>다음 문장</span></button>
      <button type="button" @click="narration.stop()"><Icon name="close" :size="24" /><span>그만 듣기</span></button>
    </div>
    <NarrationSettings ref="settings" />
  </section>
</template>
