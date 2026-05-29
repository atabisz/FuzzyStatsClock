// Pure static helper — no WPF, no HttpClient, no I/O. Lives in FuzzyClock.Core
// (net10.0, REL-03 invariant: zero PackageReference). Mirrors UptimeFormatter
// and DateFormatter pattern (FuzzyClock.Core/UptimeFormatter.cs).
namespace FuzzyClock.Core;

public static class UpdateVersionComparer
{
    /// <summary>
    /// Parse a GitHub-style release tag (e.g. "v4.5.0", "4.5", "4.5.0.0") into a
    /// System.Version. Returns false on null/empty/whitespace, on prerelease
    /// suffixes (-beta, -rc1, -alpha.2), on build metadata (+sha.abc), and on
    /// any non-numeric component.
    /// </summary>
    public static bool TryParseTag(string? tag, out Version version)
    {
        version = new Version(0, 0);   // sentinel out-value — caller must check return

        if (string.IsNullOrWhiteSpace(tag)) return false;
        var trimmed = tag.Trim();

        // Strip a single leading 'v' or 'V' (case-insensitive). Preserves the
        // GitHub convention of "v4.5.0" tags. We do NOT strip "version " or
        // longer prefixes — keep the rule narrow.
        if (trimmed.Length > 0 && (trimmed[0] is 'v' or 'V')) trimmed = trimmed[1..];

        // Reject prerelease suffix BEFORE Version.TryParse. Version.TryParse
        // rejects "4.5.0-beta" already, but the explicit rule documents intent.
        if (trimmed.Contains('-') || trimmed.Contains('+')) return false;

        // Version.TryParse handles 2/3/4-component natively. It rejects
        // negative components, non-numeric components, 5+ components, and
        // overflowing components — every case we care about.
        return Version.TryParse(trimmed, out version!);
    }

    /// <summary>
    /// Returns true iff <paramref name="latest"/> is strictly greater than
    /// <paramref name="running"/>. Equal versions return false (UPD-02).
    /// Absent components are treated as 0 (so "4.5" and "4.5.0" and "4.5.0.0"
    /// all compare equal). This requires explicit normalization because
    /// System.Version's built-in operator&gt; treats Build=-1 and Build=0 as
    /// distinct values (a version with -1 sorts BELOW a version with 0).
    /// </summary>
    public static bool IsNewer(Version running, Version latest)
        => Normalize(latest) > Normalize(running);

    /// <summary>
    /// Promote any -1 (undefined) component to 0 so that 2-, 3-, and
    /// 4-component versions compare as if they were always 4-component.
    /// </summary>
    private static Version Normalize(Version v)
        => new Version(
            v.Major,
            v.Minor,
            v.Build < 0 ? 0 : v.Build,
            v.Revision < 0 ? 0 : v.Revision);
}
