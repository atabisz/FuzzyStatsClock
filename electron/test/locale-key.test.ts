/**
 * `locale-key.ts` against `ResolveLocaleKey`/`EnStyleKey` as read from `MainWindow.xaml.cs:1835-1872`.
 *
 * This is a **source-read** translation and not a measured one -- the C# function is private, takes the UI
 * culture from ambient global state, and produces a string with no observable side effect other than the
 * locale the engine ends up on. So the evidence class here is "verified by reading the shipped source", and
 * the tests earn their keep by pinning the three things a reasonable reimplementation gets wrong:
 *
 *  1. Classic has no `case` and reaches the switch's default.
 *  2. There is no `else` before the UI-culture branch, so an unrecognised locale takes the auto path.
 *  3. Auto-detected Japanese returns the bare `ja`, which no phrase table exists for.
 *
 * The third is checked against a real `PhraseEngine`, because "unregistered" is only a defect if `setLocale`
 * actually rejects it -- and that is the half of the claim this module cannot make on its own.
 */
import { describe, expect, test } from "bun:test"
import {
  AUTO_DETECTED_LANGUAGES,
  STYLE_BLIND_LOCALES,
  enStyleKey,
  jaStyleKey,
  localeKeyIsRegistered,
  resolveLocaleKey,
} from "../src/core/phrase/locale-key.js"
import { LOCALES, type Locale } from "../src/core/phrase/tables.generated.js"
import { PhraseEngine } from "../src/core/phrase/engine.js"
import { PHRASE_STYLES } from "../src/core/settings.js"

/**
 * `[style, expectedKey]` rows, typed rather than inferred.
 *
 * Both style-key functions return `Locale` -- the narrow union of registered keys -- so an inferred table
 * widens `expected` to `string` and `toBe` rejects it. Annotating is the fix that keeps the *narrowing*: a
 * typo'd expectation like `"en-terce"` fails to compile here, which is a better failure than a red test.
 */
type StyleRow = readonly [style: string, expected: Locale]

describe("EnStyleKey", () => {
  test.each<StyleRow>([
    ["Terse", "en-terse"],
    ["Poetic", "en-poetic"],
    ["Rude", "en-rude"],
    ["Pirate", "en-pirate"],
    ["Dwarf", "en-dwarf"],
    ["Jive", "en-jive"],
    ["ValleyGirl", "en-valleygirl"],
    ["Yoda", "en-yoda"],
    ["Shakespeare", "en-shakespeare"],
  ])("%s maps to %s", (style, expected) => {
    expect(enStyleKey(style)).toBe(expected)
  })

  test("Classic reaches the default arm, and so does anything unknown", () => {
    // There is no `case "classic"` in the C# switch. Worth its own test because adding one would be a
    // no-op that makes the next reader believe the default arm is unreachable.
    expect(enStyleKey("Classic")).toBe("en-classic")
    expect(enStyleKey("")).toBe("en-classic")
    expect(enStyleKey("Haiku")).toBe("en-classic")
  })

  test("matching is case-insensitive the way ToLowerInvariant is", () => {
    // `style.ToLowerInvariant()` -- so a settings file holding a differently-cased style still resolves.
    for (const variant of ["valleygirl", "VALLEYGIRL", "ValleyGirl", "vAlLeYgIrL"]) {
      expect(enStyleKey(variant)).toBe("en-valleygirl")
    }
  })

  test("every style the menu can produce resolves to a registered locale", () => {
    // The English arm is the one the UI can actually reach for all ten styles, so this is the arm where an
    // unregistered key would be a user-visible dead end rather than a corner case.
    expect(PHRASE_STYLES).toHaveLength(10)
    for (const style of PHRASE_STYLES) {
      expect(localeKeyIsRegistered(enStyleKey(style))).toBe(true)
    }
  })
})

describe("the Japanese subset", () => {
  test.each<StyleRow>([
    ["Terse", "ja-terse"],
    ["Poetic", "ja-poetic"],
    ["Rude", "ja-rude"],
  ])("%s maps to %s", (style, expected) => {
    expect(jaStyleKey(style)).toBe(expected)
  })

  test("the seven styles with no Japanese table fall back to ja-classic", () => {
    // Seven of ten, not one: only Terse, Poetic and Rude were translated. A reimplementation that assumed
    // parity with English would ask for `ja-pirate` and get nothing.
    const withTables = new Set(["Terse", "Poetic", "Rude"])
    const fallbacks = PHRASE_STYLES.filter((style) => !withTables.has(style))
    expect(fallbacks).toHaveLength(7)
    for (const style of fallbacks) {
      expect(jaStyleKey(style)).toBe("ja-classic")
    }
  })
})

describe("ResolveLocaleKey", () => {
  test("the four style-blind locales ignore the style entirely", () => {
    expect(STYLE_BLIND_LOCALES).toEqual(["fr", "es", "de", "pl"])
    for (const locale of STYLE_BLIND_LOCALES) {
      for (const style of PHRASE_STYLES) {
        expect(resolveLocaleKey(locale, style, "en")).toBe(locale)
      }
      expect(localeKeyIsRegistered(locale)).toBe(true)
    }
  })

  test("an explicit `ja` goes through the Japanese subset", () => {
    expect(resolveLocaleKey("ja", "Poetic", "en")).toBe("ja-poetic")
    expect(resolveLocaleKey("ja", "Pirate", "en")).toBe("ja-classic")
  })

  test("an explicit `en` goes through EnStyleKey and ignores the UI culture", () => {
    // The UI language is deliberately French here: an explicit `en` must not be overridden by it.
    expect(resolveLocaleKey("en", "Yoda", "fr")).toBe("en-yoda")
    expect(resolveLocaleKey("en", "Classic", "ja")).toBe("en-classic")
  })

  test("`auto` follows the UI culture for the five detected languages", () => {
    expect(AUTO_DETECTED_LANGUAGES).toEqual(["fr", "es", "de", "ja", "pl"])
    for (const uiLanguage of AUTO_DETECTED_LANGUAGES) {
      // The style is dropped, not consulted -- an auto-detected non-English UI is Classic phrasing only.
      expect(resolveLocaleKey("auto", "Shakespeare", uiLanguage)).toBe(uiLanguage)
    }
  })

  test("`auto` under any other UI culture falls back to the English style key", () => {
    for (const uiLanguage of ["en", "tr", "zh", "pt", ""]) {
      expect(resolveLocaleKey("auto", "Dwarf", uiLanguage)).toBe("en-dwarf")
    }
  })

  test("an unrecognised locale takes the auto path -- there is no else", () => {
    // The C# comment says `// "auto"`, but the code has no guard: the five early returns are the only
    // exits, so a hand-edited or stale settings value behaves exactly like `auto`. A reimplementation that
    // added `if (locale == "auto")` would send these to `en-classic` regardless of the UI culture, which is
    // a different answer under a French UI.
    expect(resolveLocaleKey("nonsense", "Terse", "fr")).toBe("fr")
    expect(resolveLocaleKey("", "Terse", "de")).toBe("de")
    expect(resolveLocaleKey("en-GB", "Terse", "es")).toBe("es")
    // ...and the same inputs under an undetected UI culture reach the style key.
    expect(resolveLocaleKey("nonsense", "Terse", "en")).toBe("en-terse")
  })
})

describe("the bare `ja` key is unregistered, and that is a shipped defect", () => {
  test("auto-detected Japanese produces a key no phrase table exists for", () => {
    const key = resolveLocaleKey("auto", "Classic", "ja")
    expect(key).toBe("ja")
    expect(localeKeyIsRegistered(key)).toBe(false)
    // The four keys that DO exist, so the failure is "the hyphen is missing" and not "Japanese is absent".
    expect(LOCALES.filter((locale) => locale.startsWith("ja"))).toEqual([
      "ja-classic",
      "ja-poetic",
      "ja-rude",
      "ja-terse",
    ])
  })

  test("the engine rejects it and keeps English, which is what the user actually sees", () => {
    // A fresh engine rather than the module-level singleton: `setLocale` returning false leaves the locale
    // untouched, so this could not have leaked anyway, but the test should not depend on that to be safe.
    const engine = new PhraseEngine()
    const before = engine.currentLocale
    expect(before).toBe("en-classic")
    expect(engine.setLocale(resolveLocaleKey("auto", "Classic", "ja"))).toBe(false)
    expect(engine.currentLocale).toBe(before)
    // And the working route to Japanese, for contrast: an explicit locale rather than auto-detection.
    expect(engine.setLocale(resolveLocaleKey("ja", "Classic", "ja"))).toBe(true)
    expect(engine.currentLocale).toBe("ja-classic")
  })

  test("`ja` is the only auto-detected language with this problem", () => {
    // The other four are registered locales in their bare form, which is why the defect is one language
    // and not the whole auto path.
    for (const uiLanguage of AUTO_DETECTED_LANGUAGES) {
      expect(localeKeyIsRegistered(resolveLocaleKey("auto", "Classic", uiLanguage))).toBe(
        uiLanguage !== "ja",
      )
    }
  })
})
