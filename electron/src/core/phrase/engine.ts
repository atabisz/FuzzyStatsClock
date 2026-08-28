import { makeProvider } from "./factories.js"
import { SPECS } from "./specs.js"
import { DEFAULT_LOCALE, LOCALES, type Locale } from "./tables.generated.js"
import { randomPicker, type PhraseProvider, type Picker, type StructuredPhrase } from "./types.js"

/**
 * The locale registry and the active-provider switch, ported from FuzzyClock.Core/PhraseEngine.cs.
 *
 * WHY A CLASS WHERE THE C# HAS A STATIC. The original is `static class PhraseEngine` with a mutable
 * `_activeProvider`, and process-wide mutable state is the one thing a test suite cannot work
 * around: two tests that each set a locale become order-dependent. So the engine is instantiable,
 * with a module-level instance for the app -- the same shape the app had, without forcing it on the
 * tests. Same reason the picker is a constructor parameter: it is what makes a random provider
 * checkable at all.
 */
export class PhraseEngine {
  private readonly providers: ReadonlyMap<string, PhraseProvider>
  private active: PhraseProvider
  private locale: string

  constructor(picker: Picker = randomPicker) {
    const providers = new Map<string, PhraseProvider>()
    for (const locale of LOCALES) {
      const spec = SPECS[locale]
      // The generated LOCALES list is the C# registry's own keys, so a missing spec means the tables
      // were regenerated after a locale was added and specs.ts was not updated. Loudly, at startup.
      if (!spec)
        throw new Error(`PhraseEngine: locale '${locale}' is in the generated tables but has no spec in specs.ts.`)
      providers.set(locale, makeProvider(spec, picker))
    }

    const initial = providers.get(DEFAULT_LOCALE)
    if (!initial)
      throw new Error(`PhraseEngine: the default locale '${DEFAULT_LOCALE}' is not in the registry.`)

    this.providers = providers
    this.active = initial
    this.locale = DEFAULT_LOCALE
  }

  /** The active locale. Starts at the same default the C# static starts at. */
  get currentLocale(): string {
    return this.locale
  }

  /** Every registered locale, in the generated (ordinal) order. */
  get locales(): readonly Locale[] {
    return LOCALES
  }

  /**
   * Swaps the active provider. Returns true if the locale is known and the provider was swapped;
   * false if the locale is unknown, in which case the active provider and currentLocale are
   * unchanged. Returning a boolean rather than throwing is the C# contract, and the caller that
   * relies on it is settings restore: an unknown locale in a stale settings file must leave the
   * clock on its default, not stop it.
   */
  setLocale(locale: string): boolean {
    const provider = this.providers.get(locale)
    if (!provider) return false
    this.active = provider
    this.locale = locale
    return true
  }

  /** The provider for a locale, or undefined. For tests and for the golden-fixture comparison. */
  providerFor(locale: string): PhraseProvider | undefined {
    return this.providers.get(locale)
  }

  getPhrase(dt: Date): string {
    return this.active.getPhrase(dt)
  }

  getStructuredPhrase(dt: Date): StructuredPhrase {
    return this.active.getStructuredPhrase(dt)
  }

  getSegmentKey(dt: Date): string {
    return this.active.getSegmentKey(dt)
  }
}

/** The app's engine, standing in for the C# static. Tests build their own. */
export const phraseEngine = new PhraseEngine()
