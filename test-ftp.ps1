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

$remoteTestPath = "/codex-upload-test.txt"
$bytes = [System.Text.Encoding]::UTF8.GetBytes("codex ftp upload test")
$stream = $null
$resp = $null
try {
    $req = New-FtpRequest $remoteTestPath ([System.Net.WebRequestMethods+Ftp]::UploadFile)
    $req.ContentLength = $bytes.Length
    $stream = $req.GetRequestStream()
    $stream.Write($bytes, 0, $bytes.Length)
    $stream.Close()
    $stream = $null
    $resp = $req.GetResponse()
    $resp.Close()
    $resp = $null
    Write-Host "FTP upload OK!" -ForegroundColor Green
}
catch {
    Write-Host "FTP upload FAILED!" -ForegroundColor Red
    Write-Host "Error: $($_.Exception.Message)"
    Write-Host ""
    Write-Host "This usually means the FTP server passive/data ports are not open or FileZilla Server passive mode is misconfigured."
    exit 1
}
finally {
    if ($null -ne $stream) {
        $stream.Close()
    }
    if ($null -ne $resp) {
        $resp.Close()
    }
}
