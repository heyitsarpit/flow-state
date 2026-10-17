---
name: workflow-configuration
description: Read recorded project tools and model preferences when a method needs configured commands or delegation settings.
metadata:
  kind: procedure
---

# Workflow configuration

Return the recorded settings needed for the current assignment. Keep this lookup read-only.
Read [project tools](references/tools.md) for CLI, lint, and formatter commands.
Read [agent preferences](references/agents.md) for role/model/effort assignments.
Distinguish recorded settings from unconfigured prerequisites. Return only relevant entries.
Report missing settings; recommend setup-workflow without starting setup or installing tooling.
Project setup owns changes to these installed records.
