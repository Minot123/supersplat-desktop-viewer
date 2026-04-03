param(
  [Parameter(Mandatory = $true)]
  [string]$Title,
  [string]$Body,
  [string]$BodyFile,
  [string]$Repo = "Minot123/supersplat-desktop-viewer",
  [string]$Owner = "Minot123",
  [string]$ProjectTitle = "SuperSplat Desktop Viewer Workspace",
  [string[]]$Labels = @(),
  [ValidateSet("Feature", "Bug", "Research", "Release")]
  [string]$Type = "Feature",
  [ValidateSet("High", "Medium", "Low")]
  [string]$Priority = "Medium",
  [ValidateSet("UI", "Viewer Runtime", "Performance", "File Loading", "Packaging", "Release")]
  [string]$Area = "UI",
  [ValidateSet("Backlog", "Ready", "In Progress", "Blocked", "Done")]
  [string]$Status = "Ready",
  [ValidateSet("0.1.x", "0.2.x", "Backlog")]
  [string]$Version = "Backlog",
  [ValidateSet("Human", "Agent-ready", "Waiting for review", "Waiting for repro")]
  [string]$AgentState = "Agent-ready"
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

. "$PSScriptRoot\gh-project-tools.ps1"

if (-not $Body -and -not $BodyFile) {
  $Body = "Fill in the structured sections from the issue template before starting implementation."
}

$finalLabels = [System.Collections.Generic.List[string]]::new()
foreach ($label in $Labels) {
  if ($label) {
    $finalLabels.Add($label)
  }
}

switch ($Type) {
  "Feature" { $finalLabels.Add("type:feature") }
  "Research" { $finalLabels.Add("type:research") }
  "Release" { $finalLabels.Add("type:release") }
}

switch ($Priority) {
  "High" { $finalLabels.Add("priority:high") }
  "Medium" { $finalLabels.Add("priority:medium") }
  "Low" { $finalLabels.Add("priority:low") }
}

switch ($Area) {
  "UI" { $finalLabels.Add("area:ui") }
  "Viewer Runtime" { $finalLabels.Add("area:viewer-runtime") }
  "Performance" { $finalLabels.Add("area:performance") }
  "File Loading" { $finalLabels.Add("area:file-loading") }
  "Packaging" { $finalLabels.Add("area:packaging") }
  "Release" { $finalLabels.Add("area:release") }
}

switch ($AgentState) {
  "Agent-ready" { $finalLabels.Add("agent:ready") }
  "Waiting for review" { $finalLabels.Add("agent:review-needed") }
  "Waiting for repro" { $finalLabels.Add("agent:blocked") }
}

$finalLabels = $finalLabels | Select-Object -Unique

$issueArgs = @("issue", "create", "--repo", $Repo, "--title", $Title)
if ($BodyFile) {
  $issueArgs += @("--body-file", $BodyFile)
} else {
  $issueArgs += @("--body", $Body)
}

foreach ($label in $finalLabels) {
  $issueArgs += @("--label", $label)
}

$issueUrl = Invoke-GhText -Arguments $issueArgs
Write-Host "Created issue: $issueUrl"

if (-not (Test-GhProjectScope -Owner $Owner)) {
  Write-Warning "Issue created, but project scope is missing. Run 'gh auth refresh -h github.com -s project' to add the item to the Project."
  exit 0
}

$project = Get-ProjectByTitle -Owner $Owner -Title $ProjectTitle
if (-not $project) {
  throw "Project '$ProjectTitle' was not found. Run scripts\\gh-project-bootstrap.ps1 first."
}

$projectNumber = [int]$project.number
$projectData = Get-ProjectViewData -Owner $Owner -ProjectNumber $projectNumber
$projectId = $projectData.id
$fields = Get-ProjectFields -Owner $Owner -ProjectNumber $projectNumber

Invoke-GhText -Arguments @("project", "item-add", "$projectNumber", "--owner", $Owner, "--url", $issueUrl) | Out-Null
Start-Sleep -Milliseconds 400

$itemId = Resolve-ProjectItemIdFromIssueUrl -Owner $Owner -ProjectNumber $projectNumber -IssueUrl $issueUrl
if (-not $itemId) {
  throw "Issue was added to the project, but item id could not be resolved."
}

Set-ProjectSingleSelectValue -Owner $Owner -ProjectNumber $projectNumber -ProjectId $projectId -ItemId $itemId -Fields $fields -FieldName "Status" -OptionName $Status
Set-ProjectSingleSelectValue -Owner $Owner -ProjectNumber $projectNumber -ProjectId $projectId -ItemId $itemId -Fields $fields -FieldName "Type" -OptionName $Type
Set-ProjectSingleSelectValue -Owner $Owner -ProjectNumber $projectNumber -ProjectId $projectId -ItemId $itemId -Fields $fields -FieldName "Priority" -OptionName $Priority
Set-ProjectSingleSelectValue -Owner $Owner -ProjectNumber $projectNumber -ProjectId $projectId -ItemId $itemId -Fields $fields -FieldName "Area" -OptionName $Area
Set-ProjectSingleSelectValue -Owner $Owner -ProjectNumber $projectNumber -ProjectId $projectId -ItemId $itemId -Fields $fields -FieldName "Version" -OptionName $Version
Set-ProjectSingleSelectValue -Owner $Owner -ProjectNumber $projectNumber -ProjectId $projectId -ItemId $itemId -Fields $fields -FieldName "Agent State" -OptionName $AgentState

Write-Host "Project item configured."
