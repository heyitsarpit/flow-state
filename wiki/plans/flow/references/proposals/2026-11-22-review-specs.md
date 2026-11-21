---
review review-specs
status open 2026-11-22
---
# Review: the six v3 Specs, read as a coder about to build (2026-11-22)

Nothing here is decided; the lead of each Task decides each item. Paths are under `wiki/specs/v3/` unless they start
with `packages/`. Cites below are `file:line` of the text at HEAD.

**Bottom line:** buildable with seven fixes first. Each Spec is detailed enough to code from, and every `code:` cite
(about 45) and every fit-table symbol I spot-checked resolves, with two exceptions (M1, M2). The seven blockers are
cross-Spec seams, not single-Spec gaps: two Specs say different things for one input (B1, B2, B5), one name is
two things (B3), or each of three Specs says another one designs it (B4). Fix these before @task.V3.T118,
@task.V3.T122 and @task.V3.T131 start.

Read: all six `.spec` files, the fit and seam sections of the six companions, 45 `code:` cites, about 40 unprefixed
line cites, and the coverage and tests of each Spec against its Requirements and Invariants. No sidecars, no gates.

## Blocks build

- **B1. Props reach a schedule as two different occasions.** @spec.Schedules says a props change is a `Turn` for every
  scope; @spec.Changes says an `Inputs` change (props) is `Context` and "has no `Turn`" (R20).
  Evidence: `Schedules.spec:544`, `:555`; `Changes.spec:131`, `:665`, `:779`. They differ at once: `Context` may not
  restart through a disarming turn, and `Turn` carries `started` and `disarmed`.
  Fix: props is `Context` everywhere (Changes is the applier; R20 is a user rule); delete "props" from
  `Schedules.spec:544` and the sentence at `:555`.
- **B2. A saved schedule has no address.** `PositionShape.schedules` is `{ [name]: ... }` (`Records.spec:267`), but
  @spec.Schedules says "the record holds each scope's schedules by its state path" (`Schedules.spec:294`) and
  @spec.Changes scopes names per activation (`Changes.spec:793`). Two active states may declare one name, and the
  Schedules composition still lists "scoped or machine-wide" as a request to Changes (`Schedules.spec:646`, answered
  at `Changes.spec:793`). Also `Position.schedules: Scheduled` (`Records.spec:334`) is one schedule, not the map.
  Fix: `schedules: { [statePath: string]: { [name: string]: ScheduleShape } }` in `PositionShape` (and
  `InstanceShape`), and type it `Schedules`-by-path in `Position`; add one row to the reference table for the path.
- **B3. One saved-issue type, two names, and one renamed field.** @spec.Schedules unwritable states and plants say
  `Incarnation.issues` holds `StoredIssue` (`Schedules.spec:265`, `:918`, `:921`). @spec.Changes renames the field
  `outcomes` (`Changes.spec:244`) and @spec.Operations names the union `StoredSource` (`Operations.spec:291`). The
  `schedule-issue-stored` plant and the `StoredIssue` brand pin cannot be written as stated.
  Fix: use `outcomes` and `StoredSource` in Schedules (all four lines).
- **B4. Three Specs each leave a design to another.** (a) The public event a view sends for `refetch` and a
  fragment's event address: Changes Q6 says "owned by `Host`" (`Changes.spec:188`), Host Q6 says "not designed here"
  (`Host.spec:134`), Operations Q19 says "designed with `Host`" (`Operations.spec:191`). Blocks @task.V3.T122.
  (b) The alarm kind order at one instant: Schedules says "`Host`'s" (`Schedules.spec:628`), Operations and Changes
  state it as proposed (`Operations.spec:792`, `Changes.spec:1011`), Host's Spec has no alarm text at all.
  (c) The public `Published<D>` and `Turn<D>` faces: Types offers them as `EvidenceOf<D>` (`Types.spec:701`), Host
  offers them (`Host.spec:880`), Changes calls them the host's (Q5). Fix: name one owner each, in that owner's
  Spec: (a) and (c) Host, (b) Changes (it owns `tick`); delete the pointer in the other two.
- **B5. The input gate is built in one Spec and a bench-gated cache in the other.** @spec.Changes states it as the
  rule of row C5, with the `Refused` exception (`Changes.spec:789`). @spec.Schedules marks it `[proposed]` and "lands
  only when the bench shows the reads matter" (`Schedules.spec:161`, `:758`). A coder of C5 builds it; a coder of `pass`
  leaves it out. Fix: one home, in Schedules Q1; Changes row C5 says "passes every scope that hears the occasion; the
  gate, if it lands, is Schedules'".
- **B6. Decided but still open: the made-value brand.** R10 is `[decided: user 2026-11-21]` "B", the shared symbol on a
  frozen prototype (`Operations.spec:70`, `:214`), while Q6 still reads "the user confirms the first" with
  `[proposed]` (`:133`), and Q16 makes the doors Task wait on Q6 (`:178`). Blocks @task.V3.T131. Fix: close Q6 and
  Q16's dependency on it, or mark R10's tag `[proposed]`.
- **B7. `decide` takes a `Schedule` no Spec defines.** `Schedules.spec:305` lists `Schedule` as "existing", but the
  tables read its facts: keyed or not, declares `restartOn`, `armsOnEntry`, the reason names, the send mapper. The row
  "keyed or arms on entry" (`:482`) and the decoder row "an entry arming" (`:518`) need `armsOnEntry`, which is a
  parameter name in `schedule-plan.ts:150`, not a field. Fix: add the compiled `Schedule` record to `OccasionTypes`
  with the five facts above, marked CHANGED.

## Minor

- **M1. Wrong file in a fit row.** `Schedules.md:161` puts `seriesId` in `compiled.ts`; it is in
  `packages/flow-state-v3/src/core/schedule-plan.ts:88`. Fix: change the file.
- **M2. Wrong file for `Out`.** `Host.spec:253` and `Host.md:129` say `Out` is in `core/tx.ts`; the type is
  `packages/flow-state-v3/src/core/world.ts:770` (`tx.ts` only imports it). Fix: change both.
- **M3. A name used for two types.** `ScheduleReads<Key, Why>` is the five-function read bundle in Schedules
  (`Schedules.spec:325`) and a "schedule issue's source" in Types G8 (`Types.spec:268`). Fix: Types G8 names the
  public source `ScheduleIssueSource`.
- **M4. The issue source of a schedule is listed three ways.** Schedules and Types say name, key, reasons
  (`Schedules.spec:653`, `Types.spec:268`); Operations has `{ name, key, at }` (`Operations.spec:297`). Fix: pick
  one (the Operations text is the one with an address) and edit the other two.
- **M5. `TimerShape` is spelled in two Specs.** `Schedules.spec:281` and `Records.spec:280` both write it, and Records
  says "spelled once here". `ScheduleShape` exists only in Schedules. Fix: Schedules cites `Records`' spelling and
  keeps the decode rows only.
- **M6. Stale type name in Records.** `Records.spec:829` and `:851` derive `schedules` from `Tracked` and say
  Schedules saves `Tracked` "as it stands"; the saved form is now `TimerShape` and the typed side `Scheduled`.
  Fix: replace both.
- **M7. Decode rows are cited by number but not numbered.** Records cites "decode rows 1 to 7, 8 to 10, 11, 12, 13"
  (`Records.spec:622`, `:647`, `:775`); `Schedules.spec:515-535` lists the rows unnumbered, and a reorder breaks the
  cite. Fix: number the thirteen rows D1 to D13 in Schedules and cite those.
- **M8. A Types closing cite points at text that is not there.** Types Q9 is "Closed by `Schedules` R16: a key is a
  field record" (`Types.spec:161`); Schedules R16 does not say it (`Schedules.spec:140-152`); the decision is in
  Types R8 (`Types.spec:68`). Fix: cite Types R8.
- **M9. Records says a boot report is no issue; Operations says it is.** `Records.spec:227` (S10: readers evidence and
  CLI) against `Operations.spec:698` (`RecordUndecodable` has `issue: true`) and `recordIssues` (`:832`), which
  no Spec defines. Fix: Records names which fates are issues, or Operations drops `Record` from `IssueSource`.
- **M10. `judge` lives in two places.** Host S8 puts the rule judge in `host/judge.ts` (`Host.spec:207`); Operations
  says it "stays local to `host/testing`" (`Operations.spec:888`). The code has `owners.ts#judge` as another judge.
  Fix: Host names the file; Operations only keeps `owners.ts#judge`.
- **M11. Leftovers that need the proposal or companion beside them** (each fix: delete the clause or say it in the
  Spec). Section numbers of the old design: `Host.spec:122` ("6.1"), `:146` ("6.10"), `Records.spec:104` ("table 6.6").
  Earlier-draft ids: `Records.spec:147` (R-L1 to R-H6, I-L1), `:159` ("SR's D2 to D4"). "The companion" as a source:
  `Host.spec:155-159`, `Records.spec:158-161`, `:733`, `:796`, `Types.spec:720`, `:804` and `:814` (the toaster of the
  companion is T1's and T3's fixture, so move it to a fixture file). "The older Task", "the Plan's older sentence",
  "the derived-issues design's accepted rule": `Schedules.spec:18`, `:37`, `:535`; "concept designs": `:60`, `:130`.
  Sources written as "Problem class G1 (`Changes.md`)": `Changes.spec:74`, `:81`, `:111`, `:117`, and more. No
  `@proposal` or `@review` link remains.
- **M12. Test names the Spec cannot expand.** Schedules T4 uses rows `plsk`, `lapk`, `nroa`, `etk` and says "Letters
  are the ledger's" (`Schedules.spec:833`); no file in the package holds those letters (`tests/turn/schedule-ledger.ts`
  has none), so only the written-out steps define them. Fix: say "letters are the steps' initials" or drop the names.
- **M13. R0 is a walk row named like a Requirement.** `Changes.spec:101`, `:417`, `:421` cite "R0" (row at `:587`) in
  the namespace of R1 to R26. Fix: call it W0.
- **M14. Stated numbers that come from a model outside the repository.** `Schedules.spec:799-801` (22,464 and 52,608
  states), `Operations.spec:1023-1030` (899,873 steps). The Specs call them "the scratch model"; no coder can re-run
  them. Fix: mark them history, not acceptance.
- **M15. The dated Operations questions still read open or blocking** while a seam answers them: Q13 ("answered in
  `Records`") and Q19 (see B4) (`Operations.spec:167`, `:191`).

## Correctness hooks (item 5)

Schedules, Operations and Types name a check for every Invariant except those below; Schedules T4 and Operations T4 and
Records T4 to T14 are real wrong-ending Stories. The gaps:

- **Changes** has no `proven_by` at all (all `open_by Q1`, `Changes.spec:1038-1063`), and no test cites R7, R8, R10,
  R18 to R22 or R24 (`:1065-1145`); I11 is in no test. Fix: add one line per Requirement to T1 or T2.
- **Host**: I17, I21, I22, I23 and I24 are cited by no test (`Host.spec:987-1040`); R9, R12, R13 and R15 are
  therefore unproved. Fix: T1's list covers I17 to I24, plus a planted fault each for I21 and I24.
- **Records**: I14 (install fires nothing) and I19 (hydrate has no work kind) have no test or planted fault
  (`Records.spec:880-934`). Fix: add `install-fires-event` and `hydrate-carries-work` to T15.
- **Operations**: I20 and I22 are cited by no test (`Operations.spec:1012-1082`); I22 (alarms match) needs the sequence
  check beside Changes' I12. Fix: T1 or T7.
- **Cross-Spec**: Changes I12 (the heap holds one alarm per owner fact) and Schedules I9 name the same property;
  only Schedules has a plant for it. Fix: one shared alarm sequence check, named in both.

## What I checked and found right

About 15 line-number cites in `Operations.spec`, `Records.spec` and the fit tables (`close.ts:282-296`,
`tx.ts:188-191`, `lane-moves.ts:189`, `:230`, `:280`, `world.ts:49-60`, `:41`, `disposal.ts:85`,
`incarnations.ts:301-302`, `lanes.ts:125-133`, `contract.ts:247`, `:256`, `:60`, `:70`, `handles.ts:30`,
`entry.ts:46`, `compiled-parts.ts:74`) land on the named code. All `code:` cites resolve to a file and a definition,
and the nine existing plants of Schedules T6 all exist in `tests/schedule-faults.ts`. The tables of Schedules
(Keys, Selection, Arming, Firing, Reasons, Timing) read as total and consistent with its Invariants, and with
`rules` and the pseudo-code.
