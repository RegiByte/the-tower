/**
 * Slots: the moments a rule names, the core's time trigger (decision `extensions`). A rule (`When`) is crons in the
 * subset the tower can say in words, read in a zone, or a period aligned to the UTC clock. Policies' headers and
 * extensions' manifests both name their slots with one; the tower's 30 s loop fires each slot due, on time within
 * `ON_TIME_MS`. What every renderer and the CLI say about a rule and its slots, pure. Served as `/slots.js`.
 */
import { Cron } from 'croner'

/** How late a slot may still be started or offered: a later one is missed, and no fact records it. */
export const ON_TIME_MS = 5 * 60_000

/** Slots as crons: the union of theirs, read in `tz` (an IANA zone), else in the tower machine's zone. */
export type CronWhen = { cron: string[]; tz?: string }

/** Slots as a period, `30s`, `5m` or `2h`, aligned to the UTC clock: `5m` is each multiple of 5 minutes since the epoch. */
export type EveryWhen = { every: string }

/** A rule naming slots: crons, or a period. */
export type When = CronWhen | EveryWhen

/** Whether a rule is crons. */
export const isCron = (when: When): when is CronWhen => 'cron' in when

type Field = { t: 'any' } | { t: 'list'; values: number[] } | { t: 'step'; every: number } | { t: 'range'; from: number; to: number }
type Fields = { minute: Field; hour: Field; dom: Field; month: Field; dow: Field }
type FieldName = keyof Fields

const FIELD_NAMES: FieldName[] = ['minute', 'hour', 'dom', 'month', 'dow']
const FIELD_WORDS: Record<FieldName, string> = { minute: 'minute', hour: 'hour', dom: 'day of month', month: 'month', dow: 'day of week' }
const BOUNDS: Record<FieldName, [number, number]> = { minute: [0, 59], hour: [0, 23], dom: [1, 31], month: [1, 12], dow: [0, 7] }
/** The forms each field takes in the subset the tower can say in words. */
const FORMS: Record<FieldName, Field['t'][]> = {
  minute: ['list', 'step'],
  hour: ['any', 'list', 'range', 'step'],
  dom: ['any', 'list'],
  month: ['any', 'list'],
  dow: ['any', 'list', 'range'],
}
const FORM_WORDS: Record<FieldName, string> = {
  minute: 'a number, a list or */n',
  hour: '*, a number, a list, a-b or */n',
  dom: '*, a number or a list',
  month: '*, a number or a list',
  dow: '*, a number, a-b, a list or names (mon-fri)',
}
const MONTH_NAMES = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec']
const DOW_NAMES = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat']

const numberIn = (name: FieldName, word: string): number | undefined => {
  const named = name === 'month' ? MONTH_NAMES.indexOf(word.toLowerCase()) + 1 : name === 'dow' ? DOW_NAMES.indexOf(word.toLowerCase()) : -1
  if (named > 0 || (name === 'dow' && named === 0)) return named
  if (!/^\d+$/.test(word)) return undefined
  const n = Number(word)
  const [min, max] = BOUNDS[name]
  return n >= min && n <= max ? n : undefined
}

const fieldOf = (name: FieldName, text: string): Field | undefined => {
  if (text === '*') return { t: 'any' }
  const step = /^\*\/(\d+)$/.exec(text)
  if (step) {
    const every = Number(step[1])
    return every >= 1 && every <= BOUNDS[name][1] ? { t: 'step', every } : undefined
  }
  const range = /^(\w+)-(\w+)$/.exec(text)
  if (range) {
    const [from, to] = [numberIn(name, range[1]), numberIn(name, range[2])]
    return from !== undefined && to !== undefined && from < to ? { t: 'range', from, to } : undefined
  }
  const values = text.split(',').map((w) => numberIn(name, w))
  return values.every((v) => v !== undefined) ? { t: 'list', values: [...new Set(values)].sort((a, b) => a - b) } : undefined
}

/** A cron's fields, or why the tower can't say it in words. */
export const cronFields = (cron: string): Fields | string => {
  const words = cron.trim().split(/\s+/)
  if (words.length !== 5) return `"${cron}" has ${words.length} field${words.length === 1 ? '' : 's'}: a cron has five (minute, hour, day of month, month, day of week)`
  const fields = {} as Fields
  for (const [i, name] of FIELD_NAMES.entries()) {
    const field = fieldOf(name, words[i])
    if (name === 'minute' && field?.t === 'any') return `"${cron}": every minute is too often for a slot: name the minutes, like */30 or 0,30`
    if (!field || !FORMS[name].includes(field.t)) return `"${cron}": the ${FIELD_WORDS[name]} "${words[i]}" is not ${FORM_WORDS[name]}`
    fields[name] = field
  }
  if (fields.dom.t !== 'any' && fields.dow.t !== 'any') return `"${cron}" sets both day of month and day of week (cron runs on either, which nobody means): say it as several crons`
  return fields
}

const PERIOD = /^(\d+)(s|m|h)$/
const UNIT_MS = { s: 1000, m: 60_000, h: 3_600_000 } as const
const UNIT_WORDS = { s: 'second', m: 'minute', h: 'hour' } as const

/** Why a period isn't one: a whole number of seconds, minutes or hours, above 0. */
export const periodProblem = (every: string): string | undefined => {
  const match = PERIOD.exec(every)
  if (!match) return `"${every}" is no period: a whole number and s, m or h, like 30s, 5m or 2h`
  return Number(match[1]) === 0 ? `"${every}" is no period: it is above 0` : undefined
}

/** A period in ms. */
export const periodMs = (every: string): number => {
  const [, n, unit] = PERIOD.exec(every)!
  return Number(n) * UNIT_MS[unit as keyof typeof UNIT_MS]
}

/** A period in words: `every minute`, `every 5 minutes`. */
const periodWords = (every: string): string => {
  const [, n, unit] = PERIOD.exec(every)!
  const word = UNIT_WORDS[unit as keyof typeof UNIT_WORDS]
  return n === '1' ? `every ${word}` : `every ${n} ${word}s`
}

/** Whether a zone is one the tower's clock reads: an IANA zone, like Europe/Lisbon. */
export const isZone = (tz: string): boolean => {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz })
    return true
  } catch {
    return false
  }
}

/** Why a cron isn't one the tower can say in words, or nothing when it is. */
export const cronProblem = (cron: string): string | undefined => {
  const fields = cronFields(cron)
  return typeof fields === 'string' ? fields : undefined
}

const fieldsOf = (cron: string): Fields => cronFields(cron) as Fields

/** Every value a field takes. */
const valuesOf = (name: FieldName, field: Field): number[] => {
  const [min, max] = BOUNDS[name]
  const span = (from: number, to: number, every = 1) => Array.from({ length: Math.floor((to - from) / every) + 1 }, (_, i) => from + i * every)
  const values = field.t === 'any' ? span(min, max) : field.t === 'list' ? field.values : field.t === 'range' ? span(field.from, field.to) : span(min, max, field.every)
  return name === 'dow' ? [...new Set(values.map((v) => v % 7))].sort((a, b) => a - b) : values
}

const pad = (n: number) => String(n).padStart(2, '0')
const hm = (h: number, m: number) => `${pad(h)}:${pad(m)}`

/** `a`, `a and b`, `a, b and c`. */
export const listed = (words: string[]) => (words.length < 2 ? words.join('') : `${words.slice(0, -1).join(', ')} and ${words.at(-1)}`)

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']

const ordinal = (n: number) => `${n}${n % 10 === 1 && n !== 11 ? 'st' : n % 10 === 2 && n !== 12 ? 'nd' : n % 10 === 3 && n !== 13 ? 'rd' : 'th'}`

const daysWords = (dow: Field): string | undefined => {
  const days = valuesOf('dow', dow)
  if (days.length === 7) return undefined
  if (days.join() === '1,2,3,4,5') return 'weekdays'
  if (days.join() === '0,6') return 'weekends'
  if (dow.t === 'range') return `${DAYS[dow.from % 7]}s to ${DAYS[dow.to % 7]}s`
  return listed(days.map((d) => `${DAYS[d]}s`))
}

const monthsWords = (month: Field): string | undefined => (month.t === 'any' ? undefined : listed(valuesOf('month', month).map((m) => MONTHS[m - 1])))

/** The days of a cron, as they lead a rule (`weekdays`) and as they follow one (`on weekdays`). */
const dayWords = ({ dom, month, dow }: Fields): { lead: string; follow: string } => {
  const months = monthsWords(month)
  if (dom.t !== 'any') {
    const on = `on the ${listed(valuesOf('dom', dom).map(ordinal))} of ${months ?? 'the month'}`
    return { lead: on, follow: ` ${on}` }
  }
  const days = daysWords(dow)
  const within = months ? ` in ${months}` : ''
  return days ? { lead: `${days}${within}`, follow: ` on ${days}${within}` } : { lead: `daily${within}`, follow: within }
}

/** The times of day of a cron whose minute and hour are fixed, or nothing when it repeats. */
const timesOf = ({ minute, hour }: Fields): string[] | undefined =>
  minute.t === 'list' && hour.t === 'list' ? hour.values.flatMap((h) => minute.values.map((m) => hm(h, m))) : undefined

const minutesWords = (minutes: number[]) => (minutes.join() === '0' ? 'on the hour' : `at ${listed(minutes.map((m) => `:${pad(m)}`))}`)

/** How a cron repeats within its days: `every 2 minutes`, `hourly on the hour from 08:00 to 19:00`. */
const repeatWords = ({ minute, hour }: Fields): string => {
  const minutes = valuesOf('minute', minute)
  const hours = valuesOf('hour', hour)
  if (minute.t === 'step') {
    const every = minute.every === 1 ? 'every minute' : `every ${minute.every} minutes`
    if (hour.t === 'any') return every
    if (hour.t === 'range') return `${every} from ${hm(hour.from, 0)} to ${hm(hour.to, minutes.at(-1)!)}`
    return `${every} in the hours of ${listed(hours.map((h) => hm(h, 0)))}`
  }
  const at = minutesWords(minutes)
  if (hour.t === 'any') return `hourly ${at}`
  if (hour.t === 'range') return `hourly ${at} from ${hm(hour.from, minutes[0])} to ${hm(hour.to, minutes.at(-1)!)}`
  return `every ${(hour as { every: number }).every} hours ${at}`
}

/** The city of an IANA zone, as people say it: `America/New_York` → `New York`. */
export const zoneCity = (tz: string) => tz.split('/').at(-1)!.replace(/_/g, ' ')

/**
 * A rule in words, every cron of it, or its period (`every 5 minutes`): `weekdays at 09:30 and 15:00 (New York)`, `hourly on the hour from 08:00 to
 * 19:00 on weekdays`. Crons on the same days say their times together.
 */
export const ruleWords = (when: When): string => {
  if (!isCron(when)) return periodWords(when.every)
  const byDays = new Map<string, { lead: string; times: string[]; repeats: string[] }>()
  for (const cron of when.cron) {
    const fields = fieldsOf(cron)
    const days = dayWords(fields)
    const group = byDays.get(days.lead) ?? byDays.set(days.lead, { lead: days.lead, times: [], repeats: [] }).get(days.lead)!
    const times = timesOf(fields)
    if (times) group.times.push(...times)
    else group.repeats.push(`${repeatWords(fields)}${days.follow}`)
  }
  const rules = [...byDays.values()].flatMap(({ lead, times, repeats }) => [
    ...(times.length ? [`${lead} at ${listed([...new Set(times)].sort())}`] : []),
    ...repeats,
  ])
  return `${rules.join('; ')}${when.tz ? ` (${zoneCity(when.tz)})` : ''}`
}

/** The zone the reader's clock is in. */
const viewerZone = () => Intl.DateTimeFormat().resolvedOptions().timeZone

const formatters = new Map<string, Intl.DateTimeFormat>()
const formatterIn = (zone: string) =>
  formatters.get(zone) ??
  formatters
    .set(zone, new Intl.DateTimeFormat('en-US', { timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23', weekday: 'short' }))
    .get(zone)!

/** A moment on the wall clock of `zone`. */
const wallClock = (at: number, zone: string) => {
  const part = Object.fromEntries(formatterIn(zone).formatToParts(new Date(at)).map((p) => [p.type, p.value]))
  return { day: Date.UTC(Number(part.year), Number(part.month) - 1, Number(part.day)), year: Number(part.year), month: Number(part.month), date: Number(part.day), weekday: part.weekday, hour: Number(part.hour), minute: Number(part.minute) }
}

const DAY_MS = 86_400_000

/**
 * A slot in words, on the wall clock of its rule's zone: `today 15:00`, `tomorrow 09:30`, `Fri 17:00`, `Oct 14 09:30`,
 * and the zone's city when it isn't the reader's: `Fri 17:00 São Paulo`.
 */
export const slotWords = (at: number, tz: string | undefined, now: number): string => {
  const zone = tz ?? viewerZone()
  const slot = wallClock(at, zone)
  const today = wallClock(now, zone)
  const days = Math.round((slot.day - today.day) / DAY_MS)
  const day =
    days === 0
      ? 'today'
      : days === 1
        ? 'tomorrow'
        : days === -1
          ? 'yesterday'
          : Math.abs(days) < 7
            ? slot.weekday
            : `${MONTHS[slot.month - 1].slice(0, 3)} ${slot.date}${slot.year === today.year ? '' : ` ${slot.year}`}`
  return `${day} ${hm(slot.hour, slot.minute)}${tz && tz !== viewerZone() ? ` ${zoneCity(tz)}` : ''}`
}

const crons = new Map<string, Cron>()
const cronOf = (cron: string, tz: string | undefined) => {
  const key = `${cron}|${tz ?? ''}`
  return crons.get(key) ?? crons.set(key, new Cron(cron, { timezone: tz, paused: true })).get(key)!
}

/**
 * A cron's runs after `from` (epoch ms), up to `to`, each on its own wall clock: a local time that doesn't exist that
 * day (the spring-forward hour) is skipped, and one that happens twice runs once.
 */
const runsOf = (cron: string, tz: string | undefined, from: number, to: number): number[] => {
  const fields = fieldsOf(cron)
  const [minutes, hours] = [valuesOf('minute', fields.minute), valuesOf('hour', fields.hour)]
  const zone = tz ?? viewerZone()
  const runs: number[] = []
  let last = ''
  for (let at = cronOf(cron, tz).nextRun(new Date(from))?.getTime(); at !== undefined && at <= to; at = cronOf(cron, tz).nextRun(new Date(at))?.getTime()) {
    const wall = wallClock(at, zone)
    const key = `${wall.day} ${wall.hour}:${wall.minute}`
    if (minutes.includes(wall.minute) && hours.includes(wall.hour) && key !== last) runs.push(at)
    last = key
  }
  return runs
}

/** A rule's slots after `from` and up to `to` (epoch ms), oldest first: the union of its crons', or its period's multiples. */
export const slotsBetween = (when: When, from: number, to: number): number[] => {
  if (!isCron(when)) {
    const period = periodMs(when.every)
    const first = Math.floor(from / period) * period + period
    return Array.from({ length: Math.max(0, Math.floor((to - first) / period) + 1) }, (_, i) => first + i * period)
  }
  return [...new Set(when.cron.flatMap((cron) => runsOf(cron, when.tz, from, to)))].sort((a, b) => a - b)
}

/** How far ahead the next slot is looked for: any cron of the subset runs within a year. */
const YEAR_MS = 366 * DAY_MS

/** A rule's first slot after `at`. */
export const nextSlot = (when: When, at: number): number | undefined => {
  if (!isCron(when)) {
    const period = periodMs(when.every)
    return Math.floor(at / period) * period + period
  }
  const next = when.cron.flatMap((cron) => {
    for (let from = at; from < at + YEAR_MS; ) {
      const run = cronOf(cron, when.tz).nextRun(new Date(from))?.getTime()
      if (run === undefined) return []
      const valid = runsOf(cron, when.tz, run - 1, run)
      if (valid.length) return valid
      from = run
    }
    return []
  })
  return next.length ? Math.min(...next) : undefined
}

/** The slot due at `now`: the latest at or before it, while it is on time. */
export const onTimeSlot = (when: When, now: number): number | undefined => slotsBetween(when, now - ON_TIME_MS - 1, now).at(-1)

/** The slot of `when` due at `now`, if one is: on time, and later than `fired`, the latest slot this process fired. */
export const dueSlot = (when: When, fired: number | undefined, now: number): number | undefined => {
  const at = onTimeSlot(when, now)
  return at !== undefined && (fired === undefined || at > fired) ? at : undefined
}
