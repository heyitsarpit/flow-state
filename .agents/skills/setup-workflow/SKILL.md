---
name: setup-workflow
description: >-
  Configure this repository's installed workflow suite. Establish project intent, confirm model
  preferences, and record available CLI, lint, and formatter commands. Use for initial setup or
  configuration changes.
metadata:
  kind: procedure
---

# Setup workflow

Configure the installed suite for this project. Reuse defaults and keep setup a short conversation.
For a graph-only assignment, read [graph design](references/agent-graph.md) and return the graph.
Do not run configuration setup for that assignment.

## 1. Start with intent

Reuse the request and conversation. If the project's purpose is unclear, ask:
"What are you building here, and do you have a preferred stack?"
Wait for the answer before searching for tools or writing files.
The user describes the outcome; infer technical scope.

## 2. Read existing setup

Identify the project root, harness, and installed suite. Read project instructions, package scripts,
and existing model/lint settings. Stay within the repository unless the user supplies an external
path. Record the absolute root; confirm the working directory before any writes.
Do not audit every installed skill or search neighboring projects for missing tools.

## 3. Confirm model preferences

Use the `workflow-configuration` skill for existing choices and routing defaults. Keep
existing choices. Offer different models or reasoning effort when the user wants a change; show only
changed choices.
Validate unique model/effort choices against the session's advertised options. Ask about unavailable
choices instead of searching the filesystem. Apply confirmed changes to the installed routing table.
Keep the current root's model. Preserve names, invocation policies, and unrelated settings.

## 4. Record project tools

Recommend lint and formatter commands from project scripts or the chosen stack; let the user
confirm.
Infer file scope. Record commands, working directories, file scopes, and write/check behavior
in the installed workflow-configuration skill's `references/tools.md`. Leave missing tools
unconfigured.
Record confirmed model preferences in its `references/agents.md`.
Setup owns these configuration writes; consumers invoke workflow-configuration for lookup.
Install only requested tooling; setup does not start application implementation.

Find the workflow CLI through PATH or project instructions. If found, run `--help` and record its
invocation in the installed workflow-configuration skill's `references/tools.md`.
Query records only when project-owned workflow records exist.
Run global validation on those records.
Rebuild a stale index with the established CLI, then recheck; return other unresolved diagnostics.
Report missing tools; do not expand setup into an unrelated repository investigation.

## 5. Return and stop

Return changed settings, configuration locations, available commands, and missing prerequisites.
Name one next action, then stop. Setup does not select a task, launch workers, or generate a graph.
Use [graph design](references/agent-graph.md) only for an explicit graph request or a complex
program.
