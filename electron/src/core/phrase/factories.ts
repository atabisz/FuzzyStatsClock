import type { LocaleTables } from "./tables.generated.js"
import {
  hour12Of,
  nextHour12Of,
  randomPicker,
  timeOf,
  type PhraseProvider,
  type Picker,
  type StructuredPhrase,
} from "./types.js"

/**
 * Two factories cover all 18 C# providers.
 *
 * HOW 18 FILES BECAME 2. Clustering the C# providers by the structure of their methods (every string
 * literal collapsed, then compared) gives 7 distinct shapes, not 18. Five of those seven differ only
 * in data once three things are seen as data rather than as code:
 *
 *   - A provider whose noon text is a bare literal is a provider with a one-element candidate list.
 *     Picking uniformly from one element is the identity, so the "single literal" and "five
 *     candidates" families are one implementation. (French's `return "midi"` and Pirate's five-way
 *     draw.)
 *   - A provider with one template per bucket is a provider whose every candidate list has length 1.
 *     tools/TableExport normalises `(int, string)[]` and `(int, string[])[]` to the same shape for
 *     exactly this reason, and records which was declared so determinism stays assertable.
 *   - Substituting `{ho}` is a no-op when no template contains it, so Shakespeare's extra
 *     replacement can run for every locale. It is driven by whether the locale HAS an ordinal word
 *     list, not by naming Shakespeare.
 *
 * The two that genuinely differ are en-classic and en-poetic: they are the only providers whose
 * GetStructuredPhrase does real work. The other 16 return `("", GetPhrase(dt))`, which is the
 * `"delegate"` mode below -- so 16 of them get an identity relationship the golden fixture cannot
 * express, since the fixture samples the two kinds independently and never recorded which phrase a
 * given pair came from.
 */

/** Which segment-key convention a locale follows. Both are observed in the C#, neither is a default. */
export type SegmentKeyMode =
  /** `"<locale>:<bucketIndex>"`, or `:noon` / `:midnight` at the two special minutes. 10 locales. */
  | "bucket"
  /** The phrase itself, from `GetSegmentKey(dt) => GetPhrase(dt)`. The 8 single-template locales. */
  | "phrase"

/** Whether GetStructuredPhrase does real work or forwards to GetPhrase. */
export type StructuredMode =
  /** `("", GetPhrase(dt))`. 16 of 18 providers. */
  | "delegate"
  /** Splits the chosen template at its trailing hour token. Only en-classic and en-poetic. */
  | "split"

export interface ProviderSpec {
  /** The generated tables for this locale: buckets, hour words, and any static candidate lists. */
  readonly tables: LocaleTables

  /**
   * The noon and midnight candidate lists. Reflection reaches these for en-classic and en-terse
   * only, where they are static fields; the other 16 providers hold them in method locals or as a
   * bare literal, so those are transcribed here by hand from the C# source.
   *
   * That hand-copy is deliberate rather than a gap. tools/GoldenGen harvested the same sets by
   * SAMPLING the running provider, so the fixture and this file reach the C# by two different
   * routes and have to agree. Generating both from one route would make the fixture's :noon and
   * :midnight rows a check on their own provenance.
   */
  readonly noon: readonly string[]
  readonly midnight: readonly string[]

  /**
   * The suffix after the colon at the two special minutes. Always `"noon"`, and always `"midnight"`
   * except en-poetic, which says `"witching"`. Spelled out per locale rather than derived, because a
   * lone exception that is computed is a lone exception that goes missing.
   */
  readonly noonKey: string
  readonly midnightKey: string

  readonly segmentKeyMode: SegmentKeyMode
  readonly structuredMode: StructuredMode

  /**
   * A template the structured phrase refuses to split, emitting it whole as the emphasis. en-classic
   * sets it to `"{h} o'clock"`; en-poetic has no such case, so the key is absent there rather than
   * present and empty.
   *
   * For en-classic's own value the guard is a no-op -- see getStructuredPhrase, where that is measured
   * rather than argued. It is load-bearing only for a template ending in an hour token, so this field
   * is best read as the C#'s escape hatch faithfully carried over, not as behaviour today's data needs.
   */
  readonly oClockTemplate?: string
}

/**
 * Builds a provider from its spec. The picker is bound here rather than passed per call, so a test
 * can construct a provider that always chooses index 3 and read the whole candidate space back out.
 *
 * Preconditions are checked now, not at the minute they would matter. The C# throws from GetPhrase
 * when its buckets fail to cover minute 59, and picks from an empty array at noon -- both real
 * failures that would first appear an hour or a day into a run. Nothing in the generated tables can
 * trigger either (GoldenGen walked all 1440 minutes of all 18 locales without an exception, which is
 * what proves the coverage), so these throws are a guard on a future regeneration and cannot fire on
 * today's data. Moving them to construction is the one deliberate behavioural divergence in this
 * file.
 */
export function makeProvider(spec: ProviderSpec, picker: Picker = randomPicker): PhraseProvider {
  const { tables } = spec
  const hourWords = requireWords(tables, "hourWords")
  const ordinalHourWords = tables.words["ordinalHourWords"]
  const buckets = tables.buckets

  if (hourWords.length < 13)
    throw new Error(`${tables.locale}: hourWords has ${hourWords.length} entries; indices 1..12 are addressed.`)
  if (buckets.length === 0)
    throw new Error(`${tables.locale}: no buckets.`)
  const lastBound = buckets[buckets.length - 1]!.upperBound
  if (lastBound < 59)
    throw new Error(`${tables.locale}: the last bucket ends at minute ${lastBound}, so minutes ${lastBound + 1}..59 match nothing.`)
  if (spec.noon.length === 0 || spec.midnight.length === 0)
    throw new Error(`${tables.locale}: the noon or midnight candidate list is empty.`)
  for (const bucket of buckets) {
    if (bucket.candidates.length === 0)
      throw new Error(`${tables.locale}: the bucket ending at minute ${bucket.upperBound} has no candidates.`)
  }

  /**
   * `{ho}` before `{h}` before `{h1}`, matching the C# order -- which is faithfulness, not a
   * correctness constraint, and that distinction is measured. None of the three tokens is a substring
   * of another (`{h}` closes where `{h1}` and `{ho}` continue), so no substitution can create or
   * destroy a later one's match and all six orderings agree on every input. Reversing this line is the
   * one mutation in 28 that survives the ENTIRE suite; it is a true equivalent mutant rather than a
   * gap, and the order is kept only so the two languages read alike. A token that IS a prefix of
   * another would make the order load-bearing overnight.
   */
  const resolve = (template: string, hour12: number, next12: number): string => {
    let out = template
    if (ordinalHourWords) out = out.split("{ho}").join(ordinalHourWords[hour12]!)
    return out.split("{h}").join(hourWords[hour12]!).split("{h1}").join(hourWords[next12]!)
  }

  const provider: PhraseProvider = {
    getPhrase(dt: Date): string {
      const { hour, minute } = timeOf(dt)
      const total = hour * 60 + minute
      if (total === 720) return picker(spec.noon)
      if (total === 0) return picker(spec.midnight)

      const hour12 = hour12Of(hour)
      const next12 = nextHour12Of(hour12)
      const bucket = buckets[bucketIndex(buckets, minute)]!
      return resolve(picker(bucket.candidates), hour12, next12)
    },

    getStructuredPhrase(dt: Date): StructuredPhrase {
      if (spec.structuredMode === "delegate")
        return { qualifier: "", emphasis: provider.getPhrase(dt) }

      const { hour, minute } = timeOf(dt)
      const total = hour * 60 + minute
      // A DRAW OF ITS OWN, not a reuse of getPhrase's. The C# calls Random.Shared again here, so the
      // qualifier/emphasis pair a caller sees need not come from the phrase it saw a moment ago.
      // Sharing one draw would look tidier and would be a different program.
      if (total === 720) return { qualifier: "", emphasis: picker(spec.noon) }
      if (total === 0) return { qualifier: "", emphasis: picker(spec.midnight) }

      const hour12 = hour12Of(hour)
      const next12 = nextHour12Of(hour12)
      const bucket = buckets[bucketIndex(buckets, minute)]!
      const template = picker(bucket.candidates)

      // Kept because the C# has it, and NOT because en-classic needs it. For its actual value,
      // "{h} o'clock", this branch is indistinguishable from the fallback below: the template does not
      // end with "{h}", so neither split arm would claim it, and it holds no "{h1}" for the fallback's
      // second replacement to act on. Measured, not reasoned -- disabling this line leaves all 78
      // golden assertions green. It earns its place for any oClockTemplate that DOES end in an hour
      // token, where it is the difference between ("", "half past three") and ("half past", "three"),
      // which is the case phrase-factories.test.ts pins.
      if (spec.oClockTemplate !== undefined && template === spec.oClockTemplate)
        return { qualifier: "", emphasis: resolve(template, hour12, next12) }

      // The qualifier is the template's text with its trailing token removed, so it is a template
      // fragment rather than resolved output -- "half past" and not "half past three".
      if (template.endsWith("{h}"))
        return { qualifier: template.slice(0, -"{h}".length).trimEnd(), emphasis: hourWords[hour12]! }
      if (template.endsWith("{h1}"))
        return { qualifier: template.slice(0, -"{h1}".length).trimEnd(), emphasis: hourWords[next12]! }

      // Reached only by a template with no trailing hour token. Present in the C# as a fallback, and
      // kept because whether the tables contain such a template is a property of the data, not of
      // this function.
      return { qualifier: "", emphasis: resolve(template, hour12, next12) }
    },

    getSegmentKey(dt: Date): string {
      if (spec.segmentKeyMode === "phrase") {
        // The 8 single-template locales define the key AS the phrase. Sound only because those
        // locales are deterministic: one candidate per bucket, so `picker` has no choice to make and
        // the key cannot change between two calls in the same minute. `declaredShape` records which
        // family the C# declared, and specShapeMismatches below reports a spec that pairs this mode
        // with a locale that draws at random.
        return provider.getPhrase(dt)
      }

      const { hour, minute } = timeOf(dt)
      const total = hour * 60 + minute
      if (total === 720) return `${tables.locale}:${spec.noonKey}`
      if (total === 0) return `${tables.locale}:${spec.midnightKey}`
      return `${tables.locale}:${bucketIndex(buckets, minute)}`
    },
  }

  return provider
}

/** The first bucket whose inclusive upper bound the minute reaches. */
function bucketIndex(buckets: LocaleTables["buckets"], minute: number): number {
  for (let i = 0; i < buckets.length; i++) {
    if (minute <= buckets[i]!.upperBound) return i
  }
  // Unreachable for the generated tables, whose coverage makeProvider checks at construction. The
  // message matches the C# InvalidOperationException so a stack trace from either side reads alike.
  throw new Error(`No bucket matched minute=${minute}`)
}

function requireWords(tables: LocaleTables, name: string): readonly string[] {
  const list = tables.words[name]
  if (!list)
    throw new Error(`${tables.locale}: the generated tables have no '${name}' list. Re-run tools/TableExport.`)
  return list
}

/**
 * Checks the two places where a hand-written spec could contradict the generated data, and returns
 * what it found so a test can assert on it rather than trust it.
 *
 * `"phrase"` mode is only sound for a deterministic locale, and `declaredShape` is the C#'s own word
 * on that. Today the two line up exactly -- all 8 `"template"` locales use `"phrase"` and all 10
 * `"candidates"` locales use `"bucket"` -- but that alignment is an observation about the original,
 * not a rule, which is why the mode is written out per locale and verified here instead of derived.
 */
export function specShapeMismatches(specs: readonly ProviderSpec[]): readonly string[] {
  const problems: string[] = []
  for (const spec of specs) {
    const { locale, declaredShape, buckets } = spec.tables
    const drawsAtRandom = buckets.some((b) => b.candidates.length > 1) || spec.noon.length > 1 || spec.midnight.length > 1

    if (spec.segmentKeyMode === "phrase" && drawsAtRandom)
      problems.push(`${locale}: segmentKeyMode is "phrase" but some bucket offers more than one candidate, so the key would not be stable within a minute.`)
    if (declaredShape === "template" && spec.segmentKeyMode !== "phrase")
      problems.push(`${locale}: declared shape is "template" but segmentKeyMode is "${spec.segmentKeyMode}"; the C# single-template providers all key on the phrase.`)
    if (declaredShape === "candidates" && spec.segmentKeyMode !== "bucket")
      problems.push(`${locale}: declared shape is "candidates" but segmentKeyMode is "${spec.segmentKeyMode}"; a randomly drawn phrase cannot be a stable key.`)
    if (spec.oClockTemplate !== undefined && spec.structuredMode !== "split")
      problems.push(`${locale}: an oClockTemplate is set but structuredMode is "delegate", so it can never be consulted.`)
  }
  return problems
}
