param(
  [ValidateSet('debug', 'release', 'bundle')]
  [string]$Mode = 'release'
)

$ErrorActionPreference = 'Stop'

function Test-Java21Home {
  param(
    [string]$PathValue
  )

  if ([string]::IsNullOrWhiteSpace($PathValue)) {
    return $false
  }

  $javaExe = Join-Path $PathValue 'bin/java.exe'
  if (-not (Test-Path $javaExe)) {
    return $false
  }

  $versionOutput = & cmd.exe /c """$javaExe"" -version 2>&1" | Out-String
  return $versionOutput -match 'version "21(\.|")'
}

function Resolve-Java21Home {
  $candidates = @(
    $env:JAVA_HOME_21,
    $env:ANDROID_STUDIO_JBR,
    $env:JAVA_HOME,
    'C:\Program Files\Android\Android Studio\jbr',
    'C:\Program Files\JetBrains\Android Studio\jbr'
  ) | Where-Object { -not [string]::IsNullOrWhiteSpace($_) }

  foreach ($candidate in $candidates) {
    if (Test-Java21Home $candidate) {
      return $candidate
    }
  }

  return $null
}

function Require-Command {
  param(
    [string]$Name
  )

  if (-not (Get-Command $Name -ErrorAction SilentlyContinue)) {
    throw "Required command '$Name' was not found in PATH."
  }
}

function Test-ReleaseSigningConfigured {
  $requiredVars = @(
    'ANDROID_KEYSTORE_FILE',
    'ANDROID_KEYSTORE_PASSWORD',
    'ANDROID_KEY_ALIAS',
    'ANDROID_KEY_PASSWORD'
  )

  foreach ($varName in $requiredVars) {
    $value = [Environment]::GetEnvironmentVariable($varName)
    if ([string]::IsNullOrWhiteSpace($value)) {
      return $false
    }
  }

  return Test-Path ([Environment]::GetEnvironmentVariable('ANDROID_KEYSTORE_FILE'))
}

$repoRoot = Split-Path -Parent $PSScriptRoot
$appDir = Join-Path $repoRoot 'apps/desktop'
$androidDir = Join-Path $appDir 'android'

Require-Command 'pnpm'

if (-not (Test-Path $androidDir)) {
  throw "Android project not found: $androidDir"
}

$java21Home = Resolve-Java21Home
if (-not $java21Home) {
  throw "Java 21 is required. Set JAVA_HOME_21 or install Android Studio so the script can use its bundled JBR."
}

$originalJavaHome = $env:JAVA_HOME
$originalPath = $env:PATH

try {
  $env:JAVA_HOME = $java21Home
  $env:PATH = "$java21Home\bin;$originalPath"

  $gradleTask = switch ($Mode) {
    'debug' { 'assembleDebug' }
    'release' { 'assembleRelease' }
    'bundle' { 'bundleRelease' }
  }

  Write-Host "Using JAVA_HOME=$java21Home"
  Write-Host "Building web assets..."
  & pnpm --filter desktop build
  if ($LASTEXITCODE -ne 0) {
    throw "Web build failed."
  }

  Write-Host "Syncing Capacitor..."
  & pnpm --filter desktop cap:sync
  if ($LASTEXITCODE -ne 0) {
    throw "Capacitor sync failed."
  }

  Write-Host "Running Gradle task $gradleTask..."
  Push-Location $androidDir
  try {
    & .\gradlew.bat $gradleTask
    if ($LASTEXITCODE -ne 0) {
      throw "Gradle task $gradleTask failed."
    }
  } finally {
    Pop-Location
  }

  $artifactPattern = switch ($Mode) {
    'debug' { Join-Path $androidDir 'app/build/outputs/apk/debug/*.apk' }
    'release' { Join-Path $androidDir 'app/build/outputs/apk/release/*.apk' }
    'bundle' { Join-Path $androidDir 'app/build/outputs/bundle/release/*.aab' }
  }

  $artifact = Get-ChildItem $artifactPattern -File -ErrorAction SilentlyContinue |
    Sort-Object LastWriteTime -Descending |
    Select-Object -First 1

  if ($artifact) {
    Write-Host "Android artifact ready: $($artifact.FullName)"
    if ($Mode -eq 'release' -and -not (Test-ReleaseSigningConfigured)) {
      Write-Warning 'Release signing is not configured. The APK is unsigned and may fail to install. Use pnpm android:debug for local installs or set ANDROID_KEYSTORE_* env vars for a signed release build.'
    }
  } else {
    Write-Warning "Build finished, but no artifact matched: $artifactPattern"
  }
} finally {
  $env:JAVA_HOME = $originalJavaHome
  $env:PATH = $originalPath
}
