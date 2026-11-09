param([string]$ProcessIds)
$damageIds = @($ProcessIds.Split(',') | ForEach-Object { [int]$_ })
$damageProcesses = @(Get-Process -Id $damageIds -ErrorAction SilentlyContinue)
$damageResult = [ordered]@{
  workingSetBytes = ($damageProcesses | Measure-Object -Property WorkingSet64 -Sum).Sum
  privateBytes = ($damageProcesses | Measure-Object -Property PrivateMemorySize64 -Sum).Sum
  processIds = $damageIds
  dedicatedGpuBytes = $null
  sharedGpuBytes = $null
  gpuMemoryReason = $null
}
try {
  $damageGpu = @(Get-CimInstance Win32_PerfFormattedData_GPUPerformanceCounters_GPUProcessMemory -ErrorAction Stop | Where-Object { $_.Name -match '^pid_(\d+)_' -and $damageIds -contains [int]$Matches[1] })
  if ($damageGpu.Count) {
    $damageResult.dedicatedGpuBytes = ($damageGpu | Measure-Object -Property DedicatedUsage -Sum).Sum
    $damageResult.sharedGpuBytes = ($damageGpu | Measure-Object -Property SharedUsage -Sum).Sum
  } else { $damageResult.gpuMemoryReason = 'Windows GPU process counters have no records for this browser process tree.' }
} catch { $damageResult.gpuMemoryReason = $_.Exception.Message }
$damageResult | ConvertTo-Json -Compress
