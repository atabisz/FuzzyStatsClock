using System.Reflection;
using System.Text;
using FuzzyClock.Core;

namespace FuzzyClock.GoldenGen;

/// <summary>
/// Generates the ISC-13 translation oracle: the golden files the TypeScript phrase providers are
/// diffed against.
///
/// WHY THIS IS NOT A ONE-LINE SWEEP. ISC-13 was written as "phrase output is byte-identical to the
/// C# original across a full sweep", which is impossible as stated: 10 of the 18 providers pick a
/// candidate with <c>Random.Shared.Next()</c>, so <see cref="IPhraseProvider.GetPhrase"/> has no
/// single correct answer for a given minute. What IS deterministic, and what this generator
/// captures instead:
///
///   1. <see cref="IPhraseProvider.GetSegmentKey"/> for every minute of the day in all 18 locales.
///      Deterministic by the interface's own contract ("Must NOT depend on random candidate
///      selection"). For the 8 single-template providers this is also the full phrase, because
///      those define <c>GetSegmentKey(dt) => GetPhrase(dt)</c>.
///   2. The complete CANDIDATE SET per bucket for the 10 multi-candidate providers, collected by
///      sampling the real provider to saturation. Stronger than a sampled phrase: it pins every
///      string the port is allowed to emit, not one of them.
///
/// HOW SATURATION IS MADE PROVABLE RATHER THAN HOPEFUL. Reflection reads only the *arity* of each
/// bucket's candidate array -- the denominator. Every byte written comes from calling the provider.
/// Nothing in this file re-implements template substitution, because an oracle that renders
/// "{h}" itself would be testing this generator instead of the provider.
/// </summary>
internal static class Program
{
    /// <summary>Minutes in a day. The sweep is exhaustive, not sampled.</summary>
    private const int MinutesPerDay = 24 * 60;

    /// <summary>
    /// Draws with no new distinct value before a set is called complete, when reflection could not
    /// supply an expected count (noon/midnight candidates are locals in 3 providers, and locals are
    /// not reflectable). For a 5-candidate set the chance of missing one member is (4/5)^400.
    /// </summary>
    private const int StableDraws = 400;

    /// <summary>Same rule, wider, for the ~20 special-case buckets where it is the only rule.</summary>
    private const int SpecialStableDraws = 2000;

    /// <summary>Hard stop, so a provider that somehow never saturates fails loudly instead of hanging.</summary>
    private const int MaxDraws = 500_000;

    /// <summary>Draws used to demonstrate that a single-template provider really is deterministic.</summary>
    private const int DeterminismDraws = 200;

    /// <summary>
    /// ASCII Unit Separator, used only in memory to pack a (qualifier, emphasis) pair into one
    /// string so it can live in a <see cref="SortedSet{T}"/>. Written as an escape rather than a
    /// literal control byte so the source file stays copy-pasteable and greppable. It never reaches
    /// a golden file -- the pair is split back into two TSV columns on the way out.
    /// </summary>
    private const string Sep = "\u001f";

    /// <summary>An arbitrary fixed date. Every provider reads only Hour and Minute.</summary>
    private static readonly DateTime SweepDay = new(2026, 1, 1, 0, 0, 0, DateTimeKind.Unspecified);

    private static int Main()
    {
        var root = FindRepoRoot();
        if (root is null)
        {
            Console.Error.WriteLine("FATAL: could not locate the repo root (no FuzzyClock.slnx above the build output).");
            return 2;
        }

        var outDir = Path.Combine(root, "electron", "test", "fixtures");
        if (!Directory.Exists(outDir))
        {
            Console.Error.WriteLine($"FATAL: fixture directory does not exist: {outDir}");
            return 2;
        }

        var providers = ReadProviderRegistry();
        if (providers.Count == 0)
        {
            Console.Error.WriteLine("FATAL: could not read PhraseEngine's provider registry by reflection.");
            return 2;
        }
        Console.WriteLine($"registry: {providers.Count} locales");

        // Cross-check the reflected registry against the public API, so a private field renamed out
        // from under this generator cannot silently produce a golden file covering zero locales.
        foreach (var locale in providers.Keys)
        {
            if (!PhraseEngine.SetLocale(locale))
            {
                Console.Error.WriteLine($"FATAL: reflected locale '{locale}' is rejected by PhraseEngine.SetLocale.");
                return 2;
            }
        }
        if (PhraseEngine.SetLocale("no-such-locale-¶"))
        {
            Console.Error.WriteLine("FATAL: SetLocale accepted a bogus locale; the registry check proves nothing.");
            return 2;
        }

        var problems = new List<string>();
        var segments = new List<SegmentRow>(providers.Count * MinutesPerDay);
        var candidates = new List<CandidateRow>();
        var report = new List<ProviderReport>();

        foreach (var (locale, provider) in providers.OrderBy(kv => kv.Key, StringComparer.Ordinal))
        {
            var buckets = ReadCandidateBuckets(provider.GetType());
            var isMultiCandidate = buckets is not null;

            for (var m = 0; m < MinutesPerDay; m++)
                segments.Add(new SegmentRow(locale, SweepDay.AddMinutes(m), provider.GetSegmentKey(SweepDay.AddMinutes(m))));

            if (isMultiCandidate)
                report.Add(HarvestMultiCandidate(locale, provider, buckets!, candidates, problems));
            else
                report.Add(VerifyDeterministic(locale, provider, problems));
        }

        WriteSegments(Path.Combine(outDir, "phrase-golden-segments.tsv"), segments);
        WriteCandidates(Path.Combine(outDir, "phrase-golden-candidates.tsv"), candidates);

        Console.WriteLine();
        Console.WriteLine($"{"locale",-16} {"shape",-16} {"segkeys",8} {"groups",7} {"rows",6} {"maxdraws",9}");
        foreach (var r in report)
            Console.WriteLine($"{r.Locale,-16} {r.Shape,-16} {r.DistinctSegmentKeys,8} {r.Groups,7} {r.Rows,6} {r.MaxDraws,9}");

        Console.WriteLine();
        Console.WriteLine($"segments:   {segments.Count} rows ({providers.Count} locales x {MinutesPerDay} minutes)");
        Console.WriteLine($"candidates: {candidates.Count} rows");

        if (problems.Count > 0)
        {
            Console.Error.WriteLine();
            Console.Error.WriteLine($"{problems.Count} PROBLEM(S) -- the golden files were written, but read these first:");
            foreach (var p in problems)
                Console.Error.WriteLine($"  - {p}");
            return 1;
        }

        Console.WriteLine("no problems reported.");
        return 0;
    }

    // ---------------------------------------------------------------- multi-candidate providers

    private static ProviderReport HarvestMultiCandidate(
        string locale,
        IPhraseProvider provider,
        (int UpperBound, string[] Candidates)[] buckets,
        List<CandidateRow> sink,
        List<string> problems)
    {
        // Grouping hypothesis: the candidate set depends only on (segment key, 12-hour hour), never
        // on the minute within a bucket. hour12 is computed here purely as a GROUP LABEL -- it is
        // not trusted. Every group is checked for internal agreement below, so a wrong label or a
        // provider with minute-dependent text fails loudly instead of collapsing rows that differ.
        var groups = new Dictionary<(string Key, int Hour12), Group>();
        var maxDraws = 0;

        for (var m = 0; m < MinutesPerDay; m++)
        {
            var dt = SweepDay.AddMinutes(m);
            var key = provider.GetSegmentKey(dt);
            var hour12 = dt.Hour % 12 == 0 ? 12 : dt.Hour % 12;

            // The bucket INDEX comes from the provider itself, not from re-walking the table here.
            var expected = ExpectedCandidateCount(key, buckets);
            var stable = expected is null ? SpecialStableDraws : StableDraws;

            var phrases = Saturate(() => provider.GetPhrase(dt), expected, stable, out var d1);
            var structured = Saturate(
                () =>
                {
                    var (q, e) = provider.GetStructuredPhrase(dt);
                    return q + Sep + e;
                },
                expected, stable, out var d2);

            maxDraws = Math.Max(maxDraws, Math.Max(d1, d2));

            if (expected is not null && phrases.Count != expected)
                problems.Add($"{locale} {dt:HH\\:mm} ({key}): {phrases.Count} distinct phrases but the bucket declares {expected} candidates -- duplicate entries in the table, or an unreachable candidate.");

            var slot = (key, hour12);
            if (groups.TryGetValue(slot, out var existing))
            {
                if (!existing.Phrases.SetEquals(phrases))
                    problems.Add($"{locale} ({key}, h12={hour12}) at {dt:HH\\:mm}: phrase set differs from an earlier minute in the same group -- the (key, hour12) grouping is not the whole determinant.");
                if (!existing.Structured.SetEquals(structured))
                    problems.Add($"{locale} ({key}, h12={hour12}) at {dt:HH\\:mm}: structured set differs from an earlier minute in the same group.");
                existing.Minutes++;
            }
            else
            {
                groups[slot] = new Group(phrases, structured);
            }
        }

        var rows = 0;
        foreach (var ((key, hour12), g) in groups.OrderBy(kv => kv.Key.Key, StringComparer.Ordinal).ThenBy(kv => kv.Key.Hour12))
        {
            foreach (var phrase in g.Phrases)
            {
                sink.Add(new CandidateRow(locale, key, hour12, "phrase", phrase, ""));
                rows++;
            }
            foreach (var pair in g.Structured)
            {
                var split = pair.Split(Sep);
                sink.Add(new CandidateRow(locale, key, hour12, "structured", split[0], split[1]));
                rows++;
            }
        }

        var distinctKeys = groups.Keys.Select(k => k.Key).Distinct(StringComparer.Ordinal).Count();
        return new ProviderReport(locale, "multi-candidate", distinctKeys, groups.Count, rows, maxDraws);
    }

    /// <summary>
    /// The candidate arity for a segment key, read off the reflected table. Returns null for the
    /// noon/midnight style keys, whose candidate arrays are method locals in several providers and
    /// therefore unreachable by reflection -- those fall back to the stable-draws rule.
    /// </summary>
    private static int? ExpectedCandidateCount(string key, (int UpperBound, string[] Candidates)[] buckets)
    {
        var colon = key.LastIndexOf(':');
        if (colon < 0 || !int.TryParse(key.AsSpan(colon + 1), out var index))
            return null;
        if (index < 0 || index >= buckets.Length)
            return null;
        return buckets[index].Candidates.Length;
    }

    private static SortedSet<string> Saturate(Func<string> draw, int? expected, int stableLimit, out int draws)
    {
        var set = new SortedSet<string>(StringComparer.Ordinal);
        var stable = 0;
        draws = 0;

        while (draws < MaxDraws)
        {
            draws++;
            if (set.Add(draw()))
                stable = 0;
            else
                stable++;

            if (expected is not null && set.Count == expected)
                return set;
            if (stable >= stableLimit)
                return set;
        }
        return set;
    }

    // ---------------------------------------------------------------- single-template providers

    /// <summary>
    /// The 8 non-English providers declare one template per bucket and no randomness. That is read
    /// off the source, so it is verified here rather than trusted: every minute is drawn repeatedly
    /// and must yield exactly one distinct phrase, equal to its own segment key.
    /// </summary>
    private static ProviderReport VerifyDeterministic(string locale, IPhraseProvider provider, List<string> problems)
    {
        var keys = new HashSet<string>(StringComparer.Ordinal);

        for (var m = 0; m < MinutesPerDay; m++)
        {
            var dt = SweepDay.AddMinutes(m);
            var key = provider.GetSegmentKey(dt);
            keys.Add(key);

            var seen = new HashSet<string>(StringComparer.Ordinal);
            for (var i = 0; i < DeterminismDraws; i++)
                seen.Add(provider.GetPhrase(dt));

            if (seen.Count != 1)
                problems.Add($"{locale} {dt:HH\\:mm}: expected a deterministic phrase but {DeterminismDraws} draws produced {seen.Count} distinct values.");
            else if (!seen.Contains(key))
                problems.Add($"{locale} {dt:HH\\:mm}: GetSegmentKey returned '{key}' but GetPhrase returned '{seen.First()}' -- the segments file is not a full phrase oracle for this locale.");
        }

        return new ProviderReport(locale, "single-template", keys.Count, 0, 0, DeterminismDraws);
    }

    // ---------------------------------------------------------------- reflection

    private static Dictionary<string, IPhraseProvider> ReadProviderRegistry()
    {
        var field = typeof(PhraseEngine).GetField("_providers", BindingFlags.NonPublic | BindingFlags.Static);
        if (field?.GetValue(null) is not Dictionary<string, IPhraseProvider> map)
            return new Dictionary<string, IPhraseProvider>();
        return new Dictionary<string, IPhraseProvider>(map, StringComparer.Ordinal);
    }

    /// <summary>
    /// Reads a provider's <c>Buckets</c> table when it is the multi-candidate shape
    /// <c>(int, string[])[]</c>. Returns null for the single-template shape <c>(int, string)[]</c>,
    /// which is how the two provider families are told apart -- by their actual field type, not by
    /// a hardcoded list of locale names that would rot.
    /// </summary>
    private static (int UpperBound, string[] Candidates)[]? ReadCandidateBuckets(Type providerType)
    {
        var field = providerType.GetField("Buckets", BindingFlags.NonPublic | BindingFlags.Static);
        if (field?.GetValue(null) is not Array arr)
            return null;

        var element = field.FieldType.GetElementType();
        var item1 = element?.GetField("Item1");
        var item2 = element?.GetField("Item2");
        if (item1 is null || item2 is null || item2.FieldType != typeof(string[]))
            return null;

        var result = new (int, string[])[arr.Length];
        for (var i = 0; i < arr.Length; i++)
        {
            var box = arr.GetValue(i)!;
            result[i] = ((int)item1.GetValue(box)!, (string[])item2.GetValue(box)!);
        }
        return result;
    }

    // ---------------------------------------------------------------- output

    private static void WriteSegments(string path, List<SegmentRow> rows)
    {
        using var w = Open(path);
        w.WriteLine("# ISC-13 oracle, part 1 of 2: the deterministic time-bucket key for every minute.");
        w.WriteLine("# Generated by tools/GoldenGen. Do not hand-edit. LF-only (see .gitattributes).");
        w.WriteLine("# columns: locale <TAB> hh:mm <TAB> segmentKey");
        w.WriteLine("#");
        w.WriteLine("# For the 8 single-template locales (de, es, fr, ja-*, pl) segmentKey IS the phrase,");
        w.WriteLine("# because those providers define GetSegmentKey(dt) => GetPhrase(dt) -- verified by");
        w.WriteLine("# redrawing each minute, not assumed from the source.");
        foreach (var r in rows)
            w.WriteLine($"{r.Locale}\t{r.When:HH\\:mm}\t{r.Key}");
    }

    private static void WriteCandidates(string path, List<CandidateRow> rows)
    {
        using var w = Open(path);
        w.WriteLine("# ISC-13 oracle, part 2 of 2: the COMPLETE candidate set per bucket for the 10");
        w.WriteLine("# multi-candidate locales, whose GetPhrase picks at random. A port is correct when");
        w.WriteLine("# the set of strings it can emit equals the set here -- not when one sample matches.");
        w.WriteLine("# Generated by tools/GoldenGen. Do not hand-edit. LF-only (see .gitattributes).");
        w.WriteLine("# columns: locale <TAB> segmentKey <TAB> hour12 <TAB> kind <TAB> value1 <TAB> value2");
        w.WriteLine("#");
        w.WriteLine("#   kind=phrase      value1 = a GetPhrase result,           value2 = (empty)");
        w.WriteLine("#   kind=structured  value1 = GetStructuredPhrase Qualifier, value2 = Emphasis");
        w.WriteLine("#");
        w.WriteLine("# The two kinds are sampled INDEPENDENTLY and must not be zipped: nothing here");
        w.WriteLine("# records which phrase a given (qualifier, emphasis) pair came from, because that");
        w.WriteLine("# correspondence was never measured. Each kind is a set, complete on its own.");
        foreach (var r in rows)
            w.WriteLine($"{r.Locale}\t{r.SegmentKey}\t{r.Hour12}\t{r.Kind}\t{r.Value1}\t{r.Value2}");
    }

    /// <summary>UTF-8 without a BOM and LF endings, so the file is byte-stable across platforms.</summary>
    private static StreamWriter Open(string path) =>
        new(path, false, new UTF8Encoding(encoderShouldEmitUTF8Identifier: false)) { NewLine = "\n" };

    private static string? FindRepoRoot()
    {
        var dir = new DirectoryInfo(AppContext.BaseDirectory);
        while (dir is not null)
        {
            if (File.Exists(Path.Combine(dir.FullName, "FuzzyClock.slnx")))
                return dir.FullName;
            dir = dir.Parent;
        }
        return null;
    }

    private sealed record SegmentRow(string Locale, DateTime When, string Key);

    private sealed record CandidateRow(string Locale, string SegmentKey, int Hour12, string Kind, string Value1, string Value2);

    private sealed record ProviderReport(string Locale, string Shape, int DistinctSegmentKeys, int Groups, int Rows, int MaxDraws);

    private sealed class Group(SortedSet<string> phrases, SortedSet<string> structured)
    {
        public SortedSet<string> Phrases { get; } = phrases;
        public SortedSet<string> Structured { get; } = structured;
        public int Minutes { get; set; } = 1;
    }
}
