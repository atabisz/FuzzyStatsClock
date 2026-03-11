# Feature Research

**Domain:** Desktop overlay widget — phrase personality styles, Nixie tube clock, dial enhancements (v3.4)
**Researched:** 2026-03-11
**Confidence:** HIGH (phrase vocabulary, WPF rendering, dial geometry); MEDIUM (1940s Jive vocabulary authenticity)

---

## Feature Landscape

### Table Stakes (Users Expect These)

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| New phrase styles appear in Settings Phrase Style selector | Any new style must be discoverable via Settings; parity with existing Classic/Terse/Poetic/Rude | LOW | Add enum values + ComboBox items; follows v3.2 pattern |
| Phrase styles persist across restarts | Every other setting persists; users expect this | LOW | `AppSettings.PhraseStyle` already serializes as string; new values just work |
| Nixie clock appears in Clock Type selector (Settings + tray) | The LCD clock type set this expectation; fourth type must appear in same places | LOW | `ClockType.Nixie` added to enum; tray submenu + Settings radio button |
| Nixie setting persists across restarts | Every clock type persists | LOW | `JsonStringEnumConverter` already handles new enum values |
| Dial shape preference persists | Per pattern established by every other dial setting | LOW | New `AppSettings.DialShape` field |

### Differentiators (Competitive Advantage)

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| Nixie tube visual simulation (WPF-native) | No other desktop clock widget renders a convincing Nixie tube without image assets; distinctive retro-tech aesthetic | HIGH | Stacked ghost digits + glow bloom + glass tube + wire mesh all in WPF vector; no bitmaps needed |
| Pirate, Dwarf, Jive, Valley Girl, Yoda, Shakespearean phrase styles | Six new personalities = strong brand identity; no competing widget has personality vocabularies at all | MEDIUM | One `IPhraseProvider` class per style; all follow established bucket pattern |
| Rude 2.0 with internet slang | Current Rude is British passive-aggressive; rewrite with WTF/bruh/smh/dafaq lifts it from "a bit snippy" to genuinely funny | LOW | Replace 12 bucket strings + 2 specials in `RudePhraseProvider` |
| Oval dial option | Round dials are universal; oval is a design choice that fits wide desktop layouts | LOW | `DialGeometry` width/height ratio change; one conditional in render path |
| Dial scales with Font Size | Currently dial is fixed-size; scaling creates visual consistency with phrase and LCD clocks | LOW | Map Small/Medium/Large → canvas size constants in dial render |

### Anti-Features (Commonly Requested, Often Problematic)

| Feature | Why Requested | Why Problematic | Alternative |
|---------|---------------|-----------------|-------------|
| Phrase styles for non-English locales | "Pirate French" sounds funny | Style personalities depend on English idiom and cultural references; translations of Pirate/Yoda/Jive do not land the same way | English-only styles; non-English gets native culturally-authentic phrasing |
| Nixie seconds display | Completing the HH:MM:SS display feels natural | Adds significant UI width; Nixie tubes render wide; seconds require 1s update interval (not the current 5s-aligned phrase cycle) | Defer to v5+; current scope is HH:MM only |
| Nixie color theme options (blue/green variants) | Historical Nixie variants in blue/green exist | Scope expansion; blue Nixie is an artistic choice that deserves its own deliberate design pass | Classic orange-amber is the canonical Nixie color; defer color variants to v5+ |
| Blinking colon on Nixie | LCD already has static colon; Nixie colon blinking feels authentic | Requires 1s timer subscription even when stats are on 10s refresh; adds complexity to clock update path | Static colon for v3.4; defer to v5+ |
| AM/PM indicator on Nixie | Disambiguation between 3 AM and 3 PM | Widget always-on-top + contextual awareness makes AM/PM redundant; LCD does not have it; Nixie should follow same decision | 12hr display without AM/PM indicator; consistent with LCD clock |
| Smooth-sweep second hand on dial | Real analog clocks sweep smoothly | Requires sub-second timer; significant battery/CPU impact for minimal visual gain | Tick-based second hand (existing); smooth sweep deferred to v5+ |

---

## Feature Dependencies

```
[Rude 2.0]
    └──replaces vocabulary in──> [RudePhraseProvider] (existing class, rewrite bucket strings only)
    └──no new dependencies]

[Pirate / Dwarf / Jive / Valley Girl / Yoda / Shakespearean styles]
    └──implements──> [IPhraseProvider] (existing interface)
    └──registered in──> [PhraseEngine._providers dictionary] (existing)
    └──exposed via──> [AppSettings.PhraseStyle] (existing string field; new values added)
    └──shown in──> [SettingsWindow Phrase Style ComboBox] (existing control; new items added)
    └──gated by──> [PhraseLanguage == "en"] (English-only; same gate as existing styles)

[Nixie Clock]
    └──adds value to──> [ClockType enum] (existing; add ClockType.Nixie = 3)
    └──requires new control──> [NixieClockView UserControl] (new XAML + code-behind)
    └──requires new digit control──> [NixieDigit UserControl] (new; analogous to SevenSegmentDigit)
    └──shown/hidden by──> [MainWindow clock type switching logic] (existing pattern)
    └──independent of──> [LcdClockView] (no shared rendering code needed)
    └──uses color from──> [hardcoded Nixie palette] (orange-amber; NOT AppSettings.AccentColor)

[Dial Shape (Round/Oval)]
    └──reads new setting──> [AppSettings.DialShape] (new field: "Round" | "Oval")
    └──modifies──> [DialGeometry canvas width/height ratio] (existing class)
    └──shown in──> [SettingsWindow Appearance tab] (new radio buttons)

[Dial Size Scaling]
    └──reads existing──> [AppSettings.FontSize] (Small/Medium/Large; already exists)
    └──modifies──> [DialGeometry canvas dimensions] (existing class; add size mapping)
    └──no new AppSettings field needed] (reuses FontSize)
    └──must test──> oval + large does not overflow widget bounds

[Dial Shape] ──combines with──> [Dial Size Scaling]
    (both modify canvas dimensions; must be applied together, not independently)
```

### Dependency Notes

- **Nixie uses its own color palette, not AccentColor.** The warm orange-amber (#FF8C2F, ~2200K color temperature range) is intrinsic to the Nixie aesthetic. Wiring it to AccentColor would let users accidentally set Nixie to pink or green, destroying the look. Hardcode the Nixie color in the NixieDigit control.
- **Phrase styles all depend on PhraseEngine registration.** The `_providers` dictionary in `PhraseEngine.cs` must be extended with all new provider keys (e.g., `"en-pirate"`, `"en-dwarf"`, `"en-jive"`, `"en-valley"`, `"en-yoda"`, `"en-shakespeare"`). The Settings window PhraseStyle ComboBox and SettingsService must map display names to these keys.
- **Dial shape + size are independent settings but must render together.** `DialGeometry` should accept both shape and size as parameters in one call. Do not apply shape first then size as a second pass — that risks a redundant layout pass.
- **Rude 2.0 is a rewrite, not a new provider.** The class key `"en-rude"` stays the same in PhraseEngine. Only the bucket string content changes. Existing tests for the Rude provider must be updated to match new vocabulary.

---

## MVP Definition

### Launch With (v3.4)

- [ ] Rude 2.0 — internet-slang vocabulary replacing existing passive-aggressive British Rude
- [ ] Pirate phrase style — expected as delightful; simple bucket array
- [ ] Dwarf phrase style — gruff, blunt; well-defined vocabulary space
- [ ] Jive phrase style — 1940s Harlem Jive; most research-intensive but high charm
- [ ] Valley Girl phrase style — well-defined vocabulary; universally understood cultural reference
- [ ] Yoda phrase style — mechanical inversion rule; low vocabulary research needed
- [ ] Shakespearean phrase style — formal archaic English; clear vocabulary domain
- [ ] All styles registered in PhraseEngine + visible in Settings + persisting
- [ ] Nixie tube clock (HH:MM, warm orange glow, stacked ghost digits, glass tube, wire mesh)
- [ ] Nixie in Clock Type selector (Settings Appearance tab + tray Clock Type submenu)
- [ ] Dial shape: round vs oval toggle in Settings Appearance tab
- [ ] Dial size scales with Font Size setting

### Add After Validation (v3.x)

- [ ] Nixie color variants (blue/green historical Nixie) — validate interest first
- [ ] Phrase styles for Polish (pl) — Polish was added in v3.3; personality styles would pair naturally

### Future Consideration (v5+)

- [ ] Nixie seconds display — needs Nixie size option first
- [ ] Blinking Nixie colon — nice-to-have authenticity detail
- [ ] Smooth-sweep second hand — CPU/battery concern; low priority
- [ ] User-authored custom phrase sets

---

## Feature Prioritization Matrix

| Feature | User Value | Implementation Cost | Priority |
|---------|------------|---------------------|----------|
| Rude 2.0 | HIGH | LOW | P1 |
| Pirate style | HIGH | LOW | P1 |
| Dwarf style | MEDIUM | LOW | P1 |
| Jive style | HIGH | MEDIUM | P1 |
| Valley Girl style | HIGH | LOW | P1 |
| Yoda style | HIGH | LOW | P1 |
| Shakespearean style | MEDIUM | LOW | P1 |
| Nixie tube clock | HIGH | HIGH | P1 |
| Dial shape (oval) | MEDIUM | LOW | P1 |
| Dial size scaling | MEDIUM | LOW | P1 |

All features are P1 for v3.4 — they are in scope and the phrase providers are individually cheap once the pattern is established.

---

## Detailed Feature Specifications

### A. Rude 2.0 — Internet Slang Rewrite

**Philosophy:** The v3.3 Rude style is British passive-aggressive ("still here?", "do keep up"). v3.4 Rude is internet-era: blunt, meme-inflected, uses abbreviations as spoken words (WTF, bruh, smh, dafaq, tf, lmao). The register is "Discord at 2 AM" not "disappointed English teacher."

**Key vocabulary atoms:**
- `WTF` — rhetorical disgust/surprise (used as exclamation)
- `bruh` — exasperated address, implies disbelief
- `dafaq` / `tf` — "what the [f***]" compressed forms
- `smh` — "shaking my head", disappointment shorthand
- `lmao` — self-deprecating absurdity
- `literally` — Valley-Girl-inflected intensifier that leaked into gen-Z usage
- `rn` — "right now" compressed
- `ngl` — "not gonna lie"

**Full bucket table (replaces existing RudePhraseProvider buckets):**

| Bucket (≤min) | Template | Notes |
|---------------|----------|-------|
| 2 | `{h} o'clock, bruh` | blunt acknowledgment |
| 7 | `just after {h}, tf` | "what the [f***]" reaction to time passing |
| 12 | `ten past {h}, smh` | disappointment at how late it is |
| 17 | `quarter past {h}, ngl` | honest but reluctant acknowledgment |
| 22 | `WTF, still quarter past {h}` | time isn't moving fast enough |
| 27 | `almost half past {h}, lmao` | laughing at the passage of time |
| 32 | `half past {h}, bruh` | disbelief it's already :30 |
| 37 | `just past half {h}, dafaq` | stronger reaction |
| 42 | `almost quarter to {h1}, rn` | urgency |
| 47 | `quarter to {h1}, literally` | intensifier |
| 52 | `nearly {h1}, smh` | disappointment at approach of next hour |
| 59 | `almost {h1}, WTF` | closing exclamation |

Special: noon → `"noon, bruh"`, midnight → `"midnight, wtf are you doing"`

---

### B. Pirate Phrase Style

**Philosophy:** Golden Age of Piracy dialect. Key features: dropped g's (mornin'), archaic "ye/yer/arr/yarr", nautical time references ("bell"), "ahoy", possessives dropped ("tis", "'twere"). Phrases should feel like a seafarer calling out the watch.

**Key vocabulary atoms:**
- `arr` / `yarr` — affirmative/emphasis interjection
- `'tis` — "it is" contracted (very characteristic)
- `nearly` / `almost` → `nigh on` / `near to`
- `past` → `gone past` / `by`
- `o'clock` → `by the bell` / `on the bell`
- `quarter` → `quarter bell`
- `half` → `half bell`
- Hour words: standard English words work; can prepend "the {h}" for flavor

**Full bucket table:**

| Bucket (≤min) | Template | Notes |
|---------------|----------|-------|
| 2 | `{h} bells, arr` | naval "bell" for hour |
| 7 | `just past {h} bells, yarr` | |
| 12 | `ten past {h}, arr` | |
| 17 | `a quarter past {h}, yarr` | |
| 22 | `past the quarter bell of {h}` | |
| 27 | `nigh on half past {h}, arr` | "nigh on" = almost |
| 32 | `half past {h}, arr` | |
| 37 | `just past the half bell, yarr` | |
| 42 | `nigh on a quarter to {h1}` | |
| 47 | `a quarter to {h1}, arr` | |
| 52 | `nearly {h1}, yarr` | |
| 59 | `almost {h1}, shiver me timbers` | longer phrase for end-of-hour |

Special: noon → `"high noon at sea, arr"`, midnight → `"the dead of night, yarr"`

---

### C. Dwarf Phrase Style

**Philosophy:** Fantasy dwarf archetype — short, blunt, gruff. No flowery language. Underground context where time is measured in work shifts, meals, and ale. Grudging acknowledgment of time rather than celebration. References: mining, ale, forge, the deep halls. Tolkien-Dwarrow register merged with Robert E. Howard-era gruffness.

**Key vocabulary atoms:**
- `aye` — affirmation
- `bah` — dismissal
- `eh` — rhetorical suffix
- References: "by the forge", "before second ale", "deep in the shift", "stone and bone"
- `'tis` / `'twere` — archaic contractions
- Short sentences; imperative mood; no subordinate clauses

**Full bucket table:**

| Bucket (≤min) | Template | Notes |
|---------------|----------|-------|
| 2 | `{h}, aye` | blunt confirmation |
| 7 | `just past {h}, move on` | gruff dismissal |
| 12 | `ten past {h}, bah` | mild irritation |
| 17 | `a quarter past {h}` | no embellishment needed |
| 22 | `past the quarter, aye` | |
| 27 | `near half past {h}` | |
| 32 | `half past {h}, get to work` | characteristic Dwarf imperative |
| 37 | `just past half {h}, eh` | |
| 42 | `near a quarter to {h1}` | |
| 47 | `quarter to {h1}, by the stone` | mild oath |
| 52 | `nearly {h1}, aye` | |
| 59 | `almost {h1}, quit yer dawdlin` | |

Special: noon → `"midday. eat."`, midnight → `"deep into the night, bah"`

---

### D. Jive Phrase Style (1940s Harlem Jive)

**Philosophy:** 1940s Harlem jazz scene slang, popularized by Cab Calloway's Hepster's Dictionary (1938/1944). This is the most research-intensive style due to the specific vocabulary required for authenticity. The register is cool, hip, knowing — a "hep cat" who always knows what time it is without checking a clock.

**Confidence:** MEDIUM — vocabulary sourced from Cab Calloway's Hepster's Dictionary and documented 1940s Afro-American vernacular. Exact phrase naturalness depends on implementation judgment.

**Key vocabulary atoms (sourced from documented Jive lexicon):**

| Jive Word/Phrase | Meaning | Use in clock phrase |
|------------------|---------|---------------------|
| `dig` | understand, know | "dig — it's {h}" |
| `cat` | cool person (generic address) | closing interjection |
| `hip` | aware, in the know | "you hip to {h}" |
| `solid` | excellent, confirmed | affirmation |
| `daddy-o` | address to a man (generic) | closer |
| `real gone` | absorbed, away | time passing |
| `in the groove` | performing well | things proceeding |
| `blow your wig` | to be astounded | surprise at the time |
| `gimme some skin` | handshake, greeting | N/A (too gesture-based) |
| `nix` | nothing, nixed | "nix on {h}" = not quite {h} |
| `square` | uncool person | N/A (not time-related) |
| `put down` | to say/express | "put it down as {h}" |
| `spill` | to tell, reveal | N/A |
| `the real deal` | the truth | "the real deal is {h}" |
| `gone` | lost in the music/moment | time-passing connotation |

**Full bucket table:**

| Bucket (≤min) | Template | Notes |
|---------------|----------|-------|
| 2 | `{h} on the nose, daddy-o` | "on the nose" = exact; "daddy-o" is authentic Jive address |
| 7 | `just past {h}, dig it` | "dig it" = understand/feel it |
| 12 | `ten past {h}, solid` | "solid" = confirmed |
| 17 | `quarter past {h}, you hip?` | "hip" = aware |
| 22 | `past the quarter, cat` | generic cool address |
| 27 | `near half past {h}, real gone` | "real gone" = time is flying |
| 32 | `half past {h}, in the groove` | things proceeding smoothly |
| 37 | `just past half {h}, daddy-o` | |
| 42 | `almost quarter to {h1}, dig` | |
| 47 | `quarter to {h1}, solid` | |
| 52 | `nearly {h1}, blow your wig` | the hour is nearly here — astounding |
| 59 | `almost {h1}, that's the deal` | "that's the deal" = that's reality |

Special: noon → `"high noon, daddy-o"`, midnight → `"the witching hour, cat"`

**Implementation note:** Jive vocabulary does not require phonetic respelling (no "iz" suffix, no apostrophe abuse). The documented 1940s lexicon uses real words with specific meanings. Phonetic eye-dialect would be inauthentic and offensive. Use the actual vocabulary.

---

### E. Valley Girl Phrase Style

**Philosophy:** Early-1980s San Fernando Valley (California) teenage speech patterns, popularized by Frank Zappa's 1982 "Valley Girl." Key markers: `like` as a verbal filler/quotative, `totally`, `literally` as intensifiers, `oh my god` / `omg`, upspeak (questions in declarative context), `so` as intensifier, `whatever`, `fer sure` (for sure). The voice is enthusiastic but vague about specifics.

**Key vocabulary atoms:**
- `like` — filler before almost anything
- `totally` — intensifier
- `literally` — intensifier (often non-literal)
- `omg` / `oh my god` — reaction
- `fer sure` / `for sure` — affirmation
- `so` — intensifier ("so almost noon")
- `whatever` — dismissal or closure
- `as if` — disbelief (Clueless-era extension)
- Upspeak marker: question-inflected statement (hard to render in text; omit or use "...?")

**Full bucket table:**

| Bucket (≤min) | Template | Notes |
|---------------|----------|-------|
| 2 | `{h} o'clock, like, literally` | |
| 7 | `like, just after {h}` | filler-first is characteristic |
| 12 | `ten past {h}, totally` | |
| 17 | `like, quarter past {h}` | |
| 22 | `omg, still quarter past {h}` | |
| 27 | `like, almost half past {h}` | |
| 32 | `half past {h}, fer sure` | |
| 37 | `like, just past half {h}` | |
| 42 | `so almost quarter to {h1}` | |
| 47 | `quarter to {h1}, whatever` | dismissal |
| 52 | `like, nearly {h1}` | |
| 59 | `omg, almost {h1}` | |

Special: noon → `"like, it's literally noon"`, midnight → `"omg it's literally midnight"`

---

### F. Yoda Phrase Style

**Philosophy:** Yoda's speech in the Star Wars films (canonical: The Empire Strikes Back, Return of the Jedi) follows Object-Subject-Verb (OSV) word order in many but not all sentences. The pattern is: move the normal last clause to the front, append "it is" or "there is" at the end. The voice is deliberate, wise, slightly archaic ("mmm", "yes"). Key rule: do NOT use Yoda for every single phrase — he speaks normally sometimes. But for a clock, the inversion is the point.

**Inversion rule (for implementation):**
- "It is {h} o'clock" → "{h} o'clock, it is"
- "Just past {h}" → "Past {h}, just"
- "Almost {h1}" → "{h1}, almost it is" (or "{h1} near, it is")
- "Quarter past {h}" → "Quarter past {h}, it is" (subject-verb swap only)
- "Half past {h}" → "Half past {h}, yes" (sometimes Yoda just agrees)

**Full bucket table:**

| Bucket (≤min) | Template | Notes |
|---------------|----------|-------|
| 2 | `{h} o'clock, it is` | canonical inversion |
| 7 | `past {h}, just gone it is` | |
| 12 | `ten past {h}, mmm` | "mmm" is characteristic Yoda filler |
| 17 | `quarter past {h}, yes` | simple affirmation |
| 22 | `past the quarter of {h}, it is` | |
| 27 | `near half past {h}, we are` | "we are" includes the user |
| 32 | `half past {h}, mmm` | |
| 37 | `past the half, just` | |
| 42 | `quarter to {h1}, nearly` | |
| 47 | `quarter to {h1}, it is` | |
| 52 | `nearly {h1}, yes` | |
| 59 | `{h1} approaches` | unambiguous; Yoda can speak normally |

Special: noon → `"noon it is, hmm"`, midnight → `"midnight, the dark hour, yes"`

---

### G. Shakespearean Phrase Style

**Philosophy:** Early Modern English (EME) as used in Shakespeare's plays (1590s–1610s). Key markers: second-person singular pronoun "thou/thee/thy", verb inflections "-eth" (third person singular present), "-est" (second person singular), "doth", "hath", "hark", "'tis". Time announcements in the plays use: "the clock hath stricken [n]", "it strikes [n]", "the bell hath rung". Phrasing tends toward proclamation: "Hark!" opening, formal statement, sometimes exclamatory close.

**Key vocabulary atoms:**
- `Hark` — listen / pay attention (opening exclamation)
- `'Tis` — it is
- `the [hour]th hour` — formal hour naming
- `hath struck` / `hath stricken` — clock-striking idiom (documented in Macbeth, Julius Caesar, etc.)
- `doth` — does (third person singular)
- `nigh` — near/almost
- `hence` — from here / therefore
- `methinks` — I think
- `forsooth` — in truth
- `anon` — soon

**Hour words for Shakespearean:** ordinal-style phrases. Use a separate ordinal array:
`["", "first", "second", "third", "fourth", "fifth", "sixth", "seventh", "eighth", "ninth", "tenth", "eleventh", "twelfth"]`

**Full bucket table:**

| Bucket (≤min) | Template | Notes |
|---------------|----------|-------|
| 2 | `Hark! The {h}th hour hath struck` | formal proclamation; needs ordinal array |
| 7 | `'Tis just past the {h}th hour` | |
| 12 | `Ten minutes past the {h}th hour` | |
| 17 | `A quarter past the {h}th hour` | |
| 22 | `Past the quarter of {h}` | simpler form |
| 27 | `Nigh on half past {h}` | "nigh on" = almost; shared with Pirate |
| 32 | `Half past the {h}th hour, forsooth` | |
| 37 | `The half hour is spent` | hour-agnostic; like Poetic pattern |
| 42 | `Nigh on a quarter to {h1}` | |
| 47 | `A quarter to {h1}, methinks` | |
| 52 | `Nearly {h1}, anon` | "anon" = soon |
| 59 | `Almost {h1}, forsooth` | |

Special: noon → `"Hark! 'Tis the noontide hour"`, midnight → `"The witching hour doth toll"`

**Implementation note on ordinal array:** The Shakespearean provider needs its own `OrdinalWords` array (["", "first", "second", ...]) for the `{h}` token in ordinal contexts. Alternatively, use a new `{ho}` token for ordinal-hour. The provider can resolve internally without changing `IPhraseProvider`. Recommend: add a private `OrdinalHourWords` array and resolve `{ho}` token alongside `{h}` and `{h1}` within `GetPhrase`. This keeps the interface stable.

---

## Nixie Tube Clock Visual Specification

### What a Nixie Tube Is

A Nixie tube (1950s–1970s technology) is a glass tube filled with neon gas containing 10 wire-formed cathodes shaped as digits 0–9, stacked front-to-back. The active cathode glows orange when current is applied. All 10 digit shapes are visible simultaneously — inactive ones appear as faint ghostly shadows behind the lit digit. This "stacked ghost" effect is the defining visual characteristic.

### Visual Elements (WPF-Native Implementation)

#### 1. Warm Orange Glow / Bloom

The active digit emits warm orange-amber light with a soft atmospheric glow around it.

**Color targets:**
- Active digit color: `#FFFF8C2F` (warm amber-orange, ~590nm wavelength equivalent)
- Glow core: same color at full opacity
- Glow bloom: `RadialGradientBrush` centered on digit, inner stop `#80FF8C2F` (50% alpha), outer stop `#00FF6A00` (0% alpha, deep orange)
- Background (tube interior): very dark warm black `#FF0A0500` — pure black is too cold; the neon gas gives a faint warm ambient

**WPF approach:** Layer a `RadialGradientBrush` `Ellipse` or `Rectangle` behind the digit text at slightly larger bounds. `BlurEffect` (`Radius=8`) on the glow layer adds bloom. Text itself is unblurred.

#### 2. Stacked Ghost Digits

All 10 digits (0–9) should be visible as faint ghosts behind the active digit. In a real tube they are physically stacked; in WPF simulation they are rendered at very low opacity in the same position.

**Ghost rendering approach:**
- Ghost color: `#18FF8C2F` — same orange but at ~10% alpha (0x18 = 24/255 ≈ 9.4%)
- Ghost digits are the full set 0–9 rendered at the same Canvas position, below the active digit
- Active digit is rendered last (topmost), full opacity
- All rendered as `TextBlock` or `Path` elements with `FontFamily="Courier New"` or a custom digit font
- Note: real Nixie tubes have varying ghost intensity by digit position in the stack. Simulating this exactly requires per-digit alpha values. For v3.4, uniform ghost alpha is acceptable.

**Alternative approach for digit rendering:** Use `TextBlock` with a monospace font. The digits 0–9 in Courier New are all the same width and have a usable retro character. A dedicated Nixie-style font (e.g., "DSEG7" family) is not required — the glow and ghost effects carry the visual effect.

#### 3. Glass Tube Border

Each digit slot is enclosed in a rounded-rectangle border simulating the glass tube envelope.

**WPF approach:**
- `Border` with `CornerRadius="8"` (or similar, proportional to digit size)
- `BorderBrush`: `LinearGradientBrush` from `#60FFFFFF` (top-left highlight, ~38% white) to `#20FFFFFF` (bottom-right, ~12% white) — simulates glass reflection
- `BorderThickness`: 2px
- `Background`: the dark warm background `#FF0A0500`
- Outer glow on the border: additional `DropShadowEffect` or a second outer border at lower opacity to simulate the glass catching ambient light

#### 4. Wire Mesh / Anode Grid Overlay

Real Nixie tubes have a wire mesh anode grid visible in front of the digits, creating a subtle grid pattern.

**WPF approach (pragmatic):** A `DrawingBrush` tiled pattern of very thin horizontal or horizontal+vertical lines at ~5% white opacity overlaid on the digit slot.

**Pattern spec:**
- Tile size: 4×4px logical units
- Line color: `#0DFFFFFF` (~5% white)
- Line thickness: 0.5px (sub-pixel; renders as very faint)
- Orientation: horizontal lines only (real Nixie mesh is predominantly horizontal)
- Applied as: `Rectangle.Fill = DrawingBrush` overlaid above the digit content, pointer-events-transparent

**Alternative (simpler):** A single `Rectangle` with `Opacity=0.05` and a `DrawingBrush` tile. This avoids per-element overhead.

#### 5. Layout Structure

```
NixieClockView (StackPanel, Horizontal)
    NixieDigit (digit 0 — tens of hours)
    NixieDigit (digit 1 — units of hours)
    NixieColon (two dots, static)
    NixieDigit (digit 2 — tens of minutes)
    NixieDigit (digit 3 — units of minutes)
```

Each `NixieDigit`:
```
Canvas (clip boundary = tube size)
    Rectangle (tube background, dark warm black)
    TextBlock × 10 (ghost digits 0–9, stacked, ghost opacity)
    Ellipse/Rectangle (glow bloom, RadialGradientBrush, BlurEffect)
    TextBlock (active digit, full opacity, no blur)
    Rectangle (wire mesh overlay, DrawingBrush tile)
    Border (glass tube border, on top for reflection effect)
```

**Size:** Nixie digits should default to the equivalent of "Medium" font size. Base height ~60px logical units. Width proportional (~48px). Total clock width for HH:MM: ~4 × 48px + colon ~16px = ~208px. This fits within the existing widget width constraints.

#### 6. Color Palette — Hardcoded Values

| Element | Color | Hex | Notes |
|---------|-------|-----|-------|
| Active digit | Warm amber | `#FFFF8C2F` | Primary orange; ~590nm |
| Ghost digits | Faint amber | `#18FF8C2F` | ~9% alpha |
| Glow inner | Bright amber | `#80FF8C2F` | 50% alpha for RadialGradient |
| Glow outer | Deep orange | `#00FF6A00` | 0% alpha (transparent edge) |
| Tube background | Warm black | `#FF0A0500` | Slightly warm, not pure black |
| Glass border highlight | White glass | `#60FFFFFF` | Top/left glass reflection |
| Glass border shadow | Dim white | `#20FFFFFF` | Bottom/right |
| Wire mesh | Very faint white | `#0DFFFFFF` | ~5% overlay |

**Do not wire these to AppSettings.AccentColor.** The Nixie aesthetic depends entirely on this specific palette. User customization of Nixie colors is a v5+ concern.

---

### Dial Enhancements

#### Dial Shape: Round vs Oval

**Expected behavior:**
- Round: current behavior (width == height, circular canvas)
- Oval: width > height, approximately 4:3 or 3:2 ratio (e.g., 120×90 at medium size)
- Clock hands remain same angular positions; oval stretches the canvas, not the hand angles
- Hour markers are repositioned to match the oval perimeter (computed from the canvas geometry)
- Persists as `AppSettings.DialShape` = `"Round"` | `"Oval"`

**WPF approach:** `DialGeometry` already computes all positions from a center point and radius. For oval: provide `radiusX` and `radiusY` separately. Hour marker positions use `EllipseGeometry` math. Hand tips trace the same angle but the canvas scales them to the oval bounds.

**Complexity:** LOW. `DialGeometry` is already parametric; adding `radiusX`/`radiusY` split is a small change.

#### Dial Size Scaling with Font Size

**Expected behavior:**

| Font Size Setting | Dial Canvas Size (Round) | Dial Canvas Size (Oval) |
|-------------------|--------------------------|-------------------------|
| Small (24pt) | 80×80 | 100×75 |
| Medium (32pt) | 110×110 | 140×105 |
| Large (42pt) | 150×150 | 190×140 |

These sizes maintain consistent visual weight relative to the phrase clock text at each font size. The dial currently has a fixed size that was designed for Medium. Small and Large should visually match the phrase/LCD clock at those sizes.

**Implementation:** Add a static lookup in `MainWindow` (or `DialGeometry`) mapping `FontSize` enum value to `(double width, double height)` pairs for both shapes. Called when font size or dial shape changes.

---

## Competitor Feature Analysis

| Feature | Other desktop clock widgets | Our Approach |
|---------|----------------------------|--------------|
| Phrase personalities | No other widget has vocabulary personalities | 7 English styles (8 total with existing Poetic/Terse) — no competitor offers this |
| Nixie tube rendering | Image-based skins in Rainmeter; pre-rendered bitmap sprites | Pure WPF vector + RadialGradientBrush — no image assets, scales at any DPI |
| Dial shape options | Mostly round-only; some are fixed rectangular segments | Round + oval with geometry-based rendering |
| Retro clock aesthetics | Common; LCD 7-segment is well-worn | Nixie tube is underrepresented in software; distinctive |

---

## Sources

- `FuzzyClock.Core/EnglishPhraseProvider.cs`, `RudePhraseProvider.cs`, `PoeticPhraseProvider.cs`, `TersePhraseProvider.cs` — direct codebase inspection (HIGH confidence)
- `FuzzyClock.Core/IPhraseProvider.cs`, `PhraseEngine.cs` — direct codebase inspection (HIGH confidence)
- `FuzzyClock.Core/SevenSegmentEncoder.cs`, `FuzzyClock.App/Controls/SevenSegmentDigit.xaml.cs` — LCD rendering pattern for Nixie analog (HIGH confidence)
- `FuzzyClock.App/ClockType.cs` — enum extension point (HIGH confidence)
- `.planning/REQUIREMENTS.md` v3.4 — requirement source (HIGH confidence)
- Cab Calloway's Hepster's Dictionary (1938, 1944 editions) — Jive vocabulary source (MEDIUM confidence; vocabulary documented, but natural phrase composition judgment is the implementer's)
- Shakespeare Corpus — EME vocabulary (HIGH confidence; "hark", "forsooth", "'tis", "anon", "nigh", "methinks" are well-attested)
- Nixie tube visual characteristics — first-hand knowledge of IN-12, IN-14, Z573M tube appearance; corroborated by hobbyist Nixie clock community documentation (HIGH confidence on visual elements; MEDIUM confidence on exact WPF color values needing tuning)
- WPF `RadialGradientBrush`, `DrawingBrush`, `BlurEffect` — standard WPF APIs (HIGH confidence)
- Valley Girl slang — Frank Zappa "Valley Girl" (1982), Clueless (1995), documented in linguist studies of California English (HIGH confidence)
- Star Wars Yoda dialog — The Empire Strikes Back (1980), Return of the Jedi (1983) canonical dialog (HIGH confidence)
- Pirate dialect — well-documented theatrical pirate register; ITLAPD vocabulary (HIGH confidence)

---

*Feature research for: FuzzyStatsClock v3.4 — phrase personalities, Nixie tube clock, dial enhancements*
*Researched: 2026-03-11*
