Add-Type -AssemblyName System.Drawing

$srcPath = "C:\Users\ezsha\.gemini\antigravity-ide\brain\773b3aea-a409-43ee-86b1-f19b069d8e3e\.user_uploaded\media_1792268902374.jpg"
$src = [System.Drawing.Image]::FromFile($srcPath)

function Save-Resized($width, $height, $destPath) {
    $bmp = New-Object System.Drawing.Bitmap $width, $height
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
    $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
    $g.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighQuality
    $g.DrawImage($src, 0, 0, $width, $height)
    $bmp.Save($destPath, [System.Drawing.Imaging.ImageFormat]::Png)
    $g.Dispose()
    $bmp.Dispose()
    Write-Host "Created $destPath ($width x $height)"
}

# Assets folder
Save-Resized 1024 1024 "assets\icon.png"
Save-Resized 1024 1024 "assets\android-icon-foreground.png"
Save-Resized 192 192 "assets\favicon.png"
Save-Resized 1024 1024 "assets\splash-icon.png"

# Android mipmap icon sizes (standard icon sizes: mdpi=48, hdpi=72, xhdpi=96, xxhdpi=144, xxxhdpi=192)
# Foreground sizes: mdpi=108, hdpi=162, xhdpi=216, xxhdpi=324, xxxhdpi=432
$mipmaps = @(
    @{ Dir = "mipmap-mdpi"; Size = 48; FgSize = 108 },
    @{ Dir = "mipmap-hdpi"; Size = 72; FgSize = 162 },
    @{ Dir = "mipmap-xhdpi"; Size = 96; FgSize = 216 },
    @{ Dir = "mipmap-xxhdpi"; Size = 144; FgSize = 324 },
    @{ Dir = "mipmap-xxxhdpi"; Size = 192; FgSize = 432 }
)

foreach ($m in $mipmaps) {
    $dir = "android\app\src\main\res\$($m.Dir)"
    if (Test-Path $dir) {
        # Save both as PNG and overwrite existing webp or png files
        Save-Resized $m.Size $m.Size "$dir\ic_launcher.png"
        Save-Resized $m.Size $m.Size "$dir\ic_launcher_round.png"
        Save-Resized $m.FgSize $m.FgSize "$dir\ic_launcher_foreground.png"
        
        # Remove any competing webp files so Android compiles the clean PNGs
        Remove-Item "$dir\ic_launcher.webp" -ErrorAction SilentlyContinue
        Remove-Item "$dir\ic_launcher_round.webp" -ErrorAction SilentlyContinue
        Remove-Item "$dir\ic_launcher_foreground.webp" -ErrorAction SilentlyContinue
    }
}

$src.Dispose()
Write-Host "All icons generated successfully!"
