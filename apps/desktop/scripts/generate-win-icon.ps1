$ErrorActionPreference = 'Stop'

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$desktopDir = Split-Path -Parent $scriptDir
$sourcePath = Join-Path $desktopDir 'build/icon.png'
$outputPath = Join-Path $desktopDir 'build/icon.ico'
$tempDir = Join-Path $desktopDir 'build/.icon-tmp'
$sizes = @(16, 24, 32, 48, 64, 128, 256)

if (-not (Test-Path $sourcePath)) {
  throw "Source icon not found: $sourcePath"
}

if (Test-Path $tempDir) {
  Remove-Item -Recurse -Force $tempDir
}

New-Item -ItemType Directory -Path $tempDir | Out-Null

Add-Type -AssemblyName System.Drawing

$sourceImage = [System.Drawing.Image]::FromFile($sourcePath)
$cornerRadiusRatio = 0.22

function New-RoundedRectanglePath {
  param(
    [int]$Width,
    [int]$Height,
    [float]$Radius
  )

  $path = New-Object System.Drawing.Drawing2D.GraphicsPath
  $diameter = [Math]::Max(1, [int]([Math]::Round($Radius * 2)))
  $arc = New-Object System.Drawing.Rectangle 0, 0, $diameter, $diameter

  $path.AddArc($arc, 180, 90)
  $arc.X = $Width - $diameter
  $path.AddArc($arc, 270, 90)
  $arc.Y = $Height - $diameter
  $path.AddArc($arc, 0, 90)
  $arc.X = 0
  $path.AddArc($arc, 90, 90)
  $path.CloseFigure()

  return $path
}

try {
  foreach ($size in $sizes) {
    $bitmap = New-Object System.Drawing.Bitmap $size, $size
    $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
    $clipPath = $null

    try {
      $graphics.Clear([System.Drawing.Color]::Transparent)
      $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
      $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
      $graphics.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
      $graphics.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighQuality
      $graphics.CompositingMode = [System.Drawing.Drawing2D.CompositingMode]::SourceOver
      $radius = [Math]::Max(2, $size * $cornerRadiusRatio)
      $clipPath = New-RoundedRectanglePath -Width $size -Height $size -Radius $radius
      $graphics.SetClip($clipPath)
      $graphics.DrawImage($sourceImage, 0, 0, $size, $size)
      $graphics.ResetClip()

      $pngPath = Join-Path $tempDir "$size.png"
      $bitmap.Save($pngPath, [System.Drawing.Imaging.ImageFormat]::Png)
    }
    finally {
      if ($clipPath) {
        $clipPath.Dispose()
      }
      $graphics.Dispose()
      $bitmap.Dispose()
    }
  }
}
finally {
  $sourceImage.Dispose()
}

$nodeScriptPath = Join-Path $tempDir 'generate-win-icon.mjs'
$nodeScript = @'
import fs from "node:fs";
import path from "node:path";
import pngToIco from "png-to-ico";

const tempDir = process.argv[2];
const outputPath = process.argv[3];
const sizes = [16, 24, 32, 48, 64, 128, 256];
const inputFiles = sizes.map((size) => path.join(tempDir, `${size}.png`));
const icoBuffer = await pngToIco(inputFiles);
fs.writeFileSync(outputPath, icoBuffer);
'@

Set-Content -Path $nodeScriptPath -Value $nodeScript -Encoding UTF8
node $nodeScriptPath $tempDir $outputPath

Remove-Item -Recurse -Force $tempDir
Write-Output "Generated Windows icon: $outputPath"
