import { episodeId, legacyEpisodes } from './episode-ids.mjs'
export { legacyEpisodes } from './episode-ids.mjs'

export function parseEpisodeHeading(value) {
  const match = String(value).trim().match(/^(.+?)\s+\{#([a-z0-9][a-z0-9-]{0,39})\}$/u)
  if (!match) return null
  const special = match[1].match(/^(프롤로그|에필로그|외전)[.．:：—–-]\s*(.+)$/u)
  return { id: match[2], title: special ? special[2].trim() : match[1].trim(),
    kind: special ? ({ 프롤로그: 'prologue', 에필로그: 'epilogue', 외전: 'side' })[special[1]] : 'episode' }
}

/** Scan structural headings without mistaking fenced examples for episodes. */
export function parseManuscript(markdown, warn = () => {}) {
  const boundaries = []
  let offset = 0, fence = null
  for (const line of markdown.split(/(?<=\n)/)) {
    const delimiter = line.match(/^\s{0,3}(`{3,}|~{3,})/)
    if (delimiter) {
      if (!fence) fence = delimiter[1]
      else if (delimiter[1][0] === fence[0] && delimiter[1].length >= fence.length) fence = null
    } else if (!fence) {
      const heading = line.match(/^(#{1,2})\s+([^\r\n]+)/)
      if (heading) boundaries.push({ level: heading[1].length, text: heading[2].trim(), start: offset, bodyStart: offset + line.length })
      if (/^###\s/.test(line)) warn(`회차 안의 소제목은 본문에 통합하고, 시간·장소·사건이 크게 달라질 때만 장면 전환을 사용하세요: ${line.trim()}`)
    }
    offset += line.length
  }
  if (!boundaries.length || markdown.slice(0, boundaries[0].start).trim()) throw new Error('원고는 부 또는 회차 제목으로 시작해야 합니다.')
  const parts = [], episodes = [], ids = new Set()
  let part = null, number = 0, sideNumber = 0
  for (let i = 0; i < boundaries.length; i++) {
    const heading = boundaries[i]
    const content = markdown.slice(heading.bodyStart, boundaries[i+1]?.start ?? markdown.length).trim()
    if (heading.level === 1) {
      const match = heading.text.match(/^(\d+)부[.．:：—–-]\s*(.+)$/u)
      if (!match || Number(match[1]) !== parts.length + 1) throw new Error(`부 번호는 1부터 차례로 지정하세요: ${heading.text}`)
      if (content) throw new Error(`부 제목 아래에는 회차 제목을 넣으세요: ${heading.text}`)
      part = { number: Number(match[1]), title: match[2], label: `${match[1]}부 ${match[2]}` }
      parts.push(part)
      continue
    }
    const episode = parseEpisodeHeading(heading.text)
    if (!episode) throw new Error(`회차 ID가 없거나 형식이 잘못되었습니다: ${heading.text}. 음악 파일명과 같은 {#ep01} 형식의 ID를 지정하세요.`)
    if (ids.has(episode.id)) throw new Error(`회차 ID 중복: ${episode.id}`)
    if (['intro', 'life-story'].includes(episode.id) || Object.hasOwn(legacyEpisodes, episode.id)) throw new Error(`예약된 회차 ID: ${episode.id}`)
    if (episode.kind === 'episode' && !part) throw new Error(`본편 회차 앞에 부 제목을 넣으세요: ${heading.text}`)
    if (episode.kind === 'prologue' && episodes.length) throw new Error('프롤로그는 원고 맨 앞에 두세요.')
    if (episode.kind === 'episode' && episodes.some(e => ['epilogue', 'side'].includes(e.kind))) throw new Error('본편은 에필로그·외전 앞에 두세요.')
    ids.add(episode.id)
    const timeMatch = content.match(/^\*([^*\r\n]+)\*(?:\r?\n|$)/)
    if (!timeMatch || timeMatch[1].length > 40) throw new Error(`시점 줄은 첫 줄에 *때, 곳*으로 40자 이내로 적으세요: ${episode.title}`)
    const body = content.slice(timeMatch[0].length).trim()
    if (!body) throw new Error(`회차 본문이 비어 있습니다: ${episode.title}`)
    const episodeNumber = episode.kind === 'episode' ? ++number : null
    if (episode.kind === 'side') ++sideNumber
    const expectedId = episodeId(episode.kind, episodeNumber ?? sideNumber)
    if (episode.id !== expectedId) throw new Error(`회차 번호와 ID가 맞지 않습니다: ${episode.title}. 음악 파일명에 맞춰 {#${expectedId}}를 사용하세요.`)
    const label = episode.kind === 'episode' ? `${episodeNumber}화` : episode.kind === 'prologue' ? '프롤로그' : episode.kind === 'epilogue' ? '에필로그' : `외전 ${sideNumber}화`
    episodes.push({ ...episode, number: episodeNumber, label, time: timeMatch[1], part: episode.kind === 'episode' ? part : null, body })
  }
  if (!number) throw new Error('본편 회차가 없습니다.')
  for (const item of parts) if (!episodes.some(e => e.part?.number === item.number)) throw new Error(`비어 있는 부: ${item.label}`)
  if (sideNumber === 1) episodes.find(e => e.kind === 'side').label = '외전'
  return { parts, episodes }
}
