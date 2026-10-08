import type { CueKind } from '../../shared/narration-cues.mjs'

/** Elements a cue reads aloud: a sentence's spans, or the title and dateline above the story. */
export function cueElements(index: number, kind?: CueKind): Element[] {
  const selector = kind === 'title' ? '.article-header h1 > span'
    : kind === 'dateline' ? '.article-time > span'
    : kind ? '' : `.story-content .cue[data-cue="${index}"]`
  return selector ? [...document.querySelectorAll(selector)] : []
}

/** The part of the screen between the sticky toolbar and the listening controls. */
export function readingBand() {
  const top = document.querySelector('.reader-toolbar')?.getBoundingClientRect().bottom ?? 0
  const dock = document.querySelector('.narration-dock')?.getBoundingClientRect().top ?? window.innerHeight
  return { top, bottom: Math.min(window.innerHeight, dock) }
}

/** -1 when the elements sit above the reading band, 1 below it, 0 while in view. */
export function placement(elements: readonly Element[]): -1 | 0 | 1 {
  if (!elements.length) return 0
  const band = readingBand()
  if (elements.at(-1)!.getBoundingClientRect().bottom < band.top + 4) return -1
  if (elements[0].getBoundingClientRect().top > band.bottom - 4) return 1
  return 0
}

function smooth(): ScrollBehavior {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth'
}

/** Keeps the sentence in the upper part of the band, scrolling only once it leaves the comfortable middle. */
export function bringIntoView(elements: readonly Element[], force = false) {
  if (!elements.length) return
  const first = elements[0].getBoundingClientRect()
  const last = elements.at(-1)!.getBoundingClientRect()
  const band = readingBand()
  const room = band.bottom - band.top
  if (!force && first.top >= band.top + room * 0.08 && last.bottom <= band.top + room * 0.72) return
  window.scrollTo({ top: Math.max(0, window.scrollY + first.top - band.top - room * 0.28), behavior: smooth() })
}

export function showElement(element: Element | null) {
  element?.scrollIntoView({ block: 'center', behavior: smooth() })
}

/** The sentence at the top of the screen, or null while the episode header is still in view. */
export function firstVisibleCue(): number | null {
  const band = readingBand()
  const header = document.querySelector('.article-header')?.getBoundingClientRect()
  if (header && header.bottom > band.top) return null
  for (const element of document.querySelectorAll('.story-content .cue')) {
    if (element.getBoundingClientRect().bottom > band.top + 8) return Number(element.getAttribute('data-cue'))
  }
  return null
}

export function setMark(elements: readonly Element[], name: string, on: boolean) {
  for (const element of elements) element.classList.toggle(name, on)
}
