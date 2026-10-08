<script setup lang="ts">
import { computed, inject } from 'vue'
import { narrationKey } from '../lib/narration'
import Icon from './Icon.vue'

const narration = inject(narrationKey)!
const { state, docked } = narration
// One button keeps keyboard focus: it starts listening, then shows the state and returns to the sentence being read.
const label = computed(() => (!docked.value ? '듣기' : state.playing ? '듣는 중' : '잠시 멈춤'))
const name = computed(() => (docked.value ? `${label.value}, 지금 듣는 곳으로 이동` : '지금 보이는 곳부터 듣기'))
const icon = computed(() => (!docked.value ? 'headphones' : state.playing ? 'wave' : 'pause'))
function act() {
  if (docked.value) narration.returnToCue()
  else narration.startHere()
}
</script>

<template>
  <button type="button" class="narration-tool" :class="{ 'narration-status': docked }" :aria-label="name" @click="act">
    <Icon :name="icon" :size="docked ? 18 : 20" :stroke="docked ? 2 : 1.8" /><span>{{ label }}</span>
  </button>
</template>
