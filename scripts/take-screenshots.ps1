Add-Type -AssemblyName System.Drawing

Add-Type @'
using System;
using System.Runtime.InteropServices;

public class WinUtils {
    [DllImport("user32.dll")]  public static extern bool  EnumWindows(EnumWindowsProc cb, IntPtr lp);
    [DllImport("user32.dll")]  public static extern uint  GetWindowThreadProcessId(IntPtr hwnd, out uint pid);
    [DllImport("user32.dll")]  public static extern bool  GetWindowRect(IntPtr hwnd, out RECT r);
    [DllImport("user32.dll")]  public static extern int   GetWindowLong(IntPtr hwnd, int nIndex);
    [DllImport("user32.dll")]  public static extern bool  PrintWindow(IntPtr hwnd, IntPtr hdc, uint nFlags);
    [DllImport("user32.dll")]  public static extern uint  GetDpiForWindow(IntPtr hwnd);
    public delegate bool EnumWindowsProc(IntPtr hwnd, IntPtr lp);

    [StructLayout(LayoutKind.Sequential)]
    public struct RECT { public int Left, Top, Right, Bottom; }

    private static int    _pid;
    private static IntPtr _found;

    private static bool CB(IntPtr hwnd, IntPtr lp) {
        uint wpid;
        GetWindowThreadProcessId(hwnd, out wpid);
        if ((int)wpid == _pid && (GetWindowLong(hwnd, -20) & 0x80000) != 0) {
            RECT r;
            GetWindowRect(hwnd, out r);
            int w = r.Right - r.Left, h = r.Bottom - r.Top;
            if (w > 30 && h > 30 && w < 1400 && h < 1400) {
                _found = hwnd; return false;
            }
        }
        return true;
    }

    public static IntPtr FindByPid(int pid) {
        _pid = pid; _found = IntPtr.Zero;
        EnumWindows(CB, IntPtr.Zero);
        return _found;
    }

    public static RECT GetRect(IntPtr hwnd) {
        RECT r; GetWindowRect(hwnd, out r); return r;
    }

    public static bool PrintWindowFull(IntPtr hwnd, IntPtr hdc) {
        // PW_RENDERFULLCONTENT = 0x00000002 — captures DWM-composited content
        return PrintWindow(hwnd, hdc, 2);
    }
}
'@

$exe          = "C:\src\FuzzyStatsClock\FuzzyClock.App\bin\Release\net10.0-windows\FuzzyClock.exe"
$settingsDir  = [System.Environment]::GetFolderPath('LocalApplicationData') + '\FuzzyClock'
$settingsPath = "$settingsDir\settings.json"
$outDir       = "C:\src\FuzzyStatsClock\docs\screenshots"
$backupPath   = "$settingsPath.screenshotbak"

if (-not (Test-Path $settingsDir)) { New-Item -ItemType Directory -Path $settingsDir | Out-Null }
if (-not (Test-Path $outDir))      { New-Item -ItemType Directory -Path $outDir      | Out-Null }
if (Test-Path $settingsPath) { Copy-Item $settingsPath $backupPath -Force; Write-Host "Settings backed up." }

function Kill-FuzzyClock {
    Get-Process FuzzyClock -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
    Start-Sleep -Milliseconds 800
}

function Capture-Mode {
    param([string]$label, [string]$settingsJson, [string]$outFile, [int]$extraWaitSec = 4)

    Write-Host ""
    Write-Host "Capturing: $label"
    Kill-FuzzyClock

    $settingsJson | Set-Content $settingsPath -Encoding UTF8
    $proc = Start-Process -FilePath $exe -PassThru
    Write-Host "  Launched PID $($proc.Id)..."

    $hwnd = [IntPtr]::Zero
    for ($i = 0; $i -lt 50; $i++) {
        Start-Sleep -Milliseconds 400
        $hwnd = [WinUtils]::FindByPid($proc.Id)
        if ($hwnd -ne [IntPtr]::Zero) { break }
    }

    if ($hwnd -eq [IntPtr]::Zero) {
        Write-Warning "  Overlay not found -- skipping."; Kill-FuzzyClock; return
    }

    Write-Host "  Found overlay. Waiting ${extraWaitSec}s for content..."
    Start-Sleep -Seconds $extraWaitSec

    $hwnd = [WinUtils]::FindByPid($proc.Id)
    $r    = [WinUtils]::GetRect($hwnd)
    $fw   = $r.Right - $r.Left; $fh = $r.Bottom - $r.Top
    Write-Host "  Rect: ($($r.Left),$($r.Top)) ${fw}x${fh}"

    # PrintWindow renders at physical pixels; get the DPI scale factor first
    $dpi   = [WinUtils]::GetDpiForWindow($hwnd)
    $scale = $dpi / 96.0
    $physW = [int]([Math]::Ceiling($fw * $scale))
    $physH = [int]([Math]::Ceiling($fh * $scale))
    Write-Host "  DPI=$dpi scale=$scale  physical=${physW}x${physH}"

    # Capture at full physical resolution
    $raw  = New-Object System.Drawing.Bitmap($physW, $physH, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
    $gRaw = [System.Drawing.Graphics]::FromImage($raw)
    $hdc  = $gRaw.GetHdc()
    [WinUtils]::PrintWindowFull($hwnd, $hdc) | Out-Null
    $gRaw.ReleaseHdc($hdc)
    $gRaw.Dispose()

    # Composite onto dark background, scaled back to logical size
    $pad  = 16
    $full = New-Object System.Drawing.Bitmap(($fw + $pad*2), ($fh + $pad*2))
    $g    = [System.Drawing.Graphics]::FromImage($full)
    $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $g.SmoothingMode     = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
    $g.Clear([System.Drawing.Color]::FromArgb(255, 22, 22, 22))
    $g.DrawImage($raw, $pad, $pad, $fw, $fh)
    $g.Dispose()
    $raw.Dispose()

    $full.Save($outFile, [System.Drawing.Imaging.ImageFormat]::Png)
    $full.Dispose()

    $iw = $fw + $pad*2; $ih = $fh + $pad*2
    Write-Host "  Saved: $outFile  (${iw}x${ih})"
    Kill-FuzzyClock
}

function Make-Settings {
    param([bool]$dialMode, [bool]$statsVisible)
    $dial  = if ($dialMode)     { "true" } else { "false" }
    $stats = if ($statsVisible) { "true" } else { "false" }
    return @"
{
  "MonitorPositions": {},
  "LastActiveMonitor": "",
  "FontSize": 32,
  "StatsVisible": $stats,
  "StatsIntervalSeconds": 1,
  "CpuVisible": true, "GpuVisible": true, "MemVisible": true,
  "PagVisible": true, "BatteryVisible": true, "UptimeVisible": true,
  "DialMode": $dial,
  "ShowHourTicks": true, "ShowMinuteDots": true, "ShowHourNumbers": false,
  "AccentColor": "#FFFFFFFF",
  "Opacity": 1.0,
  "GhostModeEnabled": false,
  "AutoLaunchEnabled": false,
  "AutoContrastEnabled": false,
  "ProcessCountThresholdPercent": 5.0,
  "PhraseStyle": "Classic",
  "PhraseLocale": "en",
  "ShowDate": true,
  "DateFormat": "Short",
  "Theme": null,
  "BatteryAlertThresholdPercent": 20,
  "PhraseWrapEnabled": true,
  "PhraseWrapStyle": "midpoint",
  "BackdropAlwaysVisible": false,
  "BackdropOpacityPercent": 35
}
"@
}

Capture-Mode -label "Phrase only"    -settingsJson (Make-Settings $false $false) -outFile "$outDir\phrase-only.png"  -extraWaitSec 4
Capture-Mode -label "Phrase + stats" -settingsJson (Make-Settings $false $true)  -outFile "$outDir\phrase-stats.png" -extraWaitSec 12
Capture-Mode -label "Dial only"      -settingsJson (Make-Settings $true  $false) -outFile "$outDir\dial-only.png"    -extraWaitSec 4
Capture-Mode -label "Dial + stats"   -settingsJson (Make-Settings $true  $true)  -outFile "$outDir\dial-stats.png"   -extraWaitSec 12

Kill-FuzzyClock
if (Test-Path $backupPath) {
    Copy-Item $backupPath $settingsPath -Force
    Remove-Item $backupPath -Force
    Write-Host ""; Write-Host "Original settings restored."
}

Write-Host ""
Write-Host "Done."
Get-ChildItem $outDir -Filter "*.png" | Where-Object Name -notlike '_*' |
    Select-Object Name, @{N='KB';E={[math]::Round($_.Length/1KB,1)}}
