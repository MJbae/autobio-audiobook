import { computed, nextTick, onBeforeUnmount, onMounted, reactive, watch, type ComputedRef, type InjectionKey, type Ref } from 'vue'
import { useRouter, withBase } from 'vitepress'
import { cueIndexAt, nextCueStart, previousCueStart } from '../../shared/narration-cues.mjs'
import { catalog, type NarrationTrack } from './catalog'
import { createWakeLock, describeEpisode, reportPosition, reportState, setMediaControls } from './narration-device'
import { bringIntoView, cueElements, firstVisibleCue, placement, setMark, showElement } from './narration-page'

export const narrationRates = [
  { value: 0.8, label: '느리게' },
  { value: 1, label: '보통' },
  { value: 1.25, label: '빠르게' },
  { value: 1.5, label: '더 빠르게' },
] as const
const keys = { session: 'family-library:narration', rate: 'family-library:narration-rate', autoplay: 'family-library:narration-autoplay' }
const scrollKeys = new Set(['ArrowUp', 'ArrowDown', 'PageUp', 'PageDown', 'Home', 'End', ' '])

export const narrationFor = (id: string): NarrationTrack | undefined => catalog.narration?.[id]
export const narrationLive = Object.keys(catalog.narration ?? {}).length > 0

function readStorage(key: string) { try { return localStorage.getItem(key) } catch { return null } }
function writeStorage(key: string, value: string | null) {
  try {
    if (value === null) localStorage.removeItem(key)
    else localStorage.setItem(key, value)
  } catch { /* Listening works without browser storage. */ }
}
function savedSession(): { id: string; time: number } | null {
  try {
    const saved = JSON.parse(readStorage(keys.session) || 'null')
    return typeof saved?.id === 'string' && Number.isFinite(saved.time) ? { id: saved.id, time: saved.time } : null
  } catch { return null }
}
function listen(target: EventTarget, entries: [string, EventListener, AddEventListenerOptions?][]) {
  for (const [name, handler, options] of entries) target.addEventListener(name, handler, options)
  return () => { for (const [name, handler] of entries) target.removeEventListener(name, handler) }
}

type Options = { audio: Ref<HTMLAudioElement | undefined>; page: ComputedRef<string>; onFinish: (id: string) => void }
export type Narration = ReturnType<typeof useNarration>
export const narrationKey: InjectionKey<Narration> = Symbol('narration')

/** One narration session at a time, read along the episode page it belongs to. */
export function useNarration({ audio, page, onFinish }: Options) {
  const router = useRouter()
  const state = reactive({
    episodeId: '', active: false, playing: false, waiting: false, failed: false, finished: false,
    time: 0, cue: -1, follow: true, away: 0 as -1 | 0 | 1, rate: 1, autoplay: true, pick: -1, advancing: '',
  })
  const wakeLock = createWakeLock()
  let marked: Element[] = []
  let pendingSeek: number | null = null
  let savedAt = 0
  let reported = ''
  let frame = 0
  let unbind: (() => void)[] = []

  const track = computed(() => narrationFor(state.episodeId))
  const onPage = computed(() => Boolean(state.episodeId) && state.episodeId === page.value)
  // The recording belongs to this page, also while moving on to the next episode.
  const owned = computed(() => state.active && (onPage.value || state.advancing === state.episodeId))
  // Background music stays off while the recording is in use and comes back once the episode is finished.
  const holdsAudio = computed(() => owned.value && !state.finished)
  const docked = computed(() => state.active && onPage.value && !state.finished)
  const outroStart = computed(() => {
    const last = track.value?.cues.at(-1)
    return last?.[2] === 'music' ? last[0] : track.value?.duration ?? Infinity
  })
  const closing = computed(() => state.active && onPage.value && (state.finished || state.time >= outroStart.value))
  const next = computed(() => {
    const index = catalog.readingOrder.findIndex(episode => episode.id === state.episodeId)
    return index < 0 ? undefined : catalog.readingOrder[index + 1]
  })
  const nextTrack = computed(() => (next.value ? narrationFor(next.value.id) : undefined))
  const countdown = computed(() => Math.max(0, Math.ceil(((track.value?.duration ?? 0) - state.time) / state.rate)))
  const element = () => audio.value
  const loaded = () => Boolean(track.value && element()?.getAttribute('src') === withBase(track.value.src))
  const now = () => (loaded() ? element()!.currentTime : state.time)

  function applyRate() {
    const media = element()
    if (!media) return
    media.defaultPlaybackRate = state.rate
    media.playbackRate = state.rate
  }

  function moveTo(time: number) {
    const media = element()
    if (!media) return
    pendingSeek = time
    try { media.currentTime = time } catch { /* Applied once the recording's length is known. */ }
  }

  function applyPendingSeek() {
    const media = element()
    if (media && pendingSeek !== null && Math.abs(media.currentTime - pendingSeek) > 0.25) media.currentTime = pendingSeek
    pendingSeek = null
  }

  /** One element plays every episode, so the next episode may start without another tap. */
  function load(time: number) {
    const media = element()
    if (!media || !track.value) return false
    const src = withBase(track.value.src)
    if (media.getAttribute('src') !== src) {
      media.setAttribute('src', src)
      media.load()
    }
    applyRate()
    moveTo(time)
    return true
  }

  /** The lock screen shows and controls the episode only while it is being listened to. */
  function claimMedia() {
    setMediaControls(controls)
    describeEpisode(state.episodeId)
  }

  /** Lets go of the recording, so a car or earphone 'play' cannot start it again out of sight. */
  function release() {
    const media = element()
    media?.pause()
    if (media?.getAttribute('src')) {
      media.removeAttribute('src')
      media.load()
    }
    wakeLock.release()
    setMediaControls(null)
  }

  function play() {
    if (!owned.value || (!loaded() && !load(state.time))) return
    state.failed = false
    state.finished = false
    claimMedia()
    if (state.follow) bringIntoView(marked)
    element()!.play()?.catch((error: unknown) => {
      const name = error instanceof DOMException ? error.name : ''
      if (name === 'AbortError') return
      state.playing = false
      state.failed = name !== 'NotAllowedError'
    })
  }

  function mark() {
    setMark(marked, 'is-reading', false)
    const cue = track.value?.cues[state.cue]
    marked = state.active && onPage.value && !state.finished && cue ? cueElements(state.cue, cue[2]) : []
    setMark(marked, 'is-reading', true)
  }

  /** What the reader should see now: the sentence read aloud, or the next step once the closing music plays. */
  function focusElements(): Element[] {
    if (marked.length) return marked
    const card = closing.value ? document.querySelector('.narration-next') : null
    return card ? [card] : []
  }

  function setCue(index: number, force = false) {
    if (index === state.cue && !force) return
    state.cue = index
    mark()
    if (state.follow) bringIntoView(marked)
    else state.away = placement(focusElements())
  }

  function save() {
    savedAt = Date.now()
    if (!state.active || state.finished || !state.episodeId) return
    writeStorage(keys.session, JSON.stringify({ id: state.episodeId, time: Math.round(state.time * 100) / 100 }))
  }

  /** Once the closing music starts, the episode counts as heard and the next step comes into view. */
  function closeEpisode() {
    reported = state.episodeId
    onFinish(state.episodeId)
    void nextTick(() => {
      if (!onPage.value) return
      if (state.follow) showElement(document.querySelector('.narration-next'))
      else measure()
    })
  }

  function tick() {
    const current = track.value
    if (!current || !state.active || !loaded()) return
    state.time = element()!.currentTime
    setCue(cueIndexAt(current.cues, state.time))
    if (state.time >= outroStart.value && reported !== state.episodeId) closeEpisode()
    if (Date.now() - savedAt > 3000) save()
    reportPosition(current.duration, state.time, state.rate)
  }

  function begin(id: string, time: number) {
    closePick()
    Object.assign(state, { episodeId: id, active: true, finished: false, failed: false, follow: true, away: 0, time, cue: -1 })
    reported = time >= outroStart.value ? id : ''
    load(time)
  }

  function start(id: string, time = 0) {
    if (!narrationFor(id)) return
    begin(id, time)
    play()
    setCue(cueIndexAt(track.value!.cues, time), true)
    save()
  }

  /** The toolbar starts from the sentence at the top of the screen. */
  function startHere() {
    const current = narrationFor(page.value)
    if (!current) return
    const cue = firstVisibleCue()
    start(page.value, cue === null ? 0 : current.cues[cue]?.[0] ?? 0)
  }

  function toggle() {
    const media = element()
    if (media && loaded() && !media.paused) media.pause()
    else play()
  }

  function seek(time: number) {
    const current = track.value
    if (!current) return
    state.time = Math.min(Math.max(0, time), current.duration)
    state.finished = false
    if (loaded()) moveTo(state.time)
    setCue(cueIndexAt(current.cues, state.time))
    save()
  }

  function previousSentence() {
    if (!track.value) return
    state.follow = true
    seek(previousCueStart(track.value.cues, now()))
  }

  function nextSentence() {
    const target = track.value ? nextCueStart(track.value.cues, now()) : null
    if (target === null) return
    state.follow = true
    seek(target)
  }

  function playFrom(index: number) {
    const cue = track.value?.cues[index]
    if (!cue) return
    closePick()
    state.follow = true
    seek(cue[0])
    play()
  }

  function returnToCue() {
    Object.assign(state, { follow: true, away: 0 })
    mark()
    if (marked.length) bringIntoView(marked, true)
    else showElement(document.querySelector('.narration-next'))
  }

  function stop() {
    closePick()
    Object.assign(state, { active: false, playing: false, waiting: false, finished: false, advancing: '' })
    release()
    mark()
    writeStorage(keys.session, null)
  }

  function advance() {
    const following = next.value
    if (!following || !narrationFor(following.id)) return stop()
    state.advancing = following.id
    start(following.id, 0)
    void router.go(withBase(following.url))
  }

  function onEnded() {
    if (reported !== state.episodeId) closeEpisode()
    if (state.autoplay && nextTrack.value) return advance()
    Object.assign(state, { finished: true, playing: false, time: track.value?.duration ?? state.time })
    writeStorage(keys.session, null)
    mark()
    release()
  }

  function retry() {
    element()?.removeAttribute('src')
    play()
  }

  /** A recording left paused on this episode comes back paused, from the start of the same sentence. */
  function restore(id: string) {
    const current = narrationFor(id)
    const saved = savedSession()
    if (!current || (state.active && state.episodeId === id) || saved?.id !== id) return
    element()?.pause()
    const cue = cueIndexAt(current.cues, Math.min(Math.max(0, saved.time), current.duration))
    const time = cue < 0 ? 0 : current.cues[cue][0]
    Object.assign(state, { episodeId: id, active: true, finished: false, follow: true, away: 0, time, cue })
    reported = time >= outroStart.value ? id : ''
  }

  /** Called once the episode's text is on screen. */
  function attach() {
    restore(page.value)
    mark()
    if (state.playing && state.follow) bringIntoView(marked)
    else state.away = placement(focusElements())
  }

  function closePick() {
    if (state.pick < 0) return
    setMark(cueElements(state.pick), 'is-picked', false)
    state.pick = -1
  }

  /** Tapping a sentence while listening offers to play from it. */
  function choose(event: Event) {
    const target = event.target instanceof Element ? event.target : null
    if (target?.closest('.narration-pick')) return
    const cue = docked.value ? target?.closest('.story-content .cue') : null
    closePick()
    if (!cue || !window.getSelection()?.isCollapsed) return
    state.pick = Number(cue.getAttribute('data-cue'))
    setMark(cueElements(state.pick), 'is-picked', true)
  }

  function measure() {
    cancelAnimationFrame(frame)
    frame = requestAnimationFrame(() => { state.away = placement(focusElements()) })
  }

  /** Reading elsewhere pauses the page's movement until the reader comes back. */
  function leaveFollow(event: Event) {
    if (!docked.value || !state.follow) return
    if (event.target instanceof Element && event.target.closest('.narration-dock, dialog, .narration-pick')) return
    state.follow = false
    measure()
  }

  function onKey(event: Event) {
    if (!(event instanceof KeyboardEvent)) return
    if (event.key === 'Escape') return closePick()
    if (!scrollKeys.has(event.key)) return
    if (event.target instanceof Element && event.target.closest('button, a, input, textarea, select, [contenteditable="true"]')) return
    leaveFollow(event)
  }

  function setRate(value: number) {
    state.rate = value
    applyRate()
    writeStorage(keys.rate, String(value))
  }

  function setAutoplay(value: boolean) {
    state.autoplay = value
    writeStorage(keys.autoplay, value ? '1' : '0')
  }

  const controls = { play, pause: () => element()?.pause(), stop, previous: previousSentence, next: nextSentence, seek }

  // Another page takes over: marks on the old text go, and a session left behind waits paused without its audio.
  watch(page, id => {
    closePick()
    setMark(marked, 'is-reading', false)
    marked = []
    const arrived = Boolean(state.advancing) && state.advancing === id
    state.advancing = ''
    if (arrived || !state.active || state.episodeId === id) return
    if (state.finished) return stop()
    release()
  })

  onMounted(() => {
    const rate = Number(readStorage(keys.rate))
    if (narrationRates.some(option => option.value === rate)) state.rate = rate
    state.autoplay = readStorage(keys.autoplay) !== '0'
    unbind = [
      listen(element()!, [
        ['play', () => { state.playing = true; wakeLock.hold(); reportState('playing') }],
        ['playing', () => { state.playing = true; state.waiting = false }],
        ['pause', () => {
          Object.assign(state, { playing: false, waiting: false })
          wakeLock.release()
          if (owned.value) reportState('paused')
          save()
        }],
        ['waiting', () => { state.waiting = true }],
        ['canplay', () => { state.waiting = false }],
        ['timeupdate', tick],
        ['seeked', tick],
        ['loadedmetadata', applyPendingSeek],
        ['ended', onEnded],
        ['error', () => {
          if (!element()?.error) return
          Object.assign(state, { failed: true, playing: false, waiting: false })
          wakeLock.release()
        }],
      ]),
      listen(window, [
        ['wheel', leaveFollow, { passive: true }],
        ['touchmove', leaveFollow, { passive: true }],
        ['keydown', onKey],
        ['scroll', () => { if (!state.follow && docked.value) measure() }, { passive: true }],
        ['pagehide', save],
      ]),
      listen(document, [['click', choose], ['visibilitychange', wakeLock.refresh]]),
    ]
  })

  onBeforeUnmount(() => {
    for (const remove of unbind) remove()
    cancelAnimationFrame(frame)
    wakeLock.release()
    setMediaControls(null)
  })

  return {
    state, track, next, nextTrack, countdown, outroStart, docked, holdsAudio, closing,
    start, startHere, toggle, seek, previousSentence, nextSentence, playFrom, returnToCue, stop, advance, retry,
    attach, setRate, setAutoplay,
  }
}
