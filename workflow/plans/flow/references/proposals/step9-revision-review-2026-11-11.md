# Step 9 revision review (2026-11-11, `857873d8..15ac1a62`): partial, paused

**Status: partial, paused at the coordinator's request (the user is restarting Claude Code). No verdict yet.**
What follows is what I verified, then the four Haiku sidecars' leads, which I have **not** yet verified. Do not
act on any lead until it is re-run or re-read by the resuming reviewer.

## Verified

- A `git archive 15ac1a62` copy (scratchpad `h15`, with root configs and node_modules, apps, codebases, reference,
  scripts and `packages/flow-state` linked) runs the suite at **92/92** (`main.ts suite --parallel 4`).
- HEAD moved during the review: `42451e51` (anchor state in `turn/anchor.ts`) and `498e5a76` (publication) landed.
  The resumed review should pick one commit and re-run there.
- Not yet run: null runtime, falsify, coverage, the H1 header probe, `k.drop-row` and `q1a.unchanged-resets` on
  their 18 cases.

## Sidecar leads (unverified; each with the sidecar's file:line, paths under `packages/flow-state-v3/conformance/`)

Candidates for High (report-driven holes, the H1/H2 class), to verify first:

- **a1** `Evidence` discharges every `Await` of its Attempt, not only its own kind (`dsl/lifecycle.ts:213-223`),
  against STATUS's "never a discharge of another". Claimed case: cancelAll plus latest gives both Await
  NotSentCancelled and Await Superseded; an Evidence Superseded drops the I21 Await.
- **a2** a boot's `AwaitRestore` is skipped for a head whose ending the report `Parked` (`dsl/lifecycle.ts:371-382`),
  not gated by held uses (held is cleared at Reload, `dsl/lifecycle-step.ts:281-284`).
- **a3** `Unhandled`/`Denied` close the first Delivering ending of any actor (`dsl/lifecycle-step.ts:61-69`), while
  `selection` attributes to a different actor (`turn/selection.ts:278-300`).
- **a5 / c-U4** a Turn with no root part lets the reported `to` pick the alternative (`turn/selection.ts:92, 116-121`),
  which then picks the row and releases (`dsl/lifecycle-owed.ts:139-170`).
- **c-U1** a non-Live actor routes `either` before the restored check (`turn/anchor.ts:76` before `:81`), so in a
  reload step a restored ending may run a root alternative instead of R20's leaf alternative and pass.
- **c-f** `from` is the report's for non-Live actors (`turn/selection.ts:81`), against "never the report's".
- **a4 / c-d** a `Delivered` with no actor admits the event for any actor (`turn/selection.ts:155`).
- **a6** an unknown's `retained` follows the reported reason (`dsl/lifecycle-step.ts:165`, `fixtures/reference.ts:56-58`;
  the old L2), and `ending-channels` does not judge an unknown's reason.
- **a7** `retryable` counts reported Sends; `attempt-identity.ts:46` bounds only under-reporting, against STATUS 1185.
- **a8, a9** `Incarnated` (gated by a Drove alone) and `Finished` overwrite the suite's record
  (`dsl/lifecycle.ts:525-527`, `dsl/lifecycle-fold.ts:41`).
- **a11** a claimed unknown `Cancelled` excuses Actors I35's timing (`actors/disposal.ts:73-93`; old L3).
- **c-U5, U6, U7** a Delivered outranks driven credit for a refusal's actor; scheduled events admit any actor at any
  time; the restored set is gated by any actor's Ensured in the step.

Lost checks (sidecar b; it found no mutant whose cases shrank and no lie removed):

- the once-per-step `Incarnated` assertion went with the `incarnation` field (`dsl/lifecycle-step.test.ts:273-283`);
- `lanesOf` changes behaviour for a key-less commit member (`dsl/lifecycle-owed.ts:121`), logged as a rename only;
- mutant `cmp.guard-runs-at-construction` removed, so CMP-01's guard expectation has no proving mutant;
- `ending-channels`' fifth check accepts unknown { Restored } with no at-boot test (`:351-352`);
- Actors I38's delivery clause and Turn I2/I26's stated limits count as whole-checked in coverage, with no
  remainder rows (`suite.ts:110-113`).

Selection against Turn (sidecar c): handler tables match the typed sources (no mismatch); STATUS 1271 and 1300-1302
contradict each other on root-first; STATUS 1158's "12 cases" against one case in the mutant file.

Size (sidecar d, at `42451e51`): lifecycle production 2,002 → 2,033 code lines; the reviewed set 2,504 → 3,149
(+26%, mostly the new `turn/` files). Of M3, `incarnation` and `lanesNamed` are cut; `Adopt`, the shared deadline,
`PendingCancel`'s `never`, head derivations (now seven), the member cursor, `mode`, the toggles and `hearing` remain.
New: a 20-cell phase table with changes outside it, owner (state, entry) stored twice, a string key split back with
`split(" ")`, 21 lines over 120 characters, 31 review tags in comments, 10 over-exports.

## To resume

1. Pin a commit (HEAD now), rebuild the archive copy, re-run suite, null, falsify and coverage.
2. Probe a1, a2, a3, a5/U4 and U1 with round-14 edits (scratchpad `s9d/one.ts`, `sweep.ts`), plus the H1 probe and
   `k.drop-row`/`q1a.unchanged-resets` on their 18 cases.
3. Verify the rest by reading; log each lead accepted, changed or rejected; write the verdict.
