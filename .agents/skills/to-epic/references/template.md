# Epic, phase and Task template

The records below are Workflow records, checked by `workflow check`. Replace every `<...>`; leave
out a line marked optional that does not apply. Text inside backticks is not checked; every `@`,
`code:` and `skill:` link outside them must resolve. Write text lines at one indentation: the
formatter does not keep hanging indents inside a text block. Terms are as in skill:to-epic#terms.

## The Epic: `workflow/tasks/<EPIC>/epic.task`

```text
epic         <EPIC>
title        <short name>
status       draft
skill        workflow@<library revision>
description
    Goal: <what the user needs, in their words>.
    Built with skill:to-epic at the library revision in skill.
    Records: Plan <@plan.ID, or "none yet">; Specs <@spec.ID ...>.
    Locations: <where the code, the verification suites, the proposal files and the examples
    live>.

    ## Stages and stage exits

    | Stage | Phases | Stage exit |
    | --- | --- | --- |
    | <name> | <P1, P2> | <the condition> |

    ## Scope

    Bounds: <what is in>. Assumptions: <what is taken as given>. Exclusions: <deferred features,
    prototypes>. Reused evidence: <earlier results that still hold, or "none">.

    ## Constraints

    - <constraint> (<source, date>; scope: <the whole Epic | named phases>).

    ## Authority

    By default: read, edit within the phase's scope, run checks, repair own defects, update
    records. Also allowed, by the user's approval of this Epic:
    - <for example: start the next phase after its completion audit passes>
    - <for example: commit to branch <name>; never push>
    - <for example: delete proposal and design files outside the Epic once absorbed>
    Orchestrator decides: <calls in phases <...>>; small public API changes (a flag, a default, a
    field or member name, where an option sits); each noted for the user's read.
    Agents may also write coverage records and agent-judged rulings into the Plan.
    User decides: <public entry-point names, new concepts, large API changes, relaxing a gate,
    changes to the Plan's decisions or outcomes, scope, budgets>.
    Everything else still needs the user.

    ## Budget

    Total: <iterations, time, usage>. Pace: <usage per iteration>. Usage reserve: <share of the
    usage limit>. Failure limit (the default for each phase): <k> failures with the same root cause after convergence.

    | Phase | Iterations | Time | Usage |
    | --- | --- | --- | --- |
    | <P1> | <n> | <hours> | <share> |

    ## Glossary

    Library terms: skill:to-epic#terms. This project's terms:
    - <term>: <meaning>.
note <UTC timestamp>
    Summary confirmed by the user (<where>): "<their words>".
```

The loop (`run`, `instructions`, `cadence`, `stops`) goes between `description` and the first
note; skill:to-loop writes it into the draft. The user approves the Epic and its loop together;
then `status active` and a note quoting the user.
When the run ends: `status closed` and a closing note (skill:to-loop).

## A phase: `workflow/tasks/<EPIC>/<P1>.task`

```text
phase P1
title <name>
description
    Class: <verifiable | not readily verifiable | non-verifiable>.
    Kind: <ticket | feature | performance | verification-suite; leave the line out for a
    non-verifiable phase>.
    Goal: <what this phase delivers or decides>.
    Starts when: <optional; only if not right after the previous phase>.
    Verified by: <each verification suite, with where its coverage record lives (for example
    @plan.ID.V3), and who runs it; for a non-verifiable phase, the judges and the criteria>.
    One iteration: <what to do, in one or two lines>.
    Exit criteria: <the conditions the completion audit checks>.
    False pass: <how it could pass on the wrong thing>. Caught by: <the check>.
    Gates: <gate>, rejects <its mutants or planted violations>, which live in <where>.
    Budget: the Epic's Budget section, row <P1>.
    Failure limit: <k; default from the Epic's Budget section>.
    Stops: <only what can't go on without the user>. User's read: <what is recorded for it>.
    Decisions: <non-verifiable phases only; per decision: the question, the recommended answer and
    why, the judge the user confirmed, how reversible it is>.
    Prototype: <optional; "yes" only when the user chose one>.
    Draws from: <skill:NAME: when it applies and its method, one line each>.
tasks
```

Dated `comment` entries may follow the description, before `tasks`, for what happened to the
phase as a whole. A phase has no status: it is done when every Task is done and the completion
audit's PASS is a phase comment.

## A Task, written with skill:to-task

```text
    T1
        title        <deliverable>
        status       open
        priority     <low | medium | high | max>
        labels       [<class label>, <kind label>]
        derives_from [<@plan.ID.D1>]
        satisfies    [<@plan.ID.O1>]
        description
            <The deliverable, its scope, settled steps, why any blocker exists.>
            Source: <the decision and who made it, when no Plan exists yet>.
            May change: <paths>. Evidence: this Task's comments.

            False pass: <...> → caught by <...>.
            Gates: <...>.
            Budget: <...>.
            Stops: <... or "none">.
            User's read: <... or "none">.
        acceptance
            <The observable result and the checks that prove it.>
```

Class labels: `verifiable`, `not-readily-verifiable`, `non-verifiable`. Kind labels: `ticket`,
`feature`, `performance`, `verification-suite`; a non-verifiable Task has no kind label.
