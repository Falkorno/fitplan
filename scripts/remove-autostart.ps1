$ErrorActionPreference = 'SilentlyContinue'
$taskName = 'Stride Training Planner'

Stop-ScheduledTask -TaskName $taskName
Unregister-ScheduledTask -TaskName $taskName -Confirm:$false
Write-Host 'Stride automatic startup has been removed.'
