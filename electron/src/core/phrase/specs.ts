import type { ProviderSpec } from "./factories.js"
import {
  DE,
  EN_CLASSIC,
  EN_DWARF,
  EN_JIVE,
  EN_PIRATE,
  EN_POETIC,
  EN_RUDE,
  EN_SHAKESPEARE,
  EN_TERSE,
  EN_VALLEYGIRL,
  EN_YODA,
  ES,
  FR,
  JA_CLASSIC,
  JA_POETIC,
  JA_RUDE,
  JA_TERSE,
  PL,
  type LocaleTables,
} from "./tables.generated.js"

/**
 * The 18 provider specs: the part of each C# provider that could not be reflected.
 *
 * WHAT IS HAND-WRITTEN HERE AND WHY. tools/TableExport moved every static string table across by
 * reflection, which is the only trustworthy way to move 899 strings. It could not move the
 * noon/midnight text of 16 of the 18 providers, because those live in method locals or as a bare
 * `return "midi"`, and locals leave no metadata. Those strings are transcribed below from the C#
 * source.
 *
 * The transcription is checked, not trusted. tools/GoldenGen collected the same sets by SAMPLING the
 * running C# providers to saturation, so every string below has to match a row in
 * test/fixtures/phrase-golden-candidates.tsv (for the drawing locales) or
 * phrase-golden-segments.tsv (for the deterministic ones) that arrived by an entirely different
 * route. A typo here fails that comparison. Had TableExport harvested these by sampling too, both
 * sides would share one origin and the check would be worth nothing.
 */

/** Noon is `"noon"` in all 18 locales, and midnight is `"midnight"` in 17 of them. */
const NOON_KEY = "noon"
const MIDNIGHT_KEY = "midnight"

/**
 * One of the 8 locales whose C# declares a single template per bucket, never draws, and defines
 * `GetSegmentKey(dt) => GetPhrase(dt)`. Their noon/midnight text is one literal each, which becomes
 * a one-element candidate list -- picking from which is the identity, so no behaviour is invented.
 */
function templateLocale(tables: LocaleTables, noon: string, midnight: string): ProviderSpec {
  return {
    tables,
    noon: [noon],
    midnight: [midnight],
    noonKey: NOON_KEY,
    midnightKey: MIDNIGHT_KEY,
    segmentKeyMode: "phrase",
    structuredMode: "delegate",
  }
}

/**
 * One of the locales that draws a candidate at random, keys on the bucket index, and forwards
 * `GetStructuredPhrase` to `GetPhrase`. Covers 8 of the 10 drawing locales; en-classic and en-poetic
 * are written out in full below because their structured phrase does real work.
 */
function candidateLocale(
  tables: LocaleTables,
  noon: readonly string[],
  midnight: readonly string[],
): ProviderSpec {
  return {
    tables,
    noon,
    midnight,
    noonKey: NOON_KEY,
    midnightKey: MIDNIGHT_KEY,
    segmentKeyMode: "bucket",
    structuredMode: "delegate",
  }
}

/**
 * en-classic. The only provider with an `oClockTemplate`: "{h} o'clock" is kept whole so a split
 * layout renders "three o'clock" rather than emphasising "three" and losing the rest.
 * Its noon and midnight lists are static fields, so they came across by reflection.
 */
const EN_CLASSIC_SPEC: ProviderSpec = {
  tables: EN_CLASSIC,
  noon: EN_CLASSIC.words.noonCandidates,
  midnight: EN_CLASSIC.words.midnightCandidates,
  noonKey: NOON_KEY,
  midnightKey: MIDNIGHT_KEY,
  segmentKeyMode: "bucket",
  structuredMode: "split",
  oClockTemplate: "{h} o'clock",
}

/**
 * en-poetic. Splits like en-classic but has no o'clock case, and is the one provider whose midnight
 * segment key is not `:midnight` -- the C# returns `en-poetic:witching`. Its two special phrases are
 * bare literals in the method, so they are transcribed here.
 */
const EN_POETIC_SPEC: ProviderSpec = {
  tables: EN_POETIC,
  noon: ["high noon"],
  midnight: ["the witching hour"],
  noonKey: NOON_KEY,
  midnightKey: "witching",
  segmentKeyMode: "bucket",
  structuredMode: "split",
}

/** en-terse, whose noon and midnight lists are static fields and so came across by reflection. */
const EN_TERSE_SPEC = candidateLocale(EN_TERSE, EN_TERSE.words.noonCandidates, EN_TERSE.words.midnightCandidates)

// The three providers that hold five noon and five midnight candidates in method LOCALS. Transcribed
// from PiratePhraseProvider.cs, JivePhraseProvider.cs and YodaPhraseProvider.cs; the em dashes are
// the source's own.
const EN_PIRATE_SPEC = candidateLocale(
  EN_PIRATE,
  [
    "high noon at sea, arr",
    "the sun's at zenith, yarr — noon watch",
    "noon on the meridian, steady on",
    "eight bells — noon, by the log",
    "high noon, all hands — avast",
  ],
  [
    "the dead of night, yarr",
    "midnight watch begins, arr",
    "middle watch — the dark hours, avast",
    "eight bells — midnight, steady on",
    "the graveyard watch, blimey",
  ],
)

const EN_JIVE_SPEC = candidateLocale(
  EN_JIVE,
  [
    "high noon, daddy-o",
    "noon on the dot, cat — solid",
    "twelve sharp, dig it — real gone",
    "high noon, hep cat — all reet",
    "noon straight up, daddy-o — righteous",
  ],
  [
    "the witching hour, cat",
    "midnight, daddy-o — real gone",
    "the zero hour, dig it",
    "dead of night, hep cat — solid",
    "midnight on the nose, alligator",
  ],
)

const EN_YODA_SPEC = candidateLocale(
  EN_YODA,
  [
    "noon it is, hmm",
    "the noon hour, upon us it is",
    "hmm, high noon it is, yes",
    "noon, arrived it has",
    "the midday hour, reached we have",
  ],
  [
    "midnight, the dark hour it is, yes",
    "the witching hour, upon us it is",
    "hmm, midnight it is",
    "the deepest night, reached we have",
    "midnight, arrived it has, mmm",
  ],
)

// The remaining drawing locales: one literal each, so a one-element list.
const EN_RUDE_SPEC = candidateLocale(EN_RUDE, ["noon"], ["midnight"])
const EN_DWARF_SPEC = candidateLocale(EN_DWARF, ["midday. eat."], ["deep in the night, bah"])
const EN_VALLEYGIRL_SPEC = candidateLocale(EN_VALLEYGIRL, ["like, it's literally noon"], ["omg it's literally midnight"])
const EN_SHAKESPEARE_SPEC = candidateLocale(EN_SHAKESPEARE, ["Hark! 'Tis the noontide hour"], ["The witching hour doth toll"])

/**
 * Every spec, keyed as PhraseEngine's registry keys them.
 *
 * The C# registry's insertion order is en-classic first and pl last; this map is ordered the same way
 * so the two files read alike. Nothing depends on the order -- the generated LOCALES array is the
 * ordinal-sorted list, and both are exhaustive over the same 18 keys.
 */
export const SPECS: Readonly<Record<string, ProviderSpec>> = {
  "en-classic": EN_CLASSIC_SPEC,
  "en-terse": EN_TERSE_SPEC,
  "en-poetic": EN_POETIC_SPEC,
  "en-rude": EN_RUDE_SPEC,
  "en-pirate": EN_PIRATE_SPEC,
  "en-dwarf": EN_DWARF_SPEC,
  "en-jive": EN_JIVE_SPEC,
  "en-valleygirl": EN_VALLEYGIRL_SPEC,
  "en-yoda": EN_YODA_SPEC,
  "en-shakespeare": EN_SHAKESPEARE_SPEC,
  "fr": templateLocale(FR, "midi", "minuit"),
  "es": templateLocale(ES, "mediodía", "medianoche"),
  "de": templateLocale(DE, "Mittag", "Mitternacht"),
  "ja-classic": templateLocale(JA_CLASSIC, "正午", "真夜中"),
  "ja-terse": templateLocale(JA_TERSE, "正午", "真夜中"),
  "ja-poetic": templateLocale(JA_POETIC, "昼の頂", "夜の果て"),
  "ja-rude": templateLocale(JA_RUDE, "もう昼だ", "真夜中じゃないか"),
  "pl": templateLocale(PL, "południe", "północ"),
}

export const ALL_SPECS: readonly ProviderSpec[] = Object.values(SPECS)
