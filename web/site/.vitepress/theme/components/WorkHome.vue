<script setup lang="ts">
import { computed, inject, ref } from 'vue'
import { useData, withBase } from 'vitepress'
import { listenState, type ListenState } from '../../shared/player.mjs'
import { catalog, type Episode } from '../lib/catalog'
import { followsHere, narrationKey } from '../lib/narration'
import { portraitAlt } from '../../shared/portrait.mjs'
import Icon from './Icon.vue'
import ResponsiveImage from './ResponsiveImage.vue'
import { coverImageSizes, coverImageSources, imageSrcset } from '../../shared/image-sources.mjs'

type NodeState = 'read' | 'current' | 'unread'
const props = defineProps<{ completed: string[] }>()
const narration = inject(narrationKey)!
const { state } = narration
const synopsisOpen = ref(false)
const partDescriptions: Record<string, string> = {
  갯벌: '갯벌에서 자란 막내는 전쟁과 풍랑을 겪었다.',
  가마솥: '안면도에서 가정을 꾸리고 김과 멸치를 팔며 탈곡팀을 운영했다.',
  소금기: '이웃들과 독정리에 새 터를 잡고 농사와 자녀 교육을 이어갔다.',
  정미소: '농민들의 부탁으로 낡은 정미소를 맡아 일으켰다.',
  볏값: '부도와 도난에도 땅을 팔아 볏값을 치렀다. 오랜 세월 함께한 아내를 떠나보냈다.',
  들녘: '네 아들이 힘을 보태며 정미소와 쌀농사를 키워 갔다.',
}
// The cover reuses the shared watercolor, so the link preview and the home open on the same painting.
const { site } = useData()
const coverSrcset = (format: 'webp' | 'jpg') =>
  imageSrcset(coverImageSources(format), site.value.base)

const total = catalog.readingOrder.length
const ready = Object.keys(catalog.narration ?? {}).length
const meta = ready < total ? `${total}편 · 지금 ${ready}편 들을 수 있어요` : `${total}편`

const groups = computed(() => {
  const rows: {
    part: typeof catalog.parts[number] | null
    episodes: typeof catalog.readingOrder
  }[] = []
  for (const episode of catalog.readingOrder) {
    const part = episode.part
    if (!rows.length || rows[rows.length - 1].part?.number !== part?.number) {
      rows.push({ part, episodes: [] })
    }
    rows[rows.length - 1].episodes.push(episode)
  }
  return rows
})

// The episode being heard, or the one left partway, is the current one in the list.
const currentId = computed(() => (state.active ? state.episodeId : state.saved?.id ?? null))
const returning = computed(() => props.completed.length > 0 || currentId.value !== null)
const states = computed(() => {
  const session = state.active ? { id: state.episodeId, playing: state.playing, time: state.time } : null
  return Object.fromEntries(catalog.readingOrder.map(episode => [episode.id, listenState(episode.id, {
    narration: catalog.narration ?? {}, session, saved: state.saved, completed: props.completed,
  })])) as Record<string, ListenState>
})

function listenLabel(status: ListenState) {
  if (status.kind === 'playing') return '재생 중'
  if (status.kind === 'unavailable') return '준비 중'
  return status.kind === 'progress' ? `${status.minutes}분 남음` : `${status.minutes}분`
}

// A replay keeps its check; the ring marks an episode heard partway for the first time.
function nodeState(id: string): NodeState {
  if (props.completed.includes(id)) return 'read'
  return id === currentId.value ? 'current' : 'unread'
}

// The rail is filled between heard episodes and up to the one in progress, without a percentage.
function railClasses(episodes: Episode[], index: number) {
  const state = nodeState(episodes[index].id)
  const previous = episodes[index - 1]
  const next = episodes[index + 1]
  return {
    'rail-start': !previous,
    'rail-end': !next,
    'rail-before-done': Boolean(previous) && nodeState(previous.id) === 'read' && state !== 'unread',
    'rail-after-done': Boolean(next) && state === 'read' && nodeState(next.id) !== 'unread',
  }
}

const partHeard = (episodes: Episode[]) => episodes.every(episode => props.completed.includes(episode.id))
/** Opening an episode that has a recording plays it at once; the link then shows its text. */
function listen(event: MouseEvent, episode: Episode) { if (followsHere(event)) narration.open(episode.id) }
</script>

<template>
  <main id="main" tabindex="-1" class="home-main">
    <section class="home-intro" aria-label="작품 소개">
      <ResponsiveImage class="home-cover" :src="withBase('/images/home-cover-720.jpg')"
        :srcset="coverSrcset('jpg')" :webp-srcset="coverSrcset('webp')" :sizes="coverImageSizes"
        :width="1280" :height="720" :alt="portraitAlt" loading="eager" fetchpriority="high" />
      <header class="home-heading">
        <div class="home-heading-tools"><p class="home-subtitle">오디오북 · {{ catalog.work.subtitle }}</p><slot name="settings" /></div>
        <h1>{{ catalog.work.title }}</h1>
        <p class="home-meta">{{ meta }}</p>
        <p v-if="catalog.work.schedule" class="home-note">{{ catalog.work.schedule }}</p>
      </header>

      <div v-if="returning" class="synopsis-disclosure">
        <button type="button" class="synopsis-toggle" :aria-expanded="synopsisOpen" aria-controls="work-synopsis" @click="synopsisOpen = !synopsisOpen">
          {{ synopsisOpen ? '작품 소개 접기' : '작품 소개 보기' }}<Icon name="chevron" :size="16" />
        </button>
      </div>
      <div id="work-synopsis" class="work-synopsis" :hidden="returning && !synopsisOpen">
        <p v-for="(paragraph, index) in catalog.work.synopsis" :key="paragraph" :class="{ 'synopsis-quote': index === 0 }">{{ paragraph }}</p>
      </div>
    </section>

    <nav class="chapter-list" aria-label="회차 목록">
      <div class="chapter-list-heading"><h2>목차</h2><span>전체 {{ total }}편</span></div>
      <section v-for="(group, index) in groups" :key="index">
        <div v-if="group.part" class="part-heading-block">
          <div class="part-heading-row">
            <h2 :id="`part-${group.part.number}`" class="part-heading" tabindex="-1">
              {{ group.part.label }}
            </h2>
            <span v-if="partHeard(group.episodes)" class="part-done"><Icon name="check" :size="15" :stroke="2.4" />재생 완료</span>
          </div>
          <p v-if="partDescriptions[group.part.title]" class="part-description">
            {{ partDescriptions[group.part.title] }}
          </p>
        </div>
        <a
          v-for="(episode, position) in group.episodes"
          :id="`episode-${episode.episodeId}`"
          :key="episode.id"
          class="chapter-row"
          :class="[
            { 'is-read': completed.includes(episode.id), 'is-current': episode.id === currentId, 'is-unavailable': states[episode.id].kind === 'unavailable' },
            railClasses(group.episodes, position),
          ]"
          :href="withBase(episode.url)"
          :aria-current="episode.id === currentId ? 'true' : undefined"
          @click="listen($event, episode)"
        >
          <span class="chapter-body">
            <span class="chapter-copy">
              <span class="chapter-title">
                <span class="episode-label">{{ episode.label }}</span> {{ episode.title }}
              </span>
              <span class="episode-time">{{ episode.time }}</span>
            </span>
            <span class="chapter-status" :class="`is-${states[episode.id].kind}`">
              <Icon v-if="states[episode.id].kind === 'playing'" class="chapter-cue" name="wave" :size="18" :stroke="2" />
              <span class="chapter-listen">{{ listenLabel(states[episode.id]) }}</span>
              <Icon v-if="states[episode.id].kind === 'unavailable'" class="chapter-cue chapter-chevron" name="chevron" :size="16" />
              <span v-else-if="states[episode.id].kind !== 'playing'" class="chapter-cue chapter-play" aria-hidden="true"><Icon name="play" :size="12" filled :stroke="1.6" /></span>
            </span>
          </span>
          <!-- The rail is drawn first but read last, so link names still start with the title. -->
          <span class="chapter-rail">
            <span v-if="nodeState(episode.id) === 'read'" class="chapter-node node-read read-label" role="img" aria-label="재생 완료">
              <Icon name="check" :size="14" :stroke="3" />
            </span>
            <span v-else class="chapter-node" :class="`node-${nodeState(episode.id)}`" aria-hidden="true" />
          </span>
        </a>
      </section>
    </nav>

    <section
      v-if="catalog.documents.length"
      class="documents-section"
      aria-labelledby="documents-title"
    >
      <h2 id="documents-title">함께 읽을 글</h2>
      <a
        v-for="doc in catalog.documents"
        :key="doc.id"
        :href="withBase(doc.url)"
        class="document-row"
      >
        <span>{{ doc.title }}</span><Icon name="chevron" :size="16" />
      </a>
    </section>
  </main>
</template>
