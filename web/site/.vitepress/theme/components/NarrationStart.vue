<script setup lang="ts">
import { computed, inject } from 'vue'
import { listeningMinutes } from '../../shared/narration-cues.mjs'
import { narrationFor, narrationKey, narrationLive } from '../lib/narration'
import Icon from './Icon.vue'

const props = defineProps<{ episodeId: string }>()
const narration = inject(narrationKey)!
const { state, holdsAudio } = narration
const track = computed(() => narrationFor(props.episodeId))
const again = computed(() => holdsAudio.value && state.episodeId === props.episodeId)
</script>

<template>
  <button v-if="track" type="button" class="narration-start" @click="narration.start(episodeId, 0)">
    <span class="narration-start-icon" aria-hidden="true"><Icon name="play" :size="20" filled :stroke="1.6" /></span>
    <span class="narration-start-copy">
      <span class="narration-start-label">{{ again ? '처음부터 다시 듣기' : '소리로 듣기' }}</span>
      <span class="narration-start-note">{{ listeningMinutes(track.duration) }}분 · 목소리를 따라 문장이 표시돼요</span>
    </span>
  </button>
  <p v-else-if="narrationLive" class="narration-soon"><Icon name="headphones" :size="18" />소리로 듣기는 준비 중이에요</p>
</template>
