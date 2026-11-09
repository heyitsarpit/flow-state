---
name: to-plan
description: >-
  Record and maintain the project's Plans, which are its Architecture Decision Record (ADR): put
  outcomes, decisions with their reasons, constraints, verification targets, and open questions
  in the Plan that owns them, and catch conflicts before writing. Use when understanding settles
  and needs recording; it does not run an interview.
metadata:
  kind: procedure
  applies:
    - policy-writing
    - policy-records
---

# To Plan

A Plan is the project's Architecture Decision Record (`policy-records`). It keeps what was
decided, why, what it commits the project to, and what was rejected, for the life of the project.
Write what a reader needs a year from now, not what happened in this session.

Use this skill to record understanding once it has settled. It does not run an interview and it
never invents answers: when something is still open, it becomes a question in the Plan. Work from
the project root, and use `workflow --help` when the CLI syntax is unfamiliar.

## Before you start

Look in `workflow/plans/` and at `workflow/spec.index`. If either is missing, run `workflow init`.
Then read the existing Plans, because most changes belong in one of them.

## Steps

1. **Find the owning Plan.** Update the Plan whose goal and scope cover the change. Create a new
   Plan only for a distinct scope that is useful on its own. A change can touch several Plans, but
   do not invent a hierarchy between them. If no goal is known yet, say so instead of making one up.

2. **Check for conflicts before writing.** Compare what you are about to record with the goals,
   outcomes, decisions, and constraints of every Plan it touches. Compare meaning, not just words or
   IDs. If something contradicts an existing commitment, show the user the existing statement, where
   it lives, and the conflicting proposal. Do not record the proposal as settled or overwrite the
   commitment; if it should be kept, record it as a question in the owning Plan, and carry on with
   unrelated settled material. If the user has already resolved the conflict explicitly, apply that
   resolution without asking again. Fix the replaced decision and every reference to it in the same
   edit; if some references are outside your write scope, report their locations and keep the
   conflict open until they are fixed.

3. **Write decisions as ADR entries.** The title states the choice as a fact. The description gives
   the reason it wins, then the consequences and the rejected alternatives when a future reader
   would need them. A settled decision without a reason is incomplete: ask for the reason, or record
   a question instead. Write it under `policy-writing`, which keeps session history out of the
   record. In the description, say who decided, in the decision lead-in:

   ```text
   Decision (agent|user, <date>): <the choice>.
   Why: <the reason it wins>.
   Reverse: <what undoing it would take>.
   User's read: pending|done.
   ```

   A user decision quotes the user's words and needs no `User's read:` line. An agent decision
   gives `Why:`, `Reverse:` and `User's read: pending` until the user has read it; then `done`.
   Never credit the user with a decision an agent made. `workflow status` lists the pending ones;
   nothing checks the shape, so write it exactly.

4. **Define how each outcome will be checked.** Give each Verification entry a reference to the
   outcome it covers, the scenarios, the pass condition, and links to the executable checks. Define
   the expected result independently of the implementation, and keep missing or pending checks
   visible. Together, the entries must cover each outcome's full scope; say where gaps remain. A
   decision explains an approach; it does not show the outcome works. Record actual runs and their
   conditions in the Task, not in the Plan's status.

5. **Say each shared decision once.** A decision that affects several Plans lives in the Plan that
   owns it. Other Plans link to it, for example `@plan.Other.D3`, and note only what it means for
   them. Tell the user which Plan you changed, and ask before writing when you are unsure whether a
   change alters scope, ownership, or an agreed commitment.

6. **Save and validate.** Run `workflow format PATH --write` for each changed Plan, using its real
   path, then `workflow check`, and read the diff.

## The format

Plans live at `workflow/plans/<id>.plan` and start with `plan <id>`. `title` and an indented,
non-empty `goal` are required; `status` is optional free text. Use a valid existing Plan or the
syntax reference in `workflow-cli` when unsure.

| Field | Holds |
|---|---|
| `goal` | The objective, the underlying problem, and its context |
| `outcomes` (`O1`…) | What must work for the consumer |
| `decisions` (`D1`…) | The chosen approach, its reason, consequences, alternatives |
| `verification` (`V1`…) | Observable pass conditions for outcomes |
| `constraints` (`C1`…) | Binding limits, invariants, and commitments |
| `questions` (`Q1`…) | Unresolved choices and unknowns |

Each object has a title and an optional indented description. Scenarios, sources, notes, and
tables go in those descriptions. Keep facts, assumptions, proposals, and agreed decisions
distinguishable. Use only the supported format: no new schema fields and no Plan lifecycle of
your own.

Cite objects in the same Plan as `@D3` or `@V1`, and in another Plan as `@plan.Other.V1`, and
check the cited object exists. Prose citations are not enforced links. Tasks reach into Plans
through `derives_from` (which may cite Verification entries) and `satisfies` (which cites
Outcomes); Plans have no relationship fields pointing at Tasks or Specs; prose citations are fine.

## Example

```text
decisions
    D4  Retry limit applies per account
        A per-request limit lets one client bypass it by opening more requests; a per-account
        limit bounds total load from one customer. Consequence: the limit needs a shared
        counter keyed by account. Rejected: per-request limits, for the bypass above.
```

## Changing a Plan that already exists

- **Same thing, new wording:** update the passage in place. Keep IDs and unrelated content. A new
  concern gets a new object. Never renumber objects or turn a `Q` into a `D`.
- **Verification:** keep procedures and check links under the same ID while the target is the
  same. Routine changes to how a check runs need no approval; changing an agreed pass condition
  needs the user's agreement.
- **A question gets answered:** record the answer in the decision, outcome, constraint, or prose
  it belongs to; a factual answer does not need its own decision. Find every reference to the
  question across Plans, Specs, and Tasks and update it before removing the question. If some of
  those references are outside your scope, report where they are and keep the question until they
  are fixed.
- **A settled premise turns out wrong:** open a new question with a fresh ID that explains what
  changed. Keep the IDs that still hold.
- **A proposal is replaced before adoption:** replace it in place. Never present an
  implementation choice as something the user confirmed.
- **An agreed decision is reversed:** mark the old decision superseded and cite its replacement.
  Add the new decision with its predecessor and the reason, and update affected Plans. Keep enough
  context to explain the change, without a transcript or a separate decision log.

## What to return

The Plans you changed and where, unresolved conflicts, cross-Plan citations you checked, and the
validation result with its limits. Then stop.
