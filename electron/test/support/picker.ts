/**
 * Shared test instruments for the phrase layer: the index-driven picker, the enumeration that
 * recovers a bucket's whole candidate space, and the zone-checked wall-clock builder.
 *
 * Extracted from phrase-golden.test.ts when phrase-engine.test.ts needed the same three. One
 * definition on purpose -- the "exactly one draw per provider call" guard inside `enumerateAll` is
 * load-bearing for both suites, and two copies of a guard drift apart in exactly the direction that
 * makes an enumeration silently partial.
 */
import type { Picker } from "../../src/core/phrase/types.js"

export interface PickerControl {
  readonly picker: Picker
  select(index: number): void
  readonly lastLength: number
  readonly calls: number
  resetCalls(): void
}

/**
 * A picker that returns a chosen index and reports what it was offered.
 *
 * `lastLength` is the arity assertion's only source. `calls` guards the enumeration's one assumption:
 * that a single provider call draws exactly once. The port's getStructuredPhrase deliberately takes a
 * draw of its own rather than reusing getPhrase's, so "one draw per call" is a real property worth
 * pinning -- if it ever became two, enumerating by index would quietly cover only part of the space.
 */
export function indexPicker(): PickerControl {
  let index = 0
  let lastLength = 0
  let calls = 0
  return {
    picker: <T,>(items: readonly T[]): T => {
      calls++
      lastLength = items.length
      const chosen = items[index]
      if (chosen === undefined)
        throw new Error(`indexPicker: index ${index} is out of range for a ${items.length}-candidate list.`)
      return chosen
    },
    select(i: number): void {
      index = i
    },
    get lastLength(): number {
      return lastLength
    },
    get calls(): number {
      return calls
    },
    resetCalls(): void {
      calls = 0
    },
  }
}

/** Calls `call()` once per candidate the picker is offered, returning the arity and every result. */
export function enumerateAll<T>(
  ctl: PickerControl,
  call: () => T,
): { readonly arity: number; readonly values: readonly T[] } {
  ctl.select(0)
  ctl.resetCalls()
  const first = call()
  if (ctl.calls !== 1)
    throw new Error(`expected exactly one draw per provider call, saw ${ctl.calls} -- index enumeration would be partial.`)

  const arity = ctl.lastLength
  const values: T[] = [first]
  for (let i = 1; i < arity; i++) {
    ctl.select(i)
    values.push(call())
  }
  return { arity, values }
}

/**
 * Builds the Date for a wall-clock time. No provider reads anything but hour and minute, so the
 * calendar date is arbitrary -- `ymd` exists only so a suite can use the same date its C# counterpart
 * used, which keeps the two readable side by side.
 *
 * The round trip is verified rather than assumed: on a host whose zone shifted on the chosen date the
 * constructor hands back a different wall time than asked for, and every assertion downstream would
 * fail for a reason no diff shows.
 */
export function wallTime(hour: number, minute: number, ymd: readonly [number, number, number] = [2026, 0, 1]): Date {
  const dt = new Date(ymd[0], ymd[1], ymd[2], hour, minute, 0, 0)
  if (dt.getHours() !== hour || dt.getMinutes() !== minute)
    throw new Error(
      `wallTime(${hour}, ${minute}) produced ${dt.getHours()}:${dt.getMinutes()} -- this host's zone shifts on ` +
        `${ymd[0]}-${ymd[1] + 1}-${ymd[2]}; pick another date.`,
    )
  return dt
}
