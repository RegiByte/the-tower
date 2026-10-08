/**
 * Cozy lo-fi, played live by WebAudio: electric piano chords, a round bass, swung drums, a sparse pentatonic melody,
 * vinyl crackle and a slow tape wobble. No recordings: `band` builds the instruments on any audio context and plays
 * one sixteenth at a time, and the engine below schedules it just ahead of the clock. Its beat is the one the roof
 * party dances to; up there the drums go four-on-the-floor and the filter opens.
 */

export const BPM = 78
const SIXTEENTH = 60 / BPM / 4
/** How late the off-sixteenths land, as a share of a sixteenth: the lazy swing. */
const SWING = 0.3
const VOLUME = 0.4
const DUCKED = 0.35

export type Room = 'inside' | 'roof'

type Chord = { bass: number; notes: number[] }

/** Two four-bar progressions in C, rootless voicings, a bar per chord. */
const PROGRESSIONS: Chord[][] = [
  [
    { bass: 38, notes: [53, 57, 60, 64] },
    { bass: 43, notes: [53, 59, 64, 69] },
    { bass: 36, notes: [52, 55, 59, 62] },
    { bass: 45, notes: [55, 59, 60, 64] },
  ],
  [
    { bass: 41, notes: [52, 57, 60, 64] },
    { bass: 40, notes: [55, 59, 62, 67] },
    { bass: 38, notes: [53, 57, 60, 65] },
    { bass: 36, notes: [52, 55, 59, 64] },
  ],
]
const PENTATONIC = [72, 74, 76, 79, 81, 84]

const hz = (midi: number) => 440 * 2 ** ((midi - 69) / 12)

function noiseBuffer(ctx: BaseAudioContext, seconds: number) {
  const buffer = ctx.createBuffer(1, ctx.sampleRate * seconds, ctx.sampleRate)
  const data = buffer.getChannelData(0)
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1
  return buffer
}

/** A loop of record noise: a low hiss under sparse pops. */
function vinylBuffer(ctx: BaseAudioContext) {
  const buffer = ctx.createBuffer(1, ctx.sampleRate * 6, ctx.sampleRate)
  const data = buffer.getChannelData(0)
  let hiss = 0
  for (let i = 0; i < data.length; i++) {
    hiss = hiss * 0.97 + (Math.random() * 2 - 1) * 0.03
    data[i] = hiss * 0.5
  }
  for (let n = 0; n < 70; n++) {
    const at = Math.floor(Math.random() * (data.length - 40))
    const amp = (Math.random() ** 3) * 0.9
    for (let k = 0; k < 30; k++) data[at + k] += amp * (Math.random() * 2 - 1) * Math.exp(-k / 6)
  }
  return buffer
}

/** A small room's reverb: stereo noise dying away. */
function impulse(ctx: BaseAudioContext, seconds: number) {
  const buffer = ctx.createBuffer(2, ctx.sampleRate * seconds, ctx.sampleRate)
  for (let c = 0; c < 2; c++) {
    const data = buffer.getChannelData(c)
    for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / data.length) ** 3
  }
  return buffer
}

/** Rises from zero to `peak` and falls away exponentially by `end`. */
function envelope(param: AudioParam, at: number, peak: number, attack: number, end: number) {
  param.setValueAtTime(0, at)
  param.linearRampToValueAtTime(peak, at + attack)
  param.exponentialRampToValueAtTime(0.0001, end)
}

/** The instruments, wired into `out`, and what they play on each sixteenth. */
export function band(ctx: BaseAudioContext, out: AudioNode) {
  const tone = ctx.createBiquadFilter()
  tone.type = 'lowpass'
  tone.frequency.value = 2400
  tone.Q.value = 0.4
  const glue = ctx.createDynamicsCompressor()
  glue.threshold.value = -18
  glue.ratio.value = 3
  tone.connect(glue).connect(out)

  const reverb = ctx.createConvolver()
  reverb.buffer = impulse(ctx, 2.4)
  const send = ctx.createGain()
  send.gain.value = 0.35
  send.connect(reverb).connect(tone)

  const keys = ctx.createGain()
  keys.connect(tone)
  keys.connect(send)
  const tremolo = ctx.createOscillator()
  tremolo.frequency.value = 3.2
  const tremoloDepth = ctx.createGain()
  tremoloDepth.gain.value = 0.12
  tremolo.connect(tremoloDepth).connect(keys.gain)
  const wobble = ctx.createOscillator()
  wobble.frequency.value = 0.35
  const wobbleDepth = ctx.createGain()
  wobbleDepth.gain.value = 9
  wobble.connect(wobbleDepth)

  const noise = noiseBuffer(ctx, 1)
  const vinyl = ctx.createBufferSource()
  vinyl.buffer = vinylBuffer(ctx)
  vinyl.loop = true
  const vinylLevel = ctx.createGain()
  vinylLevel.gain.value = 0.05
  vinyl.connect(vinylLevel).connect(glue)
  for (const source of [tremolo, wobble, vinyl]) source.start()

  /** A Rhodes-ish note: a sine body, a bright tine that fades fast, a little triangle bark. */
  function piano(at: number, midi: number, velocity: number, length: number) {
    const f = hz(midi)
    const voice = ctx.createGain()
    voice.connect(keys)
    voice.gain.setValueAtTime(0, at)
    voice.gain.linearRampToValueAtTime(velocity, at + 0.012)
    voice.gain.setTargetAtTime(velocity * 0.35, at + 0.012, 0.5)
    voice.gain.setTargetAtTime(0, at + length, 0.25)
    const partials: [OscillatorType, number, number, number][] = [['sine', 1, 1, length + 1.5], ['triangle', 1, 0.12, length + 1.5], ['sine', 4, 0.22, 0.25]]
    for (const [type, ratio, level, ring] of partials) {
      const osc = ctx.createOscillator()
      osc.type = type
      osc.frequency.value = f * ratio
      wobbleDepth.connect(osc.detune)
      const g = ctx.createGain()
      envelope(g.gain, at, level, 0.005, at + ring)
      osc.connect(g).connect(voice)
      osc.start(at)
      osc.stop(at + length + 1.6)
    }
  }

  function bass(at: number, midi: number, length: number) {
    const osc = ctx.createOscillator()
    osc.frequency.value = hz(midi)
    const g = ctx.createGain()
    g.gain.setValueAtTime(0, at)
    g.gain.linearRampToValueAtTime(0.42, at + 0.02)
    g.gain.setTargetAtTime(0.25, at + 0.02, 0.3)
    g.gain.setTargetAtTime(0, at + length, 0.08)
    osc.connect(g).connect(tone)
    osc.start(at)
    osc.stop(at + length + 0.5)
  }

  function kick(at: number, velocity: number) {
    const osc = ctx.createOscillator()
    osc.frequency.setValueAtTime(115, at)
    osc.frequency.exponentialRampToValueAtTime(42, at + 0.14)
    const g = ctx.createGain()
    envelope(g.gain, at, velocity, 0.004, at + 0.38)
    osc.connect(g).connect(tone)
    osc.start(at)
    osc.stop(at + 0.4)
  }

  function hiss(at: number, velocity: number, filter: BiquadFilterType, freq: number, decay: number) {
    const src = ctx.createBufferSource()
    src.buffer = noise
    const f = ctx.createBiquadFilter()
    f.type = filter
    f.frequency.value = freq
    const g = ctx.createGain()
    envelope(g.gain, at, velocity, 0.002, at + decay)
    src.connect(f).connect(g).connect(tone)
    src.start(at, Math.random() * 0.5)
    src.stop(at + decay + 0.05)
  }

  const snare = (at: number, velocity: number) => {
    hiss(at, velocity, 'bandpass', 1700, 0.2)
    const body = ctx.createOscillator()
    body.frequency.value = 185
    const g = ctx.createGain()
    envelope(g.gain, at, velocity * 0.5, 0.002, at + 0.09)
    body.connect(g).connect(tone)
    body.start(at)
    body.stop(at + 0.1)
  }

  let melody = 2

  /** Plays sixteenth `step` (counted from the start) at `at`. */
  function play(step: number, at: number, room: Room) {
    const inBar = step % 16
    const bar = Math.floor(step / 16)
    const chord = PROGRESSIONS[Math.floor(bar / 8) % PROGRESSIONS.length][bar % 4]
    const beat = SIXTEENTH * 4
    const roof = room === 'roof'

    if (inBar === 0) {
      chord.notes.forEach((n, i) => piano(at + i * 0.018 + Math.random() * 0.01, n, 0.11, beat * 2.6))
      bass(at, chord.bass, beat * 1.6)
    }
    if (inBar === 10) {
      if (Math.random() < 0.55) chord.notes.slice(1).forEach((n, i) => piano(at + i * 0.015, n, 0.06, beat * 1.2))
      if (Math.random() < 0.7) bass(at, chord.bass + (Math.random() < 0.5 ? 7 : 12), beat * 0.9)
    }
    if (inBar === 14 && Math.random() < 0.3) bass(at, chord.bass + 10, beat * 0.4)

    const kicks = roof ? [0, 4, 8, 12] : [0, 7, 10]
    if (kicks.includes(inBar) && (inBar !== 7 || Math.random() < 0.4)) kick(at, roof ? 0.7 : 0.62)
    if (inBar === 4 || inBar === 12) snare(at, roof ? 0.22 : 0.17)
    if (inBar % 2 === 0) hiss(at, 0.035 + Math.random() * 0.02, 'highpass', 7500, 0.05)
    else if (Math.random() < 0.35) hiss(at, 0.015, 'highpass', 8000, 0.03)
    if (roof && inBar % 4 === 2) hiss(at, 0.03, 'highpass', 6500, 0.22)

    if (inBar % 2 === 0 && Math.random() < (roof ? 0.3 : 0.2)) {
      melody = Math.max(0, Math.min(PENTATONIC.length - 1, melody + Math.round((Math.random() - 0.5) * 3)))
      piano(at, PENTATONIC[melody], 0.07, beat * (Math.random() < 0.5 ? 0.5 : 1))
    }
  }

  return { play, tone }
}

/** How open the band's tone is in a room. */
export const toneOf = (room: Room) => (room === 'roof' ? 7000 : 2400)

/** When sixteenth `step` lands, from the song's start: the off-sixteenths a little late. */
export const stepTime = (start: number, step: number) => start + step * SIXTEENTH + (step % 2 ? SWING * SIXTEENTH : 0)

/** The music playing in this page: one, made on the first play, suspended while muted. */
type Engine = { ctx: AudioContext; level: GainNode; tone: BiquadFilterNode; start: number; step: number }
let engine: Engine | undefined
let room: Room = 'inside'
let ducked = false

function boot(): Engine {
  const ctx = new AudioContext()
  const level = ctx.createGain()
  level.gain.value = VOLUME * (ducked ? DUCKED : 1)
  level.connect(ctx.destination)
  const { play: playStep, tone } = band(ctx, level)
  tone.frequency.value = toneOf(room)
  const e: Engine = { ctx, level, tone, start: ctx.currentTime + 0.1, step: 0 }
  setInterval(() => {
    if (ctx.state !== 'running') return
    const now = ctx.currentTime
    if (stepTime(e.start, e.step) < now) e.step = Math.ceil((now - e.start) / SIXTEENTH)
    for (; stepTime(e.start, e.step) < now + 0.2; e.step++) playStep(e.step, stepTime(e.start, e.step), room)
  }, 25)
  return e
}

/** Starts or resumes the music: call it from a click or a key, or the browser keeps it silent. */
export function play() {
  engine ??= boot()
  return engine.ctx.resume()
}

export const pause = () => engine?.ctx.suspend()

export const playing = () => engine?.ctx.state === 'running'

/** Where you are: the roof's music is the party's. */
export function setRoom(next: Room) {
  if (next === room) return
  room = next
  engine?.tone.frequency.setTargetAtTime(toneOf(room), engine.ctx.currentTime, 0.8)
}

/** Softer while you're talking to a worker. */
export function duck(on: boolean) {
  if (on === ducked) return
  ducked = on
  engine?.level.gain.setTargetAtTime(VOLUME * (on ? DUCKED : 1), engine.ctx.currentTime, 0.4)
}

/** The music's beat, counted from its start (zero until it starts); the wall clock's at its tempo while it's quiet. */
export const beatAt = (seconds: number) => (playing() ? Math.max(0, engine!.ctx.currentTime - engine!.start) * (BPM / 60) : seconds * (BPM / 60))
