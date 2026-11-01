# Authoring a skill

Own this slice as `agent:workflow-coordinator`; Workflow owns the human conversation. Use the
`coordination-policy` skill for actual worker dispatch, bounded
methods, independent gates, repair routing, and stop/checkpoint handback.

For learning without a clear model, assign `agent:learning-analyst` to derive-guidance (Use the
`derive-guidance` skill) first. For requested retrospectives, the same
coordinator runs
reflect (Use the `reflect` skill) with its conditional phase owners.

1. `agent:skill-author`: Read the requested purpose, existing package, suite conventions, and
   relevant owners. State trigger, intended reader, established inputs, permitted writes, output,
   and completion proof. Use the `coordination-policy` skill for multi-role handoffs.
   Obvious conversational readers need no owner table or additional hierarchy.
   Extend an existing owner when it already covers the method.
2. `agent:skill-author`: Use the `writing` skill. Lead with prescriptions. Name
   actual paths and supported commands. Invoke each required skill by registered name at its
   trigger, including what to apply or return. Link the skill's own references where needed.
   Inline short instructions; keep substantial conditional or role-specific detail in references. Keep agent names and staffing in playbooks; skills define
   reusable methods. Move bootstrap and unresolved authority to their upstream owner before
   shortening leaves. Preserve local operational invariants and direct-entry prerequisites.
3. `agent:skill-author`: Align with keep-intent-aligned (Use the `keep-intent-aligned` skill) and
   encode-lessons-in-structure (Use the `encode-lessons-in-structure` skill). Resolve competing
   rules with their owner. Keep proposal, accepted guidance, and structural enforcement distinct.
4. `agent:skill-author`: Write the agreed package at its supplied or established location. Preserve
   unrelated metadata. Follow the suite's kind and invocation conventions; do not invent a platform
   configuration format.
5. `agent:acceptance-checker`: Check frontmatter, name, links, policy, and the full diff. Run the
   available validator and every new executable helper. Return needed behavioral trials to the
   coordinator for [Eval](eval.md). Return defects to the skill author; check corrected packages
   within budget. Preserve required behavior checks as open until exercised.
6. `agent:workflow-coordinator`: Return files, snapshot, verdicts, and evidence. Give the delivery
   operator applicable [Opening a PR](opening-a-pr.md) steps only when publication is granted;
   structural validity alone proves no behavior.

**Reply:** package, decision-changing prescriptions, reused owners, validation, and behavior limits.
