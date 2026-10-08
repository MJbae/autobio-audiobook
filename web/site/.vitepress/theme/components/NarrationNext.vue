<script setup lang="ts">
import { computed, inject } from 'vue'
import { withBase } from 'vitepress'
import { listeningMinutes } from '../../shared/narration-cues.mjs'
import { catalog } from '../lib/catalog'
import { narrationKey } from '../lib/narration'
import Icon from './Icon.vue'

const props = defineProps<{ pageId: string }>()
const narration = inject(narrationKey)!
const { state, track, next, nextTrack, countdown, outroStart, closing } = narration
const visible = computed(() => closing.value && state.episodeId === props.pageId)
const current = computed(() => catalog.readingOrder.find(episode => episode.id === props.pageId))
const counting = computed(() => state.autoplay && !state.finished)
const image = computed(() => {
  const start = next.value ? catalog.illustrations[next.value.id]?.find(candidate => candidate.position.start) : undefined
  const source = start?.sources.find(candidate => candidate.width === 360) ?? start?.sources[0]
  return source ? withBase(source.src) : ''
})
// Announced once when the card appears; the region stays mounted so screen readers notice the change.
const announcement = computed(() => {
  if (!visible.value) return ''
  if (!next.value) return '마지막 이야기까지 들으셨어요'
  if (!nextTrack.value) return `듣기는 ${current.value?.label}까지 준비되어 있어요`
  return counting.value ? '음악이 끝나면 다음 화를 이어서 들려 드려요' : '다음 화를 이어서 들을 수 있어요'
})
function stopHere() {
  narration.stop()
  setTimeout(() => (document.querySelector<HTMLElement>('.next-episode') ?? document.querySelector<HTMLElement>('.narration-tool'))?.focus({ preventScroll: true }))
}
const progress = computed(() => {
  const length = (track.value?.duration ?? 0) - outroStart.value
  return length > 0 ? `${Math.min(100, Math.max(0, ((state.time - outroStart.value) / length) * 100))}%` : '100%'
})
</script>

<template>
  <section v-if="visible" class="narration-next" aria-labelledby="narration-next-label">
    <template v-if="next && nextTrack">
      <div class="narration-next-episode">
        <img v-if="image" :src="image" alt="" width="88" height="50">
        <div>
          <p id="narration-next-label" class="narration-next-label">다음 화 이어 듣기</p>
          <p class="narration-next-title"><span>{{ next.label }}</span> {{ next.title }}</p>
          <p class="narration-next-meta">{{ listeningMinutes(nextTrack.duration) }}분 · {{ next.time }}</p>
        </div>
      </div>
      <template v-if="counting">
        <div class="narration-next-bar" aria-hidden="true"><span :style="{ width: progress }" /></div>
        <p class="narration-next-count" aria-hidden="true"><strong>{{ countdown }}초</strong> 뒤에 이어서 들려 드려요</p>
      </template>
      <div class="narration-next-actions">
        <button type="button" class="narration-next-stop" @click="stopHere">여기서 그만 듣기</button>
        <button type="button" class="narration-next-go" @click="narration.advance()">
          <Icon name="play" :size="16" filled :stroke="1.6" />{{ counting ? '바로 듣기' : '다음 화 듣기' }}
        </button>
      </div>
    </template>
    <template v-else-if="next">
      <p id="narration-next-label" class="narration-next-label">듣기는 {{ current?.label }}까지 준비되어 있어요</p>
      <p class="narration-next-note">{{ next.label }}부터는 준비되는 대로 들려 드릴게요. 그동안 글로 먼저 읽어 보세요.</p>
    </template>
    <p v-else id="narration-next-label" class="narration-next-label">마지막 이야기까지 들으셨어요</p>
  </section>
  <p class="sr-only" role="status">{{ announcement }}</p>
</template>
