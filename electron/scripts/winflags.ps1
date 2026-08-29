# Read the Win32 style bits off a LIVE window, by process id.
#
# Ported from ~/code/garry-desktop/scripts/winflags.ps1, which is the shipped precedent on this machine
# for proving an overlay's window traits. Two deliberate changes:
#
#   1. **Pids are a PARAMETER, not `Get-Process electron`.** The original scanned by process name, which
#      on this box also matches any other Electron app that happens to be running -- and the probe would
#      then report someone else's window as the overlay's. `probe-shell.ts` passes the pid it spawned.
#   2. **Output is one JSON line**, so the caller parses it instead of scraping Format-List.
#
# The Alt-Tab arm is the reason this exists at all. `$eligible` implements the documented shell rule --
# visible, titled, unowned, and either not WS_EX_TOOLWINDOW or forcibly WS_EX_APPWINDOW -- and it is
# computed for EVERY window on the desktop, not just ours. ALT_TAB_TOTAL is the positive control: without
# it, "our window is not in Alt-Tab" is indistinguishable from "this enumerator finds nothing".

param(
  [Parameter(Mandatory = $true)][string]$Pids
)

$sig = @"
using System;
using System.Text;
using System.Runtime.InteropServices;
public class FCW {
  [DllImport("user32.dll")] public static extern bool EnumWindows(EnumProc cb, IntPtr p);
  public delegate bool EnumProc(IntPtr h, IntPtr p);
  [DllImport("user32.dll")] public static extern int GetWindowLong(IntPtr h, int i);
  [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr h);
  [DllImport("user32.dll")] public static extern IntPtr GetWindow(IntPtr h, uint c);
  [DllImport("user32.dll", CharSet=CharSet.Unicode)] public static extern int GetWindowTextW(IntPtr h, StringBuilder s, int n);
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr h, out uint pid);
  [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr h, out RECT r);
  public struct RECT { public int L, T, R, B; }
  public static string Title(IntPtr h) { var sb = new StringBuilder(300); GetWindowTextW(h, sb, 300); return sb.ToString(); }
}
"@
Add-Type -TypeDefinition $sig -ErrorAction Stop

$GWL_EXSTYLE = -20
$GWL_STYLE = -16
$WS_EX_TOOLWINDOW = 0x00000080
$WS_EX_TOPMOST = 0x00000008
$WS_EX_LAYERED = 0x00080000
$WS_EX_TRANSPARENT = 0x00000020
$WS_EX_APPWINDOW = 0x00040000
$WS_CAPTION = 0x00C00000
$WS_THICKFRAME = 0x00040000
$GW_OWNER = 4

$targets = @($Pids -split ',' | Where-Object { $_ -ne '' } | ForEach-Object { [uint32]$_ })

$script:altTabAll = 0
$script:altTabOurs = 0
$script:found = @()

$cb = [FCW+EnumProc] {
  param($h, $p)
  if (-not [FCW]::IsWindowVisible($h)) { return $true }
  $t = [FCW]::Title($h)
  $ex = [FCW]::GetWindowLong($h, $GWL_EXSTYLE)
  $st = [FCW]::GetWindowLong($h, $GWL_STYLE)
  $owner = [FCW]::GetWindow($h, $GW_OWNER)
  $tool = ($ex -band $WS_EX_TOOLWINDOW) -ne 0
  $appw = ($ex -band $WS_EX_APPWINDOW) -ne 0
  $eligible = ($t.Length -gt 0) -and ($owner -eq [IntPtr]::Zero) -and ((-not $tool) -or $appw)
  if ($eligible) { $script:altTabAll++ }

  $wpid = 0
  [void][FCW]::GetWindowThreadProcessId($h, [ref]$wpid)
  if ($targets -contains $wpid) {
    if ($eligible) { $script:altTabOurs++ }
    $r = New-Object 'FCW+RECT'
    [void][FCW]::GetWindowRect($h, [ref]$r)
    $script:found += [pscustomobject]@{
      pid            = [int]$wpid
      title          = $t
      toolwindow     = $tool
      topmost        = ($ex -band $WS_EX_TOPMOST) -ne 0
      layered        = ($ex -band $WS_EX_LAYERED) -ne 0
      transparent_ex = ($ex -band $WS_EX_TRANSPARENT) -ne 0
      has_caption    = ($st -band $WS_CAPTION) -eq $WS_CAPTION
      has_thickframe = ($st -band $WS_THICKFRAME) -ne 0
      appwindow      = $appw
      altTabEligible = $eligible
      x              = $r.L
      y              = $r.T
      width          = $r.R - $r.L
      height         = $r.B - $r.T
    }
  }
  return $true
}
[void][FCW]::EnumWindows($cb, [IntPtr]::Zero)

# `@()` around the collection, or a single window serialises as an object rather than an array and the
# caller's `windows.length` reads undefined.
$payload = [pscustomobject]@{
  targets       = @($targets | ForEach-Object { [int]$_ })
  altTabTotal   = $script:altTabAll
  altTabOurs    = $script:altTabOurs
  windows       = @($script:found)
}
Write-Output ("PROBE-WINFLAGS " + ($payload | ConvertTo-Json -Compress -Depth 5))
