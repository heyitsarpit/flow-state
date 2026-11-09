# Conformance suite status

## Round 1 (2026-11-09): layout, Port, prototype adapter, fake world, runner, first slice

Built: everything in the README's layout. The slice is two WriteLanes guarantees end to end:
`three-channels` (I3) and `attempt-identity` (I6), each with two lies, and the Pay cases `PAY-01`
to `PAY-05` ported with the same steps and expectations.

Latest numbers:

- `suite`: 5/5 on round-14, also with `--parallel 3`.
- `suite --runtime null`: 0/5 (every case states a failure).
- `falsify --parallel 4`: null runtime red, control green, 4/4 lies caught by their own oracle.
- `nub run check`: no errors, no warnings (23 files).

### Verdict comparison with the old suite

Same cases, same wrong runtimes, old suite run as
`bun main.ts --round 14 --runtime <rt> --no-search --no-catalog --only <cases>` from
`prototypes/conformance/`. Runs by the runner sidecar; (b) and (d) re-run by the lead.

| Runtime                     | Old suite                                                                        | New suite                                                                                         | Reading                                                                                      |
| --------------------------- | -------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| round-14                    | PAY-01..05 pass (PAY-01..16: 53/53)                                              | 5/5 pass                                                                                          | same                                                                                         |
| `k.failure-as-success`      | PAY-02 red by (j) "delivered as Confirmed, maps to PayNotSent"                   | PAY-02 red by `three-channels`                                                                    | same verdict, same reason                                                                    |
| `lie.still-unknown-dropped` | PAY-05 red by (h) "may be at the server, and no head on disk says so"            | PAY-05 red by `three-channels` "ends unknown StillUnknown"                                        | same verdict; the old suite had no I3 oracle, only (h) noticed the lane released             |
| `lie.resend-new-id`         | PAY-04 red by (h) on `att-1-1-again`                                             | PAY-04 red by `attempt-identity` "server received ...-again, runtime reported sending it 0 times" | same verdict, different oracle                                                               |
| `lie.resend-new-input`      | PAY-04 red only by the recorded-output compare; with `--no-output` PAY-04 passes | PAY-04 red by `attempt-identity` "sent with two inputs"                                           | old-suite weakness: no named oracle for WriteLanes R5/I6 "every send carries the same input" |

No new-suite bug was found by the comparison.

### Sidecar log

All Haiku, effort high. The lead read every diff and re-ran every check.

| Sidecar                                          | Task                                                                                                    | Result                                                                                                                                                                                                                         |
| ------------------------------------------------ | ------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Runner                                           | Old suite on PAY-01..05 and PAY-01..16, control and the four lies                                       | Accepted. The lead re-ran lies (b) and (d) and got the same lines. Noted: the old suite needs `--no-catalog` now (its catalog reads a deleted design file).                                                                    |
| Coder                                            | Lint fixes in `world/*`, `runner/child.ts`, `runner/run.ts`, `oracles/equality.ts`, `oracles/oracle.ts` | Accepted after reading the diff: `Storage.answer` and `Clock.nextDue` take and return `Option`; `RETURN_TYPE` reasons on exported factories; `sameData` split. The lead changed its one cross-file call site in `dsl/case.ts`. |
| Reviewer (one rule: test the spec, not the code) | The two oracles, the reference, the fact recording                                                      | 10 findings; see below.                                                                                                                                                                                                        |
| Reviewer (lint-bomb STYLE.md)                    | Every suite file                                                                                        | 18 findings; see below.                                                                                                                                                                                                        |

Spec-fidelity review, by finding:

1. Died call not checked as `unknown Defect` (R2). **Accepted**: `three-channels` expects
   `unknown Defect` for `Die`.
2. An ending in a later step than its answer is not judged. **Rejected** as a change, kept as a
   stated limit in the oracle's doc: pairing across steps misjudges a cancel or timeout that ends
   the Attempt between an answer and a re-send; the ending ledger (`one-delivery`) owns "every
   send ends".
3. `mayHaveApplied` came from the runtime's own reports. **Accepted**: now from the server's log
   (an earlier send of the id never definitely answered).
4. The delivery check is consistency only for endings the server did not decide. **Accepted**:
   the doc says so.
5. Declines pair in order per operation. **Accepted** as a stated limit in the doc.
6. Any failure reason fell back to the `NotSent` event. **Accepted**: only Flow's decline reasons
   (WriteLanes R3's closed list) map through `NotSent`.
7. `attempt-identity` claimed full anchoring. **Accepted**: the doc says which side is the
   server's.
8. Sent-equals-received per step is stricter than the Spec (a reported send may die before the
   server). **Accepted**: a received send must have been reported, not the reverse. The
   `lie.resend-new-id` lie is still caught (re-checked).
9. `advance` did not fire a zero-delay timer armed at its end. **Accepted**: it fires every timer
   due by the end, including ones armed on the way.
10. I12 has no oracle; T1/T2 lies absent. **Accepted** as work-list items.

Style review, by finding:

1. Request liveness rebuilt from phase plus page. **Accepted**: `Orphaned` phase set at a kill;
   the page comparison is gone. The continuation stays out of the log (a capability, not a fact):
   that part **rejected**.
2. `answer` not total over phase. **Accepted**: non-open requests are refused (`RequestNotOpen`).
3. Visibility flag. **Accepted**: `seen | hidden` with `hide` and `show`.
4. Attempt states as set membership in the oracles. **Rejected**: these are per-check
   projections over the log, recomputed each time, not stored state; each oracle needs a
   different projection.
5. `"null"` runtime as a magic string. **Accepted**: `RuntimeChoice` matched once.
6. Hand-decoded prototype reports. **Accepted**: decoded once with Schema; an unreadable report of
   a known kind stops the case (`PrototypeReportUnreadable`).
7. `Channel` and `EvidenceKind` declared twice. **Accepted**: `Schema.Literals` in `port.ts`.
8. Same as spec finding 6. **Accepted**.
9. Falsify's file reads not classified. **Accepted**: a failing read or write is `NotApplied`.
10. Unknown fixture names dropped. **Accepted**: `UnknownFixture` and `NoReference` stop the case.
11. Doc comments narrating history. **Accepted**: reworded.
12. A doc naming an oracle that does not exist. **Accepted**: reworded.
13. `advance` repeating `act`. **Accepted**.
14. `getOrUndefined` in scenarios. **Rejected**: expectations compare plain values, as the old
    cases did; an absent row reads `undefined`.
15. `Option.map` for effects; a consuming lookup. **Accepted**.
16. Untyped memory reads. **Rejected for now**: memory Schemas belong with the fixtures, which
    move here with phase 4's public API (README decision 4).
17. `ok` computed twice. **Accepted**.
18. A child's unreadable verdicts dropped silently. **Accepted**: `NoVerdicts` carries why; falsify
    counts the null runtime and the control only from verdicts a child stated.

### For round 2

Take the ending ledger (`one-delivery`, WriteLanes I15, I16, I22) with the Pay cases that need it
(PAY-06 to PAY-16), which brings the fake world's `lateAnswer`, `landLate`, storage `hang` and
reload paths, and the lies `a2.deliv-fail-samemail`, `d154.moved-fail-released`, `lie.released`,
`e8.wa-failure`. Then `lane-cells`. Compare verdicts on PAY-01..16 against the old suite.
