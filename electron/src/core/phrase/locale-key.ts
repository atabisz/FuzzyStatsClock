/**
 * Which locale the engine runs, from the two settings that choose it.
 *
 * Ported from `MainWindow.ResolveLocaleKey` (`MainWindow.xaml.cs:1835-1857`) and `EnStyleKey`
 * (`:1859-1872`). Two settings feed it -- `phraseLocale` ("auto", "en", "ja", or a bare base locale) and
 * `phraseStyle` (the ten style names) -- and they do not compose freely: the style is consulted for English
 * and for Japanese, and ignored entirely for the four other base locales.
 *
 * ## `resolveLocaleKey` can return a key the engine will reject, and that is faithful
 *
 * `"auto"` under a Japanese Windows UI returns the bare `"ja"`, which is **not** a registered locale --
 * `TABLES` has `ja-classic`, `ja-terse`, `ja-poetic` and `ja-rude`, and no `ja`. So `setLocale("ja")` returns
 * false and the engine keeps whatever it had, which on startup is `en-classic`: a Japanese user with
 * `phraseLocale = "auto"` gets English phrases. The four English styles are unaffected, so this is invisible
 * unless you are the affected user.
 *
 * That is a shipped defect, and the port keeps it. The return type is therefore `string` and not `Locale`:
 * typing it as `Locale` would be a claim the function does not satisfy, and the compiler would then have to
 * be lied to at the one line that matters. `localeKeyIsRegistered` below is how a caller can tell, and the
 * test pins which inputs reach the bad key.
 *
 * ## Anything unrecognised takes the `auto` path
 *
 * There is no `else` and no final guard: the five base locales and `"en"` return early, and **everything
 * else** falls through to UI-culture detection -- including a corrupt or stale value in the settings file.
 * The C#'s comment says `// "auto"`, but the code says "auto or anything I do not know", and those differ
 * for exactly the input a hand-edited settings file produces. Pinned by test rather than left to the
 * comment.
 */

import { LOCALES, type Locale } from "./tables.generated.js"

/** The base locales that ignore the phrase style completely -- Classic phrasing only, by construction. */
export const STYLE_BLIND_LOCALES: readonly string[] = ["fr", "es", "de", "pl"]

/**
 * The base locales `auto` detection accepts, from `TwoLetterISOLanguageName`.
 *
 * `ja` is in this list and is *not* a registered locale. See the module header.
 */
export const AUTO_DETECTED_LANGUAGES: readonly string[] = ["fr", "es", "de", "ja", "pl"]

/**
 * `EnStyleKey`: the English style keys, with Classic reached by falling off the end of the switch.
 *
 * `toLowerCase` and not `toLocaleLowerCase`, to match `ToLowerInvariant`. The two differ under a Turkish
 * locale -- `toLocaleLowerCase("I")` is a dotless i there -- and every key in this table is ASCII, so the
 * invariant form is both correct and the one that cannot change under the user's regional settings.
 */
export function enStyleKey(style: string): Locale {
  switch (style.toLowerCase()) {
    case "terse":
      return "en-terse"
    case "poetic":
      return "en-poetic"
    case "rude":
      return "en-rude"
    case "pirate":
      return "en-pirate"
    case "dwarf":
      return "en-dwarf"
    case "jive":
      return "en-jive"
    case "valleygirl":
      return "en-valleygirl"
    case "yoda":
      return "en-yoda"
    case "shakespeare":
      return "en-shakespeare"
    default:
      return "en-classic"
  }
}

/** The Japanese subset: three styles have a table, everything else is Classic. */
export function jaStyleKey(style: string): Locale {
  switch (style.toLowerCase()) {
    case "terse":
      return "ja-terse"
    case "poetic":
      return "ja-poetic"
    case "rude":
      return "ja-rude"
    default:
      return "ja-classic"
  }
}

/**
 * `ResolveLocaleKey(locale, style)`, with the UI culture passed in.
 *
 * @param phraseLocale `settings.phraseLocale`: `"auto"`, `"en"`, `"ja"`, one of the four style-blind base
 *   locales, or -- per the header -- anything at all.
 * @param phraseStyle `settings.phraseStyle`. Consulted only for English and Japanese.
 * @param uiLanguage `CultureInfo.CurrentUICulture.TwoLetterISOLanguageName`. A parameter because there is no
 *   two-letter UI-culture accessor in a renderer process: `navigator.language` is a full tag like `en-AU`,
 *   so the caller does the narrowing and this stays pure and testable.
 */
export function resolveLocaleKey(
  phraseLocale: string,
  phraseStyle: string,
  uiLanguage: string,
): string {
  if (STYLE_BLIND_LOCALES.includes(phraseLocale)) return phraseLocale
  if (phraseLocale === "ja") return jaStyleKey(phraseStyle)
  if (phraseLocale === "en") return enStyleKey(phraseStyle)
  // "auto", and everything unrecognised. An auto-detected non-English UI uses the BASE locale and drops the
  // style -- which for `ja` is a key the engine has no table for.
  if (AUTO_DETECTED_LANGUAGES.includes(uiLanguage)) return uiLanguage
  return enStyleKey(phraseStyle)
}

/** Whether a key `resolveLocaleKey` produced is one `PhraseEngine.setLocale` will accept. */
export function localeKeyIsRegistered(key: string): key is Locale {
  return (LOCALES as readonly string[]).includes(key)
}
