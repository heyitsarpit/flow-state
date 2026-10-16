---
name: automate-me
description: >-
  Create or update a personal mode skill from explicit preferences and recurring conventions.
  Use for "automate me", "capture my working style", or creating or refreshing a personal mode.
disable-model-invocation: true
metadata:
  kind: procedure
---

# Automate Me

Turn the user's working preferences into one concise mode skill. Update an existing mode before
creating another. Preserve project contracts and the user's control over scope.

## Procedure

1. **Choose the target.** Inspect established skill locations for the requested personal mode.
   Read its SKILL.md and invocation settings. Name the files to create or edit.
   For a new mode, resolve its name and destination from the request or supported harness location.
   Ask for missing choices; do not invent a personal identifier or installation path.
2. **Gather preferences.** Read explicit requests and corrections before mining history.
   Name the workspace, history source, and time window. For updates, inspect history since the last
   known mode edit; otherwise use the last two weeks unless the user specifies another window.
   Use the active workspace unless the user requests a broader scope.
   Search only that scope using the available history interface or supplied transcripts.
   For large histories, search disjoint slices and retain evidence pointers and uncertainty.
   If history is unavailable, use supplied preferences and report the gap.
3. **Separate intent from inference.** Group relevant findings: response style, delegation,
   verification, code/prose conventions, or delivery. Include only categories with actual rules.
   Keep explicit preferences. Treat inferred patterns as proposals; require independent occurrences
   across at least two conversations. Do not promote an isolated incident into a standing rule.
   Ask one round about unresolved preferences or contradictions. Reuse answers already given.
   Confirm inferred preferences with the user before adding them as rules.
4. **Write the mode.** State concrete actions and conditions.
   Write the chosen mode's SKILL.md and supported invocation settings. Edit only the named files.
   Preserve rules the user has not changed.
   Link procedures by path instead of copying them. Keep transcript details out of the mode;
   put evidence pointers in the review summary. Do not copy another person's preferences.
   Trigger on the mode name or a request to work in that style, not generic engineering tasks.
   Use supported frontmatter. Keep invocation explicit unless the user requests otherwise.
5. **Validate and return.** Check frontmatter, local links, invocation settings, and placeholders.
   Return file paths, changed preferences, evidence pointers, unresolved choices, and the draft.
   Revise from user feedback. Distinguish a saved file from verified loading in the target harness.

For model-setting changes, use [setup-workflow](../setup-workflow/SKILL.md) only when requested.
For an engineering lesson needing a new mental model, use
[derive-guidance](../derive-guidance/SKILL.md).
This procedure captures personal conventions; it does not diagnose a missing engineering principle.
