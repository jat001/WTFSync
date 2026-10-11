param([string]$Destination = (Join-Path $env:TEMP 'WTFSyncStoreReview/WorldOfWarcraft'))
$ErrorActionPreference = 'Stop'
$Destination = [IO.Path]::GetFullPath($Destination)
if (Test-Path -LiteralPath $Destination) { throw 'Choose a new sample directory.' }
function Put([string]$RelativePath, [string]$Text) {
    $file = Join-Path $Destination $RelativePath
    [IO.Directory]::CreateDirectory([IO.Path]::GetDirectoryName($file)) | Out-Null
    [IO.File]::WriteAllText($file, $Text, [Text.UTF8Encoding]::new($false))
}
Put '.build.info' "Active!DEC:1|Version!STRING:0|Product!STRING:0`n1|3.80.2.12345|wow_classic_titan`n"
Put '_classic_titan_/.flavor.info' "Product Flavor!STRING:0`nwow_classic_titan`n"
Put '_classic_titan_/Interface/AddOns/BiaoGe/BiaoGe.toc' "## Title: Synthetic review fixture`n"
foreach ($id in '100000001#1','100000002#2') {
    $character = if ($id -eq '100000001#1') { 'SampleOne' } else { 'SampleTwo' }
    Put "_classic_titan_/WTF/Account/$id/SavedVariables/BiaoGe.lua" @"
BiaoGe = {
    ["realmName"] = { [4533] = "SampleRealm" },
    ["playerInfo"] = { [4533] = { ["$character"] = {
        ["class"] = "WARRIOR", ["level"] = 80,
        ["faction"] = "Alliance", ["iLevel"] = 200,
    } } },
}
"@
}
Write-Output "Select this synthetic directory in WTFSync: $Destination"
