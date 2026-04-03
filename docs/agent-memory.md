# Agent Memory Workflow

This repository uses GitHub Issues as long-lived memory for coding agents and humans. The goal is simple: a task should be resumable after days or weeks without reconstructing context from chat history.

## Why this exists

The desktop viewer already has a long implementation trail:

- Electron to Tauri migration
- WebView2 crash investigation
- localhost streaming for large scene loading
- repeated UI/UX iterations
- versioned Windows releases

That context should live in GitHub, not only in terminal chat sessions.

## Core rule

Every meaningful task should have an Issue. Every substantial work session should leave a handoff comment or a dedicated handoff issue.

## Issue types

- `Feature`: user-facing or engineering change with acceptance criteria
- `Bug`: broken behavior with repro steps and evidence
- `Research`: investigation before implementation
- `Session handoff`: a recovery point for the next session

## What every issue should contain

At minimum:

- problem statement
- expected outcome
- implementation notes
- affected files or modules
- validation plan
- running memory in comments

For performance or stability tasks also include:

- repro scene or test asset
- measured timings
- crash evidence or dump path
- release version

## Project board model

Recommended project title:

`SuperSplat Desktop Viewer Workspace`

Recommended custom fields:

- `Status`: Backlog, Ready, In Progress, Blocked, Done
- `Type`: Feature, Bug, Research, Release
- `Priority`: High, Medium, Low
- `Area`: UI, Viewer Runtime, Performance, File Loading, Packaging, Release
- `Version`: 0.1.x, 0.2.x, Backlog
- `Agent State`: Human, Agent-ready, Waiting for review, Waiting for repro

Recommended views:

- `Current`: Status is Ready, In Progress, or Blocked
- `UI / UX`: Area = UI
- `Performance`: Area = Performance or File Loading
- `Release`: Type = Release
- `Agent-ready`: Agent State = Agent-ready

## Session handoff protocol

At the end of a meaningful session, add a comment to the related issue with:

1. completed work
2. current state
3. next step
4. validation already done
5. blockers or risks
6. links to commits, releases, or dumps

The next session should begin by reading that issue before changing code.

## Local helper scripts

This repository includes PowerShell helpers in `scripts/`:

- `gh-project-bootstrap.ps1`
  Ensures labels, creates or reuses the GitHub Project, links the repository, and creates the recommended custom fields.
- `gh-start-task.ps1`
  Creates a structured issue and optionally adds it to the GitHub Project with field values.
- `gh-handoff.ps1`
  Writes a handoff comment to an existing issue and can update project status.

## Required GitHub auth

Project commands require extra GitHub CLI scope:

```powershell
gh auth refresh -h github.com -s project
```

Without that scope, labels and issues can still be managed, but project creation and field updates will fail.

## Suggested working pattern

1. Create or pick an issue.
2. Add it to the Project.
3. Set `Status=In Progress` and `Agent State=Human` or `Agent-ready`.
4. Do the work.
5. Leave a handoff comment before ending the session.
6. Move to `Done` only when the repo state and release state match reality.
