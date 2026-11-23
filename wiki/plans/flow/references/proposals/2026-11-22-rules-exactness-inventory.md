---
review rules-exactness-inventory
status open 2026-11-22
description Inventory of what must change to move rules out of the body and add exactness: Plans, Specs, Tasks and code rows.
---
# Rules out of the body and exactness at construction: what must change (2026-11-22)

**Inventory: 20 Plan places in 5 Plans (9 outcomes: Rules 7, Testing 1, Runtime 1), 57 Spec places (Types.spec 30,
Types.md 10, Host.spec 11, Host.md 5, Changes.spec 1), 7 Tasks to edit, 2 with a note only and 1 to leave, 6 code rows
with 0 removals in `src/`, 4 tests to flip and 0 rule pins to delete, 0 fixture or reference-app sites, 21 supersede
notes.** The code is the surprise: no rule exists in `src/` yet (no `rules` in `machine.ts`, no `turn` token, no
`Compiled.rules`, no `enabled`, no body capture), so both decisions mostly rewrite records and shrink what T106 and
T113 would have built. Read-only; this file is the only write.

**Decisions this rests on:** (1) rules leave the body: `rules(subject, build)`, `OrderRules.X` tokens, `turn` in the
builder, registration, `rules: "judge" | "off"` ([proposal](2026-11-22-external-rules.md), still being revised, with
its [review](2026-11-22-review-external-rules.md)). (2) Exactness is option C (@spec.Types Q19): an unknown body key is
refused by the strict decode and `flow check`, never by types; `const B`, `Exact`, `RuleNames<B>`, `Machine<D, R>`'s
second parameter, `Compiled.rules` and G3 go.

**Items that hinge on a choice still open** (marked `[H1]` to `[H6]` below; each moves if the choice does):

- `[H1]` Subject: the machine value (proposal) or the definition (review H2, recommended). Moves: `rules<D>`'s
  signature, `RulesSubjectAbsent`'s meaning, the judge's key (definition id vs machine id), O4's planted-fault variant,
  T106's `PayBody` risk.
- `[H2]` Where sets are registered: entry key (proposal A), a construction-time registry (review H1), or a module.
  Moves: Runtime.plan O1, Testing.plan O1, `Story.machine` and `Story.fragment` first argument (T76, T109),
  `defineConfig`, the scan or `globalSetup`, `judge`'s signature, `RuleSources`.
- `[H3]` `rules` required or defaulted on `runtimeSetup` (review H3), and Host R8 kept or amended for plain Runtime
  tests. Moves: Runtime.plan:50, Host R8, T106, T114.
- `[H4]` The bare-function turns entry (`CommitMovesByOne: ({ before, after }) => ...`, review M6). Moves: Rules.plan
  O1's text and example, `rules()`'s accepted shapes.
- `[H5]` A token carries its set (review M3). Moves: `Verdict<R>`, `RuleToken`, `Broken.rule`, Host :289 and :333.
- `[H6]` Typing inside `rules()`: the proposal's `ExactRules<NoInfer<D>, R>` captures the returned object, which is
  the capture Q19 dropped (review M4). Moves: Types `RuleSet` row and the cost table (Types.spec:819-826).

Conventions: paths under `wiki/` or `packages/flow-state-v3/`; `[O]` marks a Plan edit that changes an outcome and
needs the user's approval first (AGENTS: no Plan edit before the user accepts the list). Rows are
`file:line | what it says now | change`.

## 1. Plans (`wiki/plans/flow/*.plan`): 20 places, 9 outcome edits

`Rules.plan` (13 places). Every outcome except O5 moves; V1, V7 and V8 are verification wording that follows.

- `Rules.plan:23-25` O1 [O] | "A machine declares rules in a `rules` block in its `machine()` callback, where its
  `S`, `E` and `O` tokens exist" | a rule set declared by `rules(subject, ({ S, E, turn }) => ...)`; `O` is not in
  the builder (proposal section 1 gives `S`, `E`, `turn`); say where the subject's tokens come from `[H1]`
- `Rules.plan:32` O1 [O] `[H4]` | "An entry is a function, or an object `{ check, in? }` ... `{ check, on? }`" | keep
  the bare function only if the user keeps it; typed `event` needs `turn({ on, check })`
- `Rules.plan:53-80` O1 [O] | example `machine(Stepper, ({ S, E }) => ({ ..., rules: {...} }))`; `// NEW: rules ...`
  line; `on: E.Set, check: ({ event, ... })` as plain objects, which the Spec says leave `event` untyped | rewrite as
  `StepperRules = rules(StepperMachine, ({ S, E, turn }) => ({...}))` with `turn(...)` where `on` is used; the
  Stepper machine example loses its `rules` key
- `Rules.plan:81-82` O1 | the `CartNotEmptyOnBegin: { on: E.Begin, check: ... }` snippet | `turn({ on: E.Begin, ... })`
- `Rules.plan:102-109` O2 [O] | "Terminals live in `rules`, not on the definition's states list" and the
  `rules: { terminals: [...] }` snippet | "in the rule set"; the snippet becomes `rules(X, ({ S }) => ({ terminals }))`
- `Rules.plan:112-121` O3 [O] | "`machine.rules.<Name>`", "Typing the tokens changes `machine()`: ... needs the body's
  type as a second parameter ... `Machine`'s second parameter defaults" (the whole last paragraph) |
  `OrderRules.<Name>`;
  delete the paragraph: `machine()` keeps one parameter, the rule names live on `RuleSet<D, Names>` `[H1]`; the
  duplicate-name refusal moves to `rules()` and to `app()` across one subject's sets
- `Rules.plan:129-147` O4 [O] | "`machine.rules.<Name>`" in the NEW line and
  `UnclampedStepperMachine.rules.SetLandsInBounds`;
  `Story.machine(UnclampedStepperMachine, ...)` | `UnclampedRules.SetLandsInBounds`; first argument of `Story.machine`
  is an entry `[H2]`; a planted-fault variant needs its own set, or the set's subject is the definition `[H1]`
- `Rules.plan:149-153` O4 | "named by the rule value ... `checked(run, { off: [everyCommitEndsOnce] })`"; `rules` is
  also
  the run rules list | no content change; `rules` now means three things (review L1): rename `Story.app`'s run-rules
  option or the entry key `[H2]`
- `Rules.plan:176-188` O6 [O] | "Rules stay inline in `machine()`, so every Story, sweep and tool finds them with the
  machine and nothing needs registering on the app. A rule has no `enabled` flag" and the closing "wrap the block in
  a build-time constant (`rules: import.meta.env.DEV ? {...} : undefined`)" | superseded: sets are registered (the
  2026-11-20 inline-rules ruling in @proposal.rules is reversed); `enabled` sentence stays (already decided
  2026-11-22); the build-time constant is dropped: registered sets ship as closures under `"off"` (proposal section 3)
- `Rules.plan:190-202` O7 [O] | "A `trait` or `subroutine` body holds the same `rules` block ... Placing the fragment
  brings its rules, and a host can never remove or weaken one"; `(Upload.rules.CancelSticks)` | `rules(Upload, ...)`;
  `UploadRules.CancelSticks`; "placing brings its rules" is no longer true: the host's entry lists the set, and
  "never remove" holds only through the registration check (proposal feature #36, review H4) `[H2]`
- `Rules.plan:206-247` O7 | the `trait(...)` example with `rules: { turns: {...} }` in the body; `Story.fragment(Upload,
  { id })`; `Story.machine(EditorMachine, ...)` | move the two turns to `UploadRules = rules(Upload, ...)`; entry form
  for both Story constructors `[H2]`
- `Rules.plan:263-267` O8 [O] | "`flow explain` lists each machine's rules. `flow check` proves terminals ... warns
  `RuleSubjectUnreachable`" | per set (review H5), plus `RulesUnregistered` and `RulesSubjectAbsent` findings from the
  scan `[H2]`
- `Rules.plan:269-272, 287, 290-291` V1, V7, V8 | "`machine.rules.<Name>` exists for each rule"; "`machine()` refuses a
  duplicate rule name"; "a shared body and a `Machine<typeof X>` annotation still compile"; "a host unable to remove a
  fragment's rule" | `OrderRules.<Name>`; `rules()` refuses the duplicate; delete the annotation clause (one-parameter
  `Machine<D>` always compiles); V8's last clause becomes "an unlisted set is `RulesUnregistered`"

Other Plans (7 places; 4 touch an outcome: Testing O1 twice, Runtime O1 twice, so 2 outcomes).

- `Testing.plan:12-13, 17` O1 [O] `[H2]` | `Story.app(setup, { id, ... })`, `Story.machine(machine, { ... })`,
  `Story.fragment(fragment, { ... })` | `Story.machine` and `Story.fragment` take an entry (`{ machine, rules }`) in the
  proposal; the option naming of the run rules list (`Story.app`'s `rules`) per review L1
- `Testing.plan:94` O1 [O] `[H2]` | `defineConfig({ apps: [{ app, stories }], stories? })` | gains the `rules` globs the
  scan reads (proposal section 2); unchanged if sets register at construction
- `Runtime.plan:20` O1 [O] `[H2]` | "An entry is a Machine, { machine, context? }, or a lazy { id, load, context? }" |
  the
  entry gains `rules`, on the plain and lazy forms alike (a lazy entry's sets: say when they load)
- `Runtime.plan:50` O1 `[H3]` | `runtimeSetup({ app, services?, scope?, persistence?, repairSlots?, audit? })` | gains
  `rules: "judge" | "off"`, default or required `[H3]`; today's Plan lists no `rules` option though Rules O6 decided it
- `CommandLine.plan:37` | "explain accepts a machine, state path ..." | add "lists a subject's rule sets" (Rules O8);
  additive
- `CommandLine.plan:128-131` | "flow check checks the complete declared graph ... reports invalid declarations, wiring,
  ownership" | add the unknown-body-key finding as a `flow check` outcome (Q19), the set scan and per-set proofs;
  additive, no outcome removed
- `Machines.plan:191-193` O1 | "invalid machine additions are also type errors" | soften: a misspelt *name* is a type
  error; an unknown structural key (`gaurd`, `pausd`) is refused at construction and by `flow check` (Q19)

Not affected, checked: `Inspection.plan` (no `RuleBroken` or rule text), `Diagnostics`, `Operations`, `Package`,
`Persistence`, `Pending`, `EntityDomains`, `LazyFeatures`, `React`, `ServerRendering`, `FlowState`. Their "rules" hits
are other rules (wire rules, merge rules, run rules). `Machines.plan:413`, `restartOn` and `pausedBy` are declared
schedules, already in the declared-schedules inventory (2026-11-22-declared-schedules-inventory.md).

## 2. Specs (`wiki/specs/v3/*.spec` and companions): 57 places

Types.spec is where both decisions land (30 rows, Types.md 10); Host.spec takes the registration (11, Host.md 5);
Changes.spec 1;
Operations.spec and Schedules.spec 0.

**Superseded:** R9 (rule names on the machine's type), I12 (a machine's type widens), Q2 (`Machine<D, R>` default `R`),
Q3 (body gives only rule names, `turn` a body token), `BodyCapture` whole, G3, `Compiled.rules`. **Simplified:** R2
and I2 (no whole-body exactness by type), Q19 (answered; its analysis paragraphs compact), the cost table (the 23%
capture cost is no longer paid), T1 (13 patches become 10), R14's `Compiled` list, `Machine<typeof X>` (32 pins stay
valid unchanged). **Kept:** Q5 (`rules: "judge" | "off"`, no `enabled`), Q6 (terminals by `flow check`), the strict
decode row (`Types.spec:396-397`), I13's twin rule (it moves from `machine()` to `rules()`).

`Types.spec` (30):

- `:6, :15` header | `provides ... ExactBodyOf, RuleNames`; `derives_from @plan.Rules.O3` | drop the two names; add
  `RuleSet` and `rules` when it is a row; O3 stays cited
- `:24-31` R2 | "The body is checked exactly, at every depth and in every union member ... a key its definition's shape
  lacks is a type error and is never dropped" | split: a misspelt *name* (state, event, field, operation, schedule,
  reason, rule, slot) is a type error; an unknown structural key is refused by the strict decode and `flow check`
- `:71-75` R9 | "The machine's type carries its rule names ... `Machine<D, R>`" | replace: a rule set's type carries its
  names, `rules()` returns `RuleSet<D, Names>`; `Machine<D>` keeps one parameter
- `:105-108` R14 | "`Compiled` holds ... the rules, branded names" | drop "the rules" (they are not on `Compiled`)
  unless a set is compiled into it `[H1]`
- `:129-132` Q2 | "`Machine<D, R>`'s default for `R` is `never`" (decided by the user 2026-11-22) | superseded note: no
  second
  parameter; `OrderRules.Typo` is a type error on the set
- `:134-138` Q3 | "The body gives the machine's type only its rule names, and `turn` is a body token" [decided: user
  2026-11-22] | superseded: `turn` comes from the rules builder (proposal section 1); the spiked reason (a token's
  memory
  type comes from the subject) still holds
- `:146-157` Q5 | `enabled` overturn, "Stories and the CLI always judge" | keep; its trace text names a body flag; one
  line saying the switch is on the Runtime setup and the sets are registered `[H3]`
- `:217-218` Q17 | "Rule tokens are typed on a machine that is not `Built`, where the record is empty at run time" |
  moot: a
  token is a set's; a set on a `Refused` subject is a `rules()` refusal
- `:225-257` Q19 | analysis of three jobs (rule names, G3, exactness), `Deletes: const B, RuleNames<B>, G3` | answered
  by
  C; compact to the decision, the reason and "no `B`"; delete the "B has two readers" and the +31% options text
- `:271` state list | "the body's type `B` type level only. Owner: `machine()`'s signature. Reader: `RuleNames<B>`" |
  delete the row
- `:273-281` CallbackInputs | "the body function `{ S, E, O, C, turn }`" | `{ S, E, O, C }`; add a row for the rules
  builder `{ S, E, turn }` and its checks' inputs (already there)
- `:288` Derivation | "`Machine`'s one extra parameter, `R`, is for what only the body authors (`BodyCapture`)" | delete
  the sentence: no parameter is added
- `:300` Derivation row | "rule names: the body, through `B` -> `Machine<D, R>["rules"]`, ... compiled" | "a rule set's
  keys -> `RuleSet` tokens, `RuleBroken.rule`, `off`"; status `designed` until the new typing compiles `[H6]`
- `:310-314` G2, G3 | G2 "its return type is inferred"; G3 "deny literals in the body, through `B` ... Proposed:
  dropped" |
  G2 `BodyTokens<D>` loses `turn`; G3 dropped, the Q19 text already proposes it (the user decides)
- `:428-466` `BodyCapture` | the whole section: `ExactBodyOf`, `RuleNames`, `RuleToken`, `Machine<D, R>`, `machine<D,
  const B>`, "What `B` gives", the `turn` paragraph, "Compiled" and "Kept limits" | delete; replace with `RuleSet`
  typing and the `rules()` signature, from a spike on the real package `[H1, H6]`; `RuleToken` stays as a row
- `:495-501` OutputKept | "a check against the captured `B` gives `unknown`" | history; reword to "a captured body"
- `:505-513` ErasedCompiled | "the typed face is `Machine<D, R>`"; "`Broken.rule` and `off` both use `R`" |
  `Machine<D>`;
  `R` is the rule ids of the run's sets `[H5]`
- `:519` New fields | "`schedules`, `rules`, `saved` ..." | drop `rules`
- `:615-616` I2 | "Exact body. A body with a key its definition's shape lacks does not compile" | replace: construction
  and
  `flow check` refuse it (a runtime check; the strict decode); a type pin only for names
- `:647-648` I12 | "`Machine<D, R>` assigns to `Machine<D>` and to `Machine`" | delete (nothing to widen)
- `:649-651` I13 | "Every refusal the types make for a schedule or a rule name has a construction row" | stays; the rule
  half is `rules()`'s construction, not `machine()`'s
- `:662` `machine()` operation | "Returns `Machine<D, RuleNames<B>>`" | `Machine<D>`; add the `rules(subject, build)`
  operation with `Built | Refused` `[H1]`
- `:392-396` twin rule | `RuleNameTwice (BodyCapture)` listed with `machine()`'s rows | move to the rules construction
  table
- `:723` `CHECKS` | `RuleNameTwice` at `stage: "construction"` for a body | keep the key; add `RulesUnregistered`,
  `RulesSubjectAbsent` (proposal section 2); the unknown-key finding is `UnknownField` from `config.ts`, already
  there
- `:760` compile pseudo | "add each handled tag to handledTags, each rule to rules" | delete "each rule to rules"
- `:797-799` Needs `Host` | "`Compiled.rules` and `Machine<D, R>["rules"]` with `RuleBroken.rule` as `R`" | the
  registered sets and the set tokens
- `:819-826` realization cost | "body capture: 0.95 s ... about 23% ... Measured total ... 31%" | the capture is not
  built:
  keep the measurement as the reason; record the real cost after T113 without it; "expected 30 to 40%" is withdrawn
- `:879-885` T1 | 13 type patches including `ExactBodyOf` without `Exact`, `RuleNames` returning `string`, `Machine`'s
  `R`
  invariant | 10 patches; add the two-sided pins of `RuleSet` names; "`R` when `B` takes its default" goes
- `:900-902` T8 (1) | "its author writes `paused: { Vacaton: ... }` ... Here neither line compiles" | the `paused` typo
  is
  now a construction refusal (`ReasonUndeclared`) and a `flow check` finding; only the view's `pausedBy.includes`
  line stays a type error. Interacts with the declared-schedules inventory.
- `:926` T9 | planted fault `rule-name-widened` | re-aim at `rules()`'s name check

`Types.md` (companion, 10):

- `:3-5` bottom line "the body is captured exactly and gives the machine only ... its rule names" | rewrite to "the
  body is not captured; exactness at construction"
- `:19` "`rules` and `turn` in the body; no `Flow.keyed`" | drop `rules` and `turn` from the NEW line
- `:49-53, 68-69, 80-81` walkthrough | toaster's `rules: { turns: ... turn(...) }`; `.rules({ expectBroken:
  [ToasterMachine.rules.NeverOverFour] })`; "On a machine that is not `Built` the `rules` record is empty" | the
  toaster's
  rules in `ToasterRules`; token `ToasterRules.NeverOverFour`; delete the not-`Built` sentence
- `:104, :109` problem classes B and G | "excess keys compile (`excess-keys.test-d.ts:69,93,99,104`) ... rule names
  unreachable"; "`enabled: import.meta.env.DEV`" | B's cure is now the runtime decode; G stays as history
- `:144, :150, :174` fit table | "`ExactBodyOf`, `RuleNames`"; "`Machine<D, R>`"; "`Compiled`: ... `rules`" | drop
- `:204-207, :223, :232, :240-242` | "turns rule" typed picks; "`Compiled.rules` and `Machine<D, R>["rules"]`";
  "@task.V3.T113
  builds the body capture first"; "@task.V3.T106 takes `BodyCapture`'s rules" | T113 builds no capture; T106 takes the
  set
  typing
- `:250, :259` | "costs the rule tokens, a stated limit"; "(G3, Q16)" | the first is gone; the second stays as Q16
- `:284-299, :309-322` Q2, Q3, Q5 | the before/after snippets with `machine<D, const B>` and `rule({ enabled: ... })` |
  history of decided answers: add a superseded line per Q2 and Q3
- `:365, :371` H3, H9 | H9 "Rule tokens are typed on a machine that is not `Built`" | closed by the move
- `:383-398` process notes | "(1) body capture and `derive.ts` ... 41 `Machine<typeof X>` assertions updated"; "(6)
  rules";
  "Migration cost seen in the copy: 41 compile errors ... `fixtures/sync/stories/structure.ts:61`" | step 1 has no
  capture;
  the 41 (now 32) assertions are untouched and the `@ts-expect-error` at `structure.ts:61` is not needed (a planted
  body with an unknown key still compiles; the Story's refusal is the runtime one)

`Host.spec` (11):

- `:17` derives_from @plan.Rules.O4 | stays; add O6 for the setup switch
- `:70-74` R8 `[H3]` | "A test that breaks a rule fails, whoever wrote it and however it was run" | the plain Runtime
  test
  case (proposal section 4.5) is not covered by a Story; amend with the user's yes, or keep and add the `afterEach`
  check (review H3)
- `:94-98` R12 | "checked against the rules placed at its state" | against the registered sets' rules placed at its
  state
- `:197-201` RuleSources (decided by the user 2026-11-22) | "machine rules (the body, `Compiled.rules`; judged by the
  Runtime's
  judge ...)" | "machine rules (registered sets: the entry's)"; the run rules module sentence stands `[H2]`
- `:289` verdict.ts | "R: the union of rule ids, typed from the config and Compiled.rules" | the sets' tokens `[H5]`
- `:333-335` PublicFaces | "machine rules use `Machine<D, R>["rules"]`" | "a rule set's tokens"
- `:423-424` judge signature | `judge(batch, last, off)` reads rules by a world's machines | also takes the sets by
  subject
- `:440-441` verdictOf | `verdictOf(run, index, rules, switch)` | `rules` includes the entry's sets
- `:746-766` The judge | "the invariant rules placed at the actor's state, the turns rules on the turn's edge" | same
  algorithm; its input is the registered sets, matched by subject id `[H1]`; "The setup option is `rules: "judge" |
  "off"`"
  stays
- `:827` pseudo-code | `ev = out.evidence ++ judge(out.evidence, last, off) ++ slowWork` | `judge` also takes the sets
- `:918` Needs Types | "`Broken.rule` is `R` from `Machine<D, R>["rules"]`" | rule ids of the run's sets

`Host.md` (5):

- `:128` | `host/judge.ts | new | the machine rule judge of the Spec's algorithm` | unchanged; note its input
- `:89` E row | "`Story.app` requires `rules`; the one unjudged runner is internal" | the run rules option, not the sets
  `[H2]`
- `:186-192` Q2 | "Linked to the types design's question on machine rules having no `enabled` flag" | stands; add a
  pointer to the registration
- `:239-240` Q12 | `Pay.rules.NoLostWrite`, `Pay.rules.NoLostWrite, step: 3` | `PayRules.NoLostWrite`
- `:77` | "`CleanupLeft` all judge the finished run" | no edit

`Changes.spec` (1): `:971, :973` | "the judge reading `turnsOf` and `Finished`"; "Needs `Types`: ... `derive.ts` and
body capture" |
drop "and body capture"; the judge's per-copy read of fragment sets is T106 build-time choice 1, not a Spec row.
`Operations.spec` (0): its `judge` is `owners.ts#judge`, a different function. `Schedules.spec` (0): `RT6` already
withdrawn. `Records.spec` (0).

Also: `wiki/specs/specs.log` needs one entry per Spec edit (the log lines at 703-713 already record Q19).
`wiki/specs/core`
and `wiki/specs/testing` hold older text; no `enabled` or `machine().rules` found, no edit.

## 3. Tasks (`wiki/tasks/V3/`): 7 to edit, 2 note only, 1 to leave

- `P5.task:617-728` T106 | title "Rules on machines: ..."; description "declare `invariants`, `turns` and `terminals` in
  `machine()`"; Risk "rule tokens need the machine's body type, which comes from T113, and shared bodies such as
  `pay.ts#PayBody`
  must still compile"; Approach "`enabled` and `RuleBroken` outside tests"; Build-time choice 1 to 4; acceptance "tests
  cover @spec.Types (R9, I12, I13)" | becomes the external-rules build: title "Rule sets: `rules(subject, build)` ...";
  Risk is the registration and the typing spike, not T113's body type; `enabled` clause becomes the Runtime
  `rules` option; acceptance cites the new rows; add the scan, `RulesUnregistered`, `RulesSubjectAbsent` and the
  `*.rules.ts` lint; Supersedes lists the old Rules O1, O3 and O6 text; blocked_by drops nothing (T113 stays for the
  derived types) `[H1, H2, H6]`
- `P4.task:2521-2616` T113 | "Approach: carry the body type and keep excess-key checks, since inferring the body loses
  them"
  (`:2588`); "False pass ... an excess key" (`:2601`); acceptance "Excess keys in a body still fail to compile"
  (`:2608`); "Why now: the body type is lost at `machine()`" (`:2531`); "`T106` (rule tokens) only add fields through
  it" (`:2594`) | delete the capture bullet and the excess-key acceptance, replace by "an unknown key is refused by
  construction and `flow check`" (a runtime test, not a type test); T106 adds no field through this type; the AnyBody
  and `derive.ts` rows stay; add a dated comment that body capture is gone (Q19). The "41 assertions updated" step is
  empty
- `P4.task:524-600` T22 | CLI `check`, `explain`, `graph` | adds: the unknown body key through `flow check` (a CLI-level
  test; only the construction test exists today), `RulesUnregistered` and `RulesSubjectAbsent` from the scan, per-set
  `TerminalLeft` and `RuleSubjectUnreachable` (review H5), `explain` lists sets `[H2]`; T106 builds the rows, T22 owns
  the command
- `P5.task:391-500` T29 | "Story.machine ... moved to T76, Story.fragment to T109" | no outcome edit; the "wrong subject
  kind
  for a Story constructor" test (`P2.task:414`) must cover the entry form `[H2]`; T29 touches `tests/rules/sweep.ts:166`
  (run rules), unaffected
- `P4.task:2224-2330` T109 | "Story.fragment exists"; comment "inferring the body loses excess-key checks" (`:2292`) |
  the
  comment is superseded (C); `Story.fragment`'s first argument is an entry; fragment sets, and the placement check,
  belong to
  T106 `[H2]`
- `P4.task:2318+` T110 | `.each` raise and `hostEvents` | no text change; the rules builder's `E` includes `hostEvents`:
  one
  line in T106 only
- `P5.task:762-830` T114 | "Supersedes: `tests/rules/rules.ts#checked`"; the verdict, judge, `propertyTest` and exit
  table |
  the judge's input is the registered sets, not `Compiled.rules`; Read-first adds Host R8 amend `[H3]`
- `P4.task:761-830` T76 | `Story.machine` first slice "with its input and the `props(values)` step" | first argument is
  the entry form if `[H2]` stays A
- `P4.task:3175-3180` T120 comment | "`KeyOmitsField` and `RuleNameTwice` (rules) are not schedule rows: @task.V3.T113
  and
  @task.V3.T106" | `RuleNameTwice` is T106's (`rules()` refuses it); T113 owns only `KeyOmitsField`
- `P5.task:17` order | "T98, T114, T106, T25, ..." | unchanged
- Leave: `P4.task:1922-2030` T104 (done) | comment "body and returned-key exactness stays at run time (TypeScript
  does not excess-check a returned object, and an inferred exact body breaks contextual typing)" | this is option C
  already; cite it from the T113 comment as prior art, no edit. Also T118, T89, T131, T140 (their "rules" are lint or
  run rules).

## 4. Code (`packages/flow-state-v3/src/`): 6 rows, 0 removals

Nothing to delete: no capture, `Exact`, `RuleNames`, `Machine<D, R>` or `Compiled.rules` exists. Both decisions are
mostly a promise not to build them.

- `src/machine.ts:106-114` `BodyOf`, `:271` `machine` | a conditional on `D`; returns `Machine<D>` | no change; it is
  already the capture-free shape Q19 chose. `BodyTokens` stays `{ S, E, O, C }`: no `turn` is added here
- `src/definition.ts:586-589` `Machine<D>` | one parameter | no change; do not add `R`
- `src/config.ts:347` | `onExcessProperty: "error"` strict decode, `UnknownField` (`:306`, `core/well-formed.ts:78`) |
  stays
  as the one refusal; no code change, only more tests lean on it
- `src/tokens.ts` | no rule, `turn` or `enabled` text | no change; the NEW `turn` belongs to the rules builder in a new
  module
- `src/host/setup.ts:83` `SetupConfig`, `src/host/runtime.ts:88` `app` | no `rules` option, entry form is `{ machine,
  context }` (`setup.ts:12`) | adds `rules: "judge" | "off"` and, per `[H2]`, `rules` on an entry (new)
- New, by T106: `src/rules.ts` (`rules`, the `RuleSet` brand, `turn`, construction refusals) `[H1, H6]`;
  `src/host/judge.ts`
  (already planned, input changes); the scan in `src/host/cli/discover.ts:115` and `main.ts` for `flow check`;
  `src/host/testing/config.ts:47` `defineConfig` gains `rules` globs `[H2]`; `src/index.ts` exports

`tests/rules/rules.ts` (578 lines; Flow's run rules, not machine rules): `Rule` `:35`, `rules` `:542`, `breachesOf`
`:569`,
`checked` `:574`. No change forced by these decisions; T114 already renames `breaches` to `broken` and deletes
`checked`. The
list moves to `tests/rules/list.ts` (Host companion), outside this pass. 6 `tests/generated` files pass `properties:
rules`;
121 `Story.app(` calls may take a run-rules option `[H2]`; neither is caused by the move.

## 5. Tests and type tests: 4 to flip, 1 kept as incidental, 0 to delete

Under C a type test that pinned "does not compile" for an unknown structural key becomes a runtime test; an excess key
compiles today.

- `tests/types/excess-keys.test-d.ts:66-71` | "a misspelt field beside a writable one compiles" (`cuont`) | flip: assert
  it
  compiles, name `tests/compile/construction.test.ts` as the refusal; or move the case to the construction test
- `tests/types/excess-keys.test-d.ts:92-94, :96-101, :103-105` | three "wrong" lines (`onn`, `updateMemry`, `bogus`)
  that
  compile | flip the same way; their runtime pairs are `construction.test.ts:654-670` (`UnknownField` on `gaurd`,
  `every`) and `:486`; add `onn` and `bogus` there if absent (3 tests)
- `tests/types/excess-keys.test-d.ts:89-91, :18-21` comments | "owed in types" | rewrite as "refused at construction by
  decision" (the `Owed` is no longer owed)
- `tests/types/excess-keys.test-d.ts:116-127` | "a nested state's unknown key is refused today" (`onn` in `states`) |
  keep as
  an incidental pin, comment it "not a promise (Q19)"; if the T113 migration turns it red, delete it and add the
  construction row
- Keep, no flip: `tests/types/machine.test-d.ts:34, :46, :56, :72, :90` and `tree.test-d.ts:42-77`: they refuse a
  misspelt
  *name* held in a typed record or token (a state, event or operation the definition lacks), which Q19 keeps. The 32
  `Machine<typeof X>` assertions (11 files: `machine` 6, `tokens` 5, `schedules` 5, `excess-keys` 5, `endings` 2,
  `tree` 2, `context` 2, `schedule-send` 2, `send`, `contract`, `nested-schedule`) stay valid: `Machine<D>` keeps one
  parameter.
- Add, new: a `flow check` CLI test for an unknown body key (`tests/cli/`, none today); the 10 two-sided `RuleSet` name
  pins and the duplicate-name refusal in `tests/types/` and `tests/compile/` (replacing T1's three dropped patches);
  `rules-file` lint tests.
- Rule tokens, `.rules(` and `RuleBroken`: no test, fixture or pin uses them yet (`grep` of `tests/`, `fixtures/`,
  `bench/`
  finds none), so no rule-token pin changes.
- `tests/rule-faults.ts`, `tests/faults.test.ts` | planted faults for Flow's runtime rules | unaffected; T106 adds a
  planted fault per rule kind (Plan V7), now over `rules()`.

## 6. Fixtures and reference apps: 0 sites

- `fixtures/**`: no `rules:` block, no `turn(`, no `enabled` flag (the `enabled` hits are `command-palette` domain
  words). No migration. T106's correctness acceptance asks for a fixture app that uses the feature: its `*.rules.ts`
  files are new (proposal section 1 names `fixtures/shop/machines/order.rules.ts`), and
  `fixtures/sync/stories/structure.ts:61`
  needs no `@ts-expect-error` (see `Types.md:393`).
- `wiki/plans/flow/references/checkout`, `dispatch-desk`: no rule, `enabled` or `turn(` text. Their "rules" are shop and
  server
  rules (`checkout/adapters/server.ts:1`, `dispatch-desk/README.md:125`). No edit; both are historical.
- `wiki/conventions/fixture-catalog.md`: no rule, invariant or expectBroken text. No edit.

## 7. Supersede notes needed (21)

Each is a sentence that records an old decision; per AGENTS write `a superseded note` beside it, never delete the line
without the user, and name the commit that holds the old text.

1. `Rules.plan:176-188` O6 | "Rules stay inline ... nothing needs registering" and the `import.meta.env.DEV` constant;
   inline was decided 2026-11-20 (@proposal.rules, "Inline, opted into outside tests")
2. `Rules.plan:23-25` O1 | rules in the `machine()` callback
3. `Rules.plan:112-121` O3 | `machine.rules.<Name>`, second type parameter of `machine()`, default of `Machine`
4. `Rules.plan:190-191, :201` O7 | "A `trait` or `subroutine` body holds the same `rules` block",
   `Upload.rules.CancelSticks`
5. `Rules.plan:102` O2 | "Terminals live in `rules`"
6. `Rules.plan:141` O4 | `UnclampedStepperMachine.rules.SetLandsInBounds`
7. `Types.spec:71-75` R9 | "The machine's type carries its rule names"
8. `Types.spec:129-132` Q2 (decided by the user 2026-11-22) | `R` defaults to `never`
9. `Types.spec:134-138` Q3 (decided by the user 2026-11-22) | "`turn` is a body token, not an imported function"
10. `Types.spec:225-257` Q19 | the three-option text (A `Exact`, B fixed depth, C); keep only the decided C
11. `Types.spec:428-466` | `BodyCapture` section (C6 of the earlier capture round)
12. `Types.spec:647-648` I12 | "`Machine<D, R>` assigns to `Machine<D>`"
13. `Types.spec:314` G3 | "decline reasons ... through `B`"
14. `Types.spec:615-616` I2 and `:24-31` R2 | exactness "at every depth" by type
15. `Types.spec:819-826` | the capture cost table as the plan of record
16. `Types.md:309-322` Q5 | `rule({ enabled: import.meta.env.DEV, ... })` "proposed earlier" (history; add a pointer)
17. `Types.md:383-398` | build step 1 "body capture" and the "41 assertions" migration cost
18. `Host.spec:197-201` RuleSources (decided by the user 2026-11-22) | "machine rules (the body, `Compiled.rules`)"
19. `Host.md:239-240` Q12 | `Pay.rules.NoLostWrite` (decided: not built)
20. `P5.task:617-728` T106 and `P4.task:2588-2608` T113 | body-capture wording (T113's comment of 2026-11-21 21:23
    already
    supersedes "typed by the body" for schedules; add the rule half)
21. @proposal.rules (2026-11-20), @proposal.body-capture-settled, @questions.advisor-questions question 1 | merged
    or
    superseded; delete each after its absorbing record names the commit (AGENTS), not summarise

## Interactions with the declared-schedules inventory (2026-11-22-declared-schedules-inventory.md)

- The schedule pins that read the body (`schedules.test-d.ts:84`, the `pausedBy` literal union) are in that inventory;
  Q19 adds that a typo in a `paused` key or `schedules` name is now a construction refusal, not a type error (Types T8
  (1)).
- `Types.spec:395` lists `RuleNameTwice` beside the schedule twins; both decisions touch that one sentence.
- T113 loses the capture bullet from both decisions at once: edit it once.
- `Types.spec:819-826`'s "30 to 40% expected with declared schedules" no longer applies once the capture is not built.

## What the user must approve before one update pass

1. The 9 outcome edits: Rules.plan O1, O2, O3, O4 (token form), O6, O7, O8, and Testing.plan O1 and Runtime.plan O1.
2. Whether the specs' superseded decisions (Q2, Q3, Q19's analysis) are marked or deleted, since they carry `[decided:
   user]`.
3. The open choices `[H1]` to `[H6]`, which the proposal is still revising: do not edit the rows marked with them until
   they are settled.
4. Reversing the 2026-11-20 inline-rules ruling (Rules O6); the proposal says so, the Plan still states it.
