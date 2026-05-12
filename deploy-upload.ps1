param(
    [string]$Target = "all"
)

$Server = "47.122.112.242"
$FtpUser = "hal"
$FtpPass = "BkWPsQdnFHvb"
$FtpPort = 21
$ProjectRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$cred = New-Object System.Net.NetworkCredential($FtpUser, $FtpPass)

function EnsureFtpDir {
    param([string]$dirPath)
    $parts = $dirPath.Trim('/').Split('/')
    $cur = ""
    foreach ($p in $parts) {
        $cur += "/$p"
        try {
            $req = [System.Net.FtpWebRequest]::Create("ftp://${Server}:${FtpPort}${cur}/")
            $req.Method = [System.Net.WebRequestMethods+Ftp]::MakeDirectory
            $req.Credentials = $cred
            $null = $req.GetResponse()
        }
        catch { }
    }
}

function UploadOneFile {
    param([string]$localPath, [string]$remotePath)
    $uri = "ftp://${Server}:${FtpPort}${remotePath}"
    $wc = New-Object System.Net.WebClient
    $wc.Credentials = $cred
    try {
        $wc.UploadFile($uri, $localPath)
    }
    catch {
        $rd = $remotePath.Substring(0, $remotePath.LastIndexOf('/'))
        EnsureFtpDir $rd
        $wc2 = New-Object System.Net.WebClient
        $wc2.Credentials = $cred
        $wc2.UploadFile($uri, $localPath)
        $wc2.Dispose()
    }
    $wc.Dispose()
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
            UploadOneFile $f.FullName $rp
            Write-Host " OK" -ForegroundColor Green
        }
        catch {
            $fail++
            Write-Host " FAIL" -ForegroundColor Red
        }
    }
    return $fail
}

if ($Target -eq "front" -or $Target -eq "all") {
    Write-Host "--- Upload frontend (dist) ---"
    $dp = Join-Path $ProjectRoot "dist"
    if (-not (Test-Path $dp)) {
        Write-Host "ERROR: dist folder not found"
        exit 1
    }
    $failCount = UploadDir $dp "/dist"
    if ($failCount -gt 0) {
        Write-Host "WARNING: $failCount files failed"
    }
    Write-Host "--- Frontend done ---"
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
        Write-Host "WARNING: $failCount files failed"
    }
    Write-Host "--- Upload schema + package ---"
    UploadOneFile (Join-Path $ProjectRoot "server\prisma\schema.prisma") "/xiaoxiang-server/prisma/schema.prisma"
    UploadOneFile (Join-Path $ProjectRoot "server\package.json") "/xiaoxiang-server/package.json"
    UploadOneFile (Join-Path $ProjectRoot "server\package-lock.json") "/xiaoxiang-server/package-lock.json"
    Write-Host "--- Backend done ---"
}

Write-Host "=== All uploads complete ==="
exit 0
