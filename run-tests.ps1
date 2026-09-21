$scriptDir = $PSScriptRoot
if (-not $scriptDir) { $scriptDir = (Get-Location).Path }
$docsDir = Join-Path $scriptDir "docs"
$edgePath = 'C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe'
if (-not (Test-Path $edgePath)) {
    $edgePath = 'C:\Program Files\Microsoft\Edge\Application\msedge.exe'
}

$encodedDocsDir = $docsDir.Replace('\', '/').Replace(' ', '%20')

Write-Output "=== TESTING SMART PASTE SUITE (ONE-PASTE, FORM FILL, EXCLUSIONS, STALE DATA) ==="
$spUrl = "file:///$encodedDocsDir/test-smart-paste.html"
cmd /c "`"$edgePath`" --headless --dump-dom --allow-file-access-from-files --disable-web-security --user-data-dir=`"C:\Users\407206\AppData\Local\Temp\edge-sp-test`" --virtual-time-budget=3500 `"$spUrl`" > smart-paste-out.html"
$spRaw = Get-Content 'smart-paste-out.html' -Raw
if ($spRaw -match '<pre id="test-results"[^>]*>([\s\S]*?)</pre>') {
    Write-Output $matches[1]
} else {
    Write-Output "Smart Paste results not found in output"
}

Write-Output "`n=== TESTING DICE 2 DEPENDENT FLOW AUTOMATION & DRY-RUN SUITE ==="
$diceFlowUrl = "file:///$encodedDocsDir/test-dice-flow.html"
cmd /c "`"$edgePath`" --headless --dump-dom --allow-file-access-from-files --disable-web-security --user-data-dir=`"C:\Users\407206\AppData\Local\Temp\edge-dice-test`" --virtual-time-budget=5000 `"$diceFlowUrl`" > dice-flow-out.html"
$dfRaw = Get-Content 'dice-flow-out.html' -Raw
if ($dfRaw -match '<pre id="test-results"[^>]*>([\s\S]*?)</pre>') {
    Write-Output $matches[1]
} else {
    Write-Output "DICE Flow results not found in output"
}

Write-Output "`n=== TESTING REALISTIC DICE LIVE FORM FIXTURE (BMW X3 OFFLINE FLOW) ==="
$liveFixtureUrl = "file:///$encodedDocsDir/test-dice-live-fixture.html"
cmd /c "`"$edgePath`" --headless --dump-dom --allow-file-access-from-files --disable-web-security --user-data-dir=`"C:\Users\407206\AppData\Local\Temp\edge-live-fixture-test`" --virtual-time-budget=5000 `"$liveFixtureUrl`" > live-fixture-out.html"
$lfRaw = Get-Content 'live-fixture-out.html' -Raw
if ($lfRaw -match '<pre id="test-results"[^>]*>([\s\S]*?)</pre>') {
    Write-Output $matches[1]
} else {
    Write-Output "Live Fixture results not found in output"
}

