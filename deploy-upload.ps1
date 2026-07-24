param(
    [string]$Target = "all"
)

$ErrorActionPreference = "Stop"

$Server = if ($env:XX_FTP_SERVER) { $env:XX_FTP_SERVER } else { "47.122.112.242" }
$FtpUser = if ($env:XX_FTP_USER) { $env:XX_FTP_USER } else { "hal" }
$FtpPass = if ($env:XX_FTP_PASS) { $env:XX_FTP_PASS } else { "8kWPsQdnFHyb" }
$FtpPort = if ($env:XX_FTP_PORT) { [int]$env:XX_FTP_PORT } else { 21 }
$PublicBaseUrl = if ($env:XX_PUBLIC_BASE_URL) { $env:XX_PUBLIC_BASE_URL.TrimEnd('/') } else { "https://www.xiaoxianglog.cn" }
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

function Get-RemoteFileSize {
    param([string]$remotePath)

    $req = New-FtpRequest $remotePath ([System.Net.WebRequestMethods+Ftp]::GetFileSize)
    $resp = $req.GetResponse()
    try {
        return [int64]$resp.ContentLength
    }
    finally {
        $resp.Close()
    }
}

function Assert-RemoteFileSize {
    param([string]$localPath, [string]$remotePath)

    $localSize = (Get-Item -LiteralPath $localPath).Length
    $remoteSize = Get-RemoteFileSize $remotePath
    if ($remoteSize -ne $localSize) {
        throw "Upload verification failed: $remotePath is $remoteSize bytes, expected $localSize bytes"
    }
}

function Remove-RemoteFileQuietly {
    param([string]$remotePath)

    try {
        $req = New-FtpRequest $remotePath ([System.Net.WebRequestMethods+Ftp]::DeleteFile)
        $resp = $req.GetResponse()
        $resp.Close()
    }
    catch { }
}

function Rename-RemoteFile {
    param([string]$remoteSourcePath, [string]$newName)

    $req = New-FtpRequest $remoteSourcePath ([System.Net.WebRequestMethods+Ftp]::Rename)
    $req.RenameTo = $newName
    $resp = $req.GetResponse()
    $resp.Close()
}

function Publish-OneFileAtomically {
    param([string]$localPath, [string]$remotePath)

    $remoteDirectory = $remotePath.Substring(0, $remotePath.LastIndexOf('/'))
    $remoteName = $remotePath.Substring($remotePath.LastIndexOf('/') + 1)
    $tempRemotePath = "$remoteDirectory/.deploy-$([guid]::NewGuid().ToString('N'))-$remoteName"
    $backupName = ".rollback-$([guid]::NewGuid().ToString('N'))-$remoteName"
    $backupRemotePath = "$remoteDirectory/$backupName"
    $currentWasMoved = $false

    try {
        UploadOneFileWithRetry $localPath $tempRemotePath

        # This FTP server does not overwrite an existing target on RNTO. Move the current
        # entry aside, switch the verified file into place, and restore on any failure.
        Rename-RemoteFile $remotePath $backupName
        $currentWasMoved = $true
        Rename-RemoteFile $tempRemotePath $remoteName

        Assert-RemoteFileSize $localPath $remotePath
        Remove-RemoteFileQuietly $backupRemotePath
    }
    catch {
        Remove-RemoteFileQuietly $tempRemotePath
        if ($currentWasMoved) {
            Remove-RemoteFileQuietly $remotePath
            try {
                Rename-RemoteFile $backupRemotePath $remoteName
            }
            catch {
                throw "Atomic publish failed and rollback also failed for ${remotePath}: $(Get-ErrorMessage $_)"
            }
        }
        throw
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
            # FTP 226 only confirms request acceptance. SIZE detects a truncated remote file.
            Assert-RemoteFileSize $localPath $remotePath
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

function UploadFiles {
    param(
        [string]$localDir,
        [string]$remoteDir,
        [System.IO.FileInfo[]]$files
    )

    $files = @($files)
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
            Write-Host " OK (size verified)" -ForegroundColor Green
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

function UploadDir {
    param([string]$localDir, [string]$remoteDir)
    $files = Get-ChildItem -Path $localDir -Recurse -File
    return UploadFiles $localDir $remoteDir $files
}

function Get-FrontendAssetPaths {
    param([string]$indexPath)

    $html = Get-Content -LiteralPath $indexPath -Raw
    $matches = [regex]::Matches($html, '(?:src|href)="(?<path>/assets/[^"?]+\.(?:js|css))"')
    return @($matches | ForEach-Object { $_.Groups['path'].Value } | Sort-Object -Unique)
}

function Assert-PublicFileIntegrity {
    param([string]$localRoot, [string]$publicPath)

    $relativePath = $publicPath.TrimStart('/').Replace('/', [System.IO.Path]::DirectorySeparatorChar)
    $localPath = Join-Path $localRoot $relativePath
    if (-not (Test-Path -LiteralPath $localPath)) {
        throw "Referenced frontend asset is missing locally: $publicPath"
    }

    $tempPath = Join-Path ([System.IO.Path]::GetTempPath()) "xiaoxiang-deploy-$([guid]::NewGuid().ToString('N'))$([System.IO.Path]::GetExtension($publicPath))"
    try {
        $cacheBust = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()
        $uri = "${PublicBaseUrl}${publicPath}?deploy_verify=${cacheBust}"
        Invoke-WebRequest -UseBasicParsing -Uri $uri -OutFile $tempPath -Headers @{ "Cache-Control" = "no-cache" }

        $localFile = Get-Item -LiteralPath $localPath
        $remoteFile = Get-Item -LiteralPath $tempPath
        if ($remoteFile.Length -ne $localFile.Length) {
            throw "Public verification failed: $publicPath is $($remoteFile.Length) bytes, expected $($localFile.Length) bytes"
        }

        $localHash = (Get-FileHash -LiteralPath $localPath -Algorithm SHA256).Hash
        $remoteHash = (Get-FileHash -LiteralPath $tempPath -Algorithm SHA256).Hash
        if ($remoteHash -ne $localHash) {
            throw "Public SHA256 mismatch for $publicPath"
        }

        if ($publicPath.EndsWith('.js', [System.StringComparison]::OrdinalIgnoreCase)) {
            $syntaxOutput = (& node --check $tempPath 2>&1 | Out-String).Trim()
            if ($LASTEXITCODE -ne 0) {
                throw "Public JavaScript syntax check failed for ${publicPath}: $syntaxOutput"
            }
        }

        $checks = if ($publicPath.EndsWith('.js')) { 'bytes + SHA256 + syntax' } else { 'bytes + SHA256' }
        Write-Host "    $publicPath OK ($checks)" -ForegroundColor Green
    }
    finally {
        Remove-Item -LiteralPath $tempPath -Force -ErrorAction SilentlyContinue
    }
}

function Assert-FrontendAssetsPublic {
    param([string]$distPath)

    $indexPath = Join-Path $distPath 'index.html'
    $assetPaths = Get-FrontendAssetPaths $indexPath
    if ($assetPaths.Count -eq 0) {
        throw "No hashed frontend assets were found in dist/index.html"
    }
    foreach ($assetPath in $assetPaths) {
        Assert-PublicFileIntegrity $distPath $assetPath
    }
}

function Assert-PublishedFrontendEntry {
    param([string]$distPath)

    $localIndexPath = Join-Path $distPath 'index.html'
    $expectedAssets = Get-FrontendAssetPaths $localIndexPath
    $cacheBust = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()
    $liveHtml = (Invoke-WebRequest -UseBasicParsing -Uri "${PublicBaseUrl}/?deploy_verify=${cacheBust}" -Headers @{ "Cache-Control" = "no-cache" }).Content
    foreach ($assetPath in $expectedAssets) {
        if (-not $liveHtml.Contains($assetPath)) {
            throw "Published index does not reference expected asset: $assetPath"
        }
    }
    Write-Host "    Public index references the verified release assets" -ForegroundColor Green
}

Test-FtpLogin

if ($Target -eq "front" -or $Target -eq "front-activate" -or $Target -eq "all") {
    $dp = Join-Path $ProjectRoot "dist"
    if (-not (Test-Path $dp)) {
        Write-Host "ERROR: dist folder not found"
        exit 1
    }
    # Service Worker activates first; index.html is the final release pointer and must switch last.
    $releaseControlNames = @('sw.js', 'index.html')
    $failCount = 0
    if ($Target -ne "front-activate") {
        Write-Host "--- Upload frontend payload (entry remains unchanged) ---"
        $allFrontendFiles = @(Get-ChildItem -Path $dp -Recurse -File)
        $payloadFiles = @($allFrontendFiles | Where-Object {
            $relativePath = $_.FullName.Substring($dp.Length).TrimStart('\', '/').Replace('\', '/')
            $releaseControlNames -notcontains $relativePath
        })
        $failCount = UploadFiles $dp "/dist" $payloadFiles
    }
    else {
        Write-Host "--- Reuse previously uploaded payload; verification is still required ---"
    }
    if ($failCount -gt 0) {
        $script:TotalFailures += $failCount
        Write-Host "ERROR: $failCount frontend payload files failed; index.html was not changed" -ForegroundColor Red
    }
    else {
        try {
            Write-Host "--- Verify release assets through public HTTPS ---"
            Assert-FrontendAssetsPublic $dp

            Write-Host "--- Activate verified frontend release ---"
            foreach ($controlName in $releaseControlNames) {
                $controlPath = Join-Path $dp $controlName
                if (-not (Test-Path -LiteralPath $controlPath)) {
                    throw "Required frontend release file is missing: $controlName"
                }
                Write-Host "    $controlName" -NoNewline
                Publish-OneFileAtomically $controlPath "/dist/$controlName"
                Write-Host " OK (atomic + size verified)" -ForegroundColor Green
            }

            Assert-PublishedFrontendEntry $dp
        }
        catch {
            $script:TotalFailures++
            Write-Host "ERROR: frontend release was not fully published" -ForegroundColor Red
            Write-Host "Reason: $(Get-ErrorMessage $_)"
        }
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

if ($Target -eq "back-runtime") {
    Write-Host "--- Upload backend runtime (server/dist, without .env) ---"
    $sd = Join-Path $ProjectRoot "server\dist"
    if (-not (Test-Path $sd)) {
        Write-Host "ERROR: server/dist folder not found"
        exit 1
    }
    $failCount = UploadDir $sd "/xiaoxiang-server/dist"
    if ($failCount -gt 0) {
        $script:TotalFailures += $failCount
        Write-Host "ERROR: $failCount backend runtime files failed" -ForegroundColor Red
    }

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
    Write-Host "--- Backend runtime done (.env preserved) ---"
}

if ($Target -eq "monthly-echo-runtime") {
    Write-Host "--- Upload monthly echo runtime (without .env) ---"
    $monthlyEchoFiles = @(
        "server\src\index.ts",
        "server\src\lib\monthlyEchoService.ts",
        "server\src\lib\monthlyEchoUtils.ts",
        "server\src\lib\monthlyEchoV2.ts",
        "server\dist\index.js",
        "server\dist\index.js.map",
        "server\dist\index.d.ts",
        "server\dist\index.d.ts.map",
        "server\dist\lib\monthlyEchoService.js",
        "server\dist\lib\monthlyEchoService.js.map",
        "server\dist\lib\monthlyEchoService.d.ts",
        "server\dist\lib\monthlyEchoService.d.ts.map",
        "server\dist\lib\monthlyEchoUtils.js",
        "server\dist\lib\monthlyEchoUtils.js.map",
        "server\dist\lib\monthlyEchoUtils.d.ts",
        "server\dist\lib\monthlyEchoUtils.d.ts.map",
        "server\dist\lib\monthlyEchoV2.js",
        "server\dist\lib\monthlyEchoV2.js.map",
        "server\dist\lib\monthlyEchoV2.d.ts",
        "server\dist\lib\monthlyEchoV2.d.ts.map"
    )
    foreach ($relativePath in $monthlyEchoFiles) {
        $localPath = Join-Path $ProjectRoot $relativePath
        if (-not (Test-Path $localPath)) {
            $script:TotalFailures++
            Write-Host "    $relativePath MISSING" -ForegroundColor Red
            continue
        }
        $remotePath = "/xiaoxiang-server/" + ($relativePath -replace '^server\\', '' -replace '\\', '/')
        Write-Host "    $relativePath" -NoNewline
        try {
            UploadOneFileWithRetry $localPath $remotePath
            Write-Host " OK" -ForegroundColor Green
        }
        catch {
            $script:TotalFailures++
            Write-Host " FAIL" -ForegroundColor Red
            Write-Host "        Remote: $remotePath"
            Write-Host "        Reason: $(Get-ErrorMessage $_)"
        }
    }
    Write-Host "--- Monthly echo runtime done (.env preserved) ---"
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
        @{ Local = (Join-Path $ProjectRoot "server\.env"); Remote = "/xiaoxiang-server/.env" },
        @{ Local = (Join-Path $ProjectRoot "server\bt-start.bat"); Remote = "/xiaoxiang-server/bt-start.bat" },
        @{ Local = (Join-Path $ProjectRoot "server\tsconfig.json"); Remote = "/xiaoxiang-server/tsconfig.json" },
        @{ Local = (Join-Path $ProjectRoot "server\scripts\doctor-cpamc.mjs"); Remote = "/xiaoxiang-server/scripts/doctor-cpamc.mjs" },
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
