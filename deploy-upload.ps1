param(
    [string]$Target = "all"
)

$ErrorActionPreference = "Stop"

$Server = if ($env:XX_FTP_SERVER) { $env:XX_FTP_SERVER } else { "47.122.112.242" }
$FtpUser = if ($env:XX_FTP_USER) { $env:XX_FTP_USER } else { "hal" }
$FtpPass = if ($env:XX_FTP_PASS) { $env:XX_FTP_PASS } else { "8kWPsQdnFHyb" }
$FtpPort = if ($env:XX_FTP_PORT) { [int]$env:XX_FTP_PORT } else { 21 }
$ProjectRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$cred = New-Object System.Net.NetworkCredential($FtpUser, $FtpPass)
$script:TotalFailures = 0
[System.Net.WebRequest]::DefaultWebProxy = $null

function Get-ErrorMessage {
    param([System.Management.Automation.ErrorRecord]$ErrorRecord)

    $messages = New-Object System.Collections.Generic.List[string]
    $ex = $ErrorRecord.Exception
    while ($null -ne $ex) {
        if (-not [string]::IsNullOrWhiteSpace($ex.Message)) {
            $messages.Add($ex.Message)
        }
        $ex = $ex.InnerException
    }
    return ($messages -join " | ")
}

function New-FtpRequest {
    param(
        [string]$RemotePath,
        [string]$Method
    )

    $uri = "ftp://${Server}:${FtpPort}${RemotePath}"
    $req = [System.Net.FtpWebRequest]::Create($uri)
    $req.Method = $Method
    $req.Credentials = $cred
    $req.UseBinary = $true
    $req.UsePassive = $true
    $req.KeepAlive = $false
    $req.Timeout = 30000
    $req.ReadWriteTimeout = 30000
    return $req
}

function Test-FtpLogin {
    Write-Host "Testing FTP login: ${FtpUser}@${Server}:${FtpPort}"
    try {
        $req = New-FtpRequest "/" ([System.Net.WebRequestMethods+Ftp]::PrintWorkingDirectory)
        $resp = $req.GetResponse()
        $resp.Close()
        Write-Host "FTP login OK" -ForegroundColor Green
    }
    catch {
        Write-Host "FTP login FAILED" -ForegroundColor Red
        Write-Host "Reason: $(Get-ErrorMessage $_)"
        Write-Host "Please verify FTP host, username, password, port, and whether the account is allowed to log in."
        exit 1
    }
}

function EnsureFtpDir {
    param([string]$dirPath)
    $parts = $dirPath.Trim('/').Split('/')
    $cur = ""
    foreach ($p in $parts) {
        if ([string]::IsNullOrWhiteSpace($p)) {
            continue
        }
        $cur += "/$p"
        try {
            $req = New-FtpRequest "${cur}/" ([System.Net.WebRequestMethods+Ftp]::MakeDirectory)
            $resp = $req.GetResponse()
            $resp.Close()
        }
        catch { }
    }
}

function UploadOneFile {
    param([string]$localPath, [string]$remotePath)

    $uri = "ftp://${Server}:${FtpPort}${remotePath}"
    $args = @(
        "--silent",
        "--show-error",
        "--fail",
        "--disable-epsv",
        "--noproxy", "*",
        "--ftp-create-dirs",
        "--connect-timeout", "20",
        "--max-time", "180",
        "--user", "${FtpUser}:${FtpPass}",
        "--upload-file", $localPath,
        $uri
    )

    $output = & curl.exe @args 2>&1
    if ($LASTEXITCODE -ne 0) {
        $message = ($output | Out-String).Trim()
        if ([string]::IsNullOrWhiteSpace($message)) {
            $message = "curl.exe exited with code $LASTEXITCODE"
        }
        throw $message
    }
}

function UploadOneFileWithRetry {
    param(
        [string]$localPath,
        [string]$remotePath,
        [int]$maxAttempts = 5
    )

    $lastError = $null
    for ($attempt = 1; $attempt -le $maxAttempts; $attempt++) {
        try {
            UploadOneFile $localPath $remotePath
            return
        }
        catch {
            $lastError = $_
            if ($attempt -ge $maxAttempts) {
                throw $lastError
            }
            Write-Host " RETRY $attempt/$maxAttempts" -ForegroundColor Yellow
            Start-Sleep -Seconds (2 * $attempt)
        }
    }
}

function UploadDir {
    param([string]$localDir, [string]$remoteDir)
    $files = Get-ChildItem -Path $localDir -Recurse -File
    $total = $files.Count
    $i = 0
    $fail = 0
    Write-Host "    Total files: $total"
    foreach ($f in $files) {
        $i++
        $rel = $f.FullName.Substring($localDir.Length).Replace('\', '/')
        $rp = "${remoteDir}${rel}"
        Write-Host "    [$i/$total] $($f.Name)" -NoNewline
        try {
            UploadOneFileWithRetry $f.FullName $rp
            Write-Host " OK" -ForegroundColor Green
        }
        catch {
            $fail++
            Write-Host " FAIL" -ForegroundColor Red
            Write-Host "        Remote: $rp"
            Write-Host "        Reason: $(Get-ErrorMessage $_)"
        }
    }
    return $fail
}

Test-FtpLogin

if ($Target -eq "front" -or $Target -eq "all") {
    Write-Host "--- Upload frontend (dist) ---"
    $dp = Join-Path $ProjectRoot "dist"
    if (-not (Test-Path $dp)) {
        Write-Host "ERROR: dist folder not found"
        exit 1
    }
    $failCount = UploadDir $dp "/dist"
    if ($failCount -gt 0) {
        $script:TotalFailures += $failCount
        Write-Host "ERROR: $failCount frontend files failed" -ForegroundColor Red
    }
    Write-Host "--- Frontend done ---"
}

if ($Target -eq "back-src") {
    Write-Host "--- Upload backend source (server/src) ---"
    $srcDir = Join-Path $ProjectRoot "server\src"
    if (-not (Test-Path $srcDir)) {
        Write-Host "ERROR: server/src folder not found"
        exit 1
    }
    $failCount = UploadDir $srcDir "/xiaoxiang-server/src"
    if ($failCount -gt 0) {
        $script:TotalFailures += $failCount
        Write-Host "ERROR: $failCount backend source files failed" -ForegroundColor Red
    }
    Write-Host "--- Backend source done ---"
}

if ($Target -eq "back" -or $Target -eq "all") {
    Write-Host "--- Upload backend (server/dist) ---"
    $sd = Join-Path $ProjectRoot "server\dist"
    if (-not (Test-Path $sd)) {
        Write-Host "ERROR: server/dist folder not found"
        exit 1
    }
    $failCount = UploadDir $sd "/xiaoxiang-server/dist"
    if ($failCount -gt 0) {
        $script:TotalFailures += $failCount
        Write-Host "ERROR: $failCount backend files failed" -ForegroundColor Red
    }
    Write-Host "--- Upload schema + package ---"
    foreach ($extra in @(
        @{ Local = (Join-Path $ProjectRoot "server\prisma\schema.prisma"); Remote = "/xiaoxiang-server/prisma/schema.prisma" },
        @{ Local = (Join-Path $ProjectRoot "server\package.json"); Remote = "/xiaoxiang-server/package.json" },
        @{ Local = (Join-Path $ProjectRoot "server\package-lock.json"); Remote = "/xiaoxiang-server/package-lock.json" }
    )) {
        Write-Host "    $([System.IO.Path]::GetFileName($extra.Local))" -NoNewline
        try {
            UploadOneFileWithRetry $extra.Local $extra.Remote
            Write-Host " OK" -ForegroundColor Green
        }
        catch {
            $script:TotalFailures++
            Write-Host " FAIL" -ForegroundColor Red
            Write-Host "        Remote: $($extra.Remote)"
            Write-Host "        Reason: $(Get-ErrorMessage $_)"
        }
    }
    Write-Host "--- Backend done ---"

    Write-Host "--- Upload backend source (server/src) ---"
    $srcDir = Join-Path $ProjectRoot "server\src"
    if (-not (Test-Path $srcDir)) {
        Write-Host "ERROR: server/src folder not found"
        exit 1
    }
    $failCount = UploadDir $srcDir "/xiaoxiang-server/src"
    if ($failCount -gt 0) {
        $script:TotalFailures += $failCount
        Write-Host "ERROR: $failCount backend source files failed" -ForegroundColor Red
    }
    Write-Host "--- Backend source done ---"
}

if ($script:TotalFailures -gt 0) {
    Write-Host "=== Upload finished with $script:TotalFailures failure(s) ===" -ForegroundColor Red
    exit 1
}

Write-Host "=== All uploads complete ==="
exit 0
