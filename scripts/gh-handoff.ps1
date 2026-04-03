param(
  [Parameter(Mandatory = $true)]
  [int]$IssueNumber,
  [Parameter(Mandatory = $true)]
  [string]$Summary,
  [string[]]$Completed = @(),
  [string[]]$NextSteps = @(),
  [string[]]$Verification = @(),
  [string[]]$Risks = @(),
  [string]$Repo = "Minot123/supersplat-desktop-viewer",
  [string]$Owner = "Minot123",
  [string]$ProjectTitle = "SuperSplat Desktop Viewer Workspace",
  [ValidateSet("Backlog", "Ready", "In Progress", "Blocked", "Done")]
  [string]$Status = "In Progress",
  [ValidateSet("Human", "Agent-ready", "Waiting for review", "Waiting for repro")]
  [string]$AgentState = "Waiting for review",
  [switch]$CloseIssue
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

. "$PSScriptRoot\gh-project-tools.ps1"

function Format-BulletList {
  param([string[]]$Items, [string]$EmptyText)

  if (-not $Items -or $Items.Count -eq 0) {
    return "- $EmptyText"
  }

  return ($Items | ForEach-Object { "- $_" }) -join [Environment]::NewLine
}

$timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss K"
$comment = @"
## Session handoff

**Timestamp:** $timestamp

**Summary**
$Summary

**Completed**
$(Format-BulletList -Items $Completed -EmptyText "No completed items recorded.")

**Next steps**
$(Format-BulletList -Items $NextSteps -EmptyText "No next steps recorded.")

**Verification**
$(Format-BulletList -Items $Verification -EmptyText "No verification recorded.")

**Risks / blockers**
$(Format-BulletList -Items $Risks -EmptyText "No known blockers recorded.")
"@

$tempFile = Join-Path ([System.IO.Path]::GetTempPath()) ("supersplat-handoff-" + [guid]::NewGuid().ToString("N") + ".md")
try {
  Set-Content -LiteralPath $tempFile -Value $comment -Encoding UTF8
  Invoke-GhText -Arguments @("issue", "comment", "$IssueNumber", "--repo", $Repo, "--body-file", $tempFile) | Out-Null
} finally {
  if (Test-Path $tempFile) {
    Remove-Item -LiteralPath $tempFile -Force
  }
}

if ($CloseIssue) {
  Invoke-GhText -Arguments @("issue", "close", "$IssueNumber", "--repo", $Repo) | Out-Null
}

if (-not (Test-GhProjectScope -Owner $Owner)) {
  Write-Warning "Handoff comment posted, but project scope is missing. Run 'gh auth refresh -h github.com -s project' to sync project fields."
  exit 0
}

$project = Get-ProjectByTitle -Owner $Owner -Title $ProjectTitle
if (-not $project) {
  Write-Warning "Handoff comment posted, but project '$ProjectTitle' was not found."
  exit 0
}

$issueData = Invoke-GhJson -Arguments @("issue", "view", "$IssueNumber", "--repo", $Repo, "--json", "url")
$issueUrl = $issueData.url
$projectNumber = [int]$project.number
$projectData = Get-ProjectViewData -Owner $Owner -ProjectNumber $projectNumber
$projectId = $projectData.id
$fields = Get-ProjectFields -Owner $Owner -ProjectNumber $projectNumber
$itemId = Resolve-ProjectItemIdFromIssueUrl -Owner $Owner -ProjectNumber $projectNumber -IssueUrl $issueUrl

if (-not $itemId) {
  Write-Warning "Issue exists, but no linked project item was found."
  exit 0
}

Set-ProjectSingleSelectValue -Owner $Owner -ProjectNumber $projectNumber -ProjectId $projectId -ItemId $itemId -Fields $fields -FieldName "Workflow Status" -OptionName $Status
Set-ProjectSingleSelectValue -Owner $Owner -ProjectNumber $projectNumber -ProjectId $projectId -ItemId $itemId -Fields $fields -FieldName "Agent State" -OptionName $AgentState

Write-Host "Handoff comment posted and project item updated."
