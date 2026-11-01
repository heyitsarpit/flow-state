---
name: reflect
description: >-
  Review the active session through Judgment, Tooling, and Divergent lenses. Surface durable
  lessons and propose targeted existing-skill edits or structural enforcement. Use when the
  user says "reflect", or requests lessons from meaningful work or corrections.
metadata:
  kind: procedure
---

# Reflect

Review durable session lessons and propose skill edits or structural enforcement.

## When to invoke

Invoke when the user says "reflect" or requests a retrospective on meaningful work.
Skip trivial, off-topic, or already-covered conversations where the agent followed the guidance.
One-offs are not learnings.

## Process

### 1. Locate the active transcript

Use the supplied target session identity, transcript, or digest; verify that identity.
For direct invocation, use the active session. Read through the available history interface or
supplied transcript location. Do not search unrelated projects' chats.
If the active transcript is unavailable, pass a tight session digest with decisions, corrections,
tool evidence, and source locations. Mark missing evidence; do not reconstruct tool use from memory.

For material project-record gaps or contract findings, use keep-intent-aligned (Use the
`keep-intent-aligned` skill) to identify the affected record.
Only reusable working-method lessons become skill proposals.

### 2. Review through three lenses

Spawn three independent read-only reviewers with the transcript and referenced local context.

| Lens      | Prompt template                                           |
|-----------|-----------------------------------------------------------|
| Judgment  | [judgment-reviewer.md](references/judgment-reviewer.md)   |
| Tooling   | [tooling-reviewer.md](references/tooling-reviewer.md)     |
| Divergent | [divergent-reviewer.md](references/divergent-reviewer.md) |

Pass each template verbatim, substituting the transcript path or digest where marked.
Reviewers return findings; they do not apply them.

### 3. Synthesize

For substantive learning proposals, pass the evidence, attempted approach, correction, and scope
to
derive-guidance (Use the `derive-guidance` skill). It identifies the thinking gap and
proposes
guidance.

Give one synthesizer [synthesizer.md](references/synthesizer.md), the full reviewer outputs,
any derived guidance, and read access needed to spot-check citations and target skills.
It returns Accepted / Rejected / Backlog.
Project findings in Backlog name the affected record and unresolved implication, without being
treated as accepted skill edits or automatically written to that record.

### 4. Check structural enforcement

Assess Accepted. Move an item to Backlog when a lint, script, flag,
or runtime check would enforce it more reliably. Use encode-lessons-in-structure (Use the
`encode-lessons-in-structure` skill).

### 5. Apply approved changes

Before applying Accepted edits, present the full Accepted / Rejected / Backlog output and wait
for explicit approval unless the user already authorized those concrete changes.
The user picks the subset and may redirect routing. Do not auto-apply retrospective proposals.
Keep Backlog in the response; file it only when the user authorizes a destination.
Use the `writing` skill before composing or adapting approved skill prose edits.
Follow the item's Routing:

- **Trivial existing-skill edit:** tighten the sentence or correct the
  stale fact.
- **Substantive existing-skill edit:** apply the approved model and evidence in the owning package.
- **`tune routing: <skill path>`:** improve its description or the invoking procedure's routing.
  Preserve explicit-only invocation policy; a missed call does not authorize automatic loading.
- **`new skill: <kebab-name>`:** use the approved model, trigger, and rationale.

Run the environment's skill validator on every touched skill when available.
Check references and invocation policy; behavioral changes need a realistic case, not just
frontmatter validation.

### 6. Report

Short list, no preamble:

- Edits applied: skill path and what changed, one line each.
- New skills created: skill path, one line each (rare).
- Backlog: suggested mechanisms, distinguishing proposals from any authorized filed items.
- Dropped: each rejected finding and the synthesizer's reason.
- Verification: checks performed and their limits.
