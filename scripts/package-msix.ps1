[CmdletBinding()]
param(
    [ValidatePattern('^[1-9][0-9]*\.[0-9]+\.[0-9]+\.0$')]
    [string]$PackageVersion = '1.0.0.0',
    [switch]$SkipBuild,
    [string]$Certificate
)

$ErrorActionPreference = 'Stop'
$projectRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$outputRoot = Join-Path $projectRoot 'artifacts/msix'
$outputDir = Join-Path $outputRoot $PackageVersion
$layoutDir = [IO.Path]::GetFullPath((Join-Path $outputDir 'x64'))
$manifestPath = Join-Path $projectRoot 'packaging/windows/Package.appxmanifest'

if (-not $IsWindows -or [Runtime.InteropServices.RuntimeInformation]::OSArchitecture -ne 'X64') {
    throw 'This packaging script requires PowerShell 7 on Windows x64.'
}
foreach ($part in $PackageVersion.Split('.')) {
    if ([long]$part -gt 65535) { throw 'MSIX version components must be at most 65535.' }
}
if (-not $layoutDir.StartsWith([IO.Path]::GetFullPath($outputRoot) + [IO.Path]::DirectorySeparatorChar)) {
    throw 'The package layout must remain inside artifacts/msix.'
}
if ($Certificate) {
    $Certificate = (Resolve-Path -LiteralPath $Certificate).Path
}

function Invoke-Checked([string]$Command, [string[]]$CommandArguments) {
    & $Command @CommandArguments
    if ($LASTEXITCODE -ne 0) { throw "$Command failed with exit code $LASTEXITCODE." }
}

Push-Location -LiteralPath $projectRoot
try {
    if (-not $SkipBuild) {
        Invoke-Checked 'pnpm' @('exec', 'tauri', 'icon', 'public/icon.png')
        Invoke-Checked 'pnpm' @('exec', 'tauri', 'build', '--no-bundle', '--ci')
    }
    $executable = Join-Path $projectRoot 'src-tauri/target/release/wtfsync.exe'
    if (-not (Test-Path -LiteralPath $executable -PathType Leaf)) {
        throw 'The release executable is missing. Run without -SkipBuild first.'
    }
    # Only the verified, version-specific package staging directory is disposable.
    if (Test-Path -LiteralPath $layoutDir) { Remove-Item -LiteralPath $layoutDir -Recurse -Force }
    [IO.Directory]::CreateDirectory($layoutDir) | Out-Null
    Copy-Item -LiteralPath $executable -Destination (Join-Path $layoutDir 'wtfsync.exe')
    Copy-Item -LiteralPath (Join-Path $projectRoot 'packaging/windows/Assets') -Destination $layoutDir -Recurse

    [xml]$manifest = Get-Content -LiteralPath $manifestPath -Raw
    $manifest.Package.Identity.Version = $PackageVersion
    $writerSettings = [Xml.XmlWriterSettings]::new()
    $writerSettings.Encoding = [Text.UTF8Encoding]::new($false)
    $writerSettings.Indent = $true
    $writerSettings.NewLineChars = "`n"
    $writer = [Xml.XmlWriter]::Create((Join-Path $layoutDir 'Package.appxmanifest'), $writerSettings)
    try { $manifest.Save($writer) } finally { $writer.Dispose() }

    $suffix = if ($Certificate) { '_dev' } else { '' }
    $packagePath = Join-Path $outputDir "WTFSync_${PackageVersion}_x64${suffix}.msix"
    $packArguments = @('exec', 'winapp', 'pack', $layoutDir, '--manifest', (Join-Path $layoutDir 'Package.appxmanifest'), '--executable', 'wtfsync.exe', '--output', $packagePath)
    if ($Certificate) {
        $packArguments += @('--cert', $Certificate)
        if ($env:WINAPP_CERT_PASSWORD) { $packArguments += @('--cert-password', $env:WINAPP_CERT_PASSWORD) }
    } else {
        $packArguments += '--no-sign'
    }
    Invoke-Checked 'pnpm' $packArguments
    $hash = (Get-FileHash -LiteralPath $packagePath -Algorithm SHA256).Hash
    [ordered]@{
        package = [IO.Path]::GetFileName($packagePath)
        packageVersion = $PackageVersion
        applicationVersion = (Get-Content package.json -Raw | ConvertFrom-Json).version
        architecture = 'x64'
        sha256 = $hash
        signedForDevelopment = [bool]$Certificate
    } | ConvertTo-Json | Set-Content -LiteralPath ($packagePath + '.json') -Encoding utf8NoBOM
    Write-Output "Package: $packagePath"
    Write-Output "SHA256: $hash"
} finally {
    Pop-Location
}
