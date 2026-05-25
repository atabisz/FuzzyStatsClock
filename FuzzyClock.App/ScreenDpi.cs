// Sources:
//   GetDpiForMonitor (Shcore):
//     https://learn.microsoft.com/en-us/windows/win32/api/shellscalingapi/nf-shellscalingapi-getdpiformonitor
//   MonitorFromPoint:
//     https://learn.microsoft.com/en-us/windows/win32/api/winuser/nf-winuser-monitorfrompoint
//   Why this helper exists:
//     With UseWPF=true + UseWindowsForms=true (.NET 5+), the process is per-monitor
//     DPI-aware. System.Windows.Forms.Screen.WorkingArea / Bounds therefore return
//     PHYSICAL PIXELS, while WPF's Window.Left/Top are DIPs (logical units, 96 DPI).
//     Comparing the two directly lets a saved DIP position fall outside the screen's
//     pixel bounds while still appearing "in range" — the widget renders off-screen.
//
//     ScreenDpi.WorkingAreaInDips() converts a Screen's WorkingArea to DIPs so the
//     pre-Show off-desktop check and post-Show clamp see consistent units.
using System.Runtime.InteropServices;

namespace FuzzyClock.App;

internal static class ScreenDpi
{
    private const int MONITOR_DEFAULTTONEAREST = 2;
    private const int MDT_EFFECTIVE_DPI = 0;

    [DllImport("user32.dll")]
    private static extern IntPtr MonitorFromPoint(POINT pt, int flags);

    [DllImport("Shcore.dll")]
    private static extern int GetDpiForMonitor(
        IntPtr hmonitor, int dpiType, out uint dpiX, out uint dpiY);

    [StructLayout(LayoutKind.Sequential)]
    private struct POINT { public int X; public int Y; }

    /// <summary>
    /// Returns the DPI scale (e.g. 1.0, 1.25, 1.5, 2.0) for <paramref name="screen"/>.
    /// Falls back to 1.0 when Shcore APIs are unavailable (Windows 7) or fail.
    /// </summary>
    internal static double GetScaleFor(System.Windows.Forms.Screen screen)
    {
        try
        {
            var b = screen.Bounds;
            var pt = new POINT { X = b.Left + b.Width / 2, Y = b.Top + b.Height / 2 };
            IntPtr hmon = MonitorFromPoint(pt, MONITOR_DEFAULTTONEAREST);
            if (hmon == IntPtr.Zero) return 1.0;
            int hr = GetDpiForMonitor(hmon, MDT_EFFECTIVE_DPI, out uint dpiX, out _);
            if (hr != 0 || dpiX == 0) return 1.0;
            return dpiX / 96.0;
        }
        catch
        {
            return 1.0;
        }
    }

    /// <summary>
    /// Converts <paramref name="screen"/>'s physical-pixel WorkingArea to DIPs.
    /// Use this whenever WorkingArea bounds will be compared against — or clamped to —
    /// a WPF Window.Left/Top value.
    /// </summary>
    internal static (double Left, double Top, double Width, double Height) WorkingAreaInDips(
        System.Windows.Forms.Screen screen)
    {
        double s = GetScaleFor(screen);
        if (s <= 0.0) s = 1.0;
        var w = screen.WorkingArea;
        return (w.Left / s, w.Top / s, w.Width / s, w.Height / s);
    }

    /// <summary>
    /// Returns the Screen containing the given DIP point — equivalent of
    /// <c>Screen.FromPoint</c> but accepting WPF logical coordinates.
    /// Iterates connected screens, converting each one's WorkingArea (pixels)
    /// to DIPs and testing containment. Falls back to PrimaryScreen on miss.
    /// </summary>
    internal static System.Windows.Forms.Screen FromDipPoint(double xDip, double yDip)
    {
        foreach (var s in System.Windows.Forms.Screen.AllScreens)
        {
            var w = WorkingAreaInDips(s);
            if (xDip >= w.Left && xDip < w.Left + w.Width &&
                yDip >= w.Top  && yDip < w.Top  + w.Height)
                return s;
        }
        return System.Windows.Forms.Screen.PrimaryScreen
               ?? System.Windows.Forms.Screen.AllScreens[0];
    }
}
