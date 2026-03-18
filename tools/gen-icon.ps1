Add-Type -AssemblyName System.Drawing

function New-ClockBitmap([int]$size) {
    $bmp = New-Object System.Drawing.Bitmap($size, $size, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    try {
        $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
        $g.Clear([System.Drawing.Color]::Transparent)
        $cx = [float]($size / 2.0)
        $cy = [float]($size / 2.0)
        $m  = [float]($size * 0.06)
        $fw = [float]($size - 2.0 * $m)

        $fb = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(30, 30, 30))
        $g.FillEllipse($fb, $m, $m, $fw, $fw)
        $fb.Dispose()

        $rw = [float]([Math]::Max(1.0, $size * 0.08))
        $rp = New-Object System.Drawing.Pen([System.Drawing.Color]::White, $rw)
        $g.DrawEllipse($rp, $m, $m, $fw, $fw)
        $rp.Dispose()

        $hr = -60.0 * [Math]::PI / 180.0
        $hl = [float]($size * 0.22)
        $hx = $cx + $hl * [float][Math]::Sin($hr)
        $hy = $cy - $hl * [float][Math]::Cos($hr)
        $hw = [float]([Math]::Max(1.0, $size * 0.11))
        $hp = New-Object System.Drawing.Pen([System.Drawing.Color]::White, $hw)
        $hp.StartCap = [System.Drawing.Drawing2D.LineCap]::Round
        $hp.EndCap   = [System.Drawing.Drawing2D.LineCap]::Round
        $g.DrawLine($hp, $cx, $cy, $hx, $hy)
        $hp.Dispose()

        $mr = 60.0 * [Math]::PI / 180.0
        $ml = [float]($size * 0.34)
        $mxp = $cx + $ml * [float][Math]::Sin($mr)
        $myp = $cy - $ml * [float][Math]::Cos($mr)
        $mw = [float]([Math]::Max(1.0, $size * 0.07))
        $mp = New-Object System.Drawing.Pen([System.Drawing.Color]::White, $mw)
        $mp.StartCap = [System.Drawing.Drawing2D.LineCap]::Round
        $mp.EndCap   = [System.Drawing.Drawing2D.LineCap]::Round
        $g.DrawLine($mp, $cx, $cy, $mxp, $myp)
        $mp.Dispose()

        $dr = [float]([Math]::Max(2.0, $size * 0.09))
        $g.FillEllipse([System.Drawing.Brushes]::White, $cx - $dr, $cy - $dr, $dr * 2.0, $dr * 2.0)
    } finally {
        $g.Dispose()
    }
    return $bmp
}

function BitmapToIcoBmpBytes([System.Drawing.Bitmap]$bmp) {
    $w = $bmp.Width; $h = $bmp.Height
    $hdr = [byte[]]::new(40)
    [System.BitConverter]::GetBytes([int32]40).CopyTo($hdr, 0)
    [System.BitConverter]::GetBytes([int32]$w).CopyTo($hdr, 4)
    [System.BitConverter]::GetBytes([int32]($h * 2)).CopyTo($hdr, 8)
    [System.BitConverter]::GetBytes([int16]1).CopyTo($hdr, 12)
    [System.BitConverter]::GetBytes([int16]32).CopyTo($hdr, 14)

    $pixBytes = [byte[]]::new($w * $h * 4)
    for ($y = $h - 1; $y -ge 0; $y--) {
        for ($x = 0; $x -lt $w; $x++) {
            $c   = $bmp.GetPixel($x, $y)
            $idx = (($h - 1 - $y) * $w + $x) * 4
            $pixBytes[$idx]     = $c.B
            $pixBytes[$idx + 1] = $c.G
            $pixBytes[$idx + 2] = $c.R
            $pixBytes[$idx + 3] = $c.A
        }
    }
    $andStride = [int]([Math]::Ceiling($w / 32.0)) * 4
    $andMask   = [byte[]]::new($andStride * $h)

    $result = [byte[]]::new($hdr.Length + $pixBytes.Length + $andMask.Length)
    $hdr.CopyTo($result, 0)
    $pixBytes.CopyTo($result, $hdr.Length)
    $andMask.CopyTo($result, $hdr.Length + $pixBytes.Length)
    return $result
}

function BitmapToPngBytes([System.Drawing.Bitmap]$bmp) {
    $ms = New-Object System.IO.MemoryStream
    $bmp.Save($ms, [System.Drawing.Imaging.ImageFormat]::Png)
    return $ms.ToArray()
}

$outPath = "c:\src\FuzzyStatsClock\FuzzyClock.App\app.ico"
$sizes   = @(16, 32, 48, 256)
$imgs    = @()

foreach ($s in $sizes) {
    $bmp = New-ClockBitmap $s
    if ($s -eq 256) { $data = [byte[]](BitmapToPngBytes $bmp) }
    else            { $data = [byte[]](BitmapToIcoBmpBytes $bmp) }
    $imgs += [PSCustomObject]@{ Size = $s; Data = $data }
    $bmp.Dispose()
}

$ms = New-Object System.IO.MemoryStream
$bw = New-Object System.IO.BinaryWriter($ms)

$bw.Write([uint16]0)
$bw.Write([uint16]1)
$bw.Write([uint16]$imgs.Count)

$offset = [uint32](6 + 16 * $imgs.Count)
foreach ($img in $imgs) {
    $wb = if ($img.Size -eq 256) { [byte]0 } else { [byte]$img.Size }
    $hb = if ($img.Size -eq 256) { [byte]0 } else { [byte]$img.Size }
    $bw.Write($wb)
    $bw.Write($hb)
    $bw.Write([byte]0)
    $bw.Write([byte]0)
    $bw.Write([uint16]1)
    $bw.Write([uint16]32)
    $bw.Write([uint32]$img.Data.Length)
    $bw.Write($offset)
    $offset += [uint32]$img.Data.Length
}

foreach ($img in $imgs) { $bw.Write($img.Data) }

$bw.Flush()
[System.IO.File]::WriteAllBytes($outPath, $ms.ToArray())
Write-Host "Created $outPath ($($ms.Length) bytes)"
