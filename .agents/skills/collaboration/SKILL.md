---
name: collaboration
description: >-
  How an agent works with the user while they are present: answer first and act on the user's go,
  put decisions to the user in numbered rounds with a recommendation, record only what the user
  confirms, and carry ideas from proposal to merged Plans, Specs and Tasks through wiki records
  with a lifecycle. The attended companion to build-a-loop. Use for any request in a project with
  a wiki, when shaping a feature, writing a proposal, putting a decision to the user, or recording
  a deferral or open question.
metadata:
  kind: procedure
  applies:
    - policy-authority
    - policy-records
    - policy-writing
    - principle-claim-only-what-you-checked
---

# Collaboration

skill:build-a-loop says how an orchestrator runs work while the user is away. This skill says how
an agent works with the user while they are present: what it does when asked for something, how
it puts decisions to the user and records them, and which records each step of feature work
leaves in `wiki/`. Both write the same records, in skill:policy-records's syntax: frontmatter for
a Markdown record's kind, name and status, and inline tags for decisions, deferrals and questions.

The rules below are defaults. A project's instruction file (`AGENTS.md`, `CLAUDE.md`) holds its
overrides, each with its source, and an override wins; see [Defaults and
overrides](#defaults-and-overrides).

## Terms

- **The user:** the person you work for in this session. Write "the user" in records, never a
  name or "the owner".
- **The frame:** what bounds the work: its scope, a Plan decision, a Spec guarantee, acceptance
  criteria, the authority, and a public API's names and concepts. Only the user changes it.
- **Round:** one message of numbered questions, each with options and a recommendation, answered
  by the user in the form `Q1 A`.
- **Proposal:** a Markdown record of kind `proposal` that puts one change to the user: options,
  before and after, a recommendation per item, and a status (skill:policy-records#markdown-records).
- **Item:** one tagged point in a record: a decision, a deferral or a question, addressed by its
  heading or bold lead term (skill:policy-records#tags).

## A request

Sort each message before acting on it. Answer what was asked first.

| The message is                          | Do                                                            | Write                                       |
|-----------------------------------------|---------------------------------------------------------------|---------------------------------------------|
| A question                              | Answer it; investigate facts yourself instead of asking       | Nothing, until the user says go             |
| An instruction inside the frame         | Do it                                                         | The records it changes                      |
| An instruction that changes the frame   | Restate it in one line, "I read this as: …", and wait for yes | Only after the yes                          |
| A decision (`Q2 B`, "yes", "go with A") | Record it, then apply it                                      | A `decided: user` tag with the user's words |
| A go                                    | Do the steps it names, through their endpoint                 | The records those steps change              |
| Stop, hold or pause                     | Stop at a safe point (skill:policy-delegation#pause)          | Where it stands and how to resume           |

- A readiness question ("is this ready?", "what do you think?") is a question, not a go.
- A request that names several steps covers them; never ask again for each
  (skill:policy-authority#carrying-authority).
- Work on one thing at a time. A new topic mid-task gets the current task's state in one line,
  then the new topic. Background work is reported once, when it finishes.
- Commits, pushes and anything outside the project need the user's explicit request
  (skill:policy-authority). "Commit first" means commit before changing anything.

## Who decides

- **Yours:** facts you can find, implementation details, and small public API changes (a flag, a
  default, a member name, where an option sits). Decide them by correctness, record each as an
  agent decision with `Why:` and `Reverse:`, and keep going.
- **The user's:** the frame, product options the records leave open, public entry-point names,
  new concepts, and large API changes: a change to how users structure their code, removing a
  feature, anything touching many call sites. When in doubt, it is the user's.
- **Never present as decided** what the user has not accepted. Everything else is tagged
  `proposed` or `open`, in chat as in records.
- **Reviewer findings are advice.** You hold the most context: verify each finding, then accept,
  change or reject it, with why.

Before editing, deleting or merging into a Plan, a Spec or the frame, list the change and wait for
the user's yes, unless an accepted proposal already names that change (see [Merge](#merge)).

## Decision rounds

Put every decision that is the user's in a round.

1. **Close what is open first.** Finish every open question of the current topic before a round on
   the next.
2. **About three questions, never more than five.** Ask only independent questions whose
   prerequisites are settled; a dependent question waits for the next round.
3. **Make each choice concrete.** Show the current behaviour and the proposed one as a complete
   before-and-after example in the real format: code for an API, a record for a decision. Write
   definitions, use sites and fragments in full, with no `…`. Mark every name: **new**,
   **renamed**, existing, or user-defined. Say what is added, what is dropped and what it costs.
   Start from where the data comes from.
4. **Recommend.** Put your recommendation first among the options and say why.
5. **Ask in chat and end the turn.** Do not act on a choice before the user answers it.
6. **Record only what the user confirms,** as a `decided: user` tag in the record the decision
   governs, followed by the chosen option's text; a reply in the user's own words is quoted as
   written. Question numbers label the round; they never appear in a record.

```markdown
**Q1. Where status lives** (affects every proposal)
- A. In the frontmatter, current status first (recommended): one place, read at a glance.
- B. In a Status line under the title: visible in rendered Markdown, but metadata in the body.
```

The user replies `Q1 A`. Settled questions that are worth keeping become `decided: user` tags; the
rest are dropped with the round.

## Proposals

Write a proposal when a change needs the user's decision and more than a few lines to show: a new
feature or concept, a change to a Plan, a Spec guarantee or an Epic's frame, or a redesign. A
single question goes in a round in chat instead.

### Write one

- **A new file for each idea:** `wiki/proposals/YYYY-MM-DD-<slug>.md` by default (records are
  found by name, so a project may use other folders), with frontmatter `proposal <name>` and
  `status draft <date>` (skill:policy-records#markdown-records). Never overwrite another proposal.
  A revision that replaces one is a new file with `supersedes @proposal.<old>`, and the old one
  stays as prior art until its successor is merged or rejected; a proposal that only extends
  another links it in its prose instead.
- **The bottom line first:** the verdict in one sentence, then what it produces.
- **One section per decision,** each with a complete before and after, and a tag on its bold lead
  term: `[proposed: agent <date>]` for your recommendation, `[decided: user <date>]` for what the
  user already settled, `[open: <date>; recommend A]` for a question still to ask.
- **A "Considered and dropped" section** with each rejected option and why, and a short
  **Risks** section.
- **Show it, and stop.** When it is ready, set `status proposed <date>`, give the user its path and
  what to check first, and wait. Proposals are not the place for unasked ideas: a new idea of
  your own goes in a new proposal, never into an accepted one.

[The templates](references/templates.md) give a proposal, a review, a question list and a revisit
file.

### Lifecycle

| Status       | Set by                      | When                                                        |
|--------------|-----------------------------|-------------------------------------------------------------|
| `draft`      | The author                  | While writing                                               |
| `proposed`   | The author                  | Ready for the user                                          |
| `accepted`   | The user                    | The user accepts the whole proposal                         |
| `partial`    | The user                    | The user accepts some items and rejects others, each tagged |
| `rejected`   | The user                    | The user rejects it                                         |
| `superseded` | The author of its successor | A newer proposal replaces it                                |
| `merged`     | The agent that merged it    | Its decisions are in Plans, Specs and Tasks                 |
| `withdrawn`  | The user                    | Dropped before a decision                                   |

On the user's ruling, retag every item: an accepted one `[decided: user <date>]`, a rejected one
`[rejected: user <date>]`. Then write `status accepted user <date>`, `status partial user <date>`
or `status rejected user <date>`, moving the old status down a line.

### Merge

An accepted proposal is merged into the records it changes, each through its owning skill:
decisions into the Plan (skill:to-plan), contracts into Specs (skill:to-spec, only for work
starting soon), work into Tasks (skill:to-task) or an Epic (skill:to-epic). The acceptance covers
every change the proposal names; anything it does not name is listed for the user first. Then set
`status merged <date> [<links>]`, linking each record it landed in. A merged or rejected proposal
is deleted once the records that absorbed it name the last commit holding it
(skill:policy-records#deleting-absorbed-records). With the user present, deleting it is the
user's call: list the files ready to delete and delete them on the user's yes.

### Reviews and question lists

A review (kind `review`) holds findings on one change; each finding is accepted, changed or
rejected with why, then fixed or turned into a Task, and the review is `resolved`. A question list
(kind `questions`) holds questions for the user or an advisor; each is tagged `open` with a
recommendation until answered.

## Deferrals and open questions

- **Defer where it arises.** Tag the item in the record it came from: `[deferred: user <date>]`
  with `Reopen if:` naming the evidence that would bring it back. An item with no home record goes
  in `wiki/revisit.md` (kind `revisit`).
- **Ask where it arises.** An open question is tagged `[open: <date>; recommend <answer>]` in the
  record it belongs to, and becomes `answered` when the user rules.
- **Find them with the CLI,** never with a hand-kept index: `wk list defer` and
  `wk list question --open`.

## Feature work, end to end

| Step                              | Skill                                                      | Record it leaves                                                   |
|-----------------------------------|------------------------------------------------------------|--------------------------------------------------------------------|
| An idea worth the user's decision | this skill                                                 | A proposal, `draft` then `proposed`                                |
| Reviews of the proposal           | skill:review, by skill:policy-delegation                   | A review record, or tagged items in the proposal                   |
| A decision round                  | this skill                                                 | `decided: user` tags; status `accepted`, `partial` or `rejected`   |
| Merge                             | skill:to-plan, skill:to-spec, skill:to-task, skill:to-epic | Plan decisions, Specs, Tasks; status `merged`                      |
| Long work                         | skill:build-a-loop                                         | The Epic's loop                                                    |
| Build                             | skill:playbook-build, or the loop                          | Commits that link the records (`Refs:`)                            |
| Explain the result                | this skill                                                 | A living record (kind `page` or `convention`) when readers need it |
| Close                             | this skill                                                 | The proposal deleted, pointed to by the records that absorbed it   |

Each step stops at its endpoint; the user starts the next.

## Delegating while the user is present

Apply skill:policy-delegation as a loop does: the lead and sidecar models it names for the agent
harness, every review or research task to a lead with its sidecars, sidecars reporting only to
their lead, and the lead verifying every sidecar result before using it. Briefs stand alone and
follow skill:policy-writing's order. The project's instruction file holds its overrides (models,
effort, how many agents at once). Tell the user about background agents once, when they finish.

## Commits

Commit only when asked, with explicit paths, in skill:policy-records#commits's format: a subject
`<area>: <summary>` and a `Refs:` trailer listing the records the commit touches.

## Defaults and overrides

This skill holds the defaults, written for any user. A project's instruction file keeps only what
differs for its user, each line with its source (`(the user, <date>)`), in a section such as
"Working with the user". An override wins over the default it names. Never copy this skill into an
instruction file; link it.

## What to return

Each turn: the answer or result first; what changed, with paths; what waits on the user, as a
numbered round; and only claims you checked.
