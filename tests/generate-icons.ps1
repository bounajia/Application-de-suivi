$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing
$assetDirectory = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\public'))
foreach ($icon in @(@{ Size = 192; Name = 'icon-192.png' }, @{ Size = 512; Name = 'icon-512.png' }, @{ Size = 180; Name = 'apple-touch-icon.png' })) {
    $bitmap = [System.Drawing.Bitmap]::new($icon.Size, $icon.Size)
    $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
    $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
    $graphics.Clear([System.Drawing.ColorTranslator]::FromHtml('#087f70'))
    $graphics.ScaleTransform(($icon.Size / 512.0), ($icon.Size / 512.0))
    $white = [System.Drawing.SolidBrush]::new([System.Drawing.Color]::White)
    $green = [System.Drawing.SolidBrush]::new([System.Drawing.ColorTranslator]::FromHtml('#087f70'))
    $accent = [System.Drawing.Pen]::new([System.Drawing.ColorTranslator]::FromHtml('#a8ead6'), 18)
    $accent.StartCap = [System.Drawing.Drawing2D.LineCap]::Round
    $accent.EndCap = [System.Drawing.Drawing2D.LineCap]::Round
    $accent.LineJoin = [System.Drawing.Drawing2D.LineJoin]::Round
    $graphics.FillRectangle($white, 137, 210, 101, 171)
    $graphics.FillRectangle($white, 263, 141, 113, 240)
    $graphics.FillRectangle($white, 116, 365, 280, 18)
    foreach ($x in @(159, 194)) { foreach ($y in @(236, 282)) { $graphics.FillRectangle($green, $x, $y, 22, 25) } }
    foreach ($x in @(286, 330)) { foreach ($y in @(167, 213, 259)) { $graphics.FillRectangle($green, $x, $y, 22, 25) } }
    $graphics.FillRectangle($green, 302, 322, 37, 59)
    $points = [System.Drawing.Point[]]@([System.Drawing.Point]::new(135,169), [System.Drawing.Point]::new(162,195), [System.Drawing.Point]::new(209,139))
    $graphics.DrawLines($accent, $points)
    $bitmap.Save((Join-Path $assetDirectory $icon.Name), [System.Drawing.Imaging.ImageFormat]::Png)
    $accent.Dispose()
    $green.Dispose()
    $white.Dispose()
    $graphics.Dispose()
    $bitmap.Dispose()
}
