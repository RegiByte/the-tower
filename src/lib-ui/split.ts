/**
 * The tower's split, served as `/lib-ui/split.js`. Importing it defines `<tower-split>`: two panes with a grip between
 * them, one of them sized in pixels that hold as the window resizes, the other taking the rest. The drag, the keys, the
 * separator's ARIA and frames that let a drag pass over them are the SDK's `resizable`; the pixels are the element's.
 *
 * A page writes the tag with its two panes as its first and last element children, and marks it
 * `data-owned="children"`: at connect it moves the panes into the parts it builds, and they stay the page's.
 */
import type { UiResizableElement } from '@ui-sdk/web'
import './sdk.ts'
import type { ElementContract } from './sdk.ts'

/** What the element takes, fires and shows. */
export const elements = {
  'tower-split': {
    attributes: {
      orientation: '`horizontal`, the default: the panes side by side; `vertical`: stacked.',
      sized: "`first`, the default, or `last`: the pane whose size the split holds in px as it resizes; the other takes the rest.",
      size: "The sized pane's size, a CSS length: the px a viewer kept. Absent, it is `default-size`.",
      'default-size': 'Its size until a viewer drags, a CSS length (`clamp(20rem, 22vw, 28rem)`, `38vh`), resolved again as the split resizes. A double-click on the grip goes back to it.',
      min: "The sized pane's least size, a CSS length, `0px` when absent.",
      max: "Its greatest, a CSS length whose `%` is of the whole split: `calc(100% - 480px)` keeps 480px for the other pane.",
      step: 'Px an arrow key moves the grip, 24 when absent; Shift moves ten steps.',
      label: "The grip's accessible name (`sidebar width`).",
      tip: "The grip's tip, written as its `data-tip` for a page whose tips read that (the tower page's do): how to use it, since the grip draws nothing until it is pointed at.",
      disabled: "The grip is gone: the sized pane takes its content's size, the other the rest, and `size` waits for the grip's return.",
    },
    properties: {},
    events: {
      sizechange: "`detail.value`: the sized pane's size in px, on every move of a drag or a key. `preventDefault()` keeps the size it had.",
      sizecommit: "`detail.value`: the size in px once a drag or a key ends, or `null` once a double-click returned it to `default-size`. Keep it as the viewer's (`tower.store`) and write it back as `size`; forget it on `null`.",
    },
    states: {
      dragging: 'While the grip is dragged.',
    },
  },
} satisfies Record<string, ElementContract>

/** The probe that resolves a CSS length, styled inline so no rule of the page's sizes it. */
const PROBE_STYLE = 'position: absolute; top: 0; left: 0; width: 0; height: 0; margin: 0; padding: 0; border: 0; box-sizing: content-box; visibility: hidden; pointer-events: none'

/** The separator's ARIA the SDK writes for the pane before the grip, which the element writes for the sized pane. */
const ARIA_VALUES = ['aria-controls', 'aria-valuenow', 'aria-valuemin', 'aria-valuemax'] as const

const STEP_PX = 24
const LARGE_STEPS = 10

/** The changes a viewer makes; the split's own (`imperative`, `resize`) are not theirs to keep. */
const VIEWER_REASONS = new Set(['drag', 'step-key'])

type Change = CustomEvent<{ value: number[]; reason: string }>

class TowerSplit extends HTMLElement {
  static observedAttributes = ['orientation', 'sized', 'size', 'default-size', 'min', 'max', 'step', 'label', 'tip', 'disabled']
  #internals = this.attachInternals()
  #group?: UiResizableElement
  #panels: HTMLElement[] = []
  #handle?: HTMLElement
  #probe?: HTMLElement
  #held: string | null = null
  #limits = { min: 0, max: 0 }
  #frame = 0
  #observer?: ResizeObserver

  connectedCallback() {
    if (this.#group) return this.#observe()
    const panes = [...this.children]
    if (panes.length !== 2) throw new Error(`<tower-split> holds two panes, its first and last element children; it has ${panes.length}`)
    const group = document.createElement('ui-resizable') as UiResizableElement
    this.#panels = panes.map((pane) => {
      const panel = document.createElement('ui-resizable-panel')
      panel.append(pane)
      return panel
    })
    const handle = document.createElement('ui-resizable-handle')
    const probe = document.createElement('div')
    probe.setAttribute('aria-hidden', 'true')
    probe.style.cssText = PROBE_STYLE
    group.append(this.#panels[0], handle, this.#panels[1])
    this.replaceChildren(group, probe)
    this.#group = group
    this.#handle = handle
    this.#probe = probe
    this.#held = this.getAttribute('size')
    this.#sync()
    this.#panels[this.#sizedIndex()].setAttribute('default-size', `${this.#want()}px`)
    group.addEventListener('layoutchange', this.#onChange)
    group.addEventListener('layoutcommit', this.#onCommit)
    handle.addEventListener('dblclick', this.#onReset)
    new MutationObserver(() => this.#mark()).observe(group, { attributes: true, attributeFilter: ['data-dragging'] })
    new MutationObserver(() => this.#describe()).observe(handle, { attributes: true, attributeFilter: [...ARIA_VALUES] })
    this.#observe()
  }

  disconnectedCallback() {
    this.#observer?.disconnect()
    cancelAnimationFrame(this.#frame)
  }

  attributeChangedCallback(name: string, _old: string | null, value: string | null) {
    if (name === 'size') this.#held = value
    if (!this.#group) return
    this.#sync()
    this.#schedule()
  }

  /** Its own resizes hold the sized pane's px, before the frame is painted. */
  #observe() {
    this.#observer ??= new ResizeObserver(() => this.#apply())
    this.#observer.observe(this.#group!)
  }

  #schedule() {
    this.#frame ||= requestAnimationFrame(() => {
      this.#frame = 0
      this.#apply()
    })
  }

  #vertical() {
    return this.getAttribute('orientation') === 'vertical'
  }

  #sizedIndex() {
    return this.getAttribute('sized') === 'last' ? 1 : 0
  }

  /** What the attributes say of the parts: the direction, the grip's name, which pane is sized, whether it is on. */
  #sync() {
    const group = this.#group!
    group.setAttribute('orientation', this.#vertical() ? 'vertical' : 'horizontal')
    group.toggleAttribute('disabled', this.hasAttribute('disabled'))
    this.#handle!.setAttribute('aria-label', this.getAttribute('label') ?? '')
    const tip = this.getAttribute('tip')
    if (tip === null) delete this.#handle!.dataset.tip
    else this.#handle!.dataset.tip = tip
    this.#panels.forEach((panel, i) => (panel.dataset.towerSplit = i === this.#sizedIndex() ? 'sized' : 'rest'))
  }

  /** A CSS length in px along the split's axis, its `%` of the whole split. */
  #px(length: string) {
    const probe = this.#probe!
    const axis = this.#vertical() ? 'height' : 'width'
    probe.style[axis] = length
    const px = probe.getBoundingClientRect()[axis]
    probe.style[axis] = '0'
    return px
  }

  /** The space the two panes share, the grip's own left out, as the SDK counts its percent. */
  #space() {
    const axis = this.#vertical() ? 'height' : 'width'
    return this.#panels.reduce((sum, panel) => sum + panel.getBoundingClientRect()[axis], 0)
  }

  #bounds() {
    const min = this.#px(this.getAttribute('min') ?? '0px')
    return { min, max: Math.max(min, this.#px(this.getAttribute('max') ?? '100%')) }
  }

  /** The px the sized pane should have now, within its bounds. */
  #want() {
    const { min, max } = this.#bounds()
    return Math.min(max, Math.max(min, this.#px(this.#held ?? this.getAttribute('default-size') ?? '50%')))
  }

  /**
   * Lays the panes out for the split's size now, everything in percent of it as measured here: the SDK turns px into
   * percent with the size it measured last, which may be a frame old. The layout is set once the SDK has taken the new
   * bounds, which it does in a microtask.
   */
  #apply() {
    const group = this.#group!
    const space = this.#space()
    if (!space || this.hasAttribute('disabled')) return
    const percent = (px: number) => String((px / space) * 100)
    const { min, max } = this.#bounds()
    this.#limits = { min, max }
    const sized = this.#panels[this.#sizedIndex()]
    sized.setAttribute('min-size', percent(min))
    sized.setAttribute('max-size', percent(max))
    const step = Number(this.getAttribute('step') ?? STEP_PX)
    group.setAttribute('step', percent(step))
    group.setAttribute('large-step', percent(step * LARGE_STEPS))
    const share = (this.#want() / space) * 100
    queueMicrotask(() => {
      group.api.setLayout(this.#sizedIndex() === 0 ? [share, 100 - share] : [100 - share, share])
      this.#describe()
    })
  }

  /** The sized pane's px in a layout of the SDK's percent. */
  #valueOf(layout: number[]) {
    return Math.round((layout[this.#sizedIndex()] / 100) * this.#space())
  }

  #onChange = (event: Event) => {
    const { value, reason } = (event as Change).detail
    if (!VIEWER_REASONS.has(reason)) return
    const told = new CustomEvent('sizechange', { detail: { value: this.#valueOf(value) }, cancelable: true, bubbles: true })
    if (!this.dispatchEvent(told)) event.preventDefault()
  }

  #onCommit = (event: Event) => {
    const { value, reason } = (event as Change).detail
    if (!VIEWER_REASONS.has(reason)) return
    const px = this.#valueOf(value)
    this.#held = `${px}px`
    this.dispatchEvent(new CustomEvent('sizecommit', { detail: { value: px }, bubbles: true }))
  }

  #onReset = () => {
    if (this.hasAttribute('disabled')) return
    this.#held = null
    this.#apply()
    this.dispatchEvent(new CustomEvent('sizecommit', { detail: { value: null }, bubbles: true }))
  }

  /**
   * The grip says the sized pane's size in px, between its bounds, and controls it. The SDK's separator reports the pane
   * before it, in percent, so a split sized `last` would describe the other pane, its value falling as the sized one
   * grows; what the SDK writes is written over here, once it has.
   */
  #describe() {
    const handle = this.#handle!
    const sized = this.#panels[this.#sizedIndex()]
    if (!handle.hasAttribute('aria-valuenow')) return
    const values: Record<(typeof ARIA_VALUES)[number], string> = {
      'aria-controls': sized.id,
      'aria-valuenow': String(this.#valueOf(this.#group!.api.getLayout())),
      'aria-valuemin': String(Math.round(this.#limits.min)),
      'aria-valuemax': String(Math.round(this.#limits.max)),
    }
    for (const [name, value] of Object.entries(values)) if (handle.getAttribute(name) !== value) handle.setAttribute(name, value)
  }

  #mark() {
    if (this.#group!.hasAttribute('data-dragging')) this.#internals.states.add('dragging')
    else this.#internals.states.delete('dragging')
  }
}

customElements.define('tower-split', TowerSplit)
