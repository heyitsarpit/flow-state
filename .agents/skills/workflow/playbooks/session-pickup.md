# Session pickup

Own this slice as `agent:workflow-coordinator`; Workflow owns the human conversation.
Apply [coordination-policy](../../coordination-policy/SKILL.md) to actual worker dispatch, bounded
methods, independent gates, repair routing, and stop/checkpoint handback.

Recover prior intent, reconcile live state and evidence, then resume the first incomplete gate.
Use when relevant prior state is missing from the conversation.

1. `agent:source-investigator`: Use [recall](../../recall/SKILL.md) with the supplied trail,
   workspace-scoped history, or branch. Read recent state first, then decision anchors. Do not
   search unrelated private conversations.
2. `agent:acceptance-checker`: Compare intended and actual work: Git base/head, dirty files, Tasks,
   Specs, PRs, and running workers. Preserve prior decisions; verify consequential claims against
   the current artifact and conditions. Return missing history to the investigator; return
   stale proof to the coordinator for the relevant checker. Do not repair or restart work here.
3. `agent:acceptance-checker`: Separate complete, stale, pending, and unavailable evidence. State
   the first incomplete gate. Do not repeat valid reproduction or design merely to orient yourself.
4. `agent:workflow-coordinator`: Recover the current grant and stop boundary from the conversation.
   A briefing-only request returns a briefing. An authorized continuation resumes its matching
   playbook without another routine go.
5. `agent:workflow-coordinator`: Give replacements consolidated scope, constraints, and upstream
   findings. Never assume an old agent ID is still alive. The selected workflow owns all work after
   this handoff. Use its phases as the same playbook owner; do not add a manager for the handoff.

**Reply:** inherited state, what remains valid, resume gate, current revision, remaining choices.
