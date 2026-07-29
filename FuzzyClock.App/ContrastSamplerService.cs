// Screen color sampler for auto-contrast. Captures the window footprint via BitBlt
// and returns an average pixel color as RgbColor for use by ContrastService.
// Requires UseWindowsForms=true in the .csproj (provides System.Drawing.Bitmap without extra NuGet).
using System.Runtime.InteropServices;
using FuzzyClock.Core;

namespace FuzzyClock.App;

internal static class ContrastSamplerService
{
    // GDI P/Invoke
    [DllImport("gdi32.dll")] private static extern IntPtr CreateCompatibleDC(IntPtr hdc);
    [DllImport("gdi32.dll")] private static extern IntPtr CreateCompatibleBitmap(IntPtr hdc, int nWidth, int nHeight);
    [DllImport("gdi32.dll")] private static extern IntPtr SelectObject(IntPtr hdc, IntPtr h);
    [DllImport("gdi32.dll")] private static extern bool BitBlt(IntPtr hdcDest, int xDest, int yDest, int nWidth, int nHeight, IntPtr hdcSrc, int xSrc, int ySrc, uint dwRop);
    [DllImport("gdi32.dll")] private static extern bool DeleteDC(IntPtr hdc);
    [DllImport("gdi32.dll")] private static extern bool DeleteObject(IntPtr hObject);

    // User32 P/Invoke
    [DllImport("user32.dll")] private static extern IntPtr GetDesktopWindow();
    [DllImport("user32.dll")] private static extern IntPtr GetDC(IntPtr hWnd);
    [DllImport("user32.dll")] private static extern int ReleaseDC(IntPtr hWnd, IntPtr hDC);

    private const uint SRCCOPY = 0x00CC0020;

    // Maximum sample area dimension — larger regions are stepped to keep sampling fast.
    private const int MaxSampleDim = 200;

    /// <summary>
    /// Captures the screen region under the widget and returns the average pixel color.
    /// Pixel coordinates must be physical screen pixels (not WPF device-independent units).
    /// Returns RgbColor(128, 128, 128) if screen capture is unavailable.
    /// </summary>
    internal static RgbColor Sample(int pixelLeft, int pixelTop, int pixelWidth, int pixelHeight)
    {
        // Clamp to minimum 1×1 to avoid zero-size BitBlt
        int w = Math.Max(1, pixelWidth);
        int h = Math.Max(1, pixelHeight);

        IntPtr desktopHwnd = GetDesktopWindow();
        IntPtr screenDC    = GetDC(desktopHwnd);
        if (screenDC == IntPtr.Zero)
            return new RgbColor(128, 128, 128);

        IntPtr memDC  = IntPtr.Zero;
        IntPtr hBmp   = IntPtr.Zero;
        IntPtr hOld   = IntPtr.Zero;

        try
        {
            memDC = CreateCompatibleDC(screenDC);
            hBmp  = CreateCompatibleBitmap(screenDC, w, h);
            hOld  = SelectObject(memDC, hBmp);

            // BitBlt from the desktop into the off-screen memory DC
            bool ok = BitBlt(memDC, 0, 0, w, h, screenDC, pixelLeft, pixelTop, SRCCOPY);
            if (!ok)
                return new RgbColor(128, 128, 128);

            // Wrap the HBITMAP in a System.Drawing.Bitmap to read pixel data
            using var bitmap = System.Drawing.Bitmap.FromHbitmap(hBmp);

            // Compute step size so we sample at most MaxSampleDim×MaxSampleDim pixels
            int stepX = Math.Max(1, w / MaxSampleDim);
            int stepY = Math.Max(1, h / MaxSampleDim);

            long totalR = 0, totalG = 0, totalB = 0;
            int  count  = 0;

            for (int y = 0; y < h; y += stepY)
            {
                for (int x = 0; x < w; x += stepX)
                {
                    var pixel = bitmap.GetPixel(x, y);
                    totalR += pixel.R;
                    totalG += pixel.G;
                    totalB += pixel.B;
                    count++;
                }
            }

            if (count == 0)
                return new RgbColor(128, 128, 128);

            return new RgbColor(
                (byte)(totalR / count),
                (byte)(totalG / count),
                (byte)(totalB / count));
        }
        catch
        {
            // GDI/GDI+ interop (FromHbitmap/GetPixel) can throw transiently on
            // display-state changes (monitor connect/disconnect, DPI/resolution
            // change, RDP session, lock screen). Return the same neutral grey
            // every other failure path uses so one bad tick skips contrast
            // adjustment instead of crashing the process. The finally below still
            // releases all GDI handles on this path.
            return new RgbColor(128, 128, 128);
        }
        finally
        {
            if (hOld != IntPtr.Zero && memDC != IntPtr.Zero) SelectObject(memDC, hOld);
            if (hBmp != IntPtr.Zero)  DeleteObject(hBmp);
            if (memDC != IntPtr.Zero) DeleteDC(memDC);
            ReleaseDC(desktopHwnd, screenDC);
        }
    }
}
