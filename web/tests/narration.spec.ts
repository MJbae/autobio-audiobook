import { expect, test, type Page } from '@playwright/test'
import rawCatalog from '../site/.vitepress/generated/catalog.json' with { type: 'json' }

type Track = { src: string; duration: number; cues: (number | string)[][] }
const narration = (rawCatalog as unknown as { narration: Record<string, Track> }).narration
const cueStart = (id: string, index: number) => narration[id].cues[index][0] as number
const audio = (page: Page) => page.locator('.narration-audio')
const currentTime = (page: Page) => audio(page).evaluate((media: HTMLAudioElement) => media.currentTime)
const dock = (page: Page) => page.getByRole('region', { name: '듣기 조작' })
const reading = (page: Page) => page.locator('.is-reading')

async function listening(page: Page, id: string) {
  await expect(audio(page)).toHaveAttribute('src', `/bae-memoir/record/${id}.mp3`)
  await expect.poll(() => audio(page).evaluate((media: HTMLAudioElement) => !media.paused && media.readyState >= 2)).toBe(true)
}
async function jumpTo(page: Page, seconds: number) {
  await audio(page).evaluate((media: HTMLAudioElement, at: number) => { media.currentTime = at }, seconds)
}
async function noOverflow(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
}
function quietMusic(page: Page) {
  return page.addInitScript(() => {
    if (!localStorage.getItem('family-library:music')) localStorage.setItem('family-library:music', JSON.stringify({ enabled: false }))
  })
}
async function startEpisode(page: Page, id: string) {
  await page.goto(`read/${id}.html`)
  await page.locator('.narration-start').click()
  await listening(page, id)
}

test('소리로 듣기는 제목부터 읽으며 읽는 문장을 표시하고 이전·다음 문장으로 옮긴다', async ({ page }, info) => {
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  await quietMusic(page)
  await page.goto('read/ep01.html')
  const start = page.locator('.narration-start')
  await expect(start).toContainText('소리로 듣기')
  await expect(start).toContainText('4분 · 목소리를 따라 문장이 표시돼요')
  await expect(page.locator('.reader-toolbar a, .reader-toolbar button')).toHaveCount(3)
  await expect(page.getByRole('button', { name: '지금 보이는 곳부터 듣기' })).toBeVisible()
  await start.click()
  await listening(page, 'ep01')
  await expect(page.getByRole('button', { name: '듣는 중, 지금 듣는 곳으로 이동' })).toBeVisible()
  await expect(page.locator('.article-header h1 > span')).toHaveClass(/is-reading/)
  await expect(start).toContainText('처음부터 다시 듣기')
  expect(await page.evaluate(() => navigator.mediaSession.metadata?.title)).toBe('1화 어머니의 쇠갈고리')
  await dock(page).getByRole('button', { name: '일시 정지' }).click()
  await dock(page).getByRole('button', { name: '다음 문장' }).click()
  await expect(page.locator('.article-time > span')).toHaveClass(/is-reading/)
  await dock(page).getByRole('button', { name: '다음 문장' }).click()
  await expect(page.locator('.story-content .cue[data-cue="2"]')).toHaveClass(/is-reading/)
  expect(Math.abs(await currentTime(page) - cueStart('ep01', 2))).toBeLessThan(0.3)
  await dock(page).getByRole('button', { name: '이전 문장' }).click()
  await expect(page.locator('.article-time > span')).toHaveClass(/is-reading/)
  await expect(page.locator('.story-content .is-reading')).toHaveCount(0)
  await noOverflow(page)
  await page.screenshot({ path: `test-results/reading/${info.project.name}-narration.png` })
  expect(errors).toEqual([])
})

test('듣는 동안 다른 곳을 읽으면 따라가기를 멈추고, 누른 문장부터 다시 듣는다', async ({ page }, info) => {
  // Instant scrolling keeps the page still between the voice's moves and the reader's own.
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await quietMusic(page)
  await startEpisode(page, 'ep01')
  await jumpTo(page, cueStart('ep01', 6) + 0.2)
  const sixth = page.locator('.story-content .cue[data-cue="6"]')
  await expect(sixth).toHaveClass(/is-reading/)
  await expect.poll(() => sixth.evaluate(element => {
    const rect = element.getBoundingClientRect()
    return rect.top > 0 && rect.bottom < innerHeight
  })).toBe(true)
  await page.mouse.move(100, 300)
  await page.mouse.wheel(0, 1800)
  const back = page.getByRole('button', { name: '지금 듣는 곳으로', exact: true })
  await expect(back).toBeVisible()
  const target = await page.evaluate(() => {
    const bottom = document.querySelector('.narration-dock')!.getBoundingClientRect().top - 24
    const top = document.querySelector('.reader-toolbar')!.getBoundingClientRect().bottom + 80
    for (const element of document.querySelectorAll('.story-content .cue')) {
      const line = element.getClientRects()[0]
      if (line && line.top > top && line.bottom < bottom) return { cue: Number(element.getAttribute('data-cue')), x: line.left + Math.min(20, line.width / 2), y: line.top + line.height / 2 }
    }
    return null
  })
  expect(target).not.toBeNull()
  await page.mouse.click(target!.x, target!.y)
  const offer = page.getByRole('button', { name: /^여기부터 듣기/ })
  await expect(offer).toBeVisible()
  await page.screenshot({ path: `test-results/reading/${info.project.name}-narration-pick.png` })
  await offer.click()
  await expect(page.locator(`.story-content .cue[data-cue="${target!.cue}"]`).first()).toHaveClass(/is-reading/)
  expect(Math.abs(await currentTime(page) - cueStart('ep01', target!.cue))).toBeLessThan(1)
  await expect(back).toHaveCount(0)
  await page.mouse.wheel(0, -2400)
  await expect(back).toBeVisible()
  await back.click()
  await expect(back).toHaveCount(0)
  await expect.poll(() => reading(page).first().evaluate(element => {
    const rect = element.getBoundingClientRect()
    return rect.top > 0 && rect.bottom < innerHeight
  })).toBe(true)
})

test('재생 속도와 다음 화 이어 듣기 선택을 기억하고, 그만 듣기로 조작 막대를 닫는다', async ({ page }) => {
  await quietMusic(page)
  await startEpisode(page, 'ep02')
  await dock(page).getByRole('button', { name: '재생 속도 보통, 바꾸기' }).click()
  const sheet = page.getByRole('dialog', { name: '듣기 설정' })
  await expect(sheet).toBeVisible()
  await sheet.getByRole('button', { name: '빠르게', exact: true }).click()
  await expect(sheet.getByRole('button', { name: '빠르게', exact: true })).toHaveAttribute('aria-pressed', 'true')
  expect(await audio(page).evaluate((media: HTMLAudioElement) => media.playbackRate)).toBe(1.25)
  await sheet.getByRole('switch', { name: '다음 화 이어 듣기' }).click()
  await expect(sheet.getByRole('switch', { name: '다음 화 이어 듣기' })).toHaveAttribute('aria-checked', 'false')
  await sheet.getByRole('button', { name: '설정 마치기' }).click()
  await expect(dock(page).getByRole('button', { name: '재생 속도 빠르게, 바꾸기' })).toBeVisible()
  await page.reload()
  await page.locator('.narration-start').click()
  await listening(page, 'ep02')
  expect(await audio(page).evaluate((media: HTMLAudioElement) => media.playbackRate)).toBe(1.25)
  expect(await page.evaluate(() => localStorage.getItem('family-library:narration-autoplay'))).toBe('0')
  await dock(page).getByRole('button', { name: '그만 듣기' }).click()
  await expect(page.locator('.narration-dock')).toHaveCount(0)
  expect(await audio(page).evaluate((media: HTMLAudioElement) => media.paused)).toBe(true)
  await expect(reading(page)).toHaveCount(0)
  await expect(page.getByRole('button', { name: '지금 보이는 곳부터 듣기' })).toBeVisible()
  expect(await page.evaluate(() => localStorage.getItem('family-library:narration'))).toBeNull()
  // Stopping lets go of the recording, so the lock screen or a car cannot start it again unseen.
  expect(await audio(page).getAttribute('src')).toBeNull()
  expect(await page.evaluate(() => navigator.mediaSession.metadata)).toBeNull()
})

test('끝 음악이 나오면 다음 화를 안내하고, 바로 듣기로 2화를 이어서 읽는다', async ({ page }) => {
  await quietMusic(page)
  await startEpisode(page, 'ep01')
  const outro = narration.ep01.cues.at(-1)!
  expect(outro[2]).toBe('music')
  await jumpTo(page, (outro[0] as number) + 0.5)
  const card = page.getByRole('region', { name: '다음 화 이어 듣기' })
  await expect(card).toBeVisible()
  await expect(card).toContainText('2화')
  await expect(card).toContainText('책보 대신 지게')
  await expect(card).toContainText('3분 · 1940년대 · 안면도 중장리')
  await expect(card).toContainText(/\d+초 뒤에 이어서 들려 드려요/)
  await expect(page.locator('.story-content .is-reading')).toHaveCount(0)
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('family-library:completed') || '[]'))).toContain('ep01')
  await card.getByRole('button', { name: '바로 듣기' }).click()
  await expect(page).toHaveURL(/read\/ep02\.html$/)
  await listening(page, 'ep02')
  await expect(page.locator('.narration-dock')).toBeVisible()
  await expect(page.locator('.article-header h1 > span')).toHaveClass(/is-reading/)
})

test('다른 곳을 읽는 중에 끝 음악이 나오면 지금 듣는 곳으로 버튼이 다음 화 안내로 데려간다', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await quietMusic(page)
  await startEpisode(page, 'ep01')
  await page.mouse.move(100, 300)
  await page.mouse.wheel(0, 300)
  const back = page.getByRole('button', { name: '지금 듣는 곳으로', exact: true })
  await expect(back).toBeVisible()
  await jumpTo(page, (narration.ep01.cues.at(-1)![0] as number) + 0.5)
  const card = page.getByRole('region', { name: '다음 화 이어 듣기' })
  await expect(card).toBeAttached()
  await expect(card).not.toBeInViewport()
  await expect(back).toBeVisible()
  await back.click()
  await expect(card).toBeInViewport()
  await expect(back).toHaveCount(0)
})

test('음악이 끝나면 저절로 다음 화로 넘어가고, 3화 끝에서는 준비 안내를 보여 준다', async ({ page }) => {
  test.setTimeout(60000)
  await quietMusic(page)
  await startEpisode(page, 'ep02')
  await audio(page).evaluate((media: HTMLAudioElement) => { media.currentTime = media.duration - 1.5 })
  await expect(page).toHaveURL(/read\/ep03\.html$/, { timeout: 15000 })
  await listening(page, 'ep03')
  await audio(page).evaluate((media: HTMLAudioElement) => { media.currentTime = media.duration - 1.5 })
  const card = page.locator('.narration-next')
  await expect(card).toContainText('듣기는 3화까지 준비되어 있어요', { timeout: 15000 })
  await expect(card).toContainText('4화부터는 준비되는 대로 들려 드릴게요')
  // A finished episode lets go of its recording, so nothing can restart it unseen.
  await expect.poll(() => audio(page).getAttribute('src'), { timeout: 15000 }).toBeNull()
  await expect(page.locator('.narration-dock')).toHaveCount(0)
  await expect(page).toHaveURL(/read\/ep03\.html$/)
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('family-library:completed') || '[]'))).toEqual(expect.arrayContaining(['ep02', 'ep03']))
})

test('다시 열면 멈춘 문장에서 멈춘 채로 기다렸다가 이어서 읽는다', async ({ page }) => {
  await quietMusic(page)
  await startEpisode(page, 'ep01')
  await dock(page).getByRole('button', { name: '일시 정지' }).click()
  for (let step = 0; step < 3; step++) await dock(page).getByRole('button', { name: '다음 문장' }).click()
  const third = page.locator('.story-content .cue[data-cue="3"]')
  await expect(third).toHaveClass(/is-reading/)
  await page.reload()
  await expect(page.locator('.narration-dock')).toBeVisible()
  await expect(third).toHaveClass(/is-reading/)
  await expect(page.getByRole('button', { name: '잠시 멈춤, 지금 듣는 곳으로 이동' })).toBeVisible()
  expect(await audio(page).evaluate((media: HTMLAudioElement) => media.paused)).toBe(true)
  await dock(page).getByRole('button', { name: '재생', exact: true }).click()
  await listening(page, 'ep01')
  expect(Math.abs(await currentTime(page) - cueStart('ep01', 3))).toBeLessThan(1.5)
  expect(await page.evaluate(() => navigator.mediaSession.metadata?.title)).toBe('1화 어머니의 쇠갈고리')
})

test('키보드로 듣기를 시작하고 그만 들어도 초점을 잃지 않는다', async ({ page }) => {
  await quietMusic(page)
  await page.goto('read/ep01.html')
  const tool = page.locator('.narration-tool')
  await tool.focus()
  await page.keyboard.press('Enter')
  await listening(page, 'ep01')
  await expect(tool).toBeFocused()
  await expect(tool).toHaveAccessibleName('듣는 중, 지금 듣는 곳으로 이동')
  await dock(page).getByRole('button', { name: '그만 듣기' }).focus()
  await page.keyboard.press('Enter')
  await expect(page.locator('.narration-dock')).toHaveCount(0)
  await expect(tool).toBeFocused()
  await expect(tool).toHaveAccessibleName('지금 보이는 곳부터 듣기')
})

test('듣는 동안 배경음악을 멈추고, 그만 들으면 배경음악을 다시 튼다', async ({ page }) => {
  const music = page.locator('.background-audio')
  const musicPlaying = () => music.evaluate((media: HTMLAudioElement) => !media.paused)
  await page.goto('read/ep01.html')
  await page.getByRole('button', { name: '설정', exact: true }).click()
  await expect.poll(async () => await musicPlaying() || await page.locator('.music-retry').isVisible()).toBeTruthy()
  if (await page.locator('.music-retry').isVisible()) await page.locator('.music-retry').click()
  await expect.poll(musicPlaying).toBe(true)
  await page.keyboard.press('Escape')
  await page.locator('.narration-start').click()
  await listening(page, 'ep01')
  await expect.poll(musicPlaying).toBe(false)
  await page.getByRole('button', { name: '설정', exact: true }).click()
  await expect(page.locator('#music-setting-status')).toHaveText('듣는 동안 꺼짐')
  await page.keyboard.press('Escape')
  await dock(page).getByRole('button', { name: '그만 듣기' }).click()
  await expect.poll(musicPlaying).toBe(true)
})

test('녹음된 마지막 회차를 끝까지 들으면 배경음악을 다시 튼다', async ({ page }) => {
  test.setTimeout(45000)
  const music = page.locator('.background-audio')
  const musicPlaying = () => music.evaluate((media: HTMLAudioElement) => !media.paused)
  await page.goto('read/ep03.html')
  await page.getByRole('button', { name: '설정', exact: true }).click()
  await expect.poll(async () => await musicPlaying() || await page.locator('.music-retry').isVisible()).toBeTruthy()
  if (await page.locator('.music-retry').isVisible()) await page.locator('.music-retry').click()
  await expect.poll(musicPlaying).toBe(true)
  await page.keyboard.press('Escape')
  await page.locator('.narration-start').click()
  await listening(page, 'ep03')
  await expect.poll(musicPlaying).toBe(false)
  await audio(page).evaluate((media: HTMLAudioElement) => { media.currentTime = media.duration - 1 })
  await expect(page.locator('.narration-next')).toContainText('듣기는 3화까지 준비되어 있어요', { timeout: 15000 })
  await expect.poll(musicPlaying, { timeout: 15000 }).toBe(true)
  await expect(page.locator('.narration-dock')).toHaveCount(0)
})

test('녹음이 없는 회차는 준비 중 안내만 보이고 듣기 버튼이 없다', async ({ page }) => {
  await page.goto('read/ep04.html')
  await expect(page.locator('.narration-soon')).toHaveText('소리로 듣기는 준비 중이에요')
  await expect(page.locator('.narration-start')).toHaveCount(0)
  await expect(page.locator('.reader-toolbar a, .reader-toolbar button')).toHaveCount(2)
})

test('아주 큰 글씨에서도 조작 막대가 화면을 넘지 않고 누르기 쉽다', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('family-library:font', '3'))
  await quietMusic(page)
  await startEpisode(page, 'ep01')
  await noOverflow(page)
  const sizes = await dock(page).locator('.narration-controls button').evaluateAll(buttons => buttons.map(button => {
    const rect = button.getBoundingClientRect()
    return { width: rect.width, height: rect.height }
  }))
  expect(sizes).toHaveLength(5)
  for (const size of sizes) {
    expect(size.height).toBeGreaterThanOrEqual(44)
    expect(size.width).toBeGreaterThanOrEqual(44)
  }
})
