Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"
$PSNativeCommandUseErrorActionPreference = $false

function Invoke-GhJson {
  param(
    [Parameter(Mandatory = $true)]
    [string[]]$Arguments
  )

  $output = & gh @Arguments 2>&1
  if ($LASTEXITCODE -ne 0) {
    throw ($output -join [Environment]::NewLine)
  }

  if (-not $output) {
    return $null
  }

  return ($output | Out-String | ConvertFrom-Json)
}

function Invoke-GhText {
  param(
    [Parameter(Mandatory = $true)]
    [string[]]$Arguments
  )

  $output = & gh @Arguments 2>&1
  if ($LASTEXITCODE -ne 0) {
    throw ($output -join [Environment]::NewLine)
  }

  return ($output -join [Environment]::NewLine).Trim()
}

function Test-GhProjectScope {
  param(
    [Parameter(Mandatory = $true)]
    [string]$Owner
  )

  $output = (& cmd /c "gh project list --owner $Owner 2>&1" | Out-String).Trim()
  if ($LASTEXITCODE -eq 0) {
    return $true
  }

  if ($output -match "missing required scopes") {
    return $false
  }

  throw $output
}

function Get-ProjectByTitle {
  param(
    [Parameter(Mandatory = $true)]
    [string]$Owner,
    [Parameter(Mandatory = $true)]
    [string]$Title
  )

  $result = Invoke-GhJson -Arguments @("project", "list", "--owner", $Owner, "--format", "json")
  if (-not $result) {
    return $null
  }

  $projects = @()
  if ($result.PSObject.Properties.Name -contains "projects") {
    $projects = @($result.projects)
  } elseif ($result -is [System.Collections.IEnumerable] -and -not ($result -is [string])) {
    $projects = @($result)
  }

  return $projects | Where-Object { $_.title -eq $Title } | Select-Object -First 1
}

function Get-ProjectViewData {
  param(
    [Parameter(Mandatory = $true)]
    [string]$Owner,
    [Parameter(Mandatory = $true)]
    [int]$ProjectNumber
  )

  return Invoke-GhJson -Arguments @("project", "view", "$ProjectNumber", "--owner", $Owner, "--format", "json")
}

function Get-ProjectFields {
  param(
    [Parameter(Mandatory = $true)]
    [string]$Owner,
    [Parameter(Mandatory = $true)]
    [int]$ProjectNumber
  )

  $result = Invoke-GhJson -Arguments @("project", "field-list", "$ProjectNumber", "--owner", $Owner, "--limit", "100", "--format", "json")
  if (-not $result) {
    return @()
  }

  if ($result.PSObject.Properties.Name -contains "fields") {
    return @($result.fields)
  }

  return @($result)
}

function Get-ProjectFieldByName {
  param(
    [Parameter(Mandatory = $true)]
    [object[]]$Fields,
    [Parameter(Mandatory = $true)]
    [string]$Name
  )

  return $Fields | Where-Object { $_.name -eq $Name } | Select-Object -First 1
}

function Get-SingleSelectOptionId {
  param(
    [Parameter(Mandatory = $true)]
    [object]$Field,
    [Parameter(Mandatory = $true)]
    [string]$OptionName
  )

  $options = @($Field.options)
  $match = $options | Where-Object { $_.name -eq $OptionName } | Select-Object -First 1
  if (-not $match) {
    throw "Project field '$($Field.name)' does not contain option '$OptionName'."
  }

  return $match.id
}

function Ensure-GitHubLabel {
  param(
    [Parameter(Mandatory = $true)]
    [string]$Repo,
    [Parameter(Mandatory = $true)]
    [string]$Name,
    [Parameter(Mandatory = $true)]
    [string]$Color,
    [Parameter(Mandatory = $true)]
    [string]$Description
  )

  Invoke-GhText -Arguments @(
    "label", "create", $Name,
    "--repo", $Repo,
    "--color", $Color,
    "--description", $Description,
    "--force"
  ) | Out-Null
}

function Resolve-ProjectItemIdFromIssueUrl {
  param(
    [Parameter(Mandatory = $true)]
    [string]$Owner,
    [Parameter(Mandatory = $true)]
    [int]$ProjectNumber,
    [Parameter(Mandatory = $true)]
    [string]$IssueUrl
  )

  $result = Invoke-GhJson -Arguments @("project", "item-list", "$ProjectNumber", "--owner", $Owner, "--limit", "200", "--format", "json")
  $items = @()
  if ($result) {
    if ($result.PSObject.Properties.Name -contains "items") {
      $items = @($result.items)
    } else {
      $items = @($result)
    }
  }

  foreach ($item in $items) {
    if ($item.content -and $item.content.url -eq $IssueUrl) {
      return $item.id
    }
  }

  return $null
}

function Set-ProjectSingleSelectValue {
  param(
    [Parameter(Mandatory = $true)]
    [string]$Owner,
    [Parameter(Mandatory = $true)]
    [int]$ProjectNumber,
    [Parameter(Mandatory = $true)]
    [string]$ProjectId,
    [Parameter(Mandatory = $true)]
    [string]$ItemId,
    [Parameter(Mandatory = $true)]
    [object[]]$Fields,
    [Parameter(Mandatory = $true)]
    [string]$FieldName,
    [Parameter(Mandatory = $true)]
    [string]$OptionName
  )

  $field = Get-ProjectFieldByName -Fields $Fields -Name $FieldName
  if (-not $field) {
    throw "Project field '$FieldName' was not found."
  }

  $optionId = Get-SingleSelectOptionId -Field $field -OptionName $OptionName
  Invoke-GhText -Arguments @(
    "project", "item-edit",
    "--id", $ItemId,
    "--project-id", $ProjectId,
    "--field-id", $field.id,
    "--single-select-option-id", $optionId
  ) | Out-Null
}
