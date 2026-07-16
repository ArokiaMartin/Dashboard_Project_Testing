$ds = Invoke-RestMethod -Uri "http://localhost:8081/api/datasets" -Method Get
$d = $ds | Where-Object { $_.table_name -eq 'clinic_visits_v1' } | Select-Object -First 1
$id = $d.id

$dims = @('visit_id','visit_date','department','is_followup','name','gender','code','description','severity','test_name','result','drug','refill_date')
$nums = @('total_cost','age','cost','dosage_mg','quantity')
$aggs = @('SUM','AVG','MIN','MAX','COUNT')

$pass = 0; $fail = 0; $failures = @()

function Invoke-Q($body) {
  try { $null = Invoke-RestMethod -Uri "http://localhost:8081/api/execute-query" -Method Post -ContentType 'application/json' -Body $body; return $null }
  catch {
    $msg = $_.Exception.Message
    try { $r = $_.Exception.Response.GetResponseStream(); $sr = New-Object System.IO.StreamReader($r); $msg = $sr.ReadToEnd() } catch {}
    return $msg
  }
}

# 1) single dimension x measure x aggregation
foreach ($dim in $dims) {
  foreach ($num in $nums) {
    foreach ($agg in $aggs) {
      $body = @{ dataset=$id; dimensions=@($dim); measures=@(@{ field=$num; aggregation=$agg; alias='m' }); pagination=@{ top=100; offset=0 } } | ConvertTo-Json -Depth 6
      $e = Invoke-Q $body
      if ($e) { $fail++; $failures += "DIMxMEAS $dim / $agg($num): $e" } else { $pass++ }
    }
  }
}

# 2) multi-measure (two numbers) per dimension
foreach ($dim in $dims) {
  $body = @{ dataset=$id; dimensions=@($dim); measures=@(@{ field='total_cost'; aggregation='SUM'; alias='a' }, @{ field='age'; aggregation='AVG'; alias='b' }, @{ field='cost'; aggregation='SUM'; alias='c' }); pagination=@{ top=100; offset=0 } } | ConvertTo-Json -Depth 6
  $e = Invoke-Q $body
  if ($e) { $fail++; $failures += "MULTI ${dim}: $e" } else { $pass++ }
}

# 3) dimension-only (no measures) -> raw grouping/select
foreach ($dim in $dims) {
  $body = @{ dataset=$id; dimensions=@($dim); measures=@(); pagination=@{ top=50; offset=0 } } | ConvertTo-Json -Depth 6
  $e = Invoke-Q $body
  if ($e) { $fail++; $failures += "DIMONLY ${dim}: $e" } else { $pass++ }
}

# 4) KPI (measure only, no dimension)
foreach ($num in $nums) {
  foreach ($agg in $aggs) {
    $body = @{ dataset=$id; dimensions=@(); measures=@(@{ field=$num; aggregation=$agg; alias='k' }); pagination=@{ top=1; offset=0 } } | ConvertTo-Json -Depth 6
    $e = Invoke-Q $body
    if ($e) { $fail++; $failures += "KPI $agg($num): $e" } else { $pass++ }
  }
}

# 5) with a category filter on the dimension
foreach ($num in $nums) {
  $body = @{ dataset=$id; dimensions=@('department'); measures=@(@{ field=$num; aggregation='SUM'; alias='m' }); filters=@{ condition='AND'; rules=@(@{ field='department'; operator='IN'; values=@('Cardiology','Neurology') }) }; pagination=@{ top=100; offset=0 } } | ConvertTo-Json -Depth 8
  $e = Invoke-Q $body
  if ($e) { $fail++; $failures += "FILTER department/${num}: $e" } else { $pass++ }
}

# 6) filter on a child column
$body = @{ dataset=$id; dimensions=@('department'); measures=@(@{ field='cost'; aggregation='SUM'; alias='m' }); filters=@{ condition='AND'; rules=@(@{ field='severity'; operator='='; value='high' }) }; pagination=@{ top=100; offset=0 } } | ConvertTo-Json -Depth 8
$e = Invoke-Q $body
if ($e) { $fail++; $failures += "CHILDFILTER: $e" } else { $pass++ }

# 7) sorting by measure alias
$body = @{ dataset=$id; dimensions=@('department'); measures=@(@{ field='total_cost'; aggregation='SUM'; alias='tc' }); sorting=@(@{ field='tc'; direction='DESC' }); pagination=@{ top=100; offset=0 } } | ConvertTo-Json -Depth 8
$e = Invoke-Q $body
if ($e) { $fail++; $failures += "SORT: $e" } else { $pass++ }

Write-Host "TOTAL PASS=$pass FAIL=$fail"
if ($failures.Count -gt 0) { Write-Host "---- FAILURES ----"; $failures | ForEach-Object { Write-Host $_ } }
