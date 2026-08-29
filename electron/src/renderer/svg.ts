/**
 * The renderer's only DOM vocabulary: create an SVG element, write an attribute, write text.
 *
 * ## Why every write goes through a memo
 *
 * The clock repaints every second and the stats arrive every second, but almost nothing changes between
 * frames -- one colon, two hand transforms, five bar widths. Writing an attribute that already holds the
 * value it is being given still dirties the element for the compositor, and this window is transparent and
 * always-on-top, which is the configuration where a needless repaint is most expensive. So `setAttr` and
 * `setText` compare first and return early, and the faces can be written as "assign everything, every
 * tick" without that being what actually happens.
 *
 * The memo is per element and per attribute name, in a `WeakMap`, so a rebuilt face's discarded elements
 * are collectable and a rebuild cannot leave a stale entry pointing at a detached node.
 *
 * ## No top-level DOM access anywhere in this directory
 *
 * Bun has no DOM. It can still import this file -- and `theme.ts` and every `faces/*.ts` -- for the pure
 * tables they export, provided nothing touches `document` until a function is called. That rule is why
 * `renderer.ts` is the only module here with an `init()` at the bottom, and why no test imports it.
 */

export const SVG_NS = "http://www.w3.org/2000/svg"

/** What an attribute may be given as. Numbers are stringified by `String`, never by `toFixed`. */
export type AttrValue = string | number

const writtenAttrs = new WeakMap<Element, Map<string, string>>()
const writtenText = new WeakMap<Element, string>()

/**
 * Write an attribute, skipping the write when the element already has that value.
 *
 * Returns whether the DOM was actually touched. In-process that is what `renderer.ts` reads off `setText`
 * to decide whether the date needs re-measuring, and what `test/theme.test.ts` asserts on through
 * `applyTheme`'s write count -- there is no direct test of this function, because a caller's count IS the
 * observation.
 *
 * It is NOT how the steady-state claim is proven: nothing from this module is reachable from outside the
 * renderer -- the bundle exports to no global and CDP cannot see a closure. So `probe-display.ts` measures
 * the *effect* instead, hashing the visible face's `outerHTML` across a sample window and requiring
 * exactly one distinct state from the three faces that update slower than 1 Hz (its arm D9).
 */
export function setAttr(element: Element, name: string, value: AttrValue): boolean {
  const next = typeof value === "number" ? String(value) : value
  let attrs = writtenAttrs.get(element)
  if (attrs === undefined) {
    attrs = new Map()
    writtenAttrs.set(element, attrs)
  }
  if (attrs.get(name) === next) return false
  attrs.set(name, next)
  element.setAttribute(name, next)
  return true
}

/** Write `textContent`, skipping the write when it already matches. */
export function setText(element: Element, value: string): boolean {
  if (writtenText.get(element) === value) return false
  writtenText.set(element, value)
  element.textContent = value
  return true
}

/** Create an SVG element with attributes, in the SVG namespace. */
export function svgEl<K extends keyof SVGElementTagNameMap>(
  tag: K,
  attrs: Readonly<Record<string, AttrValue>> = {},
): SVGElementTagNameMap[K] {
  const element = document.createElementNS(SVG_NS, tag)
  for (const [name, value] of Object.entries(attrs)) {
    // Straight to `setAttribute`: a freshly created element has no prior value, so going through the memo
    // would only populate it with what the caller is about to be handed.
    element.setAttribute(name, typeof value === "number" ? String(value) : value)
  }
  return element
}

/**
 * Look an element up by id, throwing when it is missing.
 *
 * Throwing rather than returning null on purpose. A missing id means `index.html` and the renderer have
 * drifted, and the failure a caller would otherwise produce is a silently blank face -- indistinguishable
 * from "the clock has not ticked yet". `renderer-ids.test.ts` makes the drift a test failure instead, but
 * this is the runtime backstop, and the id is in the message.
 */
export function element<T extends Element>(id: string): T {
  const found = document.getElementById(id)
  if (found === null) throw new Error(`missing element #${id}`)
  return found as unknown as T
}

/** Replace an element's children, and forget any memo entries the old ones held. */
export function replaceChildren(parent: Element, children: readonly Element[]): void {
  // `writtenAttrs`/`writtenText` are WeakMaps keyed on the nodes themselves, so dropping the nodes drops
  // the entries. Nothing to clean up -- which is the reason they are WeakMaps and not id-keyed Maps.
  parent.replaceChildren(...children)
}

/** Show or hide an element with `display`, the way WPF's `Collapsed` takes an element out of layout. */
export function setVisible(element: SVGElement | HTMLElement, visible: boolean): boolean {
  // An SVG element with `display: none` contributes nothing to its parent's bounding box, which is the
  // closest equivalent to `Visibility.Collapsed`. `visibility: hidden` would be `Visibility.Hidden` --
  // the one the C# deliberately does not use for these, because it keeps the space.
  return setAttr(element, "display", visible ? "inline" : "none")
}
