/**
 * Two-line phrase wrapping, ported from FuzzyClock.Core/PhraseWrapService.cs.
 *
 * `"natural"` splits at a grammatical pause ("half past" / "eleven"); anything else splits at the word
 * boundary nearest the string's midpoint. `allowNatural` is the caller's veto, passed false for
 * non-English locales where the English marker list would land mid-clause.
 *
 * The C# returns `(string Line1, string Line2)?`, a nullable value tuple, which becomes
 * `PhraseSplit | null` here. Same three-way contract: a split, or null for a phrase that cannot be
 * split at all (empty, whitespace, or one word).
 *
 * **Case-insensitive marker matching is done length-preservingly, and that is deliberate.** The C#
 * matches with `StringComparison.OrdinalIgnoreCase` and then slices the ORIGINAL phrase by
 * `marker.Length`, which is only sound because ordinal case-insensitivity cannot change a string's
 * length. `phrase.toLowerCase().startsWith(marker)` would break that: 'İ' (U+0130) lowercases to two
 * code units in JS, so a matched prefix and the slice length would disagree. Comparing
 * `phrase.slice(0, marker.length).toLowerCase()` instead keeps the index arithmetic on the original
 * string, and for the ASCII markers here it agrees with .NET's ordinal folding on the cases where the
 * two could differ at all ('ß' matches "ss" in neither).
 *
 * Every expectation in the test file was measured against the compiled C#, including two branches the
 * C# suite never reaches: a phrase that IS a marker plus nothing ("half past " -> the blank second
 * line is rejected and the midpoint fallback runs), and two word boundaries equidistant from the
 * midpoint (the earlier one wins, because the comparison is strictly less-than).
 */

/**
 * Grammatical pause markers, each with its trailing space, **longest first**. The order is the
 * algorithm: "just after quarter past " has to be tested before "just after ", or the longer phrase
 * splits after two words. Every marker ends in a single space, and the character before it is always
 * a letter -- which is what makes the `trimEnd()` below a no-op in practice.
 */
const NATURAL_PAUSE_MARKERS: readonly string[] = [
  "just after quarter past ",
  "almost a quarter before ",
  "just past half past ",
  "a quarter before ",
  "a quarter past ",
  "almost half past ",
  "just after ",
  "half past ",
  "just past ",
  "ten past ",
  "ten to ",
  "nearly ",
  "almost ",
]

/** The two display lines. */
export interface PhraseSplit {
  readonly line1: string
  readonly line2: string
}

/**
 * `PhraseWrapService.ComputeSplit`.
 *
 * @param phrase the phrase to split
 * @param style `"natural"` uses the pause markers; any other value uses the midpoint
 * @param allowNatural when false, forces midpoint whatever the style says
 */
export function computeSplit(
  phrase: string | null | undefined,
  style: string,
  allowNatural = true,
): PhraseSplit | null {
  if (phrase === null || phrase === undefined) return null
  if (phrase.trim().length === 0) return null

  // Split the phrase AS GIVEN, not trimmed -- `IsNullOrWhiteSpace` above only tests, it does not
  // rewrite. A leading space therefore becomes an empty first word and survives into line1
  // (" half past eleven" -> " half" / "past eleven", measured). Same for a doubled space, which also
  // defeats the marker match: "half  past eleven" -> "half " / "past eleven".
  const words = phrase.split(" ")
  if (words.length < 2) return null

  return style === "natural" && allowNatural
    ? splitNatural(phrase, words)
    : splitMidpoint(phrase, words)
}

/** Split at the word boundary nearest the midpoint of the string, ties going to the earlier one. */
function splitMidpoint(phrase: string, words: readonly string[]): PhraseSplit {
  // C# `phrase.Length / 2` is integer division. `phrase.length` is never negative, so trunc and
  // floor agree here; trunc matches the C# semantic and the rest of this port.
  const mid = Math.trunc(phrase.length / 2)
  let best = 0
  let bestDistance = Number.POSITIVE_INFINITY
  let position = 0

  // `words.length - 1`: the boundary AFTER the last word is not a split point. Since words.length is
  // at least 2, this always runs once, so `bestDistance` is always replaced on the first pass and the
  // initial value only has to be larger than any real distance (the C# uses int.MaxValue).
  for (let i = 0; i < words.length - 1; i++) {
    position += (words[i] ?? "").length + 1 // start index of the next word
    const distance = Math.abs(position - mid)
    // Strictly less-than, so equidistant boundaries keep the EARLIER split: "ab c efg" has
    // boundaries at 3 and 5 against a midpoint of 4, and the C# returns "ab" / "c efg". Measured.
    if (distance < bestDistance) {
      bestDistance = distance
      best = i
    }
  }

  return {
    line1: words.slice(0, best + 1).join(" "),
    line2: words.slice(best + 1).join(" "),
  }
}

/** Split after a grammatical pause marker, falling back to the midpoint when none applies. */
function splitNatural(phrase: string, words: readonly string[]): PhraseSplit {
  for (const marker of NATURAL_PAUSE_MARKERS) {
    if (!startsWithIgnoreCase(phrase, marker)) continue

    // `marker.length - 1` drops the marker's trailing space. The trimEnd() is the C#'s and is kept
    // for fidelity: it cannot fire, because every marker's last character before that space is a
    // letter. Expect a mutation removing it to survive -- equivalent by construction.
    const line1 = phrase.slice(0, marker.length - 1).trimEnd()
    const line2 = phrase.slice(marker.length)

    // A marker can consume the whole phrase ("half past " exactly). A blank second line is not a
    // split, so keep looking, and then fall through to the midpoint -- which is what the C# does,
    // and it yields "half" / "past " for that input. Measured.
    if (line2.trim().length > 0) return { line1, line2 }
  }

  return splitMidpoint(phrase, words)
}

/**
 * `text.StartsWith(prefix, StringComparison.OrdinalIgnoreCase)` for a prefix that is already
 * lowercase. Length-preserving on purpose -- see the note at the top of this file.
 */
function startsWithIgnoreCase(text: string, prefix: string): boolean {
  return text.slice(0, prefix.length).toLowerCase() === prefix
}
