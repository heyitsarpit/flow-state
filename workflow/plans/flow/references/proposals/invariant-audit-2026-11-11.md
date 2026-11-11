# Invariant audit (2026-11-11, all 186 core Invariants)

**Verdict: 161 of the 186 core Invariants are Essential and stay. Cut 18 (16 still owed, 2 already checked) and
reword 7. But resolve 26 conflicts first.** Five of those conflicts are ruled or known but not yet written into the
Specs. Twenty-one are new.

The biggest problems are not surplus Invariants. They are these:

- Construction throws on errors that `flow check` must report as findings (C6).
- Diagnostics classifies a failure two ways (C7).
- WriteLanes I2 and I12 are worded as "iff" and "only", and the Requirements break both (C9, C10).
- Several Invariants overclaim: WriteAhead I17's "no remote write is repeated" and Actors I24's "never lost"
  (C15, C16).

The cuts save 16 oracle-or-case plus mutant pairs of the 150 still owed, about 11%. Fixing the conflicts and
rewordings first saves more: without them a builder stops mid-Task, as four already have.

Everything here is proposed. Cuts and rewordings change guarantees, so they need the user's approval (V3 log,
2026-11-11T03:42:23Z). The audit changes no Spec.

Abbreviations: WL is WriteLanes, WA is WriteAhead, Diag is Diagnostics and CLI is StaticCli. A Spec name with Rn or
In means that Spec's Requirement or Invariant.

## Counts

| Spec        | Total   | Essential | Implied | Redundant | Untestable | Low value |
| ----------- | ------- | --------- | ------- | --------- | ---------- | --------- |
| Compile     | 17      | 15        | 0       | 0         | 1          | 1         |
| Diagnostics | 10      | 9         | 1       | 0         | 0          | 0         |
| Codec       | 6       | 5         | 0       | 0         | 0          | 1         |
| StaticCli   | 12      | 9         | 1       | 0         | 2          | 0         |
| Turn        | 31      | 27        | 1       | 0         | 2          | 1         |
| Reads       | 15      | 12        | 2       | 1         | 0          | 0         |
| WriteLanes  | 23      | 20        | 0       | 1         | 2          | 0         |
| Actors      | 36      | 32        | 1       | 2         | 1          | 0         |
| WriteAhead  | 18      | 16        | 2       | 0         | 0          | 0         |
| Restore     | 18      | 16        | 1       | 1         | 0          | 0         |
| **All**     | **186** | **161**   | **9**   | **5**     | **8**      | **3**     |

Some Essential Invariants have a redundant clause. The clause can go and the Invariant stays:

- WL I5's first clause is Compile I11;
- Codec I1's second clause is Codec I4;
- Restore I2's creation clause is Compile I8, and its re-send clause is WL I1;
- Reads I16's "persisted" clause is WA I6.

## Every Invariant

"Essential" names what an app author or user would notice if the Invariant broke. Cn is a conflict and Gn a gap
below.

### Compile

| Invariant   | Class      | Reason                                                                                    |
| ----------- | ---------- | ----------------------------------------------------------------------------------------- |
| Compile I1  | Essential  | If construction starts an actor, timer, storage or service, SSR import and tests break.   |
| Compile I2  | Low value  | A repeated callback shows only through side effects I1 already forbids. Fold it into I1.  |
| Compile I3  | Essential  | Authors fix every violation from one run. Conflicts with check findings (C6).             |
| Compile I4  | Essential  | Tools show exactly the states, events and operations the author wrote.                    |
| Compile I5  | Essential  | Zero or two default sources silently start memory wrong.                                  |
| Compile I6  | Essential  | A default run at import reads browser storage on the server. I1 does not cover reads.     |
| Compile I7  | Essential  | Unless equal input creates equal memory, Stories don't replay.                            |
| Compile I8  | Essential  | A restore rerunning creation resets saved state. "Creation" clashes with R8 (C24).        |
| Compile I9  | Essential  | An optional or defaulted identity field splits or orphans an actor.                       |
| Compile I10 | Essential  | Two writes on one contract share a lane. Say if an `.each` placement counts once.         |
| Compile I11 | Essential  | An unknown forced into a definite event makes the app retry or refund wrongly.            |
| Compile I12 | Essential  | A mapped write under a subroutine loses its ending when the fragment exits.               |
| Compile I13 | Essential  | Bad names break the codec, traces and CLI output.                                         |
| Compile I14 | Essential  | Duplicate machine or operation ids route events or lanes to the wrong place.              |
| Compile I15 | Untestable | Read literally, it fails on any Schema (Q3). Reword per the Q3 ruling (C4).               |
| Compile I16 | Essential  | A key outside input can't be computed. T8 must build such a Compiled, so reword it (C20). |
| Compile I17 | Essential  | A missing or incompatible provider must fail at admission, not mid-turn.                  |

### Diagnostics

| Invariant | Class     | Reason                                                                                       |
| --------- | --------- | -------------------------------------------------------------------------------------------- |
| Diag I1   | Essential | Callers branch on `error.code`, so it must be the primary diagnostic's.                      |
| Diag I2   | Essential | Diagnostics cross processes (CLI JSON, traces). The round trip is the Schema contract.       |
| Diag I3   | Essential | A callback defect labelled SchemaValidation shows false form errors.                         |
| Diag I4   | Implied   | By I5: Diagnostics.plan O2's closed list holds no Flow reason, evidence kind or denial code. |
| Diag I5   | Essential | Authors act on codes and help. An unknown code or empty help leaves them stuck.              |
| Diag I6   | Essential | Classification decides retry or report. Conflicts with I7 (C7).                              |
| Diag I7   | Essential | Classification of a failure that carries a Cause. Conflicts with I6 (C7).                    |
| Diag I8   | Essential | Finalizer noise must not hide the real failure.                                              |
| Diag I9   | Essential | Stacks and Causes in snapshots, records or CLI output leak internals and data.               |
| Diag I10  | Essential | Control characters allow terminal injection. On locations, see C26.                          |

### Codec

| Invariant | Class     | Reason                                                                                  |
| --------- | --------- | --------------------------------------------------------------------------------------- |
| Codec I1  | Essential | Records and payloads must come back equal. Clause 2 restates I4.                        |
| Codec I2  | Essential | An off-by-one bound changes which saved records load. Needs counting rules (G14).       |
| Codec I3  | Essential | Server and browser bytes must match for SSR and records. Needs a key order (G14).       |
| Codec I4  | Essential | Duplicate or unsorted keys silently change a value.                                     |
| Codec I5  | Low value | Decoded JSON can't alias a byte array. Reword to encode's output bytes, which R3 names. |
| Codec I6  | Essential | A partial write from a bad record is the damage, and a failure must not leak data.      |

### StaticCli

| Invariant | Class      | Reason                                                                                        |
| --------- | ---------- | --------------------------------------------------------------------------------------------- |
| CLI I1    | Essential  | Inspection must not run app code. Conflicts with Compile R1's callback (C8).                  |
| CLI I2    | Essential  | A graph edge must carry the trace's name so a Story reader can match them.                    |
| CLI I3    | Essential  | A typo must not execute app code.                                                             |
| CLI I4    | Untestable | "Built from one value" is structure. Reword: text and JSON give equal status, data and codes. |
| CLI I5    | Essential  | Automation parses stdout, and loader output breaks it.                                        |
| CLI I6    | Essential  | CI relies on exit codes. False as worded (C18).                                               |
| CLI I7    | Essential  | A check falsely reported complete ships unchecked code.                                       |
| CLI I8    | Untestable | It ranges over a partial list ("among them") and states suite coverage. Reword per rule id.   |
| CLI I9    | Implied    | By I6, since R8 maps warning-only checks to exit 0. Cut once I6 is reworded.                  |
| CLI I10   | Essential  | A parent config must not win. Reword: no config but the root `flow.config.ts` (C19).          |
| CLI I11   | Essential  | The CLI must not dirty the repo. Exempt forced termination (C19).                             |
| CLI I12   | Essential  | An unknown `--app` resolved to another app gives silently wrong results.                      |

### Turn

| Invariant | Class      | Reason                                                                                        |
| --------- | ---------- | --------------------------------------------------------------------------------------------- |
| Turn I1   | Essential  | Every state read and view assumes one active leaf.                                            |
| Turn I2   | Essential  | The chosen alternative decides every result. Authors rely on deepest-first order.             |
| Turn I3   | Essential  | A refused child part must not leak half a turn. Say what check returns for it.                |
| Turn I4   | Essential  | "self" keeps in-flight calls and timers. The Boundary model contradicts it (C21).             |
| Turn I5   | Essential  | Work above the boundary survives and entered states start fresh. Late routing rests on it.    |
| Turn I6   | Essential  | Exit and entry order shows in actions and activities.                                         |
| Turn I7   | Implied    | By I1: when exactly one leaf is active, the published state is a leaf.                        |
| Turn I8   | Untestable | Clause 1 is implied by I4. Clause 2 is a type rule; move it to Compile T6.                    |
| Turn I9   | Essential  | Subscribers must never see half a transition.                                                 |
| Turn I10  | Essential  | A reset must be its own visible snapshot before the next event.                               |
| Turn I11  | Essential  | Cleanup in `whenAbandoned` (cancel, release) is observable.                                   |
| Turn I12  | Essential  | A guard or select reading the wrong memory decides wrongly. Misses the before-walk view (G8). |
| Turn I13  | Low value  | The pure turn gets one clock value, so a second `now` would have to be fabricated.            |
| Turn I14  | Essential  | A rejected turn must leave nothing behind but one issue.                                      |
| Turn I15  | Essential  | Silent events must not change state or start work, yet the ending's lane effect applies.      |
| Turn I16  | Essential  | A partial write batch after commit corrupts the store.                                        |
| Turn I17  | Essential  | Stories and search replay exactly only if the turn is a function.                             |
| Turn I18  | Essential  | Views trust `check()` to enable buttons without side effects.                                 |
| Turn I19  | Untestable | Flow can't see if user guards are pure. Fold into I18: check repeats on an old snapshot.      |
| Turn I20  | Essential  | A stale timer would fire into a new state.                                                    |
| Turn I21  | Essential  | A schedule would fire in the turn that armed it.                                              |
| Turn I22  | Essential  | Timers would be lost or doubled on resume.                                                    |
| Turn I23  | Essential  | An unused actor's timers would fire.                                                          |
| Turn I24  | Essential  | An unchanged key keeps its work, and a changed key releases once (no double fetch).           |
| Turn I25  | Essential  | Spurious `value` events.                                                                      |
| Turn I26  | Essential  | Endings routed to the wrong state.                                                            |
| Turn I27  | Essential  | A late turn would orphan a live call.                                                         |
| Turn I28  | Essential  | Spurious `onContext` reactions. "Context wave" must cover the return wave (C13).              |
| Turn I29  | Essential  | React selectors need frozen snapshots.                                                        |
| Turn I30  | Essential  | React selectors need stable identity for unchanged parts.                                     |
| Turn I31  | Essential  | A stale issue from another source would show as current.                                      |

### Reads

| Invariant | Class     | Reason                                                                                          |
| --------- | --------- | ----------------------------------------------------------------------------------------------- |
| Reads I1  | Essential | Module load must not start I/O.                                                                 |
| Reads I2  | Essential | Reordered key fields must share one entry.                                                      |
| Reads I3  | Essential | A bigint key must name the same lane after reload.                                              |
| Reads I4  | Essential | An invalid key must create nothing and run no getter.                                           |
| Reads I5  | Essential | Mutating input later must not re-key a live lane.                                               |
| Reads I7  | Implied   | By I8 (a lookup that finds one in flight joins it) and R8 (subscribe starts only if none runs). |
| Reads I8  | Essential | Duplicate requests double server load and race.                                                 |
| Reads I9  | Essential | A superseded lookup's result must not reach the machine.                                        |
| Reads I11 | Essential | An old request must not overwrite newer data.                                                   |
| Reads I12 | Redundant | Turn I25 states it. "Confirmed" already excludes optimistic values.                             |
| Reads I15 | Essential | Users see each optimistic update applied exactly once.                                          |
| Reads I16 | Essential | Optimistic values must not survive a reload as data. Its "persisted" clause repeats WA I6.      |
| Reads I17 | Essential | An unknown must not loop refetches.                                                             |
| Reads I18 | Implied   | By Turn I30, for a row whose content is unchanged.                                              |
| Reads I19 | Essential | A view calling `get` with a fresh key must not crash. Reword: it returns the idle row.          |

### WriteLanes

| Invariant | Class      | Reason                                                                                      |
| --------- | ---------- | ------------------------------------------------------------------------------------------- |
| WL I1     | Essential  | A replayed commit is a double charge.                                                       |
| WL I2     | Essential  | Writes must land before the ending. Its "iff" contradicts R1 (C9).                          |
| WL I3     | Essential  | A definite failure after an unknown invites a retry with a new id: a double charge.         |
| WL I4     | Essential  | An author tag equal to a Flow reason can't be told apart from Flow's.                       |
| WL I5     | Essential  | A not-retained unknown must not block the lane. Clause 1 restates Compile I11.              |
| WL I6     | Essential  | Duplicate ids collide at the server's idempotency key. Needs a fresh seed per boot (G4).    |
| WL I7     | Essential  | `retryCount` drives RetryLimit and what mappers show.                                       |
| WL I8     | Essential  | Queue caps decide declines. The CQ3 rewording is pending (C2).                              |
| WL I9     | Untestable | The model's `head?` field, not a fact. Reword: retry and cancel name the last-sent Attempt. |
| WL I10    | Essential  | Members applied in the wrong order send into a held lane.                                   |
| WL I11    | Essential  | Promotion on an unknown double-sends. The CQ7 rewording is pending (C3).                    |
| WL I12    | Essential  | The core "no quiet release" guarantee. Its exit list is incomplete (C10).                   |
| WL I13    | Essential  | `idle()` must not pass a key a kept ending still blocks.                                    |
| WL I14    | Essential  | A key-less member must not hit another key's write.                                         |
| WL I15    | Essential  | Exactly-once delivery. CQ1 is pending (C1); CQ9 is open (C11).                              |
| WL I16    | Untestable | "Settled" and "replaced" are undefined. Reword: after a definite ending, no other ending.   |
| WL I17    | Essential  | Commits on an old key must not reach the server. Precedence clashes with R11 (C12).         |
| WL I18    | Essential  | An unencodable value must not fail the turn.                                                |
| WL I19    | Essential  | A handler reading the store on its ending must see the write.                               |
| WL I20    | Essential  | Cancel results must not vary with timing.                                                   |
| WL I21    | Essential  | cancelAll's endings come in order and nothing promotes. "Mint order" is undefined (C5).     |
| WL I22    | Redundant  | I15's exception "a releasing lane delivers nothing" states it.                              |
| WL I23    | Essential  | A late result after cleanup must not change data.                                           |

### Actors

| Invariant  | Class      | Reason                                                                                     |
| ---------- | ---------- | ------------------------------------------------------------------------------------------ |
| Actors I1  | Essential  | Setup that does I/O breaks SSR and tests.                                                  |
| Actors I2  | Essential  | A service acquired twice opens storage twice.                                              |
| Actors I3  | Essential  | Every caller of `ready()` must see one outcome.                                            |
| Actors I4  | Essential  | Services must not read before persisted data is validated.                                 |
| Actors I5  | Essential  | No handle may exist before ready.                                                          |
| Actors I6  | Essential  | A failed boot must leak nothing.                                                           |
| Actors I7  | Essential  | If field order changed identity, saved records would be orphaned.                          |
| Actors I8  | Essential  | Two shared actors for one identity split state.                                            |
| Actors I9  | Essential  | A failed ensure must leave nothing, so a retry works.                                      |
| Actors I10 | Essential  | An actor in use must not end and lose state. It has no liveness half (G3).                 |
| Actors I11 | Implied    | By I10: Free excludes WorkInFlight.                                                        |
| Actors I12 | Essential  | At an end the record must equal the last state, and the lanes stay.                        |
| Actors I13 | Essential  | Fresh incarnation ids guard against stale events.                                          |
| Actors I14 | Essential  | Return order decides what the machine sees first. "One wave" vs silent restore (C13).      |
| Actors I15 | Essential  | A stale ending must not reach another identity's life.                                     |
| Actors I16 | Redundant  | WL I15 states both clauses ("delivered once"; one `unknown { Restored }` per incarnation). |
| Actors I17 | Essential  | An ended life's timers must not fire into a new one.                                       |
| Actors I18 | Redundant  | Restore I12 states it and adds "never renamed".                                            |
| Actors I19 | Essential  | Mailbox order is the author's model of ordering.                                           |
| Actors I20 | Essential  | Runaway chains hang the page.                                                              |
| Actors I21 | Essential  | One busy actor must not starve another.                                                    |
| Actors I22 | Essential  | Overload must refuse cleanly.                                                              |
| Actors I23 | Essential  | A dropped ending is a lost write.                                                          |
| Actors I24 | Essential  | A refused ending comes back once per boot. "Never lost" overclaims (C15).                  |
| Actors I25 | Essential  | A send must not create an actor or keep one alive.                                         |
| Actors I26 | Essential  | No torn cuts (a new snapshot with old store data).                                         |
| Actors I27 | Essential  | One update per wave. Weaker than R19's rule against mixing revisions (G16).                |
| Actors I28 | Essential  | No slot rebinding and no provider cycle.                                                   |
| Actors I29 | Essential  | Disposal must not drop a non-Idle lane: that loses a write.                                |
| Actors I30 | Essential  | A write sent during shutdown is an unexpected charge.                                      |
| Actors I31 | Essential  | The ending that leaves a hold must come last, or the machine sees a stale hold.            |
| Actors I32 | Essential  | forget must not drop a live hold: that risks a double send.                                |
| Actors I33 | Essential  | A cleanup failure must not be reported as success.                                         |
| Actors I34 | Untestable | "Share no mutable object" is structure. Reword: writes through A never change B's state.   |
| Actors I35 | Essential  | User decision: a call is not cut short within 5 s.                                         |
| Actors I36 | Essential  | User decision: a definite ending during disposal leaves no hold.                           |

### WriteAhead

| Invariant | Class     | Reason                                                                                       |
| --------- | --------- | -------------------------------------------------------------------------------------------- |
| WA I1     | Essential | With persistence off, nothing may touch storage.                                             |
| WA I2     | Essential | Two apps or scopes must not overwrite each other's drafts.                                   |
| WA I3     | Essential | A local actor's data must not resurrect after reload.                                        |
| WA I4     | Essential | A restored draft must equal the committed one.                                               |
| WA I5     | Essential | An in-flight write must survive reload.                                                      |
| WA I6     | Essential | Optimistic values and queued work must not survive a reload.                                 |
| WA I7     | Essential | A torn capture pairs an actor with another commit's store data.                              |
| WA I8     | Essential | A capture must not fetch or emit.                                                            |
| WA I9     | Essential | Restore must not use a non-durable provider's stale context.                                 |
| WA I10    | Essential | Reload must not show a torn or older scope.                                                  |
| WA I11    | Essential | A lane must not outrun its actor record. The only Invariant behind R10's one-batch rule.     |
| WA I12    | Essential | Bounds the data-loss window to 5 s. Conflicts with R12 when storage is silent (C14).         |
| WA I13    | Essential | Scopes over bound lose user work. Reword "user work": a dropped record equals a fresh start. |
| WA I14    | Essential | A false "landed" sends a write with no durable Attempt.                                      |
| WA I15    | Essential | The core write-ahead guarantee.                                                              |
| WA I16    | Implied   | By I15: a refused acknowledgement is never Acknowledged, and the commit then ends.           |
| WA I17    | Essential | Honest uncertainty after a crash. "No remote write is repeated" forbids user retry (C16).    |
| WA I18    | Implied   | By WL I6 (Attempt ids across restore) and Actors I13 (incarnation ids).                      |

### Restore

| Invariant   | Class     | Reason                                                                                      |
| ----------- | --------- | ------------------------------------------------------------------------------------------- |
| Restore I1  | Essential | Owed endings must arrive, and no record may wake needlessly. Clashes with quarantine (C17). |
| Restore I2  | Essential | A restore that reruns a turn doubles effects. Two clauses repeat Compile I8 and WL I1.      |
| Restore I3  | Redundant | Actors I13 states it.                                                                       |
| Restore I4  | Implied   | By Turn I28: a restore is not a context wave.                                               |
| Restore I5  | Essential | Ending order decides the app's state after reload.                                          |
| Restore I6  | Essential | An acknowledged write with no outcome must surface as unknown, exactly once.                |
| Restore I7  | Essential | Input arriving before restored endings lets the user act on a stale hold.                   |
| Restore I8  | Essential | No phantom lane after a kill before a first send. Only restore check of the one-batch rule. |
| Restore I9  | Essential | Restored data must not show as fresh, and no fetch may be built from a key.                 |
| Restore I10 | Essential | One bad record must not brick `ready`.                                                      |
| Restore I11 | Essential | Quarantined bytes must survive for a rollback.                                              |
| Restore I12 | Essential | An old-version record restored as current shows wrong data.                                 |
| Restore I13 | Essential | A lane dropped by a version or shape rule is a lost write.                                  |
| Restore I14 | Essential | A reset must not remove other definitions' records.                                         |
| Restore I15 | Essential | Commits on a quarantined key must not run against a gone operation.                         |
| Restore I16 | Essential | Writes after a failed read overwrite unread data.                                           |
| Restore I17 | Essential | A storage failure must not roll back live state.                                            |
| Restore I18 | Essential | forget must not report success while data remains (privacy).                                |

## Conflicts

Each conflict has a trace. "Ruled" means the V3 log has a ruling that is not yet in the Spec text.

### Ruled or known, not yet in the Specs

**C1. WL I15 against Actors R15 and I24 (ruled: CQ1).**

- Trace: boot 1 refuses ending E twice, so E is kept. At boot 2, Actors R15 gives E one try, but WL I15 says the
  second refusal was final.
- Ruling, 03:30:58: final until the next boot or adoption.

**C2. WL I8 against I13 (ruled: CQ3).**

- Trace: a success ending's mapper throws twice, so the ending is kept. The Attempt is resolved, the queued commit
  promotes and the lane goes Idle.
- I8 says an Idle lane doesn't exist, so I13 can't see the kept ending.

**C3. WL I11 against R7 (ruled: CQ7).**

- Trace: under `latest`, head H was never invoked. D arrives, H ends Superseded and D queues. H is neither resolved
  nor released, so D never promotes and the lane stalls.

**C4. Compile I15 and R17 against R16 (ruled: Compile Q3, "a Schema's own functions are not Slots").**

- R17 refuses any function that is not a Slot.
- Applying the ruling to I15 alone makes Runtime creation refuse every Compiled with a filtered Schema. R17 needs
  the same exemption.
- T9 compares the DataView's canonical bytes, but the Codec rejects a Schema as `notPlain`. So T9 needs a JSON
  form of the data view, or a different comparison.

**C5. WL I21 and R15 ("mint order") against R7 ("commit on Idle mints").**

- Trace: commits B and C queue behind an InFlight head under `serialize`. Neither is minted, so their order under
  cancelAll is undefined.
- Deferred to `revisit.md` (log, 2026-11-10T18:09:25Z); still open.
- Proposed: order queued commits by admission and say so in R15 and I21.

### New

**C6 (High). Construction throws on errors that check must report as findings.**

- Compile R2, R13 and I3 make construction throw on an unfilled required port, a raise into an exited fragment, two
  state changers, overlapping keys, or a write out of scope.
- CLI R10 and I8 require check to report these as errors (exit 1). But check loads the app, and CLI R11 makes a
  failed load an invocation failure (exit 2).
- Trace: a fixture with an unfilled port makes `machine()` throw, so config loading fails with ConfigLoadFailed
  and exit 2. It never becomes a finding.
- Decide one of two:
  - check catches the construction FlowError and reports its diagnostics as findings;
  - or these rules leave construction.

**C7. Diag I6 against I7.**

- I6 classifies by code (GuardDefect is always Defect). I7 classifies by Cause.
- Trace: GuardDefect whose Cause holds only a typed failure. I6 says Defect, I7 says Failure.
- A further trace: StorageFailure whose Cause is interruption only. R6 defaults the code to Failure; I7 says
  Interruption.

**C8. CLI I1 and R9 against Compile R1 and I2.**

- CLI I1 and R9 say check runs no callback but recorded positions, and activates no machine callback.
- But check loads the app, and Compile R1 makes `machine()` run its callback once at construction.
- Reword CLI I1: "no runtime callback (guard, mapper, select, action, default)". The configuration callback is
  construction.

**C9. WL I2's "iff" against R1.**

- R1: an invalid success write applies nothing (InvalidWrite) while the commit succeeds.
- R1: a success write never overwrites data that landed after the commit started; it marks the entry stale.
- Trace: the commit succeeds and its write is invalid. I2 says the write is applied; R1 says it isn't.

**C10. WL I12's exit list against Actors R21, Restore I13 and Restore R5.**

- Actors R21 and Restore I13: a forgotten hold whose operation is gone is dropped with HoldForgotten.
- Restore R5: a fresh start loses its holds.
- Trace: a release removes operation O, then forget runs. The Held lane leaves Held by none of I12's causes.

**C11. WL I15's evidence-only list and R7 against R14 (CQ9, open).**

- WL I15 lists "the interrupted Attempt under concurrency cancel" as evidence only. R14 says a pending cancel is
  never lost to a later replacement.
- Trace: `cancel()` on Attempt A while it is on the wire, then commit B under `cancel`. A's ending is evidence, so
  its `unknown { Cancelled }` never arrives.

**C12. WL I17 against R11.**

- I17: every commit of the operation declines OldVersion.
- R11: on a fragment operation another path's Rejected comes first.
- Trace: an old-key hold on path p1, and path p2's commit meets an InFlight lane under `reject`. R11 gives
  Rejected; I17 demands OldVersion.

**C13. Silent restore against the return wave.**

- Actors R18 and Turn R22: baselines are silent at "restore", and Turn I28 enqueues only after a context wave.
- Actors R9 and I14: a return "restored from the Runtime's copy" gets one wave if a selection changed.
- Trace: A ends, provider P changes, `ensure(A)`. One rule gives a wave, the other gives none.
- Fix: say "reload restore" in R18 and R22, and say in I28 that the return wave counts.

**C14. WA I12 against R12 ("one plain write per key is out at a time").**

- Trace: capture 1 is out and storage never answers, as in T5. Key K is dirtied again. I12 demands a new capture
  within 5 s; R12 forbids a second write for K while capture 1 is out.
- Reword I12: "within 5 s, or once that key's previous write answers".

**C15. Actors I24's "never lost" against R15 and R21.**

- R15: a stranded read is dropped at a boot. R21: forget turns parked endings into evidence.
- Reword: "never lost while its lane or life stands".

**C16. WA I17's "no remote write is repeated" against WL R8 and Restore R5.**

- Trace: a crash, then `unknown { Restored }`, then the user taps retry. The same id is re-sent, and a correct
  runtime fails I17.
- Restore R5's fresh-start limit also loses acknowledged Attempts.
- Reword: "never repeated automatically; R5's fresh start excepted".

**C17. Restore I1 ("exactly the Owed identities") against R5 and R7.**

- Trace: a lane was InFlight at capture, and the identity's record is undecodable (quarantined) or reset at the
  boot. The identity is Owed but cannot be restored live from a record.
- Say what such an identity is at `ready`, and where its endings park.

**C18. CLI I6 against R8.**

- Status `failed` exits 2, 130 or 143. A check with errors exits 1, but its status is never named.
- So the exit code is not a function of status.

**C19. CLI I10 and I11, read literally, against R12, R13 and CommandLine.plan O3.**

- CLI I10 says discovery reads "only `flow.config.ts`". R12 also needs `package.json`, and the stories and
  tsconfig paths are read.
- CommandLine.plan O3 says forced termination has no cleanup guarantee, but CLI I11 says no temporary file
  remains after any run.

**C20. Compile I16 ("every Compiled") against R17 and T8.**

- T8 must build a Compiled with a key field outside input, so I16 is false of the world.
- Reword: `machine()` never emits one, and Runtime creation refuses one.

**C21. The Turn model's Boundary against I4.**

- For "self" at S under parent P, the Boundary is P, so S counts as below it and re-entered. I4 says "self" keeps
  S's Activation.
- Fix: the Boundary of "self" is H.

**C22. Actors R10 against Restore I6, Restore R3 and WA R14.**

- Trace: Runtime disposal runs past 5 s. The head ends `unknown { Disposed }`, which is parked, and stays Held on
  disk.
- At the next boot, Actors R10 also delivers `unknown { Restored }`, which Restore I6 forbids.
- Actors R10 needs Restore R3's exception.

**C23. Codec R4 against WA R4, WA T13 and Restore R9.**

- Codec R4 says an over-bound value fails CodecBoundExceeded.
- WA R4, T13 and Restore R9 say an over-bound capture is skipped with UnencodableValue.
- So one trace (a 4,097-item array at capture) gets two codes.

**C24. Compile I8 against R8.**

- R6 defines creation to include computed initials. R8 runs a computed initial at restore for a field the record
  lacks.
- Reword I8: restore runs no initial for a field the record has.

**C25. Actors model against R7.**

- The model says WorkInFlight includes "a kept read". R7 says it includes "a read started in a turn handling an
  ending of work in flight".
- "Kept" also names R15's kept ending, so I10 and I11 can't be tested until one wording wins.

**C26. Diag R10 and I10 against CLI R2.**

- CLI R2 requires output to name source locations (`pay.machine.ts:42`).
- But no Diagnostic has a location, Compile R16 carries none, and Diag I10 forbids inventing one.

## Gaps

These are Plan outcomes with no Invariant.

**G1.** No Invariant says every admitted commit ends. Operations.plan O3 promises it: a commit "always ends in
success, failure or unknown". WL I15 only counts endings. Two ruled Invariants are not yet written either: M5 ("a
definite ending matches an answer the server gave") and "an owed retry re-sends".

**G2.** No core Spec has a Requirement or Invariant for Persistence.plan O7 (a second tab runs without
persistence: the Web Lock, SecondTabNoPersistence). Actors R3 says only "claim scope ownership". Two owner tabs
would overwrite each other's data.

**G3.** Liveness has no Invariants:

- a Free actor ends after the grace (Actors I10 is one-way, so a leak passes);
- incomplete context propagation retries once settled (WA R8).

**G4.** WL I6's "never reused across restore" depends on a fresh seed per boot, or on a floor covering ids that
are not on disk. No Requirement asks the host for either (WL R5; Q4).

**G5.** The CQ6 Invariant must also cover a head still waiting for its acknowledgement when disposal starts. Actors
R22 assigns endings only to queued commits and to calls on the wire.

**G6.** Turn R15 and R16 have no Invariant. Turn Q2 says these have no prototype case:

- equal-deadline order;
- a step's next delay counted from the actual firing;
- `restartOn` baselines;
- keyed schedules.

**G7.** Nothing says whether a Denied or Unhandled ending's lane-only change is published. Turn R19 says it is;
Machines.plan O3 says denied events publish nothing. Rows could stay stale.

**G8.** Turn I12 covers two memory views. Machines.plan O3 also gives `resetOn` and input fillers a before-walk
view, and gives guards and keys separate lane views.

**G9.** Turn I18 covers only Allowed. Turn R13's Denied and Unhandled verdicts, reason order and GuardDefect have
no Invariant.

**G10.** Reads' coverage cites Invariants that don't state the Requirement:

- R8 (input rule, no automatic retry) cites I8, which only joins;
- R9's failure mapping, R10's holds and R14's resource row tags have no Invariant.

**G11.** Reads Q2 defers staleTime, gcTime, invalidate, stacking and more. Operations.plan still promises them.
This is recorded, not an oversight, but the Plan was not narrowed.

**G12.** Restore R4 has no Invariant: late results from old work can't affect restored work, and live placements
reopen from restored input.

**G13.** Two Diagnostics rules have no Invariant: R5's "a specific code wins", and R8's "Promise adapters keep the
complete Cause".

**G14.** Codec R2 says "sorted keys" without saying by what: UTF-16, code point or UTF-8. R1 has no counting rules
for depth, nodes or canonical bytes. I1 to I4 can't become fixed vectors until both are stated.

**G15.** Some Actors behaviour has only tests, no Invariant:

- R4: the boot queue's bound, and the StorageFailure flush past it;
- R20: BlockedByDependents, and idempotent disposal;
- R22: RuntimeDisposed rejections.

**G16.** Actors I27 ("one revision each") allows mixing revisions across providers. R19 forbids mixing ("diamonds
included").

**G17.** The Plans drift:

- Runtime.plan O6 says disposal "invokes what the lane table promotes" and also "nothing is invoked";
- Operations.plan O3 says "whatever the turn's outcome".

The Specs follow the second reading in each case.

## Recommended cuts

These need the user's approval. Each cut removes a row from `not-yet.ts`, or retires an existing check.

| Cut        | Covered by                                         | Owner   | Saves                                                    |
| ---------- | -------------------------------------------------- | ------- | -------------------------------------------------------- |
| Diag I4    | Diag I5                                            | T17     | one case and mutant                                      |
| Turn I7    | Turn I1                                            | T8      | one oracle claim and mutant                              |
| Turn I8    | Turn I4; clause 2 moves to Compile T6's type tests | T8      | one oracle and mutant                                    |
| Turn I13   | the turn's signature (one clock value)             | T8      | one mutant                                               |
| Turn I19   | Turn I18, reworded to cover an old snapshot        | T8      | one oracle and mutant                                    |
| Reads I7   | Reads I8 and R8                                    | T12     | one mutant                                               |
| Reads I12  | Turn I25                                           | T12     | one oracle and mutant                                    |
| Reads I18  | Turn I30                                           | T12     | one mutant                                               |
| WL I22     | WL I15                                             | T7      | one fixture and mutant (the owed releasing-lane fixture) |
| Actors I11 | Actors I10                                         | T9      | one mutant                                               |
| Actors I16 | WL I15                                             | T9      | one mutant                                               |
| Actors I18 | Restore I12                                        | T9      | one case and mutant                                      |
| WA I16     | WA I15                                             | T10     | one mutant                                               |
| WA I18     | WL I6, Actors I13                                  | T10     | one oracle and mutant                                    |
| Restore I3 | Actors I13                                         | T11     | one mutant                                               |
| Restore I4 | Turn I28                                           | T11     | one oracle and mutant                                    |
| Compile I2 | Compile I1 (fold the count in)                     | checked | retire one check; move its mutant to I1                  |
| CLI I9     | CLI I6, once reworded (C18)                        | checked | retire one check; move its mutant to I6                  |

That is 16 owed pairs saved, of 150.

Also cut the clauses named under the counts: WL I5's first clause, Codec I1's second, Restore I2's creation and
re-send clauses, and Reads I16's "persisted". Each cut narrows one oracle.

Reword these seven so a check can exist:

| Invariant   | Rewording                                                                                            |
| ----------- | ---------------------------------------------------------------------------------------------------- |
| Compile I15 | Every function in Compiled outside a Schema is a Slot (C4).                                          |
| CLI I4      | Text and JSON give equal status, data and diagnostic codes.                                          |
| CLI I8      | Each CommandLine O5 rule id errors (exit 1) on a violating fixture; no reference app errors.         |
| WL I9       | Every retry and cancel on a lane names the Attempt its last send carried.                            |
| WL I16      | After a success or failure of an Attempt is delivered, no other ending of it is delivered.           |
| Actors I34  | Writes through Runtime A never change B's store, lanes, storage or snapshots; B rejects A's handles. |
| Codec I5    | After `encode(v)` returns bytes b, mutating b changes no stored value and no later `encode(v)`.      |

Order of work:

1. Apply the four rulings (C1 to C4, the R17 exemption included), M5 and the retry Invariant (G1).
2. Rule on C6, C7 and C9 to C17. These block T7 to T12 and T17.
3. Fix C18 to C26 with to-spec as their Tasks start.
4. Make the cuts.

## Sidecar findings: accepted, changed, rejected

There were four Haiku sidecars (effort high, read-only). I checked every finding I used against the Spec text.

**(a) Compile, Diagnostics, Codec and StaticCli.**

- **Accepted:**
  - the classes of Compile I2, I15, Codec I5, CLI I4, I8 and Diag I4;
  - conflicts 1 (C6), 3 and 4 (C4), 5 (C24), 7 (C7), 15 (C18), 16 and 17 (C19);
  - the Codec and Diagnostics gaps (G13, G14), and the locations finding (C26).
- **Changed:**
  - CLI I9: Essential to Implied by I6;
  - CLI I6 and Compile I16: kept Essential, with the wording in C18 and C20.
- **Rejected:**
  - conflict 6 (`.each`): an ambiguity, noted under Compile I10;
  - conflict 8: evidence acceptance stays in process, and R9 bans only leaving values;
  - conflict 9: TurnStorm and the others are diagnostic records, not R4's lane evidence kinds;
  - conflict 14: no core Invariant forbids recorded positions at `app()`;
  - conflicts 10 to 13, 18 and 19: Plan-level or phase-5 wording, not Invariant conflicts.
- **Mine (no sidecar found it):** C8, the machine callback during check.

**(b) Turn and Reads.**

- **Accepted:**
  - the classes of Turn I7, I8, I19, Reads I12 and I18;
  - conflicts C1 (now C21) and C7 (now C13);
  - gaps G-T1 to G-T4 (G6), G-T12 (G9), G-T19 (G8), and G-R3 to G-R5 (G10).
- **Changed:**
  - Turn I3: Redundant to Essential. I15 covers events, not refused parts;
  - Turn I13: Implied to Low value. I17 does not entail it;
  - Reads I7: Essential to Implied;
  - their C4 and C6 became gaps G7 and G8.
- **Rejected:**
  - C2: I3 settles "publishes nothing";
  - C3: PreTurn includes the ending, so Turn I14 and WL I15 agree;
  - C5: a freeze ends no incarnation;
  - C8: a first placement has nothing to compare against;
  - RC1: `O.x.get` is the write lanes' member;
  - RC2: low value, not pursued.
- **Mine:** Restore I4 is implied by Turn I28.

**(c) WriteLanes and Actors.**

- **Accepted:**
  - the classes of WL I9, I22, Actors I11, I16 and I34;
  - conflicts C1, C2 (now C9), C5 (now C11), C6 and C7 (now C2 and C3), C8 (now C10), C9 (now C12), C11 (now
    C5), C17 (now C22), C19 (now C13), C20 (now C15), C24 (now C25) and C26;
  - their C12 and C25 became gaps G4 and G16.
- **Changed:**
  - WL I16: Essential to Untestable, using the sidecar's own rewording.
- **Rejected:**
  - C3: R4 was reworded on 2026-11-11 (see `spec-log.md`);
  - C4: the cancel policy's unknown is never retained, so the lane is never Held (WL I5);
  - C10: a release's later endings are the interrupted fiber's;
  - C13: a refused re-send not spending the budget is intended (`pay16.refused-capture-spends-budget` is a wrong
    runtime);
  - C14: a refused turn applies no member;
  - C15: a spin goes through the mailbox, not follow-ups (Runtime.plan O4);
  - C16: FIFO holds within an actor;
  - C18: a local actor has no identity to send to;
  - C21: Plan drift, moved to G17;
  - C22: Restore's model defines HoldLeaving;
  - C23: I22 counts external events only.
- **Mine:** WL I5's first clause is Compile I11.

**(d) WriteAhead, Restore and cross-area.**

- **Accepted:**
  - the classes of WA I16, Restore I3 and Restore I12 (I cut Actors I18 instead);
  - conflicts C1 (now C14), C2 and C3 (now C16), C4 (now C17), C5, C6 (now C1), C7 (now C23) and C10 (now C22);
  - C8 and C12 became gaps G5 and G4;
  - gaps G1 (now G2), G2 (now G12) and G9 (now G3).
- **Changed:**
  - WA I18: Redundant to Implied;
  - WA I6: Redundant to Essential. The others repeat only parts of it;
  - WA I11 and Restore I8: Implied to Essential. R10's one-batch rule is no Invariant, so these are its only
    checks.
- **Rejected:**
  - C9: WL I15 counts per incarnation, and WA R15 is a stated limit;
  - C11: Actors I10 is one-way;
  - C13: "exactly once" is within "at most once";
  - C15 and C16: wording at Plan level;
  - C17 and C18: Restore R5's ruling allows them;
  - G4: Turn I10 already covers a pending reset.
