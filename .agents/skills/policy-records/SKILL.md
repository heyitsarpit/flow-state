---
name: policy-records
description: >-
  What each workflow record is for and what belongs in it. The Plan is the project's
  Architecture Decision Record (ADR); Specs hold behavioral contracts; Epics hold large work, its
  loop and its notes; Tasks hold bounded work and evidence; exploration documents hold working
  material with no authority. Owns the decision convention for agents' and the user's decisions.
  Apply whenever you create or change a record, or when a finding changes recorded intent.
metadata:
  kind: policy
  applies: [policy-writing]
---

# Records

Records are what survives the session. Use the table below to choose where a decision, contract,
finding, or draft belongs. They are not a memory dump or a transcript.

| Record | It is | Lifetime | Written by |
|---|---|---|---|
| Plan | The project's ADR | The project | `to-plan` |
| Spec | A behavioral contract | The module | `to-spec` |
| Epic | A large piece of work: its contract, its phases and Tasks, its loop, its notes | Until closed | skill:to-epic, skill:to-loop |
| Task | A unit of work and its evidence | Until done | `to-task` |
| Exploration | Working material, no authority | Until adopted or dropped | Its author |

- **Plan:** context, outcomes, decisions with their reasons, verification, constraints, questions.
- **Spec:** requirements, invariants, and test obligations.
- **Epic:** its contract (goal, stages and gates, scope, authority, budget, glossary), written by
  skill:to-epic; its phases, one file each; its loop fields (`skill`, `run`, `instructions`,
  `cadence`, `stops`), written by skill:to-loop; and its notes. Notes are append-only history:
  approvals, rulings, decisions, stops and events. A correction is a new note linking the old one.
- **Task:** scope, acceptance criteria, findings, and evidence. `to-task` creates Tasks; the
  procedure doing the work (`execute-task`, `hillclimb`) updates them.
- **Exploration:** options, research, drafts, and worked examples.

`workflow-cli` supplies file mechanics; it does not choose what to record.

## The Plan is the ADR

A Plan and an Architecture Decision Record are the same thing. The Plan is where the project's
architecture decisions live, for the whole life of the project, so that someone joining later can
learn what was decided, why, and what it costs. There is no separate ADR file.

Its parts map to an ADR:

| ADR part | Plan field |
|---|---|
| Context | `goal`: the problem, the consumer, and why the work matters |
| Decision | each `decisions` entry's title: the choice, stated as a fact |
| Rationale | the entry's body: why this choice wins |
| Consequences | the entry's body: what it commits the project to, what it costs |
| Alternatives | the entry's body: what was rejected and why |
| Status | proposed (an open question, or an agent's decision with `User's read: pending`), accepted, or superseded |

Every accepted decision says **what** was chosen and **why**. Add consequences and rejected
alternatives when they would change how someone reads or revisits the decision. A decision with
only a title is incomplete. Outcomes say what must work; Verification says how to show it works.

A Plan reads as the current state of the project's decisions. It is never a log of the discussion
that produced them: no "User answer, round N", no "working record of the discussion", no
chronology. Record the reasons the discussion surfaced, then let the discussion go.

## Exploration documents

Explorations (options, comparisons, drafts, worked examples) live under the Plan's `references/`
or `explorations/` folder. They have no authority on their own.

- Start each with a status line: what it is, and whether it is current, adopted, or superseded.
- Adopting an exploration means moving its decisions into the Plan and its contracts into Specs.
  After that, the record is the authority; the exploration is supporting material.
- Never let a long Markdown file quietly become the contract. If behavior must hold, it belongs
  in a Spec.

## Decisions and settled intent

Every recorded decision names who made it, in one convention:

```text
Decision (<agent|user>, <date>): <the decision>. Why: <reason and evidence>.
Reverse: <how to undo it>. User's read: <pending | done>.
```

- **A user's decision** quotes the user's words and needs no `Why`, `Reverse` or `User's read`.
- **An agent's decision** has all four parts. Use it when coding, review, or exploration leads an
  agent to change recorded intent: a Spec guarantee, especially an invariant, and the rarer change
  to Plan direction or decisions. Routine Spec details that elaborate an accepted guarantee, and
  ordinary Task edits, need none; a new guarantee or changed acceptance criteria do.
- **Where it goes:** next to the text it governs in the record, or in an Epic note that links that
  text. For example, an Epic note:

```text
note 2026-11-09T04:02:00Z
    Decision (agent, 2026-11-09): retry idempotent GET requests only (@task.<EPIC>.T7).
    Why: retrying a POST can charge twice; evidence in the Task's comments.
    Reverse: retry every request again, and drop the idempotency check.
    User's read: pending.
```

- The convention separates an agent's decisions from the user's at a glance. Never credit the user
  with an agent's decision.
- Work may continue within agreed intent while a decision is pending the user's read.
- A pending decision does not override explicit human commitments, and later agents must not treat
  it as approved.
- When the user reads it, set `User's read: done`, or replace it with the user's own decision.
  Choices the user has not decided stay as questions, not as decisions.

## Reconcile records

Apply when a finding changes a consequential commitment, exposes a conflict, invalidates
relied-on evidence, or leaves material work unresolved for the next coworker. Routine activity and
direct explanations do not need recording merely because they occurred.

1. **Read the relevant commitments and prior evidence.** Verify material historical claims against
   current code and conditions; records may be stale or incomplete.
2. **Compare before recording.** Separate an implementation defect from a missing contract, stale
   mechanism, or changed decision. Separate facts, hypotheses, proposals, and agreed changes.
   Surface conflicts; changes to agreed outcomes, guarantees, or acceptance criteria need the user's
   decision.
3. **Route each change to its owner.** Use the table above, preserve stable IDs, and reference
   commitments rather than copying them. The procedure that owns the record reconciles findings
   (`to-plan`, `to-spec`, `to-task`, or the procedure doing the work), within your assigned scope.
   If several agents must edit the same record, have them write one at a time.
4. **Keep the useful remainder.** Record only material reasoning, evidence and its limits, or open
   work that belongs in that record. Preserve reasons for reversals and invalidate affected
   evidence. Do not repeat the conversation, routine steps, or another record's contents.

A root cause is evidence, not automatically an invariant. If code violates an existing guarantee,
repair enforcement. If a consequential guarantee is missing, propose the property and its
authority through `to-spec`. Updating a mechanism never authorizes weakening the guarantee.

Missing records do not force the full workflow for a small repair or direct explanation. Surface
material findings when record edits are outside your assignment. Project findings stay in project
records; only reusable working-method lessons go to `reflect`.
