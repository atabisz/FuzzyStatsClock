/**
 * The settings window's renderer: a generic interpreter for `core/settings-form.ts`.
 *
 * This file knows about eight *kinds* of control and nothing about any individual setting. There is no
 * `if (id === "opacity")` anywhere in it, no field list, no label, no range, no gating rule — all of that
 * is data arriving on the `form` channel. Which is the point: every rule this window obeys is a rule about
 * the original WPF window, and rules that live in `core/` are covered by `bun test` on any OS, while rules
 * that live here can only be executed by a running Electron on a machine with a display.
 *
 * So the fidelity claims are tested in `test/settings-form.test.ts`, and what is left here is DOM
 * plumbing — which is why it is worth reading for the three decisions below rather than for its logic.
 *
 * ## 1. Build once, then update in place — never rebuild
 *
 * Every edit is applied live and echoes back down the `form` channel, so a rebuild-on-push design would
 * destroy and recreate the control the user is touching on every single change. That loses focus, closes an
 * open `<select>`, and interrupts a slider drag. `PopulateControls`/`RefreshControls` in the C# has the same
 * structure for the same reason: WPF also re-pushes everything and also updates controls rather than
 * recreating them.
 *
 * The build/refresh split is safe because the *set* of controls never changes — `settings-form.test.ts`
 * asserts the id union is identical for all four clock types, so only values, `enabled` and row `visible`
 * ever differ between two forms. `refresh` verifies that anyway and falls back to a rebuild if the shape
 * moved, because the alternative is a window that silently stops matching the settings.
 *
 * ## 2. The focused control is not overwritten
 *
 * Mid-drag, a slider sends an edit per `input` event. Main rounds the value (2dp for opacity, 1dp for the
 * interval, truncation for the radius), saves, and pushes the form back — so the echo can differ from what
 * the control currently shows, and writing it back mid-drag makes the thumb stutter or jump. The guard is to
 * skip the element that currently has focus, and it costs one real thing: if main *rejects* an edit, the
 * control keeps showing the rejected value until it loses focus. That is the better failure — a stutter is a
 * bug a user feels on every drag, a stale value on a rejected edit is a state the shipped window cannot
 * reach, since the renderer only offers values from the form's own tables.
 *
 * The value *label* beside a slider is updated locally on `input` as well as from the echo, so the readout
 * tracks the thumb without waiting for a round trip.
 *
 * ## 3. Which tab is open is window state, not settings
 *
 * `SettingsWindow.xaml` has no persisted tab index and neither does `AppSettings`. The active tab is held in
 * a module variable so it survives the ~35-control refresh that follows every edit; it resets when the
 * window is closed and reopened, which is what the original does.
 */

import type { FormControl, FormRow, FormTab, SettingsForm } from "../../core/settings-form.js"

interface SettingsBridge {
  onForm(callback: (form: SettingsForm) => void): void
  ready(): void
  edit(id: string, value: unknown): void
  close(): void
}

/**
 * The bridge, reached by a cast rather than a `declare global`.
 *
 * `renderer.ts` already augments `Window` with its own `fuzzyclock`, and a second global declaration of the
 * same property is a hard error — the two shapes are genuinely different, because the two windows get
 * different preloads (see `preload-settings.ts`). The cast is local to this file and says so; adding a
 * second global would be claiming that some window has both surfaces, which none does.
 */
const bridge = (window as unknown as { readonly fuzzyclock: SettingsBridge }).fuzzyclock

/**
 * An element authored in `settings.html`, or a throw.
 *
 * A miss means the HTML and this bundle have diverged. Thrown rather than guarded past: the window would
 * otherwise present as empty, which reads as "main never sent the form" and sends the next person looking
 * in the wrong place entirely.
 *
 * A function rather than three checked constants because TypeScript's narrowing does not follow a
 * module-scope `null` check into a closure, so the checked-then-used pattern would need a non-null
 * assertion at every use site inside `build` and `selectTab`.
 */
function required(id: string): HTMLElement {
  const node = document.getElementById(id)
  if (node === null) throw new Error(`settings: #${id} is missing from settings.html`)
  return node
}

const tabstrip = required("tabstrip")
const panels = required("panels")
const closeButton = required("close")

/** Which tab is showing. See decision 3 in the header. */
let activeTab = 0

/** Set per control id during `build`, replayed by `refresh`. */
let updaters = new Map<string, (control: FormControl) => void>()

/** Row elements in traversal order, for the two rows that collapse. */
let rowElements: HTMLElement[] = []

/** Tab buttons and panels, so `refresh` can leave them alone and `selectTab` can toggle them. */
let tabButtons: HTMLButtonElement[] = []
let tabPanels: HTMLElement[] = []

// ---------------------------------------------------------------------------------------------------
// Small DOM helpers
// ---------------------------------------------------------------------------------------------------

function element<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className?: string,
  text?: string,
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag)
  if (className !== undefined) node.className = className
  if (text !== undefined) node.textContent = text
  return node
}

/**
 * `IsEnabled = false` — the input half natively, the label half via a class.
 *
 * Both are needed: `disabled` on the `<input>` stops it receiving events but does nothing to the `<span>`
 * carrying its text, so a disabled checkbox would otherwise read as live. See `.disabled` in settings.css.
 */
function setEnabled(wrapper: HTMLElement, inputs: readonly HTMLInputElement[] | readonly HTMLSelectElement[] | readonly HTMLButtonElement[], enabled: boolean): void {
  wrapper.classList.toggle("disabled", !enabled)
  for (const input of inputs) input.disabled = !enabled
}

/** True when the user is interacting with this element right now. See decision 2 in the header. */
function isFocused(node: Element): boolean {
  return document.activeElement === node
}

/**
 * `#AARRGGBB` → `#rrggbb`, for `<input type="color">`, which accepts no other form.
 *
 * The alpha is dropped rather than encoded because the control cannot express it — which loses nothing,
 * since the `ColorDialog` this replaces cannot either (`dlg.Color.A` is always 255). An accent with real
 * alpha can only arrive from a hand-edited settings file, and it survives untouched unless the user
 * actually picks a new colour.
 */
function toColorInputValue(argb: string): string {
  return `#${argb.slice(3).toLowerCase()}`
}

// ---------------------------------------------------------------------------------------------------
// Control builders — one per `FormControl` kind
// ---------------------------------------------------------------------------------------------------

function buildHeading(control: Extract<FormControl, { kind: "heading" }>): HTMLElement {
  return element("div", "heading", control.text)
}

function buildNote(control: Extract<FormControl, { kind: "note" }>): HTMLElement {
  return element("div", "note", control.text)
}

function buildSwatches(control: Extract<FormControl, { kind: "swatches" }>): HTMLElement {
  const wrapper = element("div", "swatches")

  for (const preset of control.presets) {
    const ring = element("button", "swatch-ring")
    ring.type = "button"
    ring.title = preset.label
    ring.setAttribute("aria-label", preset.label)

    // SVG with a `fill` presentation attribute, not a `style` attribute — the CSP forbids the latter and
    // the overlay's dial already establishes the pattern. 28x28 with a 4px radius is the XAML's swatch.
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg")
    svg.setAttribute("width", "28")
    svg.setAttribute("height", "28")
    svg.setAttribute("class", "swatch")
    const rect = document.createElementNS("http://www.w3.org/2000/svg", "rect")
    rect.setAttribute("width", "28")
    rect.setAttribute("height", "28")
    rect.setAttribute("rx", "4")
    rect.setAttribute("fill", toColorInputValue(preset.argb))
    // The white swatch needs an outline to be visible at all on a dark ground; `#FFAAAAAA` is the XAML's.
    // Applied only where the XAML applies it rather than to every swatch, which would ring all five.
    if (preset.id === "white") {
      rect.setAttribute("stroke", "#aaaaaa")
      rect.setAttribute("stroke-width", "1")
    }
    svg.append(rect)
    ring.append(svg)
    ring.addEventListener("click", () => {
      bridge.edit("accentColor", preset.argb)
    })
    wrapper.append(ring)
  }

  // "Custom…" — `<input type="color">` in place of `ColorDialog`. `input` rather than `change` so dragging
  // in the picker previews live, which is closer to the WPF dialog's live preview than a commit-on-OK is.
  const custom = element("input", "custom-color")
  custom.type = "color"
  custom.title = "Custom colour"
  custom.setAttribute("aria-label", "Custom colour")
  custom.addEventListener("input", () => {
    bridge.edit("accentColor", custom.value)
  })
  wrapper.append(custom)

  updaters.set(control.id, (next) => {
    if (next.kind !== "swatches") return
    const rings = wrapper.querySelectorAll("button.swatch-ring")
    next.presets.forEach((preset, index) => {
      rings.item(index)?.setAttribute("aria-pressed", String(preset.id === next.activePreset))
    })
    // Skipped while the picker has focus: Chromium's colour input is a live-updating popup, and writing to
    // `.value` under it fights the user's drag.
    if (!isFocused(custom)) custom.value = toColorInputValue(next.value)
  })

  return wrapper
}

function buildSlider(control: Extract<FormControl, { kind: "slider" }>): HTMLElement {
  const wrapper = element("div", "control-group")
  const input = element("input", "slider")
  input.type = "range"
  input.id = `ctl-${control.id}`
  input.min = String(control.min)
  input.max = String(control.max)
  input.step = String(control.step)

  // 36px for the opacity readout, 42px for the other two — the XAML's own two widths, which differ because
  // "100%" is narrower than "10.0s" and "200 px".
  const readout = element("span", control.id === "opacity" ? "slider-value narrow" : "slider-value wide")

  input.addEventListener("input", () => {
    bridge.edit(control.id, input.value)
    // Locally, so the number tracks the thumb rather than the round trip. Main's echo corrects it if the
    // rounding differs — and it does differ, by design, for all three sliders.
    readout.textContent = input.value
  })

  wrapper.append(input, readout)

  updaters.set(control.id, (next) => {
    if (next.kind !== "slider") return
    setEnabled(wrapper, [input], next.enabled)
    if (!isFocused(input)) input.value = String(next.value)
    // The label is authoritative from main even while focused: it is the formatted truth (`28%`, `2.0s`,
    // `80 px`) and the local update above wrote a raw number.
    readout.textContent = next.valueLabel
  })

  return wrapper
}

function buildSegments(control: Extract<FormControl, { kind: "segments" }>): HTMLElement {
  const wrapper = element("div", "segments")
  const buttons: HTMLButtonElement[] = []

  for (const option of control.options) {
    const button = element("button", "segment", option.label)
    button.type = "button"
    button.addEventListener("click", () => {
      bridge.edit(control.id, option.value)
    })
    buttons.push(button)
    wrapper.append(button)
  }

  updaters.set(control.id, (next) => {
    if (next.kind !== "segments") return
    setEnabled(wrapper, buttons, next.enabled)
    next.options.forEach((option, index) => {
      buttons[index]?.setAttribute("aria-pressed", String(option.value === next.value))
    })
  })

  return wrapper
}

function buildSelect(control: Extract<FormControl, { kind: "select" }>): HTMLElement {
  const wrapper = element("div", "control-group")
  if (control.label !== null) wrapper.append(element("span", "inline-label", control.label))

  const select = element("select", "select")
  // `#ctl-<field>` is how settings.css gives each combo the width the XAML gives it.
  select.id = `ctl-${control.id}`
  for (const option of control.options) {
    const node = element("option", undefined, option.label)
    node.value = option.value
    select.append(node)
  }
  select.addEventListener("change", () => {
    bridge.edit(control.id, select.value)
  })
  wrapper.append(select)

  updaters.set(control.id, (next) => {
    if (next.kind !== "select") return
    setEnabled(wrapper, [select], next.enabled)
    if (!isFocused(select)) select.value = next.value
  })

  return wrapper
}

function buildCheckbox(control: Extract<FormControl, { kind: "checkbox" }>): HTMLElement {
  const label = element("label", "check")
  const input = element("input")
  input.type = "checkbox"
  input.id = `ctl-${control.id}`
  input.addEventListener("change", () => {
    bridge.edit(control.id, input.checked)
  })
  label.append(input, element("span", undefined, control.label))

  updaters.set(control.id, (next) => {
    if (next.kind !== "checkbox") return
    setEnabled(label, [input], next.enabled)
    // No focus guard: a checkbox has one bit of state and no drag, so an echo can never fight the user.
    input.checked = next.checked
  })

  return label
}

function buildRadios(control: Extract<FormControl, { kind: "radios" }>): HTMLElement {
  const wrapper = element("div", "control-group")
  const inputs: HTMLInputElement[] = []

  for (const option of control.options) {
    const label = element("label", "radio")
    const input = element("input")
    input.type = "radio"
    // A shared `name` is what makes them mutually exclusive; the field id is already unique per form.
    input.name = control.id
    input.value = option.value
    input.addEventListener("change", () => {
      bridge.edit(control.id, input.value)
    })
    label.append(input, element("span", undefined, option.label))
    inputs.push(input)
    wrapper.append(label)
  }

  updaters.set(control.id, (next) => {
    if (next.kind !== "radios") return
    setEnabled(wrapper, inputs, next.enabled)
    // `next.value === null` clears all of them, which is the C#'s behaviour for an off-ladder value.
    next.options.forEach((option, index) => {
      const input = inputs[index]
      if (input !== undefined) input.checked = option.value === next.value
    })
  })

  return wrapper
}

function buildControl(control: FormControl): HTMLElement {
  switch (control.kind) {
    case "heading":
      return buildHeading(control)
    case "note":
      return buildNote(control)
    case "swatches":
      return buildSwatches(control)
    case "slider":
      return buildSlider(control)
    case "segments":
      return buildSegments(control)
    case "select":
      return buildSelect(control)
    case "checkbox":
      return buildCheckbox(control)
    case "radios":
      return buildRadios(control)
  }
}

// ---------------------------------------------------------------------------------------------------
// Rows, tabs, and the build/refresh pair
// ---------------------------------------------------------------------------------------------------

/** The six stats-row checkboxes get the XAML's 270px/86px grid; nothing else does. */
function isStatsRowGrid(row: FormRow): boolean {
  return row.controls.some((control) => "id" in control && control.id === "cpuVisible")
}

function buildRow(row: FormRow): HTMLElement {
  const node = element("div", "row")
  node.append(element("div", "row-label", row.label ?? ""))

  // Every builder returns exactly one element and none of them returns a `row-controls` box, so they nest
  // here without unwrapping. That is why `.control-group` exists in the CSS: a slider plus its readout, or
  // a radio group, needs its own flex box to carry the `disabled` class that greys the whole group, and
  // reusing `row-controls` for it would put a box inside an identical box.
  const controls = element("div", isStatsRowGrid(row) ? "row-controls grid-86" : "row-controls")
  for (const control of row.controls) controls.append(buildControl(control))
  node.append(controls)
  return node
}

function buildTab(tab: FormTab, index: number): { button: HTMLButtonElement; panel: HTMLElement } {
  const button = element("button", "tab", tab.label)
  button.type = "button"
  button.setAttribute("role", "tab")
  button.addEventListener("click", () => {
    selectTab(index)
  })

  const panel = element("div", "panel")
  panel.setAttribute("role", "tabpanel")
  for (const row of tab.rows) {
    const node = buildRow(row)
    rowElements.push(node)
    panel.append(node)
  }

  return { button, panel }
}

function selectTab(index: number): void {
  activeTab = index
  tabButtons.forEach((button, i) => {
    button.setAttribute("aria-selected", String(i === index))
  })
  tabPanels.forEach((panel, i) => {
    panel.hidden = i !== index
  })
}

function build(form: SettingsForm): void {
  updaters = new Map()
  rowElements = []
  tabButtons = []
  tabPanels = []
  tabstrip.replaceChildren()
  panels.replaceChildren()

  form.tabs.forEach((tab, index) => {
    const { button, panel } = buildTab(tab, index)
    tabButtons.push(button)
    tabPanels.push(panel)
    tabstrip.append(button)
    panels.append(panel)
  })

  selectTab(Math.min(activeTab, tabPanels.length - 1))
}

/** Every control and row in one traversal, in the order `build` created them. */
function refresh(form: SettingsForm): void {
  const rows = form.tabs.flatMap((tab) => tab.rows)
  if (rows.length !== rowElements.length) {
    // The form's shape moved, which `settings-form.test.ts` says cannot happen for any settings change.
    // Rebuilding rather than trusting that: a wrong-shaped update would leave the window silently showing
    // stale values, and a rebuild only costs the focus of whatever was being edited.
    build(form)
  }
  rows.forEach((row, index) => {
    const node = rowElements[index]
    if (node !== undefined) node.hidden = !row.visible
    for (const control of row.controls) {
      if (!("id" in control)) continue
      updaters.get(control.id)?.(control)
    }
  })
}

// ---------------------------------------------------------------------------------------------------
// Wiring
// ---------------------------------------------------------------------------------------------------

let built = false

bridge.onForm((form) => {
  if (built) {
    refresh(form)
    return
  }
  build(form)
  refresh(form)
  built = true
})

closeButton.addEventListener("click", () => {
  bridge.close()
})

// Escape closes the window, which `ResizeMode="NoResize"` dialogs on Windows do by convention and which
// the WPF window gets for free from its chrome. Cheap to add and the first thing a keyboard user tries.
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") bridge.close()
})

// Last, after the listener above is registered. See the preload header: a push before this call is dropped
// silently, and the window would sit empty with nothing on either console.
bridge.ready()

