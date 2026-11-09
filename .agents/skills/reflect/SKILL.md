---
name: reflect
description: >-
  Turn a session's lessons into durable improvements: review the work through judgment, tooling,
  divergent, and preferences lenses, find the missing understanding behind each lesson, and route
  it to a skill edit, a check, a project record, or the user's standing preferences. Use when the
  user says "reflect", asks for a retrospective, or wants their working style captured.
metadata:
  kind: procedure
  applies:
    - principle-enforce-with-structure
    - principle-claim-only-what-you-checked
    - policy-records
    - policy-writing
---

# Reflect

Review meaningful work, find what was missing in the thinking, and propose where each lesson
should live. Nothing is applied without the user's approval.

Skip trivial, off-topic, or already-covered sessions where the agent followed the guidance.
An inferred pattern seen once is not a lesson; an explicit correction from the user can be.

## 1. Gather the evidence

Use the supplied session identity, transcript, or digest, and verify that identity. For direct
invocation, use the current session, as the harness's history interface exposes it. Read through the
available history interface or the supplied location. Do not search unrelated projects' chats. If
the transcript is unavailable, use a tight digest of decisions, corrections, tool evidence, and
source locations. Mark missing evidence; do not reconstruct tool use from memory.

For the preferences lens, also read the user's history in the active workspace: since the last edit
of their preferences when updating, otherwise the last two weeks, unless the user names another
window or a broader scope. If history is unavailable, use the preferences the user supplied and
report the gap. For large histories, search disjoint slices and keep evidence pointers and
uncertainty.

## 2. Review through four lenses

Spawn independent read-only reviewers with the transcript and referenced local context. Pass each
template verbatim, substituting the transcript path or digest where marked. Reviewers return
findings; they do not apply them.

| Lens | Looks for | Prompt template |
|---|---|---|
| Judgment | Decisions that went wrong or right, and why | [judgment-reviewer.md](references/judgment-reviewer.md) |
| Tooling | Tools, scripts, and checks that were missing or misused | [tooling-reviewer.md](references/tooling-reviewer.md) |
| Divergent | Approaches nobody considered | [divergent-reviewer.md](references/divergent-reviewer.md) |
| Preferences | The user's standing working preferences | [preferences-reviewer.md](references/preferences-reviewer.md) |

Run the preferences lens only when the user asks to capture their working style, or when the
session contains explicit corrections about how to work.

## 3. Find the missing understanding

For each substantive lesson, read the evidence, attempted approach, and correction. Then:

1. **Name the gap.** State the mistaken assumption or missing relationship that led to the failure.
   Check existing guidance: was understanding missing, or was a clear instruction not followed?
   If the guidance was sufficient, explain the application failure instead of adding a rule.
2. **Explain the misunderstanding.** Explain how the parts relate and why the old approach failed.
   Explain how this understanding changes the next decision, including when it does not apply. Test
   it against the original failure and a different case; expose unsupported generalizations.
3. **State the proposal.** Make the prescription explicit, simple, and short. Name its owner and
   trigger. For a procedure, name its inputs, permitted writes, output locations, actions, and
   completion criteria. Resolve paths and commands from project files; report missing
   prerequisites instead of inventing them. Return the gap, the corrected model, the evidence, and
   the proposal. Keep the proposal distinct from an accepted rule.

## 4. Route each lesson

| Kind of lesson | Where it goes |
|---|---|
| A fact or decision about this project | The owning Plan, Spec, or Task, under `policy-records` |
| A standing preference of the user | The ambient block in the project's AGENTS.md or CLAUDE.md |
| A gap in a method | An edit to the package that owns that method |
| A recurring mistake a tool could catch | A type, lint, script, or check (`principle-enforce-with-structure`) |
| A new reusable principle or policy | A new `principle-*` or `policy-*` package |

Prefer structural enforcement for recurring rules; keep prose for judgment. Improve an existing
owner when it already covers the model. Resolve conflicting rules explicitly.

For preferences, keep explicit preferences as stated. Treat inferred patterns as proposals that need
independent occurrences in at least two conversations. Never promote an isolated incident into a
standing rule. Ask one round about unresolved or contradictory preferences, reusing answers already
given, and confirm inferred ones before adding them. Do not copy another person's preferences.

Then start one synthesizer with [synthesizer.md](references/synthesizer.md). Fill in all four
reviewer outputs (write "not run" for a lens you skipped), add the derived proposals, and give it
read access so it can spot-check citations and target packages. It returns Accepted, Rejected, and
Backlog. If the synthesizer accepted something a check would enforce more reliably than prose, move
it to Backlog yourself. Project findings in Backlog name the affected record and the open
implication; they are not written to that record automatically.

## 5. Apply approved changes

Present the full Accepted, Rejected, and Backlog output and wait for explicit approval, unless the
user already authorized those concrete changes. The user picks the subset and may redirect
routing. Keep Backlog in the response; file it only where the user authorizes.

Apply approved items under `policy-writing`:

- **Trivial edit:** tighten the sentence or correct the stale fact.
- **Substantive edit:** apply the approved model and evidence in the owning package.
- **Routing fix:** improve a description or the playbook that should have used the package.
- **New package:** use the approved model, trigger, and rationale.
- **Preference:** edit only the named ambient block; preserve rules the user has not changed;
  keep transcript details out and put evidence pointers in the summary.

Run the library's validator on every touched package: frontmatter, links, declared dependencies, and
invocation policy. A saved file is not verified loading in the target harness. Behavioral changes
need a realistic trial through `eval`, not only frontmatter validation.

## 6. Report

Short list, no preamble:

- Edits applied: path and what changed, one line each.
- New packages: path, one line each (rare).
- Backlog: suggested mechanisms, separating proposals from authorized filed items.
- Dropped: each rejected finding and the synthesizer's reason.
- Verification: checks performed and their limits.
