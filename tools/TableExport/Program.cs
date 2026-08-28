using System.Globalization;
using System.Reflection;
using System.Text;
using System.Text.Encodings.Web;
using System.Text.Json;
using FuzzyClock.Core;

namespace FuzzyClock.TableExport;

/// <summary>
/// Moves the phrase STRING TABLES from FuzzyClock.Core into TypeScript, by reflecting the compiled
/// providers rather than by anyone retyping them. Emits
/// <c>electron/src/core/phrase/tables.generated.ts</c>.
///
/// WHAT IT DOES NOT DO, and why that matters. It exports data only -- never a template
/// substitution, never a bucket walk, never a special-case branch. Behaviour is hand-ported and
/// checked against the ISC-13 golden files. If this tool emitted logic too, the port would agree
/// with itself and the fixture would be measuring nothing.
///
/// WHAT REFLECTION CANNOT REACH. Only English and Terse declare their noon/midnight candidates as
/// static fields; the other 16 providers keep that text in method locals or as inline literals, and
/// locals have no metadata to reflect. So the run's own output is the census: a locale shows
/// <c>noonCandidates</c> in its words column or its special-case text is hand-copied into the
/// provider spec. That is the better arrangement rather than a shortfall: tools/GoldenGen already
/// harvested those same sets by SAMPLING the running provider, so the fixture and the spec reach
/// the C# by two independent routes and have to agree. Had this tool harvested them the same way
/// GoldenGen does, the :noon and :midnight rows of the fixture would be checking a copy of
/// themselves.
///
/// UNKNOWN SHAPES ARE FATAL, NOT SKIPPED. Every static field on every provider is classified, and
/// anything this tool does not recognise stops the run. A field silently dropped here would surface
/// as a phrase table that is quietly short a row, which is exactly the failure the whole exercise
/// exists to prevent.
/// </summary>
internal static class Program
{
    private static int Main()
    {
        // Read the default locale BEFORE the SetLocale positive control below moves it. PhraseEngine
        // initialises _activeProvider to a specific entry, and that default is part of the behaviour
        // being ported; a value read afterwards would just be the last locale this tool poked.
        var defaultLocale = PhraseEngine.CurrentLocale;

        var root = FindRepoRoot();
        if (root is null)
        {
            Console.Error.WriteLine("FATAL: could not locate the repo root (no FuzzyClock.slnx above the build output).");
            return 2;
        }

        var outDir = Path.Combine(root, "electron", "src", "core", "phrase");
        if (!Directory.Exists(outDir))
        {
            Console.Error.WriteLine($"FATAL: output directory does not exist: {outDir}");
            Console.Error.WriteLine("       Create it deliberately. This tool will not mkdir a tree from a mistyped path.");
            return 2;
        }

        var providers = ReadProviderRegistry();
        if (providers.Count == 0)
        {
            Console.Error.WriteLine("FATAL: could not read PhraseEngine's provider registry by reflection.");
            return 2;
        }

        // Same positive control as tools/GoldenGen: prove the reflected registry is the real one by
        // round-tripping every key through the public API, and prove the check has teeth by
        // confirming a bogus key is refused.
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
        if (!providers.ContainsKey(defaultLocale))
        {
            Console.Error.WriteLine($"FATAL: the default locale '{defaultLocale}' is not in the registry.");
            return 2;
        }

        var problems = new List<string>();
        var tables = new List<LocaleTable>();

        foreach (var (locale, provider) in providers.OrderBy(kv => kv.Key, StringComparer.Ordinal))
        {
            var table = Extract(locale, provider.GetType(), problems);
            if (table is not null)
                tables.Add(table);
        }

        if (problems.Count > 0)
        {
            Console.Error.WriteLine($"{problems.Count} PROBLEM(S) -- nothing was written:");
            foreach (var p in problems)
                Console.Error.WriteLine($"  - {p}");
            return 1;
        }

        var path = Path.Combine(outDir, "tables.generated.ts");
        File.WriteAllText(path, Emit(tables, defaultLocale), new UTF8Encoding(encoderShouldEmitUTF8Identifier: false));

        Console.WriteLine($"{"locale",-16} {"shape",-11} {"buckets",7} {"strings",7}  words");
        foreach (var t in tables)
        {
            var words = string.Join(", ", t.Words.Select(w => $"{w.Key}[{w.Value.Length}]"));
            Console.WriteLine($"{t.Locale,-16} {t.Shape,-11} {t.Buckets.Count,7} {t.StringCount,7}  {words}");
        }

        Console.WriteLine();
        Console.WriteLine($"default locale: {defaultLocale}");
        Console.WriteLine($"{tables.Count} locales, {tables.Sum(t => t.StringCount)} strings -> {Path.GetRelativePath(root, path).Replace('\\', '/')}");
        Console.WriteLine($"{new FileInfo(path).Length} bytes written. Hand-ported behaviour is NOT in this file; see the ISC-13 golden fixtures.");
        return 0;
    }

    // ---------------------------------------------------------------- extraction

    /// <summary>
    /// Classifies every static field the provider declares. Two recognised kinds: a bucket table
    /// (an array of <c>(int, string)</c> or <c>(int, string[])</c>) and a word list
    /// (<c>string[]</c>). Anything else is a problem, and exactly one bucket table is required.
    /// </summary>
    private static LocaleTable? Extract(string locale, Type type, List<string> problems)
    {
        var buckets = new List<Bucket>();
        var words = new SortedDictionary<string, string[]>(StringComparer.Ordinal);
        string? shape = null;
        string? bucketField = null;

        var fields = type.GetFields(BindingFlags.Static | BindingFlags.Public | BindingFlags.NonPublic)
            .Where(f => f.DeclaringType == type)
            // Compiler-generated backing storage (lambda caches, and so on) is never a phrase table;
            // such names always contain a character no C# identifier may.
            .Where(f => !f.Name.Contains('<'))
            .OrderBy(f => f.Name, StringComparer.Ordinal);

        foreach (var field in fields)
        {
            if (field.FieldType == typeof(string[]))
            {
                if (field.GetValue(null) is not string[] value)
                {
                    problems.Add($"{locale}: static field '{field.Name}' is a string[] but read as null.");
                    continue;
                }
                words[CamelCase(field.Name)] = value;
                continue;
            }

            var asBuckets = ReadBuckets(field, out var fieldShape);
            if (asBuckets is not null)
            {
                if (bucketField is not null)
                {
                    problems.Add($"{locale}: two bucket tables ('{bucketField}' and '{field.Name}') -- this tool cannot tell which one drives GetPhrase.");
                    continue;
                }
                buckets = asBuckets;
                shape = fieldShape;
                bucketField = field.Name;
                continue;
            }

            problems.Add($"{locale}: unrecognised static field '{field.Name}' of type '{field.FieldType.Name}'. Classify it here rather than letting it be dropped.");
        }

        if (bucketField is null)
        {
            problems.Add($"{locale}: no bucket table found on {type.Name}.");
            return null;
        }
        if (buckets.Count == 0)
        {
            problems.Add($"{locale}: bucket table '{bucketField}' is empty.");
            return null;
        }
        if (words.Count == 0)
        {
            problems.Add($"{locale}: no word lists found on {type.Name}; every provider indexes at least an hour-word table.");
            return null;
        }
        foreach (var b in buckets)
        {
            if (b.Candidates.Length == 0)
                problems.Add($"{locale}: bucket with upper bound {b.UpperBound} has no candidates.");
            if (b.Candidates.Any(c => c is null))
                problems.Add($"{locale}: bucket with upper bound {b.UpperBound} contains a null candidate.");
        }

        return new LocaleTable(locale, type.Name, shape!, bucketField, buckets, words);
    }

    /// <summary>
    /// Reads a bucket table if this field is one. The single-template family declares
    /// <c>(int, string)[]</c> and the multi-candidate family <c>(int, string[])[]</c>; both are
    /// normalised to a candidate array here, because a one-element list picked from uniformly is the
    /// same behaviour as a bare template, and that collapse is what lets one TypeScript factory
    /// serve both families. The distinction is still recorded (<c>declaredShape</c>) so the port can
    /// assert that a single-template locale really is deterministic.
    /// </summary>
    private static List<Bucket>? ReadBuckets(FieldInfo field, out string? shape)
    {
        shape = null;
        if (!field.FieldType.IsArray || field.GetValue(null) is not Array arr)
            return null;

        var element = field.FieldType.GetElementType();
        var item1 = element?.GetField("Item1");
        var item2 = element?.GetField("Item2");
        if (item1 is null || item2 is null || item1.FieldType != typeof(int))
            return null;

        var multi = item2.FieldType == typeof(string[]);
        if (!multi && item2.FieldType != typeof(string))
            return null;

        shape = multi ? "candidates" : "template";
        var result = new List<Bucket>(arr.Length);
        for (var i = 0; i < arr.Length; i++)
        {
            var box = arr.GetValue(i)!;
            var bound = (int)item1.GetValue(box)!;
            var candidates = multi
                ? (string[])item2.GetValue(box)!
                : [(string)item2.GetValue(box)!];
            result.Add(new Bucket(bound, candidates));
        }
        return result;
    }

    // ---------------------------------------------------------------- emission

    private static string Emit(List<LocaleTable> tables, string defaultLocale)
    {
        var sb = new StringBuilder();
        var totalStrings = tables.Sum(t => t.StringCount);

        sb.Append("""
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

            """);
        sb.Append(CultureInfo.InvariantCulture, $"//\n// {tables.Count} locales, {totalStrings} strings, generated from the .NET assembly metadata.\n\n");

        sb.Append("""
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


            """);

        foreach (var t in tables)
        {
            sb.Append(CultureInfo.InvariantCulture,
                $"/** `{t.Locale}` -- {t.Source}, {t.Shape} shape from `{t.BucketField}`: {t.Buckets.Count} buckets, {t.StringCount} strings. */\n");
            sb.Append(CultureInfo.InvariantCulture, $"export const {Identifier(t.Locale)} = {{\n");
            sb.Append(CultureInfo.InvariantCulture, $"  locale: {Ts(t.Locale)},\n");
            sb.Append(CultureInfo.InvariantCulture, $"  source: {Ts(t.Source)},\n");
            sb.Append(CultureInfo.InvariantCulture, $"  declaredShape: {Ts(t.Shape)},\n");
            sb.Append("  buckets: [\n");
            foreach (var b in t.Buckets)
            {
                sb.Append(CultureInfo.InvariantCulture, $"    {{ upperBound: {b.UpperBound}, candidates: [");
                sb.Append(string.Join(", ", b.Candidates.Select(Ts)));
                sb.Append("] },\n");
            }
            sb.Append("  ],\n");
            sb.Append("  words: {\n");
            foreach (var (name, values) in t.Words)
            {
                sb.Append(CultureInfo.InvariantCulture, $"    {name}: [");
                sb.Append(string.Join(", ", values.Select(Ts)));
                sb.Append("],\n");
            }
            sb.Append("  },\n");
            sb.Append("} as const;\n\n");
        }

        sb.Append("""
            /**
             * Every locale, keyed as PhraseEngine's registry keys them, ordinally sorted so this file is
             * byte-stable across runs.
             */

            """);
        sb.Append("export const TABLES: Readonly<Record<string, LocaleTables>> = {\n");
        foreach (var t in tables)
            sb.Append(CultureInfo.InvariantCulture, $"  {Ts(t.Locale)}: {Identifier(t.Locale)},\n");
        sb.Append("};\n\n");

        sb.Append("/** The registry's keys, as a literal type -- so an unknown locale is a compile error. */\n");
        sb.Append("export const LOCALES = [\n");
        foreach (var t in tables)
            sb.Append(CultureInfo.InvariantCulture, $"  {Ts(t.Locale)},\n");
        sb.Append("] as const;\n\n");

        sb.Append("export type Locale = (typeof LOCALES)[number];\n\n");

        sb.Append("/** What PhraseEngine starts on before any SetLocale call. */\n");
        sb.Append(CultureInfo.InvariantCulture, $"export const DEFAULT_LOCALE: Locale = {Ts(defaultLocale)};\n");

        return sb.ToString();
    }

    private static readonly JsonSerializerOptions StringOptions = new()
    {
        // Keep accented and CJK characters as themselves rather than as \uXXXX escapes. The tables
        // are six languages wide and a wall of escapes would be unreviewable -- the point of
        // generating this file is that a human can still read it and recognise the phrases.
        Encoder = JavaScriptEncoder.UnsafeRelaxedJsonEscaping,
    };

    /// <summary>
    /// A TypeScript double-quoted string literal. JSON's string grammar is a subset of TypeScript's,
    /// so the serializer's escaping is valid as-is; the two line separators are escaped afterwards
    /// because JSON permits them raw and older JavaScript parsers did not.
    ///
    /// Both separators are spelled as C# escapes rather than as themselves. A literal separator in a
    /// source file is invisible in every diff and every review, so the one thing that must not happen
    /// to this method -- a tool quietly normalising one into an ordinary space, at which point it
    /// replaces every space in every phrase -- is the one thing nobody would see.
    /// </summary>
    private static string Ts(string value) =>
        JsonSerializer.Serialize(value, StringOptions)
            .Replace("\u2028", "\\u2028")
            .Replace("\u2029", "\\u2029");

    /// <summary>`en-classic` becomes `EN_CLASSIC`. Any character illegal in an identifier becomes `_`.</summary>
    private static string Identifier(string locale)
    {
        var sb = new StringBuilder(locale.Length);
        foreach (var c in locale)
            sb.Append(char.IsAsciiLetterOrDigit(c) ? char.ToUpperInvariant(c) : '_');
        return sb.ToString();
    }

    /// <summary>`HourWords` becomes `hourWords`, matching the surrounding TypeScript.</summary>
    private static string CamelCase(string name) =>
        name.Length == 0 ? name : char.ToLowerInvariant(name[0]) + name[1..];

    // ---------------------------------------------------------------- plumbing

    private static Dictionary<string, IPhraseProvider> ReadProviderRegistry()
    {
        var field = typeof(PhraseEngine).GetField("_providers", BindingFlags.NonPublic | BindingFlags.Static);
        if (field?.GetValue(null) is not Dictionary<string, IPhraseProvider> map)
            return new Dictionary<string, IPhraseProvider>();
        return new Dictionary<string, IPhraseProvider>(map, StringComparer.Ordinal);
    }

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

    private sealed record Bucket(int UpperBound, string[] Candidates);

    private sealed record LocaleTable(
        string Locale,
        string Source,
        string Shape,
        string BucketField,
        List<Bucket> Buckets,
        SortedDictionary<string, string[]> Words)
    {
        public int StringCount =>
            Buckets.Sum(b => b.Candidates.Length) + Words.Sum(w => w.Value.Length);
    }
}
