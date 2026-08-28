/**
 * The phrase layer's contract, ported from FuzzyClock.Core/IPhraseProvider.cs.
 *
 * Deliberately the same three members as the C# interface, in the same order, so the port can be
 * read side by side with the original. The only additions are the ones the language forces: an
 * explicit time tuple (C# passes a whole DateTime and reads two fields off it) and an injectable
 * Picker (C# reaches for the ambient Random.Shared, which a test cannot displace).
 */

/**
 * What GetStructuredPhrase returns. C# uses a named tuple, `(string Qualifier, string Emphasis)`, and
 * the field names carry the meaning, so they are kept rather than collapsed to a pair.
 *
 * 16 of the 18 providers return `("", GetPhrase(dt))` -- an empty qualifier and the whole phrase as
 * the emphasis. Only en-classic and en-poetic split a real phrase into two parts.
 */
export interface StructuredPhrase {
  readonly qualifier: string
  readonly emphasis: string
}

export interface PhraseProvider {
  getPhrase(dt: Date): string
  getStructuredPhrase(dt: Date): StructuredPhrase

  /**
   * A stable key identifying the current time bucket.
   * Same bucket = same key. Adjacent buckets = different keys.
   * Must NOT depend on random candidate selection.
   *
   * (Verbatim from the C# doc comment, because it is the load-bearing contract in this file: it is
   * what makes an exhaustive 1440-minute oracle possible for all 18 locales, and it is the reason
   * the renderer can tell "the phrase changed" from "the phrase was redrawn".)
   */
  getSegmentKey(dt: Date): string
}

/**
 * Chooses one candidate from a non-empty list.
 *
 * THIS SEAM IS WHY ISC-13 IS CHECKABLE. C# picks with `Random.Shared.Next(candidates.Length)`, so
 * neither language can be swept for a byte-identical phrase. Injecting the choice lets a test
 * enumerate every index deterministically and recover the COMPLETE candidate set -- which is the
 * form the golden fixture is in.
 *
 * It also exposes the arity. A test that only compared sets would accept a port with a duplicated
 * sixth candidate in a five-candidate bucket; a picker sees `items.length` and would not.
 */
export type Picker = <T>(items: readonly T[]) => T

/**
 * The production picker: uniform over the list, matching `Random.Shared.Next(n)`.
 *
 * Not seeded and not required to be. The C# original is not seeded either, and nothing in the app
 * depends on reproducing a particular sequence -- only on the set of reachable phrases, which is
 * what the fixture pins.
 */
export const randomPicker: Picker = <T>(items: readonly T[]): T => {
  if (items.length === 0)
    throw new Error("randomPicker: empty candidate list -- a phrase table is missing entries.")
  return items[Math.floor(Math.random() * items.length)]!
}

/**
 * The two fields every provider reads off a DateTime. Extracted once at the top of each provider
 * call so the bucket arithmetic below is plainly the same arithmetic as the C#.
 *
 * `getHours`/`getMinutes` are local-time accessors, which is what `DateTime.Hour`/`.Minute` are for
 * the `DateTimeKind.Unspecified` values this app passes around. A clock reads wall time.
 */
export function timeOf(dt: Date): { readonly hour: number; readonly minute: number } {
  return { hour: dt.getHours(), minute: dt.getMinutes() }
}

/**
 * The C# `hour12` convention: `dt.Hour % 12`, with 0 mapped to 12. Midnight and noon are both 12.
 * Used as an index into a provider's `hourWords`, which is 1-based with an empty slot 0.
 */
export function hour12Of(hour: number): number {
  const h = hour % 12
  return h === 0 ? 12 : h
}

/** The C# `nextHour12` convention: `(hour12 % 12) + 1`. Wraps 12 to 1, never yields 0. */
export function nextHour12Of(hour12: number): number {
  return (hour12 % 12) + 1
}
