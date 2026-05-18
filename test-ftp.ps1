$Server = if ($env:XX_FTP_SERVER) { $env:XX_FTP_SERVER } else { "47.122.112.242" }
$FtpUser = if ($env:XX_FTP_USER) { $env:XX_FTP_USER } else { "hal" }
$FtpPass = if ($env:XX_FTP_PASS) { $env:XX_FTP_PASS } else { "8kWPsQdnFHyb" }
$FtpPort = if ($env:XX_FTP_PORT) { [int]$env:XX_FTP_PORT } else { 21 }

function New-FtpRequest {
    param(
        [string]$RemotePath,
        [string]$Method
    )

    $req = [System.Net.FtpWebRequest]::Create("ftp://${Server}:${FtpPort}${RemotePath}")
    $req.Method = $Method
    $req.Credentials = New-Object System.Net.NetworkCredential($FtpUser, $FtpPass)
    $req.UseBinary = $true
    $req.UsePassive = $true
    $req.KeepAlive = $false
    $req.Timeout = 15000
    $req.ReadWriteTimeout = 15000
    return $req
}

Write-Host "Testing FTP login to ${FtpUser}@${Server}:${FtpPort} ..."

try {
    $req = New-FtpRequest "/" ([System.Net.WebRequestMethods+Ftp]::PrintWorkingDirectory)
    $resp = $req.GetResponse()
    $resp.Close()
    Write-Host "FTP login OK!" -ForegroundColor Green
}
catch {
    Write-Host "FTP login FAILED!" -ForegroundColor Red
    Write-Host "Error: $($_.Exception.Message)"
    Write-Host ""
    Write-Host "Details: $($_.Exception.InnerException)"
    exit 1
}

Write-Host "Testing FTP upload data connection ..."

$tempFile = Join-Path $env:TEMP "codex-ftp-upload-test.txt"
Set-Content -LiteralPath $tempFile -Value "codex ftp upload test" -Encoding ASCII

try {
    $args = @(
        "--silent",
        "--show-error",
        "--fail",
        "--disable-epsv",
        "--ftp-create-dirs",
        "--connect-timeout", "20",
        "--max-time", "60",
        "--user", "${FtpUser}:${FtpPass}",
        "--upload-file", $tempFile,
        "ftp://${Server}:${FtpPort}/codex-upload-test.txt"
    )
    $output = & curl.exe @args 2>&1
    if ($LASTEXITCODE -ne 0) {
        $message = ($output | Out-String).Trim()
        if ([string]::IsNullOrWhiteSpace($message)) {
            $message = "curl.exe exited with code $LASTEXITCODE"
        }
        throw $message
    }
    Write-Host "FTP upload OK!" -ForegroundColor Green
}
catch {
    Write-Host "FTP upload FAILED!" -ForegroundColor Red
    Write-Host "Error: $_"
    Write-Host ""
    Write-Host "curl.exe upload failed. Check the server passive/data ports and FileZilla passive mode settings."
    exit 1
}
finally {
    Remove-Item -LiteralPath $tempFile -ErrorAction SilentlyContinue
}
