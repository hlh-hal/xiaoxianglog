$ErrorActionPreference = 'Stop'

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$root = Split-Path -Parent $scriptDir
Set-Location $root

$env:MOBILE_PREVIEW = '1'

function Test-PortListening {
  param([int]$Port)
  return [bool](Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue)
}

function Wait-ForPort {
  param(
    [int]$Port,
    [int]$TimeoutSeconds = 45
  )

  $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
  while ((Get-Date) -lt $deadline) {
    if (Test-PortListening -Port $Port) {
      return $true
    }
    Start-Sleep -Seconds 1
  }

  return $false
}

function Start-BackgroundCommand {
  param(
    [string]$Name,
    [string]$Command
  )

  $logPath = Join-Path $root "$Name.mobile-preview.log"
  $wrappedCommand = "$Command *> `"$logPath`""

  Start-Process -FilePath 'powershell.exe' `
    -ArgumentList @('-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', $wrappedCommand) `
    -WorkingDirectory $root `
    -WindowStyle Hidden
}

function Find-AndroidTool {
  param(
    [string]$Name,
    [string[]]$RelativePaths
  )

  $command = Get-Command $Name -ErrorAction SilentlyContinue
  if ($command) {
    return $command.Source
  }

  $sdkRoots = @(
    $env:ANDROID_HOME,
    $env:ANDROID_SDK_ROOT
  ) | Where-Object { $_ -and (Test-Path $_) }

  if ($env:LOCALAPPDATA) {
    $localSdkRoot = Join-Path $env:LOCALAPPDATA 'Android\Sdk'
    if (Test-Path $localSdkRoot) {
      $sdkRoots += $localSdkRoot
    }
  }

  foreach ($sdkRoot in $sdkRoots) {
    foreach ($relativePath in $RelativePaths) {
      $candidate = Join-Path $sdkRoot $relativePath
      if (Test-Path $candidate) {
        return $candidate
      }
    }
  }

  return $null
}

function Find-CapacitorCli {
  $candidate = Join-Path $root 'node_modules\.bin\cap.cmd'
  if (Test-Path $candidate) {
    return $candidate
  }

  $fallback = Get-Command 'cap' -ErrorAction SilentlyContinue
  if ($fallback) {
    return $fallback.Source
  }

  throw 'Capacitor CLI was not found. Run npm install first.'
}

function Resolve-JavaHome {
  $candidates = @()

  if ($env:JAVA_HOME) {
    $candidates += $env:JAVA_HOME
  }

  $candidates += @(
    'C:\Program Files\Android\Android Studio\jbr',
    'D:\andrord-studio\jbr',
    'D:\java\.jdks\openjdk-23.0.2',
    'D:\java\IntelliJ IDEA Community Edition 2023.3.4\jbr',
    'C:\Program Files\JetBrains\PyCharm Community Edition 2024.3.1.1\jbr'
  )

  foreach ($candidate in $candidates) {
    if ($candidate -and (Test-Path (Join-Path $candidate 'bin\java.exe'))) {
      return $candidate
    }
  }

  throw 'A valid Java runtime was not found. Install Android Studio or set JAVA_HOME to a JDK/JBR directory that contains bin\java.exe.'
}

function Get-ConnectedAndroidDevices {
  param([string]$AdbPath)

  $deviceLines = & $AdbPath devices | Select-String -Pattern "`tdevice$"
  return @($deviceLines | ForEach-Object { ($_.Line -split "`t")[0] })
}

function Wait-ForAndroidBoot {
  param(
    [string]$AdbPath,
    [int]$TimeoutSeconds = 120
  )

  & $AdbPath wait-for-device | Out-Null

  $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
  while ((Get-Date) -lt $deadline) {
    $bootState = (& $AdbPath shell getprop sys.boot_completed 2>$null).Trim()
    if ($bootState -eq '1') {
      return $true
    }
    Start-Sleep -Seconds 2
  }

  return $false
}

$adbPath = Find-AndroidTool -Name 'adb' -RelativePaths @('platform-tools\adb.exe')
$emulatorPath = Find-AndroidTool -Name 'emulator' -RelativePaths @('emulator\emulator.exe')
$capCliPath = Find-CapacitorCli
$javaHome = Resolve-JavaHome
$env:JAVA_HOME = $javaHome
$env:PATH = (Join-Path $javaHome 'bin') + [IO.Path]::PathSeparator + $env:PATH

Write-Host "Using JAVA_HOME: $javaHome"

if (-not $adbPath) {
  throw 'Android SDK adb was not found. Install Android Studio, then add platform-tools to PATH or set ANDROID_HOME/ANDROID_SDK_ROOT.'
}

$frontendReady = Test-PortListening -Port 3000
$backendReady = Test-PortListening -Port 3001

if ($frontendReady -and $backendReady) {
  Write-Host 'Using existing dev servers on ports 3000 and 3001.'
  Write-Host 'If app reload does not connect in the emulator, restart the dev servers through npm run preview:mobile.'
} elseif (-not $frontendReady -and -not $backendReady) {
  Write-Host 'Starting dev servers with npm run dev:all...'
  Start-BackgroundCommand -Name 'dev-all' -Command 'npm run dev:all'
} elseif (-not $frontendReady) {
  Write-Host 'Starting Vite dev server on port 3000...'
  Start-BackgroundCommand -Name 'web' -Command 'npm run dev'
} else {
  Write-Host 'Starting backend dev server on port 3001...'
  Start-BackgroundCommand -Name 'server' -Command 'npm run dev --prefix server'
  Write-Host 'If app reload does not connect in the emulator, restart the existing Vite server through npm run preview:mobile.'
}

if (-not (Wait-ForPort -Port 3000 -TimeoutSeconds 60)) {
  throw 'Vite dev server did not start on port 3000. Check the *.mobile-preview.log files.'
}

if (-not (Wait-ForPort -Port 3001 -TimeoutSeconds 20)) {
  Write-Warning 'Backend port 3001 is not listening yet. The app can launch, but API calls may fail until the backend is ready.'
}

Write-Host 'Syncing Capacitor Android project for mobile preview...'
& $capCliPath sync android
if ($LASTEXITCODE -ne 0) {
  exit $LASTEXITCODE
}

$devices = @(Get-ConnectedAndroidDevices -AdbPath $adbPath)
if ($devices.Count -eq 0) {
  if (-not $emulatorPath) {
    throw 'No Android device is connected and emulator was not found. Open an Android emulator, or add the Android emulator directory to PATH.'
  }

  $targetAvd = $env:MOBILE_PREVIEW_AVD
  $availableAvds = @(& $emulatorPath -list-avds)

  if (-not $targetAvd) {
    if ($availableAvds.Count -eq 1) {
      $targetAvd = $availableAvds[0]
    } elseif ($availableAvds.Count -gt 1) {
      Write-Host 'Available AVDs:'
      $availableAvds | ForEach-Object { Write-Host "  $_" }
      throw 'Multiple AVDs found. Set MOBILE_PREVIEW_AVD to the AVD name you want to use.'
    } else {
      throw 'No AVD was found. Create one in Android Studio. Recommended: 1179x2556 resolution, about 480 dpi.'
    }
  }

  Write-Host "Starting Android emulator: $targetAvd"
  Start-Process -FilePath $emulatorPath `
    -ArgumentList @('-avd', $targetAvd, '-netdelay', 'none', '-netspeed', 'full') `
    -WindowStyle Hidden

  if (-not (Wait-ForAndroidBoot -AdbPath $adbPath -TimeoutSeconds 180)) {
    throw 'Android emulator started but did not finish booting in time.'
  }

  $devices = @(Get-ConnectedAndroidDevices -AdbPath $adbPath)
}

$targetDevice = $env:MOBILE_PREVIEW_TARGET
if (-not $targetDevice) {
  if ($devices.Count -eq 0) {
    throw 'No Android device is connected after emulator startup.'
  }

  $targetDevice = $devices[0]
}

Write-Host "Using Android target: $targetDevice"
Write-Host 'Launching app in Android mobile preview mode...'
& $capCliPath run android --target $targetDevice
exit $LASTEXITCODE
