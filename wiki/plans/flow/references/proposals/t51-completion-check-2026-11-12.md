# T51 completion check (2026-11-12)

**Verdict: FAIL, on two small fixes.** Every acceptance item is met, and the three step-2 blocking items are
really fixed. Two things still block close. First, `ready()` after dispose succeeds, though Actors R22 says it
rejects; T51 built the rest of R22's admission, and nothing owns this gap. Second, the Keep-on-Held case does not
check the Held head that Actors R15 requires. Range `de68a161..8a20a030`. This check was read-only. It ran one
targeted test, `src/host/lanes.test.ts` (11/11 green), and no gates.

## Blocking findings

1. **`ready()` after dispose succeeds (Actors R22: "later ready, ensureActor, createActor and runPromise reject
   RuntimeDisposed").** `src/host/runtime.ts:215-225`: once booted, `ready()` returns `Deferred.await(booted)`,
   which has already succeeded. If it never booted, it boots into the closed Scope (`runtime.ts:202`). `admitting`
   (`runtime.ts:232-236`) guards only `ensureActor` and `send`. The lead's fix-round sidecar found this gap, but it
   was logged as "accepted as gaps, not in this step's list" with no owner (`P4.task`, T51's last comment). The Epic
   rule says a review finding lands as a failing check before its fix. **Fix:** in `ready`'s `Effect.suspend`,
   when the world's disposal is not Open, return
   `Effect.fail(new FlowError({ code: "RuntimeDisposed", … }))`. That is one guard with the same predicate as
   `admitting`, plus one assertion in the case "ensureActor and send after dispose reject RuntimeDisposed"
   (`lanes.test.ts:642-653`). The assertion goes red first. It is within T51's dispose work.
2. **The Keep-on-Held case does not pin the Held head.** `lanes.test.ts:517-536` asserts no throw, one
   `unknown Error` ending, two InvalidTurn issues and `kept.size === 1`. A build whose Keep also drops the lane (or
   ends the head) still passes, so the key comes free. That breaks R15's "stays parked on its lane, blocking its
   key". The code is right today: `keepBeside` returns `Move.Keep` (`cells.ts:171`, `299`), and the Keep move
   touches only the kept map (`lane-moves.ts:304`, `persist.ts:135-145`). **Fix:** assert that the lane's head is
   still `Held`, and that a second `Ring` declines `Rejected`. Show that a planted keep-and-drop runtime fails it.

## Acceptance, one line each

- **A1, total function with no flag:** met. `Keep.Held` is `keepBeside`. `lane-shapes.test.ts` now asserts that it
  is not `Impossible`, and `CommitCancel.Kept` is still `Impossible`.
- **A2, reports from evidenceOf:** met, as reviewed in step 2. The fix range does not touch it.
- **A3, Held head:** met (`lanes.test.ts` "a restored Held head…", green).
- **A4, gates and check:** met by the record. `gates.json` at 6bb02721 shows limits 6/6 with the row retired
  (ruling (a)), and the other gates at their step-2 counts. Gates and `nub run check` were not re-run here.
- **A5, crash:** met by the record, 732/735. The three reds are named out of scope.
- **A6, dispose before Scope.close:** met. `driver.ts:195-214` awaits the core's Disposed, bounds the flush, and
  then `runtime.ts:270` closes the Scope.
- **A7, I21, seam and Spec-id lints:** met. The fix range leaves them unchanged. The `Evidence` value export is now
  logged (A7's open note).
- **A8, Q5 cells:** met as amended. `Keep.Held` came out of Q5, as the review ruled (Actors R15), and the
  WriteLanes composition says so.

## Step-2 findings: really fixed?

- **Keep on a Held head:** fixed (`cells.ts:299`). The case was red on the Defect at 77df3dc9 (record) and passes
  now. Its check is weak (blocking 2).
- **Unbounded flush:** fixed (`driver.ts:195-214`). `Effect.timeout` gets the rest of `DISPOSAL_BOUND_MS`, measured
  from the call to `dispose()`, on the platform Clock (`Effect.provideService(Clock.Clock, clock)`). Past it,
  `Issue { StorageFailure }` is reported. The timer runs on the test clock (`page.advance`), and the test has no
  sleeps or wall-clock time.
  - The test catches a short bound by assertion. At 4 s, `pollUnsafe` is defined at 4999.
  - A long or missing bound fails only by hanging until the runner's timeout.
  - The test cannot tell a bound counted from the call apart from one counted from the flush's start: the disposal
    ends at t=0, with nothing on the wire. That is a non-blocking gap. To close it, answer a call at t=3000 and
    expect StorageFailure at t=5000.
- **RuntimeDisposed:** fixed for `ensureActor` and `send`, including the Disposing window, since the guard is "not
  Open". `ready()` is still open (blocking 1).
- **Limits row:** retired (`conformance/limits.ts`), with limits at 6/6.
- **`Evidence` value export:** logged, with how to reverse it.
- **(b1) cancelled unknown with no value, and (b2) owed re-send:** both now have checks, and the record says each
  goes red against a planted runtime. The b1 case injects `Settled` directly, so the host's classifier is not on its
  path. Accepted, because b1 is a rule of the core's Cancelling cell.

## Rulings

- **`Error`, not `lost`: accepted. This is not an edit to pass.** The fixture's commit wraps a plain string,
  `Outcome.unknown("lost")` (`lanes.test.ts:43-45`).
  - A string has no `_tag`, so `reasonOf` gives `Error` (`src/flow.ts:97-98`). That classification dates from T16
    (5206dd7d) and was untouched by T51.
  - The Plan treats untagged errors as one class: "one event for an untagged error/failure" (Operations.plan
    lines 125 and 183). No Spec names a reason taken from an untagged value, so `lost` was never a rule's answer.
  - The reason is fixed when the ending is admitted, before any refusal (`serve.ts:171-172`), so it cannot tell kept
    from lost either way. The kept-not-lost requirement rests on the other assertions, which blocking 2 strengthens.
  - Spec gap, for `revisit.md`: no Spec states the literal reason of an untagged error (WriteLanes R2 and R4 say
    only that it is a failure or unknown and how it maps).
- **`ready()` after dispose: confirmed.** It is a one-guard fix within T51's dispose work (blocking 1).
- **Error names:** both match the Specs. `StorageFailure` on `IssueCode` is Actors R23 ("a write still pending
  reports StorageFailure", also WriteAhead and Persistence O5). `RuntimeDisposed` on `FlowError` is Actors R22 and
  the error list at Actors line 269 (also Diagnostics.plan line 96).

## Sidecar log

Blind sidecar (Haiku, effort high; Specs, Plans and `src/` only). Items it alone found are missed requirements.
Those T51 does not own go to their owners and need a failing check there.

- **Accepted (T51's):** 2, `ready()` (blocking 1; re-read `runtime.ts:215-225`); 6, order and bound match.
- **Accepted as missed requirements outside T51** (all present at T51's start; route by the orchestrator):
  - 3, dispose during bootstrap does not cancel it (Actors R4; `runtime.ts:220`);
  - 7, `CleanupFailed` and `ReleaseOverdue` are absent, and `dispose` is `Effect<void>` (R22, R23);
  - 20, no `ReservedReason`, and an author tag named like a Flow decline counts as definite (`cells.ts:131`;
    WriteLanes R3);
  - 22 and 23, a mapper throw drops its cause, and the mapper context is `{}` (`machine.ts:173`; WriteLanes R4);
  - 26, a lane-less ending is lost on its second refusal: `keepEnding` does nothing without a lane
    (`lanes.ts:257-260`), as at 909f4bee (`persist.ts:123-125`). Actors R15 and WriteLanes I24 forbid this.
- **Changed:**
  - 10, a Recapturing head that goes Held at disposal is not re-persisted (`lane-moves.ts:219-222`). Its record
    keeps `inFlight: true` (`record.ts:140`), so the next boot wakes the identity eagerly (`incarnations.ts:354-366`)
    where R22 says "Held on disk". Real, but low severity: delivery is unchanged and only the wake is eager.
    Proposed for revisit.md.
  - 11, the R15 and R10 wording: reconciled by the composition note T51 wrote, so not a gap.
- **Rejected:**
  - 9: disposal voids an owed re-send (I26), so a refused capture owes no second ending;
  - 25: a parked ending's first delivery to the next incarnation is an ordinary first try, and only kept endings get
    `Tries.Last` (`incarnations.ts:106-116`);
  - 12, 13 and 14: already routed to T18 (4d247101);
  - 15 to 18: T18's cells, or covered by the composition;
  - 1, 4, 5, 8, 19, 21, 24: outside the range, met, or stated limits.

Adversary sidecar (Haiku, effort high; each new case in `lanes.test.ts`):

- **Accepted:**
  - case 1, a keep-and-drop runtime passes (blocking 2);
  - case 5, the start of the bound is untested (non-blocking, above), and a long bound shows only as a hang;
  - case 6, `ready()` is unchecked (blocking 1).
- **Changed:**
  - case 2, the classifier is skipped because the case injects `Settled`. Accepted as scoped to the core cell.
  - case 4, the store answers synchronously, so a fire-and-forget flush would pass. Case 5's hung store covers
    the wait.
- **Rejected:**
  - case 3's `Owe` → `Resend` mutant: the record shows the case going red with the Ended cells set to `impossible`.
    An immediate re-send still re-sends once, and the capture order is R8's composition, which is out of this range;
  - case 6, "only Disposed checked": the guard is "not Open", and Disposing is covered by the predicate.
