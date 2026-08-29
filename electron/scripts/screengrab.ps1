# Read the actual COMPOSITED pixels of a screen rectangle. The instrument for `probe-pixels.ts`.
#
# Every other probe in this directory reads a decision: a style bit, a DOM attribute, a computed layout. None
# of them can see what the compositor actually put on the glass, and `probe-display.ts:64` says so in as many
# words -- "Nothing here compares a rendered pixel". That gap is why `probe-shell.ts`'s S2 could pass for two
# phases while attributing WS_EX_LAYERED to the wrong cause: a bit was checked, an appearance was not.
#
# `CopyFromScreen` is the whole mechanism, and it reads the DESKTOP after DWM composition rather than any one
# window's buffer -- which is the entire point. `webContents.capturePage()` cannot answer this question: it
# captures the page's own surface, so a transparent page captures as transparent whether or not the OS
# honoured the transparency.
#
# Output is a downsampled GRID plus a mean, not a full bitmap: the caller compares captures for "is this
# still magenta", and shipping 200 KB of base64 through a stdout pipe to answer that would make the probe's
# own transport the slowest thing in the run. The grid is what keeps a uniform-colour check from passing on
# an image that is uniform in the wrong place -- a mean alone cannot tell magenta from a red/blue checker.

param(
  [Parameter(Mandatory = $true)][int]$X,
  [Parameter(Mandatory = $true)][int]$Y,
  [Parameter(Mandatory = $true)][int]$W,
  [Parameter(Mandatory = $true)][int]$H,
  [int]$Grid = 8
)

Add-Type -AssemblyName System.Drawing -ErrorAction Stop

$bmp = New-Object System.Drawing.Bitmap($W, $H)
try {
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  try {
    # `CopyPixelOperation::SourceCopy` is the default and is stated rather than relied on: any blend mode
    # here would make the reading a function of the bitmap's initial contents, which are undefined.
    $g.CopyFromScreen($X, $Y, 0, 0, (New-Object System.Drawing.Size($W, $H)), [System.Drawing.CopyPixelOperation]::SourceCopy)
  } finally {
    $g.Dispose()
  }

  $cells = New-Object System.Collections.ArrayList
  $sumR = 0; $sumG = 0; $sumB = 0; $n = 0
  for ($row = 0; $row -lt $Grid; $row++) {
    for ($col = 0; $col -lt $Grid; $col++) {
      # Sample the CENTRE of each cell rather than its corner: a corner lands on the window's own border and
      # on the rounding of the rect, and a one-pixel edge artefact would then be 1/64th of the verdict.
      $px = [int](($col + 0.5) * $W / $Grid)
      $py = [int](($row + 0.5) * $H / $Grid)
      if ($px -ge $W) { $px = $W - 1 }
      if ($py -ge $H) { $py = $H - 1 }
      $c = $bmp.GetPixel($px, $py)
      [void]$cells.Add(("{0:x2}{1:x2}{2:x2}" -f $c.R, $c.G, $c.B))
      $sumR += $c.R; $sumG += $c.G; $sumB += $c.B; $n++
    }
  }

  $out = [ordered]@{
    x = $X; y = $Y; w = $W; h = $H; grid = $Grid
    meanR = [math]::Round($sumR / $n, 2)
    meanG = [math]::Round($sumG / $n, 2)
    meanB = [math]::Round($sumB / $n, 2)
    cells = $cells
  }
  Write-Output ("PROBE-SCREENGRAB " + ($out | ConvertTo-Json -Compress -Depth 4))
} finally {
  $bmp.Dispose()
}
