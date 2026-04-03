param(
  [string]$Owner = "Minot123",
  [string]$Repo = "Minot123/supersplat-desktop-viewer",
  [string]$ProjectTitle = "SuperSplat Desktop Viewer Workspace",
  [switch]$OpenProjectInBrowser
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

. "$PSScriptRoot\gh-project-tools.ps1"

$labels = @(
  @{ Name = "type:feature"; Color = "1D76DB"; Description = "User-facing or engineering feature work" },
  @{ Name = "type:research"; Color = "5319E7"; Description = "Investigation before implementation" },
  @{ Name = "type:release"; Color = "FBCA04"; Description = "Release packaging or publication work" },
  @{ Name = "type:handoff"; Color = "C5DEF5"; Description = "Session recovery and handoff context" },
  @{ Name = "priority:high"; Color = "B60205"; Description = "Must be addressed soon" },
  @{ Name = "priority:medium"; Color = "D93F0B"; Description = "Normal priority work" },
  @{ Name = "priority:low"; Color = "0E8A16"; Description = "Can wait" },
  @{ Name = "area:ui"; Color = "0052CC"; Description = "UI and UX work" },
  @{ Name = "area:viewer-runtime"; Color = "5319E7"; Description = "Viewer internals and runtime behavior" },
  @{ Name = "area:performance"; Color = "C2E0C6"; Description = "Performance measurement and tuning" },
  @{ Name = "area:file-loading"; Color = "FEF2C0"; Description = "Scene loading and file pipeline" },
  @{ Name = "area:packaging"; Color = "F9D0C4"; Description = "Build, installer, and packaging work" },
  @{ Name = "area:release"; Color = "E99695"; Description = "Versioning and release delivery" },
  @{ Name = "agent:ready"; Color = "0E8A16"; Description = "Ready for an agent to pick up" },
  @{ Name = "agent:blocked"; Color = "B60205"; Description = "Blocked pending repro, asset, or credential" },
  @{ Name = "agent:review-needed"; Color = "FBCA04"; Description = "Needs human review or verification" }
)

$projectFields = @(
  @{ Name = "Workflow Status"; Options = @("Backlog", "Ready", "In Progress", "Blocked", "Done") },
  @{ Name = "Type"; Options = @("Feature", "Bug", "Research", "Release") },
  @{ Name = "Priority"; Options = @("High", "Medium", "Low") },
  @{ Name = "Area"; Options = @("UI", "Viewer Runtime", "Performance", "File Loading", "Packaging", "Release") },
  @{ Name = "Version"; Options = @("0.1.x", "0.2.x", "Backlog") },
  @{ Name = "Agent State"; Options = @("Human", "Agent-ready", "Waiting for review", "Waiting for repro") }
)

Write-Host "Ensuring repository labels..."
foreach ($label in $labels) {
  Ensure-GitHubLabel -Repo $Repo -Name $label.Name -Color $label.Color -Description $label.Description
}

if (-not (Test-GhProjectScope -Owner $Owner)) {
  Write-Warning "GitHub CLI token is missing the 'project' scope."
  Write-Warning "Run: gh auth refresh -h github.com -s project"
  Write-Warning "After that, rerun this script to create the project and custom fields."
  exit 0
}

$project = Get-ProjectByTitle -Owner $Owner -Title $ProjectTitle
if (-not $project) {
  Write-Host "Creating project '$ProjectTitle'..."
  $project = Invoke-GhJson -Arguments @("project", "create", "--owner", $Owner, "--title", $ProjectTitle, "--format", "json")
}

$projectNumber = [int]$project.number
Write-Host "Using project #$projectNumber"

Invoke-GhText -Arguments @("project", "link", "$projectNumber", "--owner", $Owner, "--repo", $Repo) | Out-Null

$existingFields = Get-ProjectFields -Owner $Owner -ProjectNumber $ProjectNumber
foreach ($field in $projectFields) {
  if (-not (Get-ProjectFieldByName -Fields $existingFields -Name $field.Name)) {
    Write-Host "Creating field '$($field.Name)'..."
    Invoke-GhText -Arguments @(
      "project", "field-create", "$projectNumber",
      "--owner", $Owner,
      "--name", $field.Name,
      "--data-type", "SINGLE_SELECT",
      "--single-select-options", ($field.Options -join ",")
    ) | Out-Null
  }
}

Write-Host ""
Write-Host "Project bootstrap complete."
Write-Host "Recommended manual views:"
Write-Host "  - Current: Workflow Status is Ready, In Progress, or Blocked"
Write-Host "  - UI / UX: Area = UI"
Write-Host "  - Performance: Area = Performance or File Loading"
Write-Host "  - Release: Type = Release"
Write-Host "  - Agent-ready: Agent State = Agent-ready"

if ($OpenProjectInBrowser) {
  gh project view $projectNumber --owner $Owner --web | Out-Null
}
