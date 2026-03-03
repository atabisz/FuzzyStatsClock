// Sources:
//   QueryDisplayConfig / DISPLAYCONFIG_TARGET_DEVICE_NAME:
//     https://learn.microsoft.com/en-us/windows/win32/api/winuser/nf-winuser-querydisplayconfig
//   Screen.AllScreens / Screen.FromPoint:
//     https://learn.microsoft.com/en-us/dotnet/api/system.windows.forms.screen
using System.Runtime.InteropServices;

namespace FuzzyClock.App;

/// <summary>
/// Identifies monitors by a stable, human-readable key (friendly name,
/// lowercased, with -2/-3 suffixes when duplicates exist).
/// </summary>
public static class MonitorService
{
    // -----------------------------------------------------------------------
    // Public API
    // -----------------------------------------------------------------------

    /// <summary>
    /// Returns the monitor key for the monitor that contains the centre of
    /// <paramref name="window"/>.
    /// </summary>
    public static string GetCurrentMonitorKey(System.Windows.Window window)
    {
        int centerX = (int)(window.Left + window.ActualWidth  / 2);
        int centerY = (int)(window.Top  + window.ActualHeight / 2);
        var screen  = System.Windows.Forms.Screen.FromPoint(new System.Drawing.Point(centerX, centerY));
        return GetKeyForScreen(screen);
    }

    /// <summary>Returns the monitor key for the primary monitor.</summary>
    public static string GetPrimaryMonitorKey()
    {
        var screen = System.Windows.Forms.Screen.PrimaryScreen
                     ?? System.Windows.Forms.Screen.AllScreens[0];
        return GetKeyForScreen(screen);
    }

    /// <summary>
    /// Returns the deduplicated, lowercased key for <paramref name="screen"/>.
    /// Used internally and by MainWindow when restoring position.
    /// </summary>
    internal static string GetKeyForScreen(System.Windows.Forms.Screen screen)
    {
        var map = GetKeyMap();
        if (map.TryGetValue(screen.DeviceName, out var key))
            return key;
        // Fallback for a screen that somehow isn't in the cached map.
        return FallbackKey(screen.DeviceName);
    }

    // -----------------------------------------------------------------------
    // Cache
    // -----------------------------------------------------------------------

    private static Dictionary<string, string>? _keyMap;
    private static int _cachedScreenCount = -1;

    private static Dictionary<string, string> GetKeyMap()
    {
        var allScreens = System.Windows.Forms.Screen.AllScreens;
        if (_keyMap == null || _cachedScreenCount != allScreens.Length)
        {
            _keyMap = BuildKeyMap(allScreens);
            _cachedScreenCount = allScreens.Length;
        }
        return _keyMap;
    }

    // -----------------------------------------------------------------------
    // Key-map construction
    // -----------------------------------------------------------------------

    private static Dictionary<string, string> BuildKeyMap(
        System.Windows.Forms.Screen[] screens)
    {
        // 1. Try to get a friendly name for each screen via QueryDisplayConfig.
        var rawNames = new string[screens.Length];
        for (int i = 0; i < screens.Length; i++)
        {
            string? friendly = GetFriendlyNameForDevice(screens[i].DeviceName);
            rawNames[i] = !string.IsNullOrWhiteSpace(friendly)
                ? friendly
                : FallbackKey(screens[i].DeviceName);
        }

        // 2. Detect duplicates and assign -2/-3 suffixes.
        //    First occurrence keeps the plain name; subsequent get -2, -3, …
        var map          = new Dictionary<string, string>(screens.Length);
        var seenCounts   = new Dictionary<string, int>(StringComparer.OrdinalIgnoreCase);

        for (int i = 0; i < screens.Length; i++)
        {
            string raw = rawNames[i].ToLowerInvariant();
            seenCounts.TryGetValue(raw, out int prev);
            seenCounts[raw] = prev + 1;
        }

        // Reset and do a second pass to assign keys in order.
        var assigned = new Dictionary<string, int>(StringComparer.OrdinalIgnoreCase);
        for (int i = 0; i < screens.Length; i++)
        {
            string raw = rawNames[i].ToLowerInvariant();
            assigned.TryGetValue(raw, out int n);
            assigned[raw] = n + 1;

            string key = seenCounts[raw] > 1
                ? (n == 0 ? raw : $"{raw}-{n + 1}")
                : raw;

            map[screens[i].DeviceName] = key;
        }

        return map;
    }

    /// <summary>
    /// Strips the leading "\\.\\" prefix from a GDI device name and
    /// lowercases the result (e.g. "\\.\DISPLAY1" → "display1").
    /// Used as fallback when no friendly name is available.
    /// </summary>
    private static string FallbackKey(string deviceName)
        => deviceName
            .TrimStart('\\')
            .TrimStart('.')
            .TrimStart('\\')
            .ToLowerInvariant();

    // -----------------------------------------------------------------------
    // Win32 P/Invoke — QueryDisplayConfig for friendly monitor names
    // -----------------------------------------------------------------------

    private const uint QDC_ONLY_ACTIVE_PATHS = 0x4;
    private const uint DISPLAYCONFIG_DEVICE_INFO_GET_TARGET_NAME = 2;

    [DllImport("user32.dll")]
    private static extern int GetDisplayConfigBufferSizes(
        uint flags, out uint pathCount, out uint modeCount);

    [DllImport("user32.dll")]
    private static extern int QueryDisplayConfig(
        uint flags,
        ref uint pathCount,
        [Out] DISPLAYCONFIG_PATH_INFO[] paths,
        ref uint modeCount,
        [Out] DISPLAYCONFIG_MODE_INFO[] modes,
        IntPtr topologyId);

    [DllImport("user32.dll")]
    private static extern int DisplayConfigGetDeviceInfo(
        ref DISPLAYCONFIG_TARGET_DEVICE_NAME request);

    [StructLayout(LayoutKind.Sequential)]
    private struct DISPLAYCONFIG_DEVICE_INFO_HEADER
    {
        public uint type;
        public uint size;
        public uint adapterId_LowPart;
        public uint adapterId_HighPart;
        public uint id;
    }

    [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
    private struct DISPLAYCONFIG_TARGET_DEVICE_NAME
    {
        public DISPLAYCONFIG_DEVICE_INFO_HEADER header;
        public uint flags;
        public uint outputTechnology;          // DISPLAYCONFIG_VIDEO_OUTPUT_TECHNOLOGY
        public ushort edidManufactureId;
        public ushort edidProductCodeId;
        public uint connectorInstance;
        [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 64)]
        public string monitorFriendlyDeviceName;
        [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 128)]
        public string monitorDevicePath;
    }

    [StructLayout(LayoutKind.Sequential)]
    private struct DISPLAYCONFIG_PATH_INFO
    {
        // 72 bytes: sourceInfo (8) + targetInfo (8) + flags (4) + reserved (52)
        public ulong sourceInfo;
        public ulong targetInfo;
        public uint  flags;
        [MarshalAs(UnmanagedType.ByValArray, SizeConst = 13)]
        public uint[] reserved;
    }

    [StructLayout(LayoutKind.Sequential)]
    private struct DISPLAYCONFIG_MODE_INFO
    {
        // 64 bytes: 8 uint fields
        [MarshalAs(UnmanagedType.ByValArray, SizeConst = 16)]
        public uint[] data;
    }

    /// <summary>
    /// Queries the Windows display stack for the friendly monitor name
    /// associated with the GDI <paramref name="deviceName"/> (e.g. "\\.\DISPLAY1").
    /// Returns null on any failure; caller falls back to DeviceName stripping.
    /// </summary>
    private static string? GetFriendlyNameForDevice(string deviceName)
    {
        try
        {
            int ret = GetDisplayConfigBufferSizes(
                QDC_ONLY_ACTIVE_PATHS, out uint pathCount, out uint modeCount);
            if (ret != 0) return null;

            var paths = new DISPLAYCONFIG_PATH_INFO[pathCount];
            var modes = new DISPLAYCONFIG_MODE_INFO[modeCount];
            ret = QueryDisplayConfig(
                QDC_ONLY_ACTIVE_PATHS,
                ref pathCount, paths,
                ref modeCount, modes,
                IntPtr.Zero);
            if (ret != 0) return null;

            // Normalise the GDI device name for substring matching
            // ("\\.\DISPLAY1" → "DISPLAY1").
            string gdiShort = deviceName.Replace(@"\\", @"\").TrimStart('\\').TrimStart('.');
            if (gdiShort.StartsWith('\\')) gdiShort = gdiShort.TrimStart('\\');

            for (int i = 0; i < pathCount; i++)
            {
                var request = new DISPLAYCONFIG_TARGET_DEVICE_NAME
                {
                    monitorFriendlyDeviceName = string.Empty,
                    monitorDevicePath         = string.Empty
                };
                // Extract adapter LUID and target id from the packed targetInfo field.
                ulong ti   = paths[i].targetInfo;
                uint  low  = (uint)(ti & 0xFFFFFFFF);
                uint  high = (uint)(ti >> 32);
                // targetInfo layout (from WDK):
                //   bits 0-15   adapterId low
                //   bits 16-31  adapterId high (actually LUID is 64-bit split differently)
                // Use a simpler approach: store full LUID in low/high of adapterId.
                request.header.type              = DISPLAYCONFIG_DEVICE_INFO_GET_TARGET_NAME;
                request.header.size              = (uint)Marshal.SizeOf<DISPLAYCONFIG_TARGET_DEVICE_NAME>();
                request.header.adapterId_LowPart = low;
                request.header.adapterId_HighPart= high;
                // id is in bits 0-15 of targetInfo (per DISPLAYCONFIG_PATH_TARGET_INFO)
                request.header.id                = low & 0xFFFF;

                int r = DisplayConfigGetDeviceInfo(ref request);
                if (r != 0) continue;
                if (string.IsNullOrEmpty(request.monitorFriendlyDeviceName)) continue;

                // Match: does the monitorDevicePath contain the GDI short name?
                if (!string.IsNullOrEmpty(request.monitorDevicePath) &&
                    request.monitorDevicePath.Contains(
                        gdiShort, StringComparison.OrdinalIgnoreCase))
                {
                    return request.monitorFriendlyDeviceName.Trim();
                }
            }

            // QueryDisplayConfig unavailable — falling back to GDI device name
            return null;
        }
        catch
        {
            return null;
        }
    }
}
