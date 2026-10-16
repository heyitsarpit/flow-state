# Opening a PR

Own this slice as `agent:workflow-coordinator`; Workflow owns the human conversation.
Apply [coordination-policy](../../coordination-policy/SKILL.md) to actual worker dispatch, bounded
methods, independent gates, repair routing, and stop/checkpoint handback.

Enter for a requested PR or a delivery program whose grant includes publication.

1. `agent:delivery-operator`: Resolve repository, forge, current branch/base, dirty work, and
   existing matching PRs. Use a supported built-in PR tool when its instructions require it; keep
   one adapter for lifecycle operations. Preserve unrelated edits. Use an isolated checkout when the
   branch/scope requires it.
2. `agent:delivery-operator`: Inspect the complete diff and acceptance evidence. Create scoped,
   ordered commits within the grant. Verify required project checks at the actual submitted
   revision; disclose failed or unrun gates.
   Return product failures and missing required proof to the coordinator for the assigned executor
   or checker. Do not repair code while preparing delivery. Refresh evidence after patch/base edits.
3. `agent:delivery-operator`: For a stack, target the actual parent branch. Verify the child
   includes its parent's exact current tip before publishing the dependency diff. Root changes
   target the intended trunk.
4. `agent:delivery-operator`: Apply [writing](../../writing/SKILL.md). Brief the problem, resulting
   behavior, scope, material risks/tradeoffs, and actual verification. Use the repository template
   and requested title style. Link detailed evidence instead of making the description a lab
   notebook.
5. `agent:delivery-operator`: Create or update the PR in the requested draft/ready state. Read back
   URL, base, head, and state. After an ambiguous write, reconcile the matching target before
   retrying; reuse an existing PR. Repeat only when no write occurred or documented idempotency
   makes repetition safe.
6. `agent:delivery-operator`: Register the PR with the harness when supported. Return its URL,
   submitted revision, and remaining gates. PR-only work stops here; opening a PR does not
   independently start a watcher or grant merging. For a draft that permits open gates, disclose
   them; do not label the change ready while required gates remain unmet.
7. `agent:workflow-coordinator`: A full-delivery owner continues to [Babysit](babysit.md) and
   [Shipping](shipping.md) under the existing ceiling. A stack owner follows its declared
   queue/frontier schedule.

**Reply:** verified PR URL/base/head/state, submitted checks, scope, and remaining delivery work.
