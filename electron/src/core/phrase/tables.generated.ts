// GENERATED FILE -- do not hand-edit.
//
// Produced by tools/TableExport, which reflects the compiled FuzzyClock.Core providers.
// Regenerate with `dotnet run --project tools/TableExport -c Release` from the repo root.
//
// DATA ONLY. Every string here was read out of a live C# field, so the tables cannot
// drift from the original by a typo. None of the BEHAVIOUR came across this way: bucket
// selection, template substitution, the noon and midnight special cases and the
// structured-phrase split are all hand-ported, and checked against the ISC-13 golden
// fixtures in electron/test/fixtures/. A generator that emitted logic as well as data
// would leave the port agreeing with itself.
//
// NOT EVERYTHING IS HERE. Only en-classic and en-terse declare their noon/midnight
// candidates as static fields; the other 16 providers hold that text in method locals,
// which have no metadata to reflect, so those sets live in the hand-written specs.
// A locale's `words` object therefore contains exactly the static string[] fields its C#
// provider declares -- which keys exist varies by locale, and that variation is the C#
// shape showing through rather than an omission. The absence of a `noonCandidates` key
// is the signal that the locale's specials are hand-copied.
//
// 18 locales, 899 strings, generated from the .NET assembly metadata.

/** One time bucket: the inclusive upper bound in minutes, and every template allowed in it. */
export interface PhraseBucket {
  readonly upperBound: number;
  readonly candidates: readonly string[];
}

export interface LocaleTables {
  readonly locale: string;
  /** The C# type the tables were read from, for tracing a string back to its origin. */
  readonly source: string;
  /**
   * How the C# declared its buckets. `"template"` locales carry exactly one candidate per
   * bucket and are therefore deterministic; `"candidates"` locales pick at random.
   */
  readonly declaredShape: "candidates" | "template";
  readonly buckets: readonly PhraseBucket[];
  /** The provider's static string[] fields, camelCased. Keys vary by locale. */
  readonly words: { readonly [name: string]: readonly string[] };
}

/** `de` -- GermanPhraseProvider, template shape from `Buckets`: 12 buckets, 25 strings. */
export const DE = {
  locale: "de",
  source: "GermanPhraseProvider",
  declaredShape: "template",
  buckets: [
    { upperBound: 2, candidates: ["{h}"] },
    { upperBound: 7, candidates: ["kurz nach {h}"] },
    { upperBound: 12, candidates: ["zehn nach {h}"] },
    { upperBound: 17, candidates: ["Viertel nach {h}"] },
    { upperBound: 22, candidates: ["zwanzig nach {h}"] },
    { upperBound: 27, candidates: ["kurz vor halb {h1}"] },
    { upperBound: 32, candidates: ["halb {h1}"] },
    { upperBound: 37, candidates: ["kurz nach halb {h1}"] },
    { upperBound: 42, candidates: ["zwanzig vor {h1}"] },
    { upperBound: 47, candidates: ["Viertel vor {h1}"] },
    { upperBound: 52, candidates: ["zehn vor {h1}"] },
    { upperBound: 59, candidates: ["kurz vor {h1}"] },
  ],
  words: {
    hourWords: ["", "ein Uhr", "zwei Uhr", "drei Uhr", "vier Uhr", "fünf Uhr", "sechs Uhr", "sieben Uhr", "acht Uhr", "neun Uhr", "zehn Uhr", "elf Uhr", "zwölf Uhr"],
  },
} as const;

/** `en-classic` -- EnglishPhraseProvider, candidates shape from `Buckets`: 12 buckets, 83 strings. */
export const EN_CLASSIC = {
  locale: "en-classic",
  source: "EnglishPhraseProvider",
  declaredShape: "candidates",
  buckets: [
    { upperBound: 2, candidates: ["{h} o'clock", "it's {h} o'clock", "exactly {h}", "{h} on the dot", "just {h}"] },
    { upperBound: 7, candidates: ["just after {h}", "a little after {h}", "five past {h}", "five after {h}", "just past {h}"] },
    { upperBound: 12, candidates: ["ten past {h}", "ten after {h}", "ten minutes past {h}", "ten minutes after {h}", "a little past {h}"] },
    { upperBound: 17, candidates: ["a quarter past {h}", "quarter past {h}", "quarter after {h}", "fifteen past {h}", "fifteen after {h}"] },
    { upperBound: 22, candidates: ["just after quarter past {h}", "twenty past {h}", "twenty after {h}", "twenty minutes past {h}", "a little past quarter past {h}"] },
    { upperBound: 27, candidates: ["almost half past {h}", "nearly half past {h}", "coming up on half past {h}", "approaching half past {h}", "about twenty-five past {h}"] },
    { upperBound: 32, candidates: ["half past {h}", "half past {h} exactly", "thirty past {h}", "thirty minutes past {h}", "it's half past {h}"] },
    { upperBound: 37, candidates: ["just past half past {h}", "a little after half past {h}", "just after half past {h}", "thirty-five past {h}", "a bit past half past {h}"] },
    { upperBound: 42, candidates: ["almost a quarter before {h1}", "twenty to {h1}", "twenty minutes to {h1}", "almost quarter to {h1}", "about twenty to {h1}"] },
    { upperBound: 47, candidates: ["a quarter before {h1}", "quarter to {h1}", "fifteen minutes to {h1}", "fifteen to {h1}", "a quarter to {h1}"] },
    { upperBound: 52, candidates: ["nearly {h1}", "ten to {h1}", "ten minutes to {h1}", "about ten to {h1}", "coming up on {h1}"] },
    { upperBound: 59, candidates: ["almost {h1}", "nearly {h1}", "just about {h1}", "a few minutes to {h1}", "not quite {h1}"] },
  ],
  words: {
    hourWords: ["", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve"],
    midnightCandidates: ["midnight", "twelve midnight", "the midnight hour", "twelve o'clock midnight", "dead of midnight"],
    noonCandidates: ["noon", "twelve noon", "midday", "noontime", "twelve o'clock noon"],
  },
} as const;

/** `en-dwarf` -- DwarfPhraseProvider, candidates shape from `Buckets`: 12 buckets, 61 strings. */
export const EN_DWARF = {
  locale: "en-dwarf",
  source: "DwarfPhraseProvider",
  declaredShape: "candidates",
  buckets: [
    { upperBound: 2, candidates: ["{h}, aye", "by the stone, it's {h}", "'tis {h}, bah", "{h} on the mark, blast it"] },
    { upperBound: 7, candidates: ["just past {h}, move on", "barely past {h}, bah", "a hair past {h} — get to work", "five past {h}, aye — no dawdlin'"] },
    { upperBound: 12, candidates: ["ten past {h}, bah", "ten past {h}, by the forge", "ten past {h} — the tunnels wait", "ten past {h}, aye"] },
    { upperBound: 17, candidates: ["a quarter past {h}", "a quarter past {h}, by the hammer", "quarter past {h} — get diggin'", "quarter past {h}, bah"] },
    { upperBound: 22, candidates: ["past the quarter, aye", "twenty past {h}, blast it", "twenty past {h}, by the stone", "twenty past {h} — the forge calls"] },
    { upperBound: 27, candidates: ["near half past {h}", "almost half past {h}, bah", "nigh on half past {h}, by the mountain", "coming up on half past {h}, aye"] },
    { upperBound: 32, candidates: ["half past {h}, get to work", "half past {h}, bah", "half past {h} — by the stone", "'tis half past {h}, aye"] },
    { upperBound: 37, candidates: ["just past half {h}, eh", "gone half past {h}, bah", "half past {h} and a bit — quit yer lollin'", "past the half, by the hammer"] },
    { upperBound: 42, candidates: ["near a quarter to {h1}", "almost quarter to {h1}, aye", "nigh on quarter to {h1} — blast it", "coming up on quarter to {h1}, bah"] },
    { upperBound: 47, candidates: ["quarter to {h1}, by the stone", "quarter to {h1}, aye", "a quarter before {h1} — move yerself", "quarter to {h1}, bah"] },
    { upperBound: 52, candidates: ["nearly {h1}, aye", "ten to {h1}, by the hammer", "ten to {h1} — almost done", "ten to {h1}, bah"] },
    { upperBound: 59, candidates: ["almost {h1}, quit yer dawdlin'", "nearly {h1} — aye, nearly", "five to {h1}, bah", "almost {h1}, by the stone"] },
  ],
  words: {
    hourWords: ["", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve"],
  },
} as const;

/** `en-jive` -- JivePhraseProvider, candidates shape from `Buckets`: 12 buckets, 73 strings. */
export const EN_JIVE = {
  locale: "en-jive",
  source: "JivePhraseProvider",
  declaredShape: "candidates",
  buckets: [
    { upperBound: 2, candidates: ["{h} on the nose, cat", "solid {h}, daddy-o — solid", "the clock's blowin' {h}, dig it", "{h} sharp, hep cat — all reet", "that's {h} right now, real gone"] },
    { upperBound: 7, candidates: ["just past {h}, daddy-o", "a tick past {h}, cat — dig", "barely gone {h}, you hip?", "five past {h}, in the groove", "gone {h} a tick, hep cat — solid"] },
    { upperBound: 12, candidates: ["ten past {h}, solid — real solid", "ten past {h}, righteous and true", "ten past {h}, in the groove, cat", "ten past {h} — latch on, daddy-o", "gone ten past {h}, dig it"] },
    { upperBound: 17, candidates: ["quarter past {h}, hep cat", "quarter past {h}, real gone — dig", "a quarter past {h} — solid, solid", "quarter past {h}, daddy-o — righteous", "gone a quarter past {h}, cat"] },
    { upperBound: 22, candidates: ["twenty past {h}, you hip?", "twenty past {h}, daddy-o — solid", "twenty past {h} — copacetic, cat", "gone twenty past {h}, all reet", "twenty past {h}, in the groove, dig"] },
    { upperBound: 27, candidates: ["near half past {h}, blow your wig", "comin' up on half past {h}, daddy-o", "almost half past {h}, real gone", "twenty-five past {h} — dig it, cat", "nigh on half past {h}, solid — solid"] },
    { upperBound: 32, candidates: ["half past {h}, in the groove", "half past {h}, solid — real solid", "half past {h}, all reet, daddy-o", "half past {h} — righteous, cat", "gone the half of {h}, dig it"] },
    { upperBound: 37, candidates: ["gone half past {h}, daddy-o", "just past the half of {h}, cat — dig", "half past {h} and a tick — solid", "gone the half, alligator — that's {h}", "past the half of {h}, real gone"] },
    { upperBound: 42, candidates: ["almost quarter to {h1}, dig it", "comin' up on quarter to {h1}, daddy-o", "near the quarter to {h1}, cat", "twenty to {h1} — solid, hep cat", "nigh on quarter to {h1}, blow your wig"] },
    { upperBound: 47, candidates: ["quarter to {h1}, solid — dig it", "a quarter before {h1}, hep cat", "quarter to {h1} — blow your wig", "fifteen to {h1}, daddy-o — righteous", "quarter to {h1}, all reet, cat"] },
    { upperBound: 52, candidates: ["ten to {h1}, blow your wig", "nearly {h1}, daddy-o — real gone", "ten to {h1}, cat — solid, solid", "ten to {h1} — copacetic, hep cat", "comin' up on {h1}, dig it"] },
    { upperBound: 59, candidates: ["almost {h1}, daddy-o — real gone", "nearly {h1}, cat — dig it", "five to {h1}, solid, hep cat", "comin' up on {h1} — blow your wig", "{h1} comin' round the bend, all reet"] },
  ],
  words: {
    hourWords: ["", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve"],
  },
} as const;

/** `en-pirate` -- PiratePhraseProvider, candidates shape from `Buckets`: 12 buckets, 73 strings. */
export const EN_PIRATE = {
  locale: "en-pirate",
  source: "PiratePhraseProvider",
  declaredShape: "candidates",
  buckets: [
    { upperBound: 2, candidates: ["eight bells strike {h}, arr", "mark {h} by the watch, yarr", "the glass shows {h}, steady on", "on the stroke of {h}, avast", "{h} bells true, by the log"] },
    { upperBound: 7, candidates: ["just past {h} bells, yarr", "barely past {h}, arr — steady as she goes", "a tick past {h} on the glass", "five past {h}, by the watch", "past the bell of {h}, blimey"] },
    { upperBound: 12, candidates: ["ten past {h}, arr — hold course", "ten past {h}, yarr — steady on", "ten past {h} by the log", "ten past {h}, blimey — mark it", "ten past {h} on the glass, avast"] },
    { upperBound: 17, candidates: ["a quarter past {h}, yarr", "quarter past {h}, arr — trim the sails", "quarter past {h}, by the crow's nest", "a quarter past {h} on the watch", "quarter past {h}, steady on course"] },
    { upperBound: 22, candidates: ["past the quarter bell of {h}, arr", "twenty past {h}, yarr — hold bearing", "twenty past {h}, arr — heave ho", "twenty past {h} by the glass", "twenty past {h}, aye — mark it"] },
    { upperBound: 27, candidates: ["nigh on half past {h}, arr", "near half past {h}, yarr — steady", "comin' up on half past {h}, avast", "almost half past {h} by the watch", "near the half-glass of {h}, blimey"] },
    { upperBound: 32, candidates: ["half past {h}, arr — steady as she goes", "half the glass of {h}, yarr", "gone the half-watch of {h}, avast", "half past {h}, trim yer course", "mid-watch past {h}, by the log"] },
    { upperBound: 37, candidates: ["just past the half bell of {h}, yarr", "gone half past {h}, arr — hold course", "half past {h} and a tick, blimey", "past the half-glass of {h}, steady on", "beyond half past {h}, mark it"] },
    { upperBound: 42, candidates: ["nigh on a quarter to {h1}, arr", "almost quarter to {h1}, yarr — steady", "near a quarter to {h1} by the watch", "comin' up on quarter to {h1}, avast", "twenty to {h1}, arr — trim course"] },
    { upperBound: 47, candidates: ["a quarter to {h1}, arr", "a quarter to {h1}, yarr — all hands", "a quarter to {h1}, man the watch", "fifteen minutes to {h1} by the glass", "quarter to {h1}, arr — hold bearing"] },
    { upperBound: 52, candidates: ["nearly {h1}, yarr — stand ready", "ten to {h1}, arr — all hands", "ten to {h1}, the watch nears end", "ten minutes to {h1}, by the log", "nigh on {h1}, blimey — steady on"] },
    { upperBound: 59, candidates: ["almost {h1}, arr — bells soon", "nearly {h1}, by the watch", "five to {h1}, yarr — make ready", "the glass nears {h1}, avast", "{h1} on the horizon, arr"] },
  ],
  words: {
    hourWords: ["", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve"],
  },
} as const;

/** `en-poetic` -- PoeticPhraseProvider, candidates shape from `Buckets`: 12 buckets, 61 strings. */
export const EN_POETIC = {
  locale: "en-poetic",
  source: "PoeticPhraseProvider",
  declaredShape: "candidates",
  buckets: [
    { upperBound: 2, candidates: ["the hour turns to {h}", "a new hour begins with {h}", "the clock whispers {h}", "the moment settles into {h}"] },
    { upperBound: 7, candidates: ["barely past {h}", "just into {h}", "a breath beyond {h}", "the first minutes drift past {h}"] },
    { upperBound: 12, candidates: ["ten quiet minutes into {h}", "still near the start of {h}", "the hour stretches, unhurried, past {h}", "settling into {h}"] },
    { upperBound: 17, candidates: ["a quarter of the hour past {h}", "fifteen minutes deep into {h}", "past the first quarter of {h}", "the hour unfolds beyond {h}"] },
    { upperBound: 22, candidates: ["twenty minutes into {h}", "drifting further from {h}", "well past {h}", "the hour leans forward from {h}"] },
    { upperBound: 27, candidates: ["the half-hour approaches, still {h}", "drifting toward the midpoint of {h}", "the minutes gather, still {h}", "approaching the halfway mark of {h}"] },
    { upperBound: 32, candidates: ["half the hour behind, still {h}", "the midpoint passes for {h}", "the hour splits in two around {h}", "halfway through {h}"] },
    { upperBound: 37, candidates: ["past the middle of {h}", "more of the hour behind than ahead for {h}", "the balance tips past {h}", "the second half begins for {h}"] },
    { upperBound: 42, candidates: ["twenty minutes left before {h1}", "the hour winds toward {h1}", "the minutes narrow toward {h1}", "drawing closer to {h1}"] },
    { upperBound: 47, candidates: ["a quarter hour remains before {h1}", "fifteen minutes until {h1}", "the hour leans toward {h1}", "not long now before {h1}"] },
    { upperBound: 52, candidates: ["the hour narrows toward {h1}", "only minutes now before {h1}", "the last stretch before {h1}", "time closes in on {h1}"] },
    { upperBound: 59, candidates: ["the clock exhales toward {h1}", "nearly {h1}", "the hour dissolves into {h1}", "moments away from {h1}"] },
  ],
  words: {
    hourWords: ["", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve"],
  },
} as const;

/** `en-rude` -- RudePhraseProvider, candidates shape from `Buckets`: 12 buckets, 62 strings. */
export const EN_RUDE = {
  locale: "en-rude",
  source: "RudePhraseProvider",
  declaredShape: "candidates",
  buckets: [
    { upperBound: 2, candidates: ["it's {h}. still you.", "congratulations. it's {h}.", "{h} o'clock. as if that changes anything.", "it is {h}. you're welcome.", "{h} on the dot. not that it helps."] },
    { upperBound: 7, candidates: ["you couldn't even wait. five past {h}.", "barely past {h}. already desperate.", "five past {h}, since you need to know.", "just gone {h}. barely started and already checking."] },
    { upperBound: 12, candidates: ["ten past {h}. remarkable progress.", "ten past {h}. the day marches on without you.", "ten past {h}, for your records.", "roughly ten past {h}. precision is a luxury you've forfeited."] },
    { upperBound: 17, candidates: ["quarter past {h}. thrilling.", "quarter past {h}. make something of it.", "a quarter past {h}, in case you'd forgotten.", "quarter past {h}. still here, are we."] },
    { upperBound: 22, candidates: ["twenty past {h}. still going.", "gone quarter past {h}. congratulations.", "twenty past {h}. not my problem.", "twenty past {h}. the universe remains indifferent."] },
    { upperBound: 27, candidates: ["nearly half past {h}. almost impressive.", "coming up on half past {h}. brace yourself.", "twenty-five past {h}, though I fail to see why you care.", "not quite half past {h} yet. sit with that."] },
    { upperBound: 32, candidates: ["half past {h}. half the day is gone.", "half past {h}. you're welcome.", "half past {h}. still here.", "thirty minutes past {h}. magnificent."] },
    { upperBound: 37, candidates: ["just past half past {h}. agonizing.", "gone half past {h}. do something.", "half past {h} and change. great.", "thirty-something past {h}. the specifics escape me."] },
    { upperBound: 42, candidates: ["twenty to {h1}. nearly there.", "almost quarter to {h1}. patience.", "twenty minutes to {h1}, if you must know.", "approaching quarter to {h1}. riveting."] },
    { upperBound: 47, candidates: ["quarter to {h1}. one more time.", "fifteen minutes until {h1}. counting.", "quarter to {h1}. nearly over.", "fifteen to {h1}. almost done with this hour."] },
    { upperBound: 52, candidates: ["ten to {h1}. try not to expire.", "nearly {h1}. almost through.", "ten minutes to {h1}, if you can hold on.", "ten to {h1}. the end is near, at least for this hour."] },
    { upperBound: 59, candidates: ["five to {h1}. almost over.", "nearly {h1}. we're almost done here.", "almost {h1}. thank goodness.", "five minutes to {h1}. you've made it this far."] },
  ],
  words: {
    hourWords: ["", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve"],
  },
} as const;

/** `en-shakespeare` -- ShakespearePhraseProvider, candidates shape from `Buckets`: 12 buckets, 74 strings. */
export const EN_SHAKESPEARE = {
  locale: "en-shakespeare",
  source: "ShakespearePhraseProvider",
  declaredShape: "candidates",
  buckets: [
    { upperBound: 2, candidates: ["Hark! The {ho} hour hath struck", "'Tis {h} o'clock, forsooth", "The {ho} hour is upon us, verily", "Hark! 'Tis the {ho} hour"] },
    { upperBound: 7, candidates: ["'Tis just past the {ho} hour", "The {ho} hour hath barely passed, forsooth", "Just past {h}, verily", "Just past the {ho} hour, methinks"] },
    { upperBound: 12, candidates: ["Ten minutes past the {ho} hour", "'Tis ten past {h}, forsooth", "Ten past {h}, verily", "Ten minutes hence from {h}, methinks"] },
    { upperBound: 17, candidates: ["A quarter past the {ho} hour", "'Tis a quarter past {h}, forsooth", "A quarter past {h}, verily", "A quarter hence past {h}, methinks"] },
    { upperBound: 22, candidates: ["Past the quarter of {h}", "Twenty minutes past {h}, forsooth", "'Tis twenty past {h}, verily", "Past the quarter of {h}, prithee heed"] },
    { upperBound: 27, candidates: ["Nigh on half past {h}", "Near the half past {h}, forsooth", "Nigh on half past {h}, verily", "'Tis almost half past {h}, methinks"] },
    { upperBound: 32, candidates: ["Half past the {ho} hour, forsooth", "'Tis half past {h}, verily", "Half past {h}, methinks", "The half hour of {h} hath struck, forsooth"] },
    { upperBound: 37, candidates: ["The half hour is spent", "Past the half, forsooth", "The half hour is spent, verily", "Gone is the half past {h}, methinks"] },
    { upperBound: 42, candidates: ["Nigh on a quarter to {h1}", "Almost a quarter ere {h1}, forsooth", "Nigh on quarter to {h1}, verily", "'Tis nigh on a quarter to {h1}, methinks"] },
    { upperBound: 47, candidates: ["A quarter to {h1}, methinks", "'Tis a quarter ere {h1}, forsooth", "A quarter to {h1}, verily", "A quarter before {h1}, prithee"] },
    { upperBound: 52, candidates: ["Nearly {h1}, anon", "Ten minutes ere {h1}, forsooth", "Ten to {h1}, methinks", "Nearly {h1}, verily"] },
    { upperBound: 59, candidates: ["Almost {h1}, forsooth", "'Tis nigh upon {h1}, verily", "Almost {h1}, methinks", "Five minutes ere {h1}, forsooth"] },
  ],
  words: {
    hourWords: ["", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve"],
    ordinalHourWords: ["", "first", "second", "third", "fourth", "fifth", "sixth", "seventh", "eighth", "ninth", "tenth", "eleventh", "twelfth"],
  },
} as const;

/** `en-terse` -- TersePhraseProvider, candidates shape from `Buckets`: 11 buckets, 78 strings. */
export const EN_TERSE = {
  locale: "en-terse",
  source: "TersePhraseProvider",
  declaredShape: "candidates",
  buckets: [
    { upperBound: 2, candidates: ["{h}", "{h} sharp", "{h} exactly", "dead on {h}", "bang on {h}"] },
    { upperBound: 7, candidates: ["just gone {h}", "gone {h}", "just past {h}", "bit past {h}", "barely gone {h}"] },
    { upperBound: 12, candidates: ["ten past {h}", "ten past {h} odd", "just past ten past {h}", "gone ten past {h}", "nearing quarter past {h}"] },
    { upperBound: 17, candidates: ["quarter past {h}", "quarter past {h} now", "gone quarter past {h}", "just on quarter past {h}", "quarter gone {h}"] },
    { upperBound: 22, candidates: ["twenty past {h}", "gone twenty past {h}", "coming up to half {h1}", "twenty past {h} odd", "well past quarter past {h}"] },
    { upperBound: 32, candidates: ["half {h1}", "gone half {h1}", "half {h1} now", "just on half {h1}", "about half {h1}"] },
    { upperBound: 37, candidates: ["just gone half {h}", "gone half {h}", "bit past half {h}", "just past half {h}", "half {h} gone"] },
    { upperBound: 42, candidates: ["twenty to {h1}", "twenty to {h1} odd", "gone twenty to {h1}", "coming up to quarter to {h1}", "nearly quarter to {h1}"] },
    { upperBound: 47, candidates: ["quarter to {h1}", "quarter to {h1} now", "gone quarter to {h1}", "just on quarter to {h1}", "nearing {h1}"] },
    { upperBound: 52, candidates: ["ten to {h1}", "ten to {h1} odd", "gone ten to {h1}", "nearly {h1}", "coming up on {h1}"] },
    { upperBound: 59, candidates: ["nearly {h1}", "almost {h1}", "not quite {h1}", "all but {h1}", "any minute now {h1}"] },
  ],
  words: {
    hourWords: ["", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve"],
    midnightCandidates: ["midnight", "dead on midnight", "midnight sharp", "bang on midnight", "the midnight hour"],
    noonCandidates: ["noon", "midday", "dead on noon", "noon sharp", "bang on noon"],
  },
} as const;

/** `en-valleygirl` -- ValleyGirlPhraseProvider, candidates shape from `Buckets`: 12 buckets, 61 strings. */
export const EN_VALLEYGIRL = {
  locale: "en-valleygirl",
  source: "ValleyGirlPhraseProvider",
  declaredShape: "candidates",
  buckets: [
    { upperBound: 2, candidates: ["{h} o'clock, like, literally", "omg it's literally {h}", "like, {h} exactly — so weird", "{h} o'clock? fer sure"] },
    { upperBound: 7, candidates: ["like, just after {h}", "like, barely past {h} — whatever", "omg, barely past {h}", "like, five past {h}, totally"] },
    { upperBound: 12, candidates: ["ten past {h}, totally", "like, ten past {h} — whatever", "ten past {h}, fer sure", "like, ten past {h}, I can't even"] },
    { upperBound: 17, candidates: ["like, quarter past {h}", "quarter past {h}, totally", "like, quarter past {h} — omg", "quarter past {h}, fer sure"] },
    { upperBound: 22, candidates: ["omg, still going past {h}", "like, twenty past {h} — whatever", "twenty past {h}, totally", "twenty past {h}, fer sure, like"] },
    { upperBound: 27, candidates: ["like, almost half past {h}", "omg, nearly half past {h}", "like, almost half past {h} — I'm like dying", "almost half past {h}, totally"] },
    { upperBound: 32, candidates: ["half past {h}, fer sure", "like, half past {h} — totally", "half past {h}, omg", "half past {h} — like, fer sure"] },
    { upperBound: 37, candidates: ["like, just past half past {h}", "omg, gone past half past {h}", "like, past the half — whatever", "like, half past {h} and then some"] },
    { upperBound: 42, candidates: ["so almost quarter to {h1}", "like, nearly quarter to {h1}", "omg, almost quarter to {h1}", "like, almost quarter to {h1} — totally"] },
    { upperBound: 47, candidates: ["quarter to {h1}, whatever", "like, quarter to {h1} — totally", "quarter to {h1}, omg", "like, quarter to {h1}, fer sure"] },
    { upperBound: 52, candidates: ["like, nearly {h1}", "omg, nearly {h1} already", "like, ten to {h1} — whatever", "ten to {h1}, I can't even"] },
    { upperBound: 59, candidates: ["omg, almost {h1}", "like, almost {h1} — fer sure", "almost {h1}, totally", "like, nearly {h1}, omg"] },
  ],
  words: {
    hourWords: ["", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve"],
  },
} as const;

/** `en-yoda` -- YodaPhraseProvider, candidates shape from `Buckets`: 12 buckets, 73 strings. */
export const EN_YODA = {
  locale: "en-yoda",
  source: "YodaPhraseProvider",
  declaredShape: "candidates",
  buckets: [
    { upperBound: 2, candidates: ["{h} o'clock, it is", "the hour of {h}, upon us it is", "{h}, the time it is, hmm", "hmm, {h} o'clock it is, yes", "{h} — struck, the hour it has"] },
    { upperBound: 7, candidates: ["just past {h}, it is", "past {h}, just gone it has, hmm", "barely past {h}, it is, yes", "a tick past {h}, we are", "gone past {h}, it has, mmm"] },
    { upperBound: 12, candidates: ["ten past {h}, it is, mmm", "ten minutes past {h}, it is", "ten past {h}, reached we have, yes", "ten past {h} it is, hmm", "past {h} by ten, it is"] },
    { upperBound: 17, candidates: ["quarter past {h}, it is, yes", "a quarter past {h}, reached we have", "quarter past {h}, it is, hmm", "a quarter of the hour past {h}, it is", "past the quarter of {h}, we are, mmm"] },
    { upperBound: 22, candidates: ["twenty past {h}, it is", "past the quarter of {h}, gone we have, hmm", "twenty past {h}, it is, yes", "gone twenty past {h}, it has", "twenty past {h}, reached we have, mmm"] },
    { upperBound: 27, candidates: ["near half past {h}, we are", "almost half past {h}, it is, yes", "nigh on half past {h}, it is", "approaching half past {h}, we are, hmm", "near the half of {h}, it is, mmm"] },
    { upperBound: 32, candidates: ["half past {h}, it is, mmm", "the half hour of {h}, passed it has", "hmm, half past {h} we are, yes", "half past {h}, reached we have", "gone the half of {h}, it has"] },
    { upperBound: 37, candidates: ["just past the half of {h}, we are", "beyond half past {h}, it is, hmm", "past the half of {h}, gone we have, yes", "beyond the half of {h}, we are, mmm", "just past half past {h}, it is"] },
    { upperBound: 42, candidates: ["near a quarter to {h1}, we are", "almost quarter to {h1}, it is, hmm", "nearing quarter to {h1}, we are, yes", "close to quarter to {h1}, it is", "approaching {h1}, we are, mmm"] },
    { upperBound: 47, candidates: ["quarter to {h1}, it is", "a quarter before {h1}, reached we have, yes", "quarter to {h1}, it is, hmm", "fifteen minutes to {h1}, it is", "a quarter to {h1}, we are, mmm"] },
    { upperBound: 52, candidates: ["ten to {h1}, it is, yes", "nearly {h1}, it is, hmm", "ten minutes to {h1}, it is", "close to {h1}, we are, mmm", "nearing {h1}, it is, yes"] },
    { upperBound: 59, candidates: ["almost {h1}, it is, hmm", "near {h1}, it is, yes", "five to {h1}, it is", "approaching {h1}, we are, mmm", "{h1}, almost upon us it is, yes"] },
  ],
  words: {
    hourWords: ["", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve"],
  },
} as const;

/** `es` -- SpanishPhraseProvider, template shape from `Buckets`: 12 buckets, 25 strings. */
export const ES = {
  locale: "es",
  source: "SpanishPhraseProvider",
  declaredShape: "template",
  buckets: [
    { upperBound: 2, candidates: ["{h} en punto"] },
    { upperBound: 7, candidates: ["{h} y pico"] },
    { upperBound: 12, candidates: ["{h} y diez"] },
    { upperBound: 17, candidates: ["{h} y cuarto"] },
    { upperBound: 22, candidates: ["{h} y veinte"] },
    { upperBound: 27, candidates: ["{h} y casi media"] },
    { upperBound: 32, candidates: ["{h} y media"] },
    { upperBound: 37, candidates: ["pasada la media {h}"] },
    { upperBound: 42, candidates: ["casi veinte para {h1}"] },
    { upperBound: 47, candidates: ["cuarto para {h1}"] },
    { upperBound: 52, candidates: ["diez para {h1}"] },
    { upperBound: 59, candidates: ["casi {h1}"] },
  ],
  words: {
    hourWords: ["", "la una", "las dos", "las tres", "las cuatro", "las cinco", "las seis", "las siete", "las ocho", "las nueve", "las diez", "las once", "las doce"],
  },
} as const;

/** `fr` -- FrenchPhraseProvider, template shape from `Buckets`: 12 buckets, 25 strings. */
export const FR = {
  locale: "fr",
  source: "FrenchPhraseProvider",
  declaredShape: "template",
  buckets: [
    { upperBound: 2, candidates: ["{h}"] },
    { upperBound: 7, candidates: ["{h} passé"] },
    { upperBound: 12, candidates: ["dix minutes passé {h}"] },
    { upperBound: 17, candidates: ["et quart {h}"] },
    { upperBound: 22, candidates: ["vingt minutes passé {h}"] },
    { upperBound: 27, candidates: ["presque la demie {h}"] },
    { upperBound: 32, candidates: ["{h} et demie"] },
    { upperBound: 37, candidates: ["passé la demie {h}"] },
    { upperBound: 42, candidates: ["presque vingt minutes avant {h1}"] },
    { upperBound: 47, candidates: ["moins le quart {h1}"] },
    { upperBound: 52, candidates: ["bientôt {h1}"] },
    { upperBound: 59, candidates: ["presque {h1}"] },
  ],
  words: {
    hourWords: ["", "une heure", "deux heures", "trois heures", "quatre heures", "cinq heures", "six heures", "sept heures", "huit heures", "neuf heures", "dix heures", "onze heures", "douze heures"],
  },
} as const;

/** `ja-classic` -- JapanesePhraseProvider, template shape from `Buckets`: 12 buckets, 25 strings. */
export const JA_CLASSIC = {
  locale: "ja-classic",
  source: "JapanesePhraseProvider",
  declaredShape: "template",
  buckets: [
    { upperBound: 2, candidates: ["{h}ちょうど"] },
    { upperBound: 7, candidates: ["{h}過ぎ"] },
    { upperBound: 12, candidates: ["{h}十分過ぎ"] },
    { upperBound: 17, candidates: ["{h}十五分"] },
    { upperBound: 22, candidates: ["{h}二十分"] },
    { upperBound: 27, candidates: ["{h}半近く"] },
    { upperBound: 32, candidates: ["{h}半"] },
    { upperBound: 37, candidates: ["{h}半過ぎ"] },
    { upperBound: 42, candidates: ["{h1}二十分前"] },
    { upperBound: 47, candidates: ["{h1}十五分前"] },
    { upperBound: 52, candidates: ["もうすぐ{h1}"] },
    { upperBound: 59, candidates: ["{h1}近く"] },
  ],
  words: {
    hourWords: ["", "一時", "二時", "三時", "四時", "五時", "六時", "七時", "八時", "九時", "十時", "十一時", "十二時"],
  },
} as const;

/** `ja-poetic` -- JapanesePoeticPhraseProvider, template shape from `Buckets`: 12 buckets, 25 strings. */
export const JA_POETIC = {
  locale: "ja-poetic",
  source: "JapanesePoeticPhraseProvider",
  declaredShape: "template",
  buckets: [
    { upperBound: 2, candidates: ["{h}の刻"] },
    { upperBound: 7, candidates: ["{h}を過ぎた頃"] },
    { upperBound: 12, candidates: ["{h}の光の中"] },
    { upperBound: 17, candidates: ["{h}の四半刻"] },
    { upperBound: 22, candidates: ["{h}から遠ざかる"] },
    { upperBound: 27, candidates: ["{h}半へと向かう"] },
    { upperBound: 32, candidates: ["時の折り返し、{h}の半ば"] },
    { upperBound: 37, candidates: ["{h}半を越えた頃"] },
    { upperBound: 42, candidates: ["{h1}へと近づく"] },
    { upperBound: 47, candidates: ["{h1}の十五分前"] },
    { upperBound: 52, candidates: ["まもなく{h1}の刻"] },
    { upperBound: 59, candidates: ["{h1}の影が迫る"] },
  ],
  words: {
    hourWords: ["", "一時", "二時", "三時", "四時", "五時", "六時", "七時", "八時", "九時", "十時", "十一時", "十二時"],
  },
} as const;

/** `ja-rude` -- JapaneseRudePhraseProvider, template shape from `Buckets`: 12 buckets, 25 strings. */
export const JA_RUDE = {
  locale: "ja-rude",
  source: "JapaneseRudePhraseProvider",
  declaredShape: "template",
  buckets: [
    { upperBound: 2, candidates: ["もう{h}かよ"] },
    { upperBound: 7, candidates: ["{h}過ぎたじゃないか"] },
    { upperBound: 12, candidates: ["{h}十分だろ"] },
    { upperBound: 17, candidates: ["{h}十五分じゃないか"] },
    { upperBound: 22, candidates: ["{h}二十分だ、いい加減にしろ"] },
    { upperBound: 27, candidates: ["やっと{h}半になる"] },
    { upperBound: 32, candidates: ["やっと{h}半じゃないか"] },
    { upperBound: 37, candidates: ["{h}半過ぎたぞ"] },
    { upperBound: 42, candidates: ["早く{h1}になれ"] },
    { upperBound: 47, candidates: ["{h1}の十五分前だろ"] },
    { upperBound: 52, candidates: ["もうすぐ{h1}じゃないか"] },
    { upperBound: 59, candidates: ["早く{h1}になれ"] },
  ],
  words: {
    hourWords: ["", "一時", "二時", "三時", "四時", "五時", "六時", "七時", "八時", "九時", "十時", "十一時", "十二時"],
  },
} as const;

/** `ja-terse` -- JapaneseTersePhraseProvider, template shape from `Buckets`: 12 buckets, 25 strings. */
export const JA_TERSE = {
  locale: "ja-terse",
  source: "JapaneseTersePhraseProvider",
  declaredShape: "template",
  buckets: [
    { upperBound: 2, candidates: ["{h}"] },
    { upperBound: 7, candidates: ["{h}すぎ"] },
    { upperBound: 12, candidates: ["{h}十分"] },
    { upperBound: 17, candidates: ["{h}十五分"] },
    { upperBound: 22, candidates: ["{h}二十分"] },
    { upperBound: 27, candidates: ["もうすぐ{h}半"] },
    { upperBound: 32, candidates: ["{h}半"] },
    { upperBound: 37, candidates: ["{h}半すぎ"] },
    { upperBound: 42, candidates: ["{h1}二十前"] },
    { upperBound: 47, candidates: ["{h1}十五前"] },
    { upperBound: 52, candidates: ["もうすぐ{h1}"] },
    { upperBound: 59, candidates: ["{h1}近く"] },
  ],
  words: {
    hourWords: ["", "一時", "二時", "三時", "四時", "五時", "六時", "七時", "八時", "九時", "十時", "十一時", "十二時"],
  },
} as const;

/** `pl` -- PolishPhraseProvider, template shape from `Buckets`: 12 buckets, 25 strings. */
export const PL = {
  locale: "pl",
  source: "PolishPhraseProvider",
  declaredShape: "template",
  buckets: [
    { upperBound: 2, candidates: ["{h}"] },
    { upperBound: 7, candidates: ["chwila po {h}"] },
    { upperBound: 12, candidates: ["dziesięć po {h}"] },
    { upperBound: 17, candidates: ["kwadrans po {h}"] },
    { upperBound: 22, candidates: ["dwadzieścia po {h}"] },
    { upperBound: 27, candidates: ["prawie wpół do {h1}"] },
    { upperBound: 32, candidates: ["wpół do {h1}"] },
    { upperBound: 37, candidates: ["chwila po wpół do {h1}"] },
    { upperBound: 42, candidates: ["za dwadzieścia {h1}"] },
    { upperBound: 47, candidates: ["za kwadrans {h1}"] },
    { upperBound: 52, candidates: ["za dziesięć {h1}"] },
    { upperBound: 59, candidates: ["prawie {h1}"] },
  ],
  words: {
    hourWords: ["", "pierwsza", "druga", "trzecia", "czwarta", "piąta", "szósta", "siódma", "ósma", "dziewiąta", "dziesiąta", "jedenasta", "dwunasta"],
  },
} as const;

/**
 * Every locale, keyed as PhraseEngine's registry keys them, ordinally sorted so this file is
 * byte-stable across runs.
 */
export const TABLES: Readonly<Record<string, LocaleTables>> = {
  "de": DE,
  "en-classic": EN_CLASSIC,
  "en-dwarf": EN_DWARF,
  "en-jive": EN_JIVE,
  "en-pirate": EN_PIRATE,
  "en-poetic": EN_POETIC,
  "en-rude": EN_RUDE,
  "en-shakespeare": EN_SHAKESPEARE,
  "en-terse": EN_TERSE,
  "en-valleygirl": EN_VALLEYGIRL,
  "en-yoda": EN_YODA,
  "es": ES,
  "fr": FR,
  "ja-classic": JA_CLASSIC,
  "ja-poetic": JA_POETIC,
  "ja-rude": JA_RUDE,
  "ja-terse": JA_TERSE,
  "pl": PL,
};

/** The registry's keys, as a literal type -- so an unknown locale is a compile error. */
export const LOCALES = [
  "de",
  "en-classic",
  "en-dwarf",
  "en-jive",
  "en-pirate",
  "en-poetic",
  "en-rude",
  "en-shakespeare",
  "en-terse",
  "en-valleygirl",
  "en-yoda",
  "es",
  "fr",
  "ja-classic",
  "ja-poetic",
  "ja-rude",
  "ja-terse",
  "pl",
] as const;

export type Locale = (typeof LOCALES)[number];

/** What PhraseEngine starts on before any SetLocale call. */
export const DEFAULT_LOCALE: Locale = "en-classic";
