# =============================================================================
# Compilacion del Anexo de JP y BD
# Concatena los modulos de src/ en un unico archivo HTML autocontenido.
# Uso:  powershell -ExecutionPolicy Bypass -File build.ps1
# =============================================================================
$ErrorActionPreference = 'Stop'
$raiz = Split-Path -Parent $MyInvocation.MyCommand.Path
$src  = Join-Path $raiz 'src'
$dist = Join-Path $raiz 'dist'
if (-not (Test-Path $dist)) { New-Item -ItemType Directory -Path $dist | Out-Null }

Write-Host 'Compilando Anexo de JP y BD...' -ForegroundColor Cyan

$plantilla = Get-Content (Join-Path $src 'ui\index.template.html') -Raw -Encoding UTF8
$css       = Get-Content (Join-Path $src 'ui\styles.css')          -Raw -Encoding UTF8
$vendor    = Get-Content (Join-Path $src 'vendor\sheetjs.js')      -Raw -Encoding UTF8

$modulos = @(
  '01-config.js', '02-rules.js', '03-normalize.js', '04-loader.js', '05-engine.js',
  '06-validations.js', '07-reconcile.js', '08-trace.js', '09-export.js',
  '10-tests.js', '11-ui.js', '12-ui-resultados.js'
)

$partes = New-Object System.Text.StringBuilder
foreach ($m in $modulos) {
  $ruta = Join-Path $src ('app\' + $m)
  if (-not (Test-Path $ruta)) { throw "Falta el modulo $m" }
  $txt = Get-Content $ruta -Raw -Encoding UTF8
  [void]$partes.AppendLine("/* ===== $m ===== */")
  [void]$partes.AppendLine($txt)
  Write-Host ("  + {0,-24} {1,8:N0} bytes" -f $m, $txt.Length)
}

$salida = $plantilla.Replace('/*{{CSS}}*/', $css).
                     Replace('/*{{VENDOR}}*/', $vendor).
                     Replace('/*{{APP}}*/', $partes.ToString())

$destino = Join-Path $dist 'Anexo-JP-BD.html'
$raizIndex = Join-Path $raiz 'index.html'
$utf8 = New-Object System.Text.UTF8Encoding($false)
[System.IO.File]::WriteAllText($destino, $salida, $utf8)
[System.IO.File]::WriteAllText($raizIndex, $salida, $utf8)

$kb = [math]::Round((Get-Item $destino).Length / 1KB)
Write-Host ''
Write-Host "Listo: $destino ($kb KB)" -ForegroundColor Green
Write-Host "Tambien actualizado: $raizIndex (para GitHub Pages)" -ForegroundColor Green
Write-Host 'Abralo con doble clic en Edge o Chrome. No requiere instalacion ni internet.'
