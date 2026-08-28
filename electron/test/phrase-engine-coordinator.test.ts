/**
 * ISC-12: PhraseEngineCoordinatorTests (17 cases) translated from
 * FuzzyClock.Core.Tests/PhraseEngineCoordinatorTests.cs, against src/core/phrase/engine.ts -- which
 * had no coverage at all before this file: nothing in the suite imported it.
 *
 * ## The C#'s test-isolation machinery has no counterpart here, and that is the point
 *
 * The original carries `[DoNotParallelize]` and a `[TestCleanup]` that calls
 * `PhraseEngine.SetLocale("en-classic")` after every method. Both exist for one reason: `PhraseEngine`
 * is a static class, so its active locale is process state and two tests that each set a locale are
 * order-dependent. The port's engine is instantiable (engine.ts says why), so every test below builds
 * a fresh one and there is no shared state to reset. Nothing here corresponds to ResetLocale.
 *
 * That is not just tidier -- it makes two of the 17 cases mean what their names say, where the C#
 * versions cannot:
 *
 *   - `DefaultLocale_IsEnClassic` has a comment conceding the point: "CurrentLocale reflects the
 *     startup default without any SetLocale call. We can verify the invariant: after cleanup always
 *     resets, CurrentLocale is en-classic." It is checking its own cleanup. A fresh instance checks the
 *     startup default for real. Measured on the C# side too, rather than assumed: the probe reads
 *     `PhraseEngine.CurrentLocale` as the first statement in the process, before anything calls
 *     SetLocale, and it reads `en-classic`.
 *   - `SetLocale_UnknownLocale_ReturnsFalse_LocaleUnchanged` and
 *     `SetLocale_JaBare_ReturnsFalse_AfterKeyRemoval` both assert `CurrentLocale == "en-classic"` after
 *     a rejected key -- but the cleanup already left it at en-classic, so "unchanged" and "silently
 *     reset to the default" are the same reading and the test cannot separate them. Each rejection
 *     below is entered from a locale that is NOT the default, so the assertion is the one the name
 *     makes. The C# does behave that way; the probe entered all 34 rejected keys from `fr` and read
 *     `fr` back every time.
 *
 * ## Sampled to universal, as everywhere else in this layer
 *
 * Same rule as phrase-engine.test.ts, and the same discipline: the universal is recorded from the C#
 * before it is written here, never derived from the port's own tables.
 *
 *   - `GetPhrase_DelegatesCorrectly_AfterSetLocaleRoundTrip` draws one phrase and asserts it contains
 *     "three". en-classic's 03:30 bucket holds 5 candidates, so that is a 1-in-5 sample. The probe drew
 *     20000 times through the coordinator and saw exactly 5 distinct strings; those 5 are the oracle
 *     below, as a set.
 *   - The four `GetPhrase_Ja*_ReturnsNonEmpty` cases assert `IsNullOrWhiteSpace == false`. All four
 *     ja-* locales declare one template per bucket, so their 03:30 output is DETERMINISTIC and the
 *     probe recorded the exact string. Non-empty becomes exact equality. Each case also asserts the
 *     arity is exactly 1, so the reader can see why one string is the whole candidate space rather than
 *     a sample of it -- the arity is what makes `everyCandidateContains` (which requires more than one
 *     candidate) the wrong instrument here.
 *
 * ## What the strengthenings are worth, measured
 *
 * Those claims cannot be supported by a green run, so 17 defects were injected into engine.ts and
 * tables.generated.ts with THIS FILE AS THE ONLY SUITE -- the same narrowing as phrase-engine.test.ts,
 * and here there is not even a fixture to withhold, since nothing covered engine.ts before.
 *
 * First run: 15 caught, 2 survivors, both predicted with their reason written beforehand. The two that
 * justify the design both died -- resetting to the default on a rejected locale (which the C# file
 * passes unchanged, for the reason above), and dropping one of the five candidates from en-classic's
 * 03:30 bucket, which a 1-in-5 sample misses four times in five.
 *
 * The interesting one is a survivor whose REASON was wrong. Hard-wiring delegate mode into the
 * coordinator -- `getStructuredPhrase` rebuilt as `("", getPhrase(dt))` -- was predicted to survive
 * here and to be caught by phrase-engine.test.ts and phrase-golden.test.ts. That is a claim about two
 * other files, so it was run against them rather than trusted: both miss it, and so does the full
 * suite. Those two build providers through `makeProvider` and never import engine.ts, so NOTHING read
 * split-mode structured output through the coordinator. Right verdict, wrong reason, and the wrong
 * reason was the finding. The 18-locale delegation test below closes it, and the re-run reads 16 caught
 * / 1 survivor -- the constructor's missing-spec guard, which today's tables cannot trigger.
 *
 * ## One deliberate divergence
 *
 * `SetLocale(null)` throws ArgumentNullException in the C#, because `Dictionary.TryGetValue(null)`
 * throws. The port returns false and leaves the locale alone. That is the port honouring the contract
 * the C# method's own callers depend on -- an unusable locale in a stale settings file must leave the
 * clock running -- and null reaches this method from exactly there, since a settings file is JSON and
 * its `locale` field is not type-checked by anything. Recorded and asserted below rather than left as
 * an accident.
 */
import { describe, expect, test } from "bun:test"
import { PhraseEngine } from "../src/core/phrase/engine.js"
import { DEFAULT_LOCALE, LOCALES } from "../src/core/phrase/tables.generated.js"
import { enumerateAll, indexPicker, wallTime } from "./support/picker.js"

/** 2024-01-15 03:30, the instant every case in the C# file uses. */
const at330 = (): Date => wallTime(3, 30, [2024, 0, 15])

/** A fresh engine and the picker driving all 18 of its providers. No state survives a test. */
function fresh(): { readonly ctl: ReturnType<typeof indexPicker>; readonly engine: PhraseEngine } {
  const ctl = indexPicker()
  return { ctl, engine: new PhraseEngine(ctl.picker) }
}

/**
 * Every locale the C# registry holds, ordinal-sorted, read off `_providers` by reflection in the
 * probe. The port's own list is checked against this rather than the reverse.
 */
const CSHARP_REGISTRY_KEYS = [
  "de", "en-classic", "en-dwarf", "en-jive", "en-pirate", "en-poetic", "en-rude", "en-shakespeare",
  "en-terse", "en-valleygirl", "en-yoda", "es", "fr", "ja-classic", "ja-poetic", "ja-rude",
  "ja-terse", "pl",
] as const

/** What the C# coordinator emitted at 03:30 on en-classic, over 20000 draws. Exactly 5 distinct. */
const CSHARP_EN_CLASSIC_0330 = [
  "half past three",
  "half past three exactly",
  "it's half past three",
  "thirty minutes past three",
  "thirty past three",
] as const

/** The C#'s 03:30 output for the four deterministic Japanese locales, one draw's worth each. */
const CSHARP_JA_0330 = {
  "ja-classic": "三時半",
  "ja-terse": "三時半",
  "ja-poetic": "時の折り返し、三時の半ば",
  "ja-rude": "やっと三時半じゃないか",
} as const

/**
 * A locale to enter a rejection from. Not the default, so "unchanged" is distinguishable from "reset",
 * and deterministic, so a phrase read afterwards pins the active provider and not just the label.
 */
const SENTINEL = "fr"

describe("PhraseEngineCoordinatorTests, translated (17 cases)", () => {
  test("DefaultLocale_IsEnClassic -- a fresh engine starts on en-classic", () => {
    // The genuine startup default, where the C# could only re-check its own cleanup.
    expect(fresh().engine.currentLocale).toBe("en-classic")
  })

  describe("SetLocale over the 9 keys the C# accepts", () => {
    // SetLocale_KnownLocale_ReturnsTrue uses "en-classic"; the other 8 have a method each.
    for (const locale of ["en-classic", "fr", "es", "de", "pl", "ja-classic", "ja-terse", "ja-poetic", "ja-rude"])
      test(`"${locale}" returns true and becomes the current locale`, () => {
        const { engine } = fresh()
        expect(engine.setLocale(locale)).toBe(true)
        expect(engine.currentLocale).toBe(locale)
      })
  })

  describe("SetLocale over the 2 keys the C# rejects", () => {
    // "zh" was never registered; bare "ja" was removed when the four ja-* variants landed. The C#
    // comments name both reasons, and neither key appears in the 18 the probe read back.
    for (const [locale, why] of [
      ["zh", "never registered -- LANG-04 baseline, unsupported locales fall back gracefully"],
      ["ja", "removed in favour of ja-classic / ja-terse / ja-poetic / ja-rude"],
    ] as const)
      test(`"${locale}" returns false and leaves the locale alone (${why})`, () => {
        const { engine } = fresh()
        expect(engine.setLocale(SENTINEL)).toBe(true)
        expect(engine.setLocale(locale)).toBe(false)
        // The strengthening: still the sentinel, not the default. The C# asserts en-classic here only
        // because its cleanup put it there.
        expect(engine.currentLocale).toBe(SENTINEL)
      })
  })

  test("GetPhrase_DelegatesCorrectly_AfterSetLocaleRoundTrip -- all 5 candidates, not one draw", () => {
    const { ctl, engine } = fresh()
    expect(engine.setLocale("de")).toBe(true) // a round trip that actually moves off the default
    expect(engine.setLocale("en-classic")).toBe(true)

    const { arity, values } = enumerateAll(ctl, () => engine.getPhrase(at330()))
    expect(arity).toBe(5)
    // The C#'s own assertion, held to every candidate rather than to a 1-in-5 sample.
    for (const v of values) expect(v.toLowerCase()).toContain("three")
    // And the stronger form the 20000-draw recording supports: the same set, exactly.
    expect([...values].sort()).toEqual([...CSHARP_EN_CLASSIC_0330].sort())
  })

  describe("GetPhrase_Ja*_ReturnsNonEmpty -- exact, because these 4 locales are deterministic", () => {
    for (const [locale, expected] of Object.entries(CSHARP_JA_0330))
      test(`"${locale}" emits exactly "${expected}"`, () => {
        const { ctl, engine } = fresh()
        expect(engine.setLocale(locale)).toBe(true)

        const { arity, values } = enumerateAll(ctl, () => engine.getPhrase(at330()))
        // Asserted first: one candidate is the whole space here, so the equality below is universal
        // rather than a sample. A locale that gained a second template fails here, loudly, instead of
        // silently turning the next line into a 1-in-2 check.
        expect(arity).toBe(1)
        expect(values).toEqual([expected])
        // The C#'s literal assertion, kept so the original is still legible in the translation.
        expect(values[0]!.trim()).not.toBe("")
      })
  })
})

describe("additions, measured against the C#", () => {
  test("the port registers exactly the 18 locales the C# registry holds", () => {
    // The C# tests 9 of the 18 by hand. The probe read all of them off _providers by reflection, so
    // the whole set is assertable -- and a locale added to the tables without a spec cannot slip in
    // unnoticed, since the constructor throws on that and this test would never reach its assertion.
    expect([...LOCALES].sort()).toEqual([...CSHARP_REGISTRY_KEYS].sort())
    expect(DEFAULT_LOCALE).toBe("en-classic")
  })

  test("a fresh engine's ACTIVE PROVIDER is en-classic's, not just its label", () => {
    // `currentLocale` is a string field, so the translated default case above proves only that the
    // label reads "en-classic" -- a constructor that set the label and the wrong provider passes it,
    // and passes the whole rest of this file too, because every other test calls setLocale first and
    // that reassigns both. So the startup provider is read here, with no setLocale in front of it,
    // against the same 20000-draw recording the delegation case uses.
    const { ctl, engine } = fresh()
    const { arity, values } = enumerateAll(ctl, () => engine.getPhrase(at330()))
    expect(arity).toBe(5)
    expect([...values].sort()).toEqual([...CSHARP_EN_CLASSIC_0330].sort())
  })

  test("every one of the 18 keys is accepted and lands on itself", () => {
    const { engine } = fresh()
    for (const locale of CSHARP_REGISTRY_KEYS) {
      expect({ locale, ok: engine.setLocale(locale) }).toEqual({ locale, ok: true })
      expect(engine.currentLocale).toBe(locale)
    }
  })

  test("the lookup is case-sensitive and does not trim, and every reject is inert", () => {
    // No C# test covers any of these; all 14 were measured on the C# side, entered from "fr", and all
    // 14 returned false with the locale untouched. A JS Map matches C#'s ordinal Dictionary here for
    // free, which is exactly why it is worth pinning: a well-meant `locale.trim().toLowerCase()` in
    // setLocale would be a silent behaviour change, and this is the test that would object.
    const rejects = [
      "EN-CLASSIC", "En-Classic", "FR", "Ja-Classic", // case
      " fr", "fr ", "", "  ", // whitespace and empty
      "en", "en-", "classic", "en-classic-", "de-DE", "zh", // near misses
    ]
    const { ctl, engine } = fresh()
    expect(engine.setLocale(SENTINEL)).toBe(true)
    const before = enumerateAll(ctl, () => engine.getPhrase(at330())).values

    for (const key of rejects) expect({ key, ok: engine.setLocale(key) }).toEqual({ key, ok: false })

    expect(engine.currentLocale).toBe(SENTINEL)
    // Not just the label: the active provider is still the sentinel's. fr is deterministic, so this
    // comparison is exact rather than probabilistic.
    expect(enumerateAll(ctl, () => engine.getPhrase(at330())).values).toEqual(before)
  })

  test("setLocale(null) returns false where the C# throws -- the one deliberate divergence", () => {
    // Reachable in the port and only in the port: settings JSON is not type-checked, so `locale: null`
    // arrives here as null. The C# would throw ArgumentNullException out of Dictionary.TryGetValue
    // (measured, not inferred -- the probe caught it), which would take the clock down at restore time
    // for a bad settings file. Returning false is what the method's documented contract wants.
    const { engine } = fresh()
    expect(engine.setLocale(SENTINEL)).toBe(true)
    for (const bad of [null, undefined] as unknown as string[])
      expect(engine.setLocale(bad)).toBe(false)
    expect(engine.currentLocale).toBe(SENTINEL)
  })

  test("all three delegating methods reach the same provider, for the 8 deterministic locales", () => {
    // The C# only tests GetPhrase delegation. GetStructuredPhrase and GetSegmentKey forward to the
    // same field, and the probe confirmed all three agree with the provider instance for every locale
    // where a second draw cannot differ. Same 8 locales here, compared against providerFor().
    //
    // "Deterministic" is scoped to 03:30, which is all the probe measured (200 draws at that minute
    // per locale). These 8 are the single-template locales and are arity 1 everywhere, but that wider
    // claim belongs to the golden fixture, not to a delegation test.
    const { ctl, engine } = fresh()
    const deterministic = CSHARP_REGISTRY_KEYS.filter((l) => {
      const p = engine.providerFor(l)
      expect(p).toBeDefined()
      return enumerateAll(ctl, () => p!.getPhrase(at330())).arity === 1
    })
    expect(deterministic).toEqual(["de", "es", "fr", "ja-classic", "ja-poetic", "ja-rude", "ja-terse", "pl"])

    for (const locale of deterministic) {
      expect(engine.setLocale(locale)).toBe(true)
      const p = engine.providerFor(locale)!
      const dt = at330()
      expect(engine.getPhrase(dt)).toBe(p.getPhrase(dt))
      expect(engine.getStructuredPhrase(dt)).toEqual(p.getStructuredPhrase(dt))
      expect(engine.getSegmentKey(dt)).toBe(p.getSegmentKey(dt))
    }
  })

  test("all 18 locales delegate every method identically, including the 2 that SPLIT", () => {
    // Written because the test above is not enough, and the run that showed it is worth recording:
    // rebuilding getStructuredPhrase as ("", getPhrase(dt)) -- i.e. hard-wiring delegate mode into the
    // coordinator -- survived the whole suite. It had to, and for a reason neither obvious nor about
    // this file: phrase-engine.test.ts and phrase-golden.test.ts build providers through makeProvider
    // and never touch engine.ts, so NOTHING read split-mode structured output through the coordinator.
    // en-classic and en-poetic are the only split-mode locales, and they are the only ones where
    // ("", phrase) differs from the real pair.
    //
    // Enumerated rather than sampled, so the comparison covers each locale's whole candidate space.
    const { ctl, engine } = fresh()
    let splitSeen = 0
    for (const locale of CSHARP_REGISTRY_KEYS) {
      expect(engine.setLocale(locale)).toBe(true)
      const p = engine.providerFor(locale)!
      const dt = at330()
      expect(enumerateAll(ctl, () => engine.getPhrase(dt)).values).toEqual(enumerateAll(ctl, () => p.getPhrase(dt)).values)
      const viaEngine = enumerateAll(ctl, () => engine.getStructuredPhrase(dt)).values
      expect(viaEngine).toEqual(enumerateAll(ctl, () => p.getStructuredPhrase(dt)).values)
      // Compared directly, not enumerated: getSegmentKey draws ZERO times for the 10 bucket-mode
      // locales (it formats a bucket index), which trips enumerateAll's one-draw-per-call guard. It is
      // exact regardless -- bucket-mode keys are constant within a minute, and the 8 phrase-mode
      // locales are the deterministic ones, so neither family has a draw that could differ.
      expect(engine.getSegmentKey(dt)).toBe(p.getSegmentKey(dt))
      // What makes the structured comparison discriminating at all: a non-empty qualifier cannot come
      // out of ("", phrase). Counted rather than asserted per locale, because 16 of the 18 legitimately
      // have an empty one.
      if (viaEngine.some((v) => v.qualifier !== "")) splitSeen++
    }
    // en-classic and en-poetic, and this count is the guard: if the split-mode locales ever stopped
    // producing a qualifier at 03:30, the loop above would still pass while checking nothing.
    expect(splitSeen).toBe(2)
  })

  test("the 8 deterministic locales delegate their structured phrase and key the C# way", () => {
    // The probe recorded these shapes alongside the phrases: structuredMode "delegate" gives
    // ("", phrase), and segmentKeyMode "phrase" gives the phrase itself as the key. Both hold for all
    // four ja-* locales in the C#, and both are asserted here against the recorded phrase rather than
    // against whatever the port happens to produce.
    const { engine } = fresh()
    for (const [locale, expected] of Object.entries(CSHARP_JA_0330)) {
      expect(engine.setLocale(locale)).toBe(true)
      const dt = at330()
      expect(engine.getStructuredPhrase(dt)).toEqual({ qualifier: "", emphasis: expected })
      expect(engine.getSegmentKey(dt)).toBe(expected)
    }
  })

  test("locales is the generated list itself, aliased -- readonly to the compiler, not at runtime", () => {
    // There is no C# counterpart: PhraseEngine.cs exposes no Locales member, so this getter is a port
    // addition and there is nothing to be faithful to. What it does is hand back the module-level
    // LOCALES array by reference. `as const` makes that readonly to the type-checker only -- nothing
    // is frozen -- so a caller reaching through an `as string[]` could sort or splice the registry
    // list for every other caller. Recorded as the property it is, not asserted as a guarantee it
    // does not provide, and deliberately not mutated here to find out.
    const { engine } = fresh()
    expect(engine.locales).toBe(LOCALES)
    expect(Object.isFrozen(engine.locales)).toBe(false)
  })
})
