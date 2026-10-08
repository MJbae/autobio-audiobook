import { withBase } from 'vitepress'
import { catalog } from './catalog'

type Controls = { play(): void; pause(): void; stop(): void; previous(): void; next(): void; seek(time: number): void }
const actions: MediaSessionAction[] = ['play', 'pause', 'stop', 'previoustrack', 'nexttrack', 'seekto']
const supported = () => typeof navigator !== 'undefined' && 'mediaSession' in navigator

function handlerFor(action: MediaSessionAction, controls: Controls): MediaSessionActionHandler {
  if (action === 'play') return () => controls.play()
  if (action === 'pause') return () => controls.pause()
  if (action === 'stop') return () => controls.stop()
  if (action === 'previoustrack') return () => controls.previous()
  if (action === 'nexttrack') return () => controls.next()
  return details => { if (details.seekTime !== undefined) controls.seek(details.seekTime) }
}

/**
 * Lock screen and earphone buttons control the narration only while it is in use; previous and
 * next step one sentence. Without a session the system buttons go back to the background music.
 */
export function setMediaControls(controls: Controls | null) {
  if (!supported()) return
  for (const action of actions) {
    try { navigator.mediaSession.setActionHandler(action, controls ? handlerFor(action, controls) : null) } catch { /* The system keeps its default for this button. */ }
  }
  if (!controls) {
    navigator.mediaSession.metadata = null
    navigator.mediaSession.playbackState = 'none'
  }
}

/** The lock screen shows the episode with its first watercolor. */
export function describeEpisode(id: string) {
  if (!supported() || typeof MediaMetadata === 'undefined') return
  const episode = catalog.readingOrder.find(candidate => candidate.id === id)
  if (!episode) return
  const image = catalog.illustrations[id]?.find(candidate => candidate.position.start)
  navigator.mediaSession.metadata = new MediaMetadata({
    title: `${episode.label} ${episode.title}`,
    artist: catalog.work.subtitle,
    album: catalog.work.title,
    artwork: (image?.sources ?? []).map(source => ({
      src: withBase(source.src),
      sizes: `${source.width}x${Math.round(source.width * 9 / 16)}`,
      type: 'image/jpeg',
    })),
  })
}

export function reportPosition(duration: number, position: number, playbackRate: number) {
  if (!supported() || !navigator.mediaSession.setPositionState) return
  try {
    navigator.mediaSession.setPositionState({ duration, playbackRate, position: Math.min(Math.max(0, position), duration) })
  } catch { /* The position is reported again on the next update. */ }
}

export function reportState(state: MediaSessionPlaybackState) {
  if (supported()) navigator.mediaSession.playbackState = state
}

/** Keeps the screen on while the reader follows the voice; one request at a time, released when no longer wanted. */
export function createWakeLock() {
  let sentinel: WakeLockSentinel | null = null
  let pending = false
  let wanted = false
  async function acquire() {
    if (!wanted || sentinel || pending || !('wakeLock' in navigator) || document.visibilityState !== 'visible') return
    pending = true
    try {
      const lock = await navigator.wakeLock.request('screen')
      if (!wanted) return void lock.release()
      sentinel = lock
      lock.addEventListener('release', () => { if (sentinel === lock) sentinel = null })
    } catch {
      sentinel = null
    } finally {
      pending = false
    }
  }
  return {
    hold() { wanted = true; void acquire() },
    release() { wanted = false; void sentinel?.release(); sentinel = null },
    refresh() { void acquire() },
  }
}
