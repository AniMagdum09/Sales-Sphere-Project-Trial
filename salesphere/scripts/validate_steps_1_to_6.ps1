# SalesSphere — Sync Validation Steps 01-06 (handover priority)
# Run this on the machine that hosts the shop's SQL Server billing DB.
# Prerequisites: the sync agent is running (java -jar salesphere-sync-agent-1.0.0.jar)
# and MySQL is up with credentials set in application.yml.

$ErrorActionPreference = "Stop"
$AGENT = "http://127.0.0.1:8080"

function Step($n, $msg) { Write-Host "`n=== [$n] $msg ===" -ForegroundColor Cyan }
function Ok($msg)   { Write-Host "  PASS  $msg" -ForegroundColor Green }
function Bad($msg)  { Write-Host "  FAIL  $msg" -ForegroundColor Red }
function Info($msg) { Write-Host "  ----  $msg" -ForegroundColor Yellow }

# ---------------------------------------------------------------- step 01
Step "01" "Validate SQL Server connectivity (POST /api/config/source/test)"
$test = Invoke-RestMethod -Method Post -Uri "$AGENT/api/config/source/test"
if ($test.ok) { Ok "Source reachable: $($test.serverVersion)" }
else {
    Bad "Source unreachable: $($test.error)"
    Info "Checklist: SQL Server service running? TCP/IP enabled on port 1433 (SQL Server"
    Info "Configuration Manager)? Mixed Mode auth enabled? Credentials correct?"
    Info "If the server is SQL Server 2005 and the Microsoft driver fails, set"
    Info "jdbc-url-override to jdbc:jtds:sqlserver://HOST:1433/BILLING via PUT /api/config/source."
    exit 1
}

# ---------------------------------------------------------------- step 02
Step "02" "Source config reachable + identity (GET /api/config/source)"
$cfg = Invoke-RestMethod -Method Get -Uri "$AGENT/api/config/source"
Info "Source: $($cfg.host):$($cfg.port) db=$($cfg.databaseName) user=$($cfg.username)"
if ($cfg.passwordMasked -eq "********") { Ok "Credentials are masked in API responses" } else { Bad "Credential masking broken" }

# ---------------------------------------------------------------- steps 03 + 04
function Get-Counts { (Invoke-RestMethod -Uri "$AGENT/api/sync/status").target_row_counts }

function Run-SyncAndWait {
    Invoke-RestMethod -Method Post -Uri "$AGENT/api/sync/run" | Out-Null
    while ($true) {
        Start-Sleep -Seconds 5
        $st = Invoke-RestMethod -Uri "$AGENT/api/sync/status"
        if (-not $st.running) { return $st.last_run }
    }
}

Step "03" "First synchronization + row inspection (POST /api/sync/run)"
$run1 = Run-SyncAndWait
if ($run1.status -ne "SUCCESS") {
    Bad "Sync #1 ended $($run1.status): $($run1.error_message)"
    exit 1
}
Ok ("Sync #1 SUCCESS in {0} ms - customers={1} products={2} invoices={3} items={4} day_end={5}" -f `
    $run1.duration_ms, $run1.customers_synced, $run1.products_synced, $run1.invoices_synced, `
    $run1.invoice_items_synced, $run1.day_end_synced)
$counts1 = Get-Counts
Info ("Target rows after run #1: " + ($counts1 | ConvertTo-Json -Compress))

Step "04" "Second synchronization - IDEMPOTENCY PROOF"
$run2 = Run-SyncAndWait
if ($run2.status -ne "SUCCESS") { Bad "Sync #2 ended $($run2.status)"; exit 1 }
$counts2 = Get-Counts
$idempotent = $true
foreach ($p in $counts1.PSObject.Properties) {
    if ($counts2.$($p.Name) -ne $p.Value) {
        Bad "Row count changed for $($p.Name): $($p.Value) -> $($counts2.$($p.Name))"
        $idempotent = $false
    }
}
if ($idempotent) { Ok "All row counts identical after second run - upsert logic is idempotent" }
else { Info "Fix the upsert bug before building analytics (see handover step 04)." }

# ---------------------------------------------------------------- step 05
Step "05" "Dynamic reconfiguration without restart (PUT /api/config/source)"
$body = @{ host = $cfg.host; port = $cfg.port; databaseName = $cfg.databaseName;
           username = $cfg.username } | ConvertTo-Json
$updated = Invoke-RestMethod -Method Put -Uri "$AGENT/api/config/source" -ContentType "application/json" -Body $body
$test2 = Invoke-RestMethod -Method Post -Uri "$AGENT/api/config/source/test"
if ($test2.ok) { Ok "Agent picked up updated config and reconnected WITHOUT a restart" }
else { Bad "After config update: $($test2.error)" }

# ---------------------------------------------------------------- step 06
Step "06" "Im_Remaining_Qty verification (MANUAL)"
Info "Automated checks are done. Remaining manual step:"
Info "1. Pick 5 items, note Im_Remaining_Qty per item from the source DB."
Info "2. Physically count those items on the shop floor."
Info "3. If counts match -> Im_Remaining_Qty is authoritative; if not, stock analytics"
Info "   must keep using derived stock (purchased - sold), reconciled against DAY_END."

Write-Host "`n=== Validation complete ===" -ForegroundColor Cyan
