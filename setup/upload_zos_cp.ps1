# Uploads all HMS mainframe members strictly into Z72385.CP.* PDS datasets on z/OS.
$ErrorActionPreference = "Continue"
$root = Split-Path -Parent $PSScriptRoot

# Read credentials from .env
$envMap = @{}
Get-Content (Join-Path $root ".env") | ForEach-Object {
    if ($_ -match '^\s*([^#=]+?)\s*=\s*(.*)\s*$') {
        $envMap[$matches[1]] = $matches[2]
    }
}

$zosHost = if ($envMap["DB2_HOST"]) { $envMap["DB2_HOST"] } else { "204.90.115.200" }
$zosUser = if ($envMap["DB2_USER"]) { $envMap["DB2_USER"] } else { "Z72385" }
$zosPass = $envMap["DB2_PASSWORD"]
$zoweArgs = @("--host", $zosHost, "--port", "10443", "--user", $zosUser, "--password", $zosPass, "--reject-unauthorized", "false")

$pdsList = @(
    "$zosUser.CP.DDL",
    "$zosUser.CP.SQL",
    "$zosUser.CP.COBOL",
    "$zosUser.CP.JCL"
)

Write-Host "=== Creating PDS datasets under $zosUser.CP.* ==="
foreach ($ds in $pdsList) {
    Write-Host "Creating $ds ..."
    & zowe files create pds $ds --bs 6160 --rl 80 --rf FB --sz 5TRK --db 10 @zoweArgs 2>&1 | Out-String | Write-Host
}

$uploads = @(
    @((Join-Path $root "db2\HMS_DDL.sql"),    "$zosUser.CP.DDL(HMSDDL)"),
    @((Join-Path $root "db2\VIEWALL.sql"),    "$zosUser.CP.SQL(VIEWALL)"),
    @((Join-Path $root "cobol\HMSAUTH.cbl"),  "$zosUser.CP.COBOL(HMSAUTH)"),
    @((Join-Path $root "cobol\HMSAPPT.cbl"),  "$zosUser.CP.COBOL(HMSAPPT)"),
    @((Join-Path $root "cobol\HMSADMIN.cbl"), "$zosUser.CP.COBOL(HMSADMIN)"),
    @((Join-Path $root "jcl\HMSQRY.jcl"),     "$zosUser.CP.JCL(HMSQRY)"),
    @((Join-Path $root "jcl\HMSLOAD.jcl"),    "$zosUser.CP.JCL(HMSLOAD)"),
    @((Join-Path $root "jcl\HMSLOGIN.jcl"),   "$zosUser.CP.JCL(HMSLOGIN)"),
    @((Join-Path $root "jcl\HMSAPPT.jcl"),    "$zosUser.CP.JCL(HMSAPPT)"),
    @((Join-Path $root "jcl\HMSBATCH.jcl"),   "$zosUser.CP.JCL(HMSBATCH)")
)

Write-Host "=== Uploading members to $zosUser.CP.* ==="
foreach ($pair in $uploads) {
    Write-Host "Uploading $($pair[1]) ..."
    & zowe files upload ftds $pair[0] $pair[1] @zoweArgs
    if ($LASTEXITCODE -ne 0) {
        Write-Error "Failed to upload $($pair[1])"
        exit 1
    }
}

Write-Host "=== Verifying $zosUser.CP.* datasets ==="
& zowe files list ds "$zosUser.CP.*" @zoweArgs
