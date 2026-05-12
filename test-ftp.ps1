$Server = "47.122.112.242"
$FtpUser = "hal"
$FtpPass = "BkWPsQdnFHvb"

Write-Host "Testing FTP connection to $Server ..."

try {
    $req = [System.Net.FtpWebRequest]::Create("ftp://${Server}:21/")
    $req.Method = [System.Net.WebRequestMethods+Ftp]::ListDirectory
    $req.Credentials = New-Object System.Net.NetworkCredential($FtpUser, $FtpPass)
    $req.Timeout = 10000
    $resp = $req.GetResponse()
    $sr = New-Object System.IO.StreamReader($resp.GetResponseStream())
    $listing = $sr.ReadToEnd()
    $sr.Close()
    $resp.Close()
    Write-Host "FTP connected OK! Root listing:"
    Write-Host $listing
}
catch {
    Write-Host "FTP connection FAILED!"
    Write-Host "Error: $_"
    Write-Host ""
    Write-Host "Details: $($_.Exception.InnerException)"
}
