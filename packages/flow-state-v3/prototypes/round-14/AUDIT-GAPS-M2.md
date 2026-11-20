# Audit gaps to close (audit M2, migration round 3 and Q1 A)

Status: open, 2026-11-09. The auditor's wrong runtimes are in `mutants-audit-m2.ts` (14; 8 survive; run with
`mutate.ts --list mutants-audit-m2.ts`, control green, every kill read on its target case and red for the expected
reason). Probes were run in a scratch copy only; nothing in the suite or runtime was edited. For each survivor, write a
case from the cited text that turns it red by assertion, and keep it as a standing gate.

## Runtime breaks
1. **[runtime break] A new identity's own decline is lost** (rule 74; 2.7.13 every commit ends once, to its owner).
   Repro: the `Lab/P1MVal` case, with `concurrency: "reject"`. Release 1 `t: "42"` holds `save`. Release 2 makes `t` a
   `NumberFromString`. Ensure `t: 42` and commit. The commit meets the old identity's lane (same lane id, turn.ts ~736)
   and declines `Rejected`. `admitEnding` (turn.ts ~1175) tests `ofIdentity` on that old lane, so it parks the new
   identity's own decline: its `No` handler never runs (`why` stays `""`), and (j) goes red. The keyed and key-less
   `cancel` do not drop the old hold (probe: still on disk and `UnboundLane` at the next boot). They do call
   `letGoKept` on that lane, so they could let go of the old identity's parked endings (by reading only, not run).
2. **[runtime break] An op rename overwrites a quarantined hold** (2.7.15 "(actor identity, contract id, key)"; rule
   46 "the record stays"). Repro: release 1 `probeOps("pay", String, "charge")` holds both `pay` (`p1m/probe`) and
   `charge` (`p1m/other`) on `k: a`. Release 2 `probeOps("charge", String)`. The `charge` lane over `p1m/other` is
   quarantined (correct). `pay` is renamed onto the same id `charge|{k:a}` with no collision check (`renamedOp`,
   durable.ts ~547), and the boot's flush overwrites the quarantined record. Oracle (h): "att-1-2 may be at the
   server, and no head on disk says so".
3. **[runtime break, by reading] A history target the release removed is quarantined, not reset** (Q1 A "a saved
   state goes away"). `shapeReset` walks only `leaf` and `kids` (durable.ts ~147), and `validInc` refuses the history
   value (gate.ts ~511). The result is `RecordQuarantined`, not `RecordShapeChanged`. The harness's `unreadableNow`
   does not check history either, so (j) would be red on a correct reset.
4. **[runtime break, CLI] `explain --since` says "reset" for an identity field change**. `resets()` (cli/explain.ts
   ~77) reads `shapeVersion` alone, but the boot keeps the record as rule 74's old-version record, checked first (Q1
   stated limit).

## Survivors to close (suite gaps)
5. `m2.q1-fragment-state-gone-ignored`, `m2.q1-fragment-field-version-ignored`: no case changes a fragment's state or
   field Schema across a release (Q1 A; 2.2.2 "for fragments and machines alike"; shapeVersion includes fragments).
6. `m2.q1-retired-record-not-reset`: a retired record (D99, rule 73's return) across an incompatible change; Q1 A
   "saved memory and state are discarded".
7. `m2.q1-issue-per-record`: two records of one definition reset in one boot; Q1 A "an issue naming the definition".
8. `m2.q1-reset-drops-parked-endings`: a parked, non-hold ending across a reset, heard at the adopting ensure; Q1 A
   "lanes, holds and endings survive". The q1a set covers holds only.
9. `m2.q1-reset-keeps-timers`: a record with a waiting deadline (rule 73) reset; the deadline must not fire into the
   fresh actor.
10. `m2.q1-unstamped-record-resets`: the `format1()` helper (phase1m.scenario.ts ~143) keeps `shape`, so no case reads
    a record with no shape stamp (Q1 stated limit "restores as before"). Strip `shape` in it.
11. `m2.rename-any-op-kind`: no release has a read op over the renamed lane's contract (2.7.15, the runner's "the one
    write op").
12. Over-narrow kill: `m2.r74-live-ending-ignores-identity` is red only by whole output. The case
    `a-new-version-actor-...-does-not-hear-the-old-hold` asserts `unsure` right after the ensure, before the old
    hold is delivered. Assert again at the case end.
13. Cases for breaks 1 and 2 (the probes above, written as cases).

## Harness excuses
14. The (j) excuse `unreadableNow` (drive.ts ~733) reads the record's own `shape` and `fields` stamps, which the
    runtime wrote. Its shape rule is a transcription of `shapeReset`, so a shared misreading (items 3, 18) is
    excused by construction. The suite knows which release wrote each record, so compute "was" from that release's
    compiled `shapeVersion` instead.
15. The boot (j) check skips an op only by name (drive.ts ~946). A lane whose contract is gone, while an op of its
    name exists over another contract, is a correct quarantine (2.7.15) but reads as a missing ending. Key the skip
    by contract.
16. `quarantined(actor)` excuses every ending of an actor; 2.7.15 quarantines per lane (low).

## Open design questions
17. **[design question] Rule 74 gives an old identity's hold no exit.** "Only the owner's `cancel` drops a hold", and
    "no ref can spell its identity". `previous[i]` is 2.7.15's key-version route, not an identity route. Is it held
    until `forget`, forever, or released by an ensure of the new identity? And does a new identity's commit on the
    same key decline (as built) or get its own lane, as (identity, contract, key) says?
18. **[design question] Per definition or per record?** The user's words: "that definition's saved memory and state
    are discarded". As built, a removed state resets only the records saved in it (`if-saved-in-a-state-gone`).
19. **[design question] What counts as incompatible.** As built, any structural version change of a kept field counts:
    `minLength(1)` to `minLength(2)`, or a widening, resets data that still decodes. Computed and private fields are
    stamped too. A fragment change resets every host that places it.
20. **[design question] A field dropped, then re-added.** Untouched records are not rewritten (D111). A field dropped
    in release 2 and re-added in release 3 restores release 1's value with no reset and no `FieldDropped`.
21. **[design question] `explain --since` across a chain.** It compares two releases, but a record carries the shape
    of the release that last wrote it (r1 to r2 to r3, with r3 reverting r2, prints "no" where the boot resets).
22. **[design question] Shape stamps across a Flow version-format bump.** `shapeReset` compares entries raw. R7's
    by-format comparison exists for identity and key stamps, not for shapes. This is latent: only one format exists.
23. **[design question] Merging into the design text.** The reset-at-boot text conflicts with "a restored record stays a
    record until an ensure" (2.7.13) and with "from its saved leaf" (2.7.15) for a reset record's hold. Neither the
    events (`RecordShapeChanged`, `HoldWithoutRecord`, `UnboundLane`) nor `--since` are in machine-design.md yet.
