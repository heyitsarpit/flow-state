---
proposal workflow-skills-update
status proposed 2026-11-23
description Proposes 23 skill edits for today's wk changes and seven general learnings (root cause and families first); nothing applied.
---
# Workflow skills update for the 2026-11-23 wk and project changes

**Bottom line:** 23 small edits across 9 files in the skill library at `4f316bf` (suite `workflow`) bring it in line
with five changes. Nothing is applied; each edit waits for the user's go, then lands in the library repo.

Changes that drive the edits:

1. `wk` read output: one-line `agenda`, narrowing flags, `@task.E.T` addresses, `check` and `lint` grouped by code.
2. Record frontmatter `description`, linted as `RECORD_DESCRIPTION_MISSING`.
3. A proposal's status changes in the commit that accepts, merges or rejects it.
4. Trap: a plain `git commit` in a shared checkout takes other agents' staged paths; use `git commit -- <paths>`.
5. The agenda means "what waits on the user"; agent decisions are for close reviews, not a first read.

Paths are under `/Users/arpit/Developer/workflow/skills/suites/workflow/`. Every edit keeps lines at most 100
characters. `Current` is the text now; `Proposed` replaces it whole. Edits marked **gap** add text where the skill
says nothing about the change.

## Counts

| File                                    | Edits | Changes    |
| --------------------------------------- | ----- | ---------- |
| `wk/SKILL.md`                           | 5     | 1, 2, 3, 5 |
| `collaboration/SKILL.md`                | 6     | 1, 2, 3, 4 |
| `collaboration/references/templates.md` | 1     | 2          |
| `policy-records/SKILL.md`               | 4     | 2, 3, 4, 5 |
| `build-a-loop/SKILL.md`                 | 3     | 3, 4, 5    |
| `policy-delegation/SKILL.md`            | 1     | 4          |
| `workflow/SKILL.md`                     | 1     | 1, 5       |
| `README.md`                             | 1     | 1          |
| `ONBOARDING.md`                         | 1     | 5          |

Reviewed with no edit needed: `check-task` (no `wk` read, record or commit text), `execute-task` (its `wk check`
step at line 125 is still right), `compact-records` (compacts notes and comments; names no address form), `to-epic`
(its `wk check` lines 64 and 510 are still right; line 100 "Proposal file" needs no status text).

## `wk/SKILL.md`

### W1. Agenda paragraph, lines 74-76 (changes 1, 5)

Current:

```text
`wk agenda [--since DATE]` is what needs a judge, grouped by record: every `[open]` item with its
recommendation, every Markdown record at `proposed`, and agent decisions since DATE (default 7 days).
Run it instead of collecting these by hand; `--json` for programs.
```

Proposed:

```text
`wk agenda` is what waits on the user, one line per record: its `[open]` items and whether it is
`proposed`. Agent decisions show only with `--decisions` (dated since `--since DATE`, default 7
days); the totals line counts the ones left out. `@ID` or a path (`wk agenda @proposal.rules`,
`wk agenda wiki/tasks`) keeps those records and prints their items, each as its bold lead sentence
and recommendation; `--open`, `--proposed` and `--decisions` keep one kind of entry; `--full` adds
each item's text; `--limit N` and `--all` count records. A Task comment is `@task.E.T1`, a phase
comment `@phase.E.P1`, an Epic note `@epic.E`. Run it instead of collecting these by hand;
`--json` for programs.
```

### W2. Output budget, lines 68-70 (change 1)

Current:

```text
Text listings (`check`, `lint`, `list`, `refs`, `status --decisions`, `show --items`) stop at 50 rows and
end with `… and N more (--limit N or --all)`; pass `--limit N` or `--all`. `--json` is complete unless
`--limit` is given, then `total` sits beside the cut list.
```

Proposed:

```text
Text listings (`list`, `refs`, `status --decisions`, `show --items`) stop at 50 rows and end with
`… and N more (--limit N or --all)`; pass `--limit N` or `--all`. `agenda` counts records, not
items. `check` and `lint` group findings by code: a `CODE (count)` line, 5 rows of it (`--limit N`
sets the 5), then `… and N more`, and a last line naming the flags when a code was cut. `--json`
is complete unless `--limit` is given, then `total` sits beside the cut list.
```

### W3. Markdown records intro, lines 106-108 (change 2, gap)

Current:

```text
Every `.md` file under `wiki/` is read: its links resolve as in any record, and a file with
frontmatter is a Markdown record with a kind, a name and a status, linked as `@<kind>.<name>`.
Kinds and their status lists are declared in `wiki/config.json`. Decisions, deferrals and questions
```

Proposed:

```text
Every `.md` file under `wiki/` is read: its links resolve as in any record, and a file with
frontmatter is a Markdown record with a kind, a name and a status, linked as `@<kind>.<name>`.
Its optional `description` is one line saying what it decides or asks; `wk list`, `wk show` and
`wk agenda` print it in place of the title. Kinds and their status lists are declared in
`wiki/config.json`. Decisions, deferrals and questions
```

### W4. Command examples, after line 120 (changes 2, 3, gap)

Current (line 120):

```text
wk edit @proposal.rules --status merged --into @plan.Rules
```

Proposed (the line stays; add these two after it):

```text
wk edit @proposal.rules --status merged --into @plan.Rules   # in the commit that merges it
wk edit @proposal.rules --set description="Retries idempotent calls only; asks for the cap."
```

### W5. Lint bullet, lines 146-148 (changes 2, 3)

Current:

```text
- `wk lint` reads across records: `STATUS_DRIFT` (a `proposed` record a Task, Plan or Spec says was
  built, merged or accepted, or another record supersedes), `QUESTION_MAYBE_ANSWERED` (an `[open]`
```

Proposed:

```text
- `wk lint` reads across records: `STATUS_DRIFT` (a `proposed` record a Task, Plan or Spec says was
  built, merged or accepted, or another record supersedes), `STATUS_ITEMS_MISMATCH` (every tagged
  item accepted or decided while the record is `proposed`), `RECORD_DESCRIPTION_MISSING` (info: a
  `proposed` record with no `description`), `QUESTION_MAYBE_ANSWERED` (an `[open]`
```

The two drift codes mean a status was not changed in its commit; see C4.

## `collaboration/SKILL.md`

### C1. Decision-round prep, lines 109-110 (changes 1, 5, gap)

Current:

```text
Before a round, run `wk agenda` and `wk list question --open`: an open question may already hold
the answer or the recommendation. Write each decision once, as a tag in its one home record
```

Proposed:

```text
Before a round, run `wk agenda --open` (`wk agenda @proposal.name` shows one record's items) and
`wk list question --open`: an open question may already hold the answer or the recommendation.
Agent decisions are not on the agenda unless asked for (`--decisions`); a close review reads them.
Write each decision once, as a tag in its one home record
```

### C2. Write a proposal, lines 122-124 (change 2, gap)

Current:

```text
- **A new file for each idea:** `wiki/proposals/YYYY-MM-DD-<slug>.md` by default (records are
  found by name, so a project may use other folders), with frontmatter `proposal <name>` and
  `status draft <date>` (skill:policy-records#markdown-records). Never overwrite another proposal.
```

Proposed:

```text
- **A new file for each idea:** `wiki/proposals/YYYY-MM-DD-<slug>.md` by default (records are
  found by name, so a project may use other folders), with frontmatter `proposal <name>`,
  `status draft <date>` and a one-line `description` of what it decides or asks
  (skill:policy-records#markdown-records). Never overwrite another proposal.
```

### C3. Show it, line 134 (change 2, gap)

Current:

```text
- **Show it, and stop.** When it is ready, set `status proposed <date>`, give the user its path and
```

Proposed:

```text
- **Show it, and stop.** When it is ready, set `status proposed <date>` (`wk lint` asks a `proposed`
  record for its `description`), give the user its path and
```

### C4. Ruling, lines 154-156 (change 3)

Current:

```text
On the user's ruling, retag every item: an accepted one `[decided: user <date>]`, a rejected one
`[rejected: user <date>]`. Then write `status accepted user <date>`, `status partial user <date>`
or `status rejected user <date>`, moving the old status down a line.
```

Proposed:

```text
On the user's ruling, retag every item: an accepted one `[decided: user <date>]`, a rejected one
`[rejected: user <date>]`. Then write `status accepted user <date>`, `status partial user <date>`
or `status rejected user <date>`, moving the old status down a line. The status changes in the
same commit as the ruling; a proposal left `proposed` after it is a defect (`wk lint` reports
`STATUS_DRIFT` and `STATUS_ITEMS_MISMATCH`).
```

### C5. Merge, lines 163-164 (change 3)

Current:

```text
every change the proposal names; anything it does not name is listed for the user first. Then set
`status merged <date> [<links>]`, linking each record it landed in. A merged or rejected proposal
```

Proposed:

```text
every change the proposal names; anything it does not name is listed for the user first. Then, in
the same commit as the merge, set `status merged <date> [<links>]`, linking each record it landed
in (`wk edit @proposal.<name> --status merged --into @spec.<NAME>`). A merged or rejected proposal
```

Needs the user: whether `--by user` belongs on that command (see "Needs the user").

### C6. Commits, lines 212-214 (change 4)

Current:

```text
Commit only when asked, with explicit paths, in skill:policy-records#commits's format: a subject
`<area>: <summary>` and a `Refs:` trailer listing the records the commit touches; check the
message with `wk check --commit FILE` first.
```

Proposed:

```text
Commit only when asked, with explicit paths (`git commit -- <paths>`: a plain `git commit` takes
every staged path, other agents' work included), in skill:policy-records#commits's format: a
subject `<area>: <summary>` and a `Refs:` trailer listing the records the commit touches; check
the message with `wk check --commit FILE` first.
```

## `collaboration/references/templates.md`

### T1. Proposal template, lines 10-13 (change 2, gap)

Current:

```text
proposal <name>
status draft <YYYY-MM-DD>
---
```

Proposed:

```text
proposal <name>
status draft <YYYY-MM-DD>
description Drafts 23 edits to 9 Workflow skill files for the 2026-11-23 wk, description, status and commit changes.
---
```

## `policy-records/SKILL.md`

### P1. Frontmatter example and rule, lines 80-93 (change 2, gap)

Current (example, lines 80-87):

```text
proposal rules
status merged 2026-11-20 [@plan.Rules, @task.V3.T106]
    accepted user 2026-11-20
    proposed 2026-11-19
supersedes @proposal.rules-cohesion
---
# Rules on machines
```

Proposed (one line added before the closing `---`):

```text
proposal rules
status merged 2026-11-20 [@plan.Rules, @task.V3.T106]
    accepted user 2026-11-20
    proposed 2026-11-19
supersedes @proposal.rules-cohesion
description Drafts 23 edits to 9 Workflow skill files for the 2026-11-23 wk, description, status and commit changes.
---
# Rules on machines
```

Current (rule, lines 90-93):

```text
- **Frontmatter holds metadata only,** in spec-lang syntax: the first line `<kind> <name>`; then
  `status <value> [<judge>] <date> [<links>]`, the current status, with earlier steps indented
  under it, newest first; then `supersedes <link>` when it replaces another record. The title is
  the H1, never repeated in the frontmatter.
```

Proposed:

```text
- **Frontmatter holds metadata only,** in spec-lang syntax: the first line `<kind> <name>`; then
  `status <value> [<judge>] <date> [<links>]`, the current status, with earlier steps indented
  under it, newest first; then `supersedes <link>` when it replaces another record; then
  `description <text>`, one line saying what the record decides or asks (set it with
  `wk edit @<kind>.<name> --set description=TEXT`; `wk lint` asks a `proposed` record for it). The
  title is the H1, never repeated in the frontmatter.
```

### P2. Changing status, lines 106-107 (change 3)

Current:

```text
- **Changing status:** write the new step on the `status` line and move the old one down, or run
  `wk edit @<kind>.<name> --status <value>`. Git keeps every version.
```

Proposed:

```text
- **Changing status:** write the new step on the `status` line and move the old one down, or run
  `wk edit @<kind>.<name> --status <value> [--by JUDGE] [--into LINK]`, in the same commit as the
  change that earns it (a ruling, a merge). A stale status is a defect: `STATUS_DRIFT`,
  `STATUS_ITEMS_MISMATCH`. Git keeps every version.
```

### P3. Agent decisions, lines 192-193 (change 5)

Current:

```text
- Work continues within agreed intent after an agent's decision; nothing waits for the user to
  read it, and no field tracks whether the user has.
```

Proposed:

```text
- Work continues within agreed intent after an agent's decision; nothing waits for the user to
  read it, and no field tracks whether the user has. A close review finds them with
  `wk agenda --decisions` (or `wk status --decisions`); a plain `wk agenda` leaves them out.
```

### P4. Commits, lines 205-206 (change 4)

Current:

```text
Commit only on the user's explicit request (skill:policy-authority), with explicit paths. The
message uses git's own trailers:
```

Proposed:

```text
Commit only on the user's explicit request (skill:policy-authority), with explicit paths:
`git commit -- <paths>`. In a checkout shared by several agents a plain `git commit` takes every
staged path, other agents' work included. The message uses git's own trailers:
```

## `build-a-loop/SKILL.md`

### B1. R33 decision review, lines 325-328 (changes 1, 5)

Current:

```text
- **R33 Complete decisions.** An agent decision goes in a note or in the record it governs, in
  skill:policy-records's decision convention, linking what it is about. Never credit the user with
  an agent's decision. An independent check reviews the agent decisions at each stage exit, and a
  decision that narrows one of the user's own comes first.
```

Proposed:

```text
- **R33 Complete decisions.** An agent decision goes in a note or in the record it governs, in
  skill:policy-records's decision convention, linking what it is about. Never credit the user with
  an agent's decision. An independent check reviews the agent decisions at each stage exit
  (`wk agenda --decisions --since <stage start>` lists them), and a decision that narrows one of
  the user's own comes first. The user's agenda stays free of them.
```

### B2. R42 status, lines 379-382 (change 3, gap)

Current:

```text
- **R42 Deleting absorbed files.** Only when the Epic keeps proposals or other Markdown records
  outside itself, and its authority lists their deletion: delete them by
  skill:policy-records#deleting-absorbed-records, with a note naming the last commit that holds
  each. Without that line in the authority, list the files in a note for the user instead.
```

Proposed:

```text
- **R42 Deleting absorbed files.** Only when the Epic keeps proposals or other Markdown records
  outside itself, and its authority lists their deletion: delete them by
  skill:policy-records#deleting-absorbed-records, with a note naming the last commit that holds
  each. Their status is set in the commit that merges or rejects them. Without that line in the
  authority, list the files in a note for the user instead.
```

### B3. R43 shared checkout, lines 386-388 (change 4)

Current:

```text
- **R43 Checkouts, by default.** Serial work uses no worktree: one builder works in the main
  checkout on the run's branch and commits only with explicit paths. It never uses `git stash`,
  because the stash is shared with the user's own work in that repository. Parallel slices that
```

Proposed:

```text
- **R43 Checkouts, by default.** Serial work uses no worktree: one builder works in the main
  checkout on the run's branch and commits only with explicit paths (`git commit -- <paths>`; a
  plain `git commit` takes every staged path). It never uses `git stash`,
  because the stash is shared with the user's own work in that repository. Parallel slices that
```

## `policy-delegation/SKILL.md`

### D1. Write scopes, lines 77-79 (change 4)

Current:

```text
- **Write scopes never overlap:** one owner per file, branch, runtime or Git operation; separate
  checkouts or disjoint paths for parallel writers; a required independent check never by the
  author.
```

Proposed:

```text
- **Write scopes never overlap:** one owner per file, branch, runtime or Git operation; separate
  checkouts or disjoint paths for parallel writers, each committing with `git commit -- <paths>`
  (a plain `git commit` takes every staged path); a required independent check never by the
  author.
```

## `workflow/SKILL.md`

### K1. What's next, lines 68-69 (changes 1, 5)

Current:

```text
Start with `wk status`, `wk agenda` (what needs a judge) and `wk list question --open`
(skill:wk). Read the work's Epic: its loop, its latest notes, `wk show @epic.<EPIC> --tree` and
```

Proposed:

```text
Start with `wk status`, `wk agenda` (what waits on the user; one line per record) and
`wk list question --open` (skill:wk). Read the work's Epic: its loop, its latest notes,
`wk show @epic.<EPIC> --tree` and
```

## `README.md`

### R1. Instruction-file rules, line 106 (change 1)

Current:

```text
   - Start with `wk status` and `wk next`. `wk show @id` reads any record.
```

Proposed:

```text
   - Start with `wk status`, `wk agenda` and `wk next`. `wk show @id` reads any record.
```

The README block is the text a project copies into `AGENTS.md`; this adds the agenda, as the flow-state
`AGENTS.md` already does.

## `ONBOARDING.md`

### O1. Decisions agents make, lines 132-134 (change 5)

Current:

```text
`[decided: agent <role> <date>] ... Why: ... Reverse: ...`. Nothing waits for you to read them. To
overturn one, say what to change, and the agent reverses it as its `Reverse:` line says and
records your decision in its place.
```

Proposed:

```text
`[decided: agent <role> <date>] ... Why: ... Reverse: ...`. Nothing waits for you to read them,
and `wk agenda` leaves them out; `wk agenda --decisions` lists them. To
overturn one, say what to change, and the agent reverses it as its `Reverse:` line says and
records your decision in its place.
```

## Most important five

1. W1, `wk/SKILL.md` lines 74-76: the agenda description is wrong on what it prints (it still says decisions are
   included and groups items).
2. C1, `collaboration/SKILL.md` line 109: the decision-round prep that agents run on every round.
3. C4 and C5 with P2: proposal status moves in the commit that rules or merges, the rule behind two lint codes.
4. C6, P4, B3 and D1: the shared-checkout commit trap, in the four places that say "explicit paths".
5. C2, P1 and T1: the proposal `description`, which no template or rule mentions yet.

## Needs the user

- **Judge on `merged`.** `policy-records` line 105 says the judge is omitted where nobody decided
  (`proposed`, `merged`), but the flow-state `AGENTS.md` writes `--status merged --by user --into @spec.X`.
  C5 and P2 leave `--by` out of the merge example until the user says which is right.
- **Proposal description scope.** `RECORD_DESCRIPTION_MISSING` asks only `proposed` records for it. C2 and C3 ask
  every proposal at birth; the user may want it only at `proposed`.
- **README rule line.** R1 changes the text projects copy into their instruction files; confirm the user wants
  `wk agenda` in that default.
- **B1's last sentence** ("The user's agenda stays free of them") restates change 5; drop it if the user finds it
  redundant.

## Part 2: general lessons from the V3 Epic

**Bottom line:** seven lessons from `wiki/tasks/V3/epic.task` apply to any project, and each gets 1 to 3 edits in
six skills at `4f316bf`; nothing is applied. Each lesson is written whole where it lands and names the related
principle beside it, even where a principle says part of it already (the user's call: restate, don't trim). Flow terms
(Story, fixture, Spec ids, `nub`, `it.fails`) are replaced by general ones. Proposed lines are at most 100 characters.

| Lesson                                         | Lands in                                      | Epic source                        |
| ---------------------------------------------- | --------------------------------------------- | ---------------------------------- |
| 0 Fix the root cause, design for the family    | `principle-fix-root-causes` (+ 2 cross-links) | 2026-11-22, 2026-11-20, 2026-11-19 |
| 1 Name the wrong side before a fix             | `principle-fix-root-causes`                   | 2026-11-12                         |
| 2 A check must not share the code's blind spot | `principle-design-for-verification`           | 2026-11-23                         |
| 3 A known gap stays executable                 | `policy-testing`                              | 2026-11-12, 2026-11-16             |
| 4 A claim of absence gets a mechanical check   | `principle-claim-only-what-you-checked`       | 2026-11-23                         |
| 5 Ask a ruling as two traces of one scenario   | `collaboration`                               | 2026-11-23                         |
| 6 Multi-agent hygiene                          | `policy-delegation`                           | 2026-11-14, 2026-11-23, Authority  |

### L0. Fix the root cause and design for the family

Epic source, Reviews and done: "every finding ... names where the behaviour originates, traced to its source ...
before a fix or a ruling is proposed" (the user, 2026-11-22). Related: the close review's cohesion angle "lists the
whole family up front" (the user, 2026-11-20), and "the freedom is taken away by structure" (the user, 2026-11-19).

Already in the library: `principle-fix-root-causes` line 30 says "Check for the pattern, not just the instance" and
records other paths as follow-up; `policy-convergence` line 94 (Converging live code) says to name the freedom and
remove the class. Missing: tracing to a named origin as a gate, naming the class as a step of every fix, and the
choice between structure and one point of handling. New section in `principle-fix-root-causes`, after line 36
(end of Pattern, before "## Question the premise" at line 38):

```text
## Design for the family

A bug is one member of a class. Trace it to where the behaviour originates (the code, a test,
the tooling, or a dependency, checked at its installed source) before proposing a fix; a finding
with no origin goes back. Then name the class: every state, path or caller that is free to fail
the same way, here and in sibling parts. Remove the class, not the instance:

- **By structure:** make the wrong state unrepresentable, give the state one owner with a guard,
  or derive the second copy from the first (skill:principle-enforce-with-structure).
- **By one point of handling:** handle the value or failure once, where it enters, so no caller
  needs its own guard. Example: a dependency turned an invalid number into zero; tracing it to
  its source settled the call (follow the dependency) and made the local guards needless.
- **Prove it:** show each member of the class red on a planted violation, and keep the instance
  as a regression test.

Patch the instance only when its cause is local. A class that returns is converged on
(skill:policy-convergence#converging-live-code).
```

Cross-link 1, `principle-enforce-with-structure`, after line 58 ("... goes unexplained."), add one sentence:

```text
To trace a mistake to its class and remove the whole class, see
skill:principle-fix-root-causes#design-for-the-family.
```

Cross-link 2, `policy-convergence` line 109, current: "Prefer the answer that removes the most at once. A fix that
closes only the traces in hand is a patch with a longer name." Proposed (sentence added):

```text
Prefer the answer that removes the most at once. A fix that closes only the traces in hand is a
patch with a longer name. Tracing a finding to its source and naming its class comes first
(skill:principle-fix-root-causes#design-for-the-family).
```

### L1. Name the wrong side before a fix

Epic source, Building a Task: "before a red becomes a requirement or a fix, the lead replays it and names the wrong
side with evidence ... An unknown is never given a default" (the user, 2026-11-12).

Already in the library: `policy-verification` Scope ("On a failure, decide whether the code or the suite is wrong
before you fix either. Replay the failing case ...") says the first half for suites. Missing: the principle that
debugging starts from, the tooling as a third side, and the ban on a default. New bullet in
`principle-fix-root-causes`, before line 30 ("Check for the pattern"):

```text
- **Name the wrong side before a red becomes a fix.** Replay the failing case and say which side
  is wrong, with evidence: the code breaks a cited rule, or the test, a test double or the
  tooling does (skill:policy-verification#scope). An unknown side gets no default: find the
  evidence, or ask.
```

### L2. A check must not share the code's blind spot

Epic source, Earlier surfacing (the user, 2026-11-23): checks "walk a structure the way the cited rule defines it,
never the way the code traverses it"; an oracle for a boundary "is derived from the writer it judges ... never
hand-written beside it"; when the host mirrors a fact the core owns, "the harness checks both sides at every cut".

Already in the library: `policy-testing` lines 88 to 91 say to derive expectations from an oracle that is not the
implementation under test; `principle-design-for-verification` "Checking the whole" asks whether the behaviour could
be wrong while every check passes. Missing: the three concrete ways a check inherits the code's blind spot. New
paragraph and list in `principle-design-for-verification`, after line 58 (end of the first "Checking the whole"
paragraph):

```text
A check that shares the code's blind spot passes when the code is wrong. Keep them apart:

- **Walk the structure as the rule defines it,** never as the code traverses it: a check that
  "every child is closed" lists the children from the rule's definition, not from the code's list.
- **Derive a boundary oracle from the format's one declaration.** Where a writer, a reader and
  the check can share one schema or codec, the check uses it instead of a hand-written copy
  beside it; the declaration itself is checked against worked examples from the contract.
- **Check both sides of a mirrored fact.** Where one component mirrors what another owns (a
  timer, a lease, a subscription, a cache), compare both sides at every observation point, not
  only the owner's.
```

Related: skill:policy-testing#choose-inputs-and-expected-results. The second bullet narrows `policy-testing` line 91
("An expected value copied from the implementation is not a test oracle"); the worked-examples clause keeps the
oracle independent of the code, and is this draft's addition, not the Epic's. See "Needs the user".

### L3. A known gap stays executable

Epic source, Building a Task: "A known bug is one inverted test (`it.fails`), titled by the Spec rule it breaks;
`it.todo` is not used" (the user, 2026-11-12); "A gap is never written into a Spec as a limit ... the Spec keeps the
rule" (the user, 2026-11-16).

Already in the library: `policy-testing` line 99 (bug regression shows pre-fix failure) and line 103 (pending
distinct from passing); `execute-task` line 129 ("record it as a known-failing check owned by a named later Task");
`to-spec` line 60 ("an open question, not a gap the code fills"). Missing: the one form of a known gap and the ban on
writing it into the contract. New bullet in `policy-testing` "Keep tests useful", after line 99:

```text
- A known gap stays executable: one test that states the correct behaviour, marked
  expected-to-fail, titled by the rule it breaks and owned by a Task; it turns red when the
  gap is fixed. No pending placeholder. A gap routed to a later Task lands the same way, or as
  a comment on that Task when no check can express it yet. Never write the gap into the Spec
  as a limit: the Spec keeps the rule (skill:to-spec).
```

### L4. A claim of absence gets a mechanical check

Epic source, Earlier surfacing: "an acceptance item stated as an absence ('no `it.fails` left', 'no caller of X') gets
an `rg` in the builder's close gates" (the user, 2026-11-23).

Already in the library: `principle-claim-only-what-you-checked` says proxies are not results and source reading
"proves only what it directly shows"; `execute-task` step 5 says to "list every caller". Missing: absence as a named
case, and where its check runs. New bullet in `principle-claim-only-what-you-checked`, after line 34 ("Keep every
gap visible"):

```text
- **A claim of absence needs a mechanical check.** "No caller of X", "none left" and "never" are
  shown by a search over the whole scope (a grep, a lint rule), not by reading what you
  changed. Put the command in the close gates and report it with its hit count.
```

Related: skill:principle-design-for-verification (the check is designed before the claim is made).

### L5. Ask a ruling as two traces of one scenario

Epic source, Reviews and done: "A ruling is asked as two traces of the same Story, not as prose" (the user,
2026-11-23).

Already in the library: `collaboration` line 89 step 3 asks for a complete before-and-after example for an API or
a decision record. Missing: the form for a behaviour choice. `collaboration` line 93 current: "Start from where the
data comes from." Proposed (two lines):

```text
   Start from where the data comes from. For a behaviour, ask it as two traces of the same
   scenario, one per option, each step with its result, never as prose.
```

### L6. Multi-agent hygiene

Epic source: "A lead works through three context compactions and is rotated out only when a fourth is close: finish
the step, commit, leave a resume note" (the user, 2026-11-14); a fresh building lead takes the build after the
requirements lead, and "a fix round's review goes back by message to the lead that wrote the verdict" (the user,
2026-11-23); "commit locally ... with explicit paths; never push, never stash" (Authority, approved with the Epic).

Already in the library: `policy-delegation` Pause (line 110) says each agent stops at a safe point with a resume
note; line 77 says write scopes never overlap; Part 1 D1, C6, P4 and B3 add `git commit -- <paths>` to four skills.
Missing: when to rotate, fresh eyes per stage, and returning a fix-round review to its reviewer. Restated whole in
`policy-delegation`, after line 113 (end of Pause), as three bullets:

```text
- **Rotate before the context runs out.** Replace a lead before its fourth compaction (the
  project may set another count): it finishes its step, commits and leaves a resume note (what
  is true, what is next, what is at risk); a fresh lead starts from the note.
- **Fresh eyes per stage.** The lead that writes a Task's requirements stops after their fix
  round; a fresh building lead takes the build and every later fix round. A fix round's review
  goes back, by message, to the lead that wrote the verdict, so it re-runs its own probes; a
  fresh reviewer starts only when that lead is gone or out of context.
- **In a shared checkout, commit only your own paths:** `git commit -- <paths>`. A plain
  `git commit` takes every staged path, other agents' work included. Never stash.
```

Related: skill:build-a-loop R6, R7 and R43.

### Part 2: needs the user

- **L2 oracle.** Deriving a boundary oracle from the writer's own codec narrows `policy-testing` line 91; the
  worked-examples clause is this draft's guard, so say if it should go.
- **L6 compaction count.** "Fourth compaction" is the Epic's number; the draft keeps it as the default and lets a
  project change it.
- **Not drafted.** The other 33 candidates from the first list are out of scope by the user's change; they stay in
  the Epic.
