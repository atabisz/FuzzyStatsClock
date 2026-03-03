// Source: Microsoft.Win32.Registry — available in net10.0-windows BCL without extra packages
// Registry key: HKCU\SOFTWARE\Microsoft\Windows\CurrentVersion\Run
// Value name: "FuzzyClock"
// Value data: full path to the executable (including .exe)
using Microsoft.Win32;

namespace FuzzyClock.App;

internal static class AutoLaunchService
{
    private const string RunKeyPath  = @"SOFTWARE\Microsoft\Windows\CurrentVersion\Run";
    private const string ValueName   = "FuzzyClock";

    /// <summary>
    /// Writes HKCU Run entry pointing to exePath.
    /// exePath must be the full path to the running executable.
    /// </summary>
    internal static void Enable(string exePath)
    {
        using var key = Registry.CurrentUser.OpenSubKey(RunKeyPath, writable: true);
        key?.SetValue(ValueName, exePath);
    }

    /// <summary>Removes HKCU Run entry. No-op if entry is absent.</summary>
    internal static void Disable()
    {
        using var key = Registry.CurrentUser.OpenSubKey(RunKeyPath, writable: true);
        key?.DeleteValue(ValueName, throwOnMissingValue: false);
    }

    /// <summary>Returns true if the HKCU Run entry exists for this app.</summary>
    internal static bool IsEnabled()
    {
        using var key = Registry.CurrentUser.OpenSubKey(RunKeyPath, writable: false);
        return key?.GetValue(ValueName) is not null;
    }
}
