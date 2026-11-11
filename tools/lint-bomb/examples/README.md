# Boundary requirements and invariant review

Run `nub run check:demo` for formatting, type-aware lint, type checks, and executable evidence.

**Verdict: scoped checks pass.** Admission is owned by the booking Service, returned receipts and
previews are detached, and retaining services capture validated policy snapshots.
Schema values remain caller-owned; the checks do not promise frozen values or exhaustive correctness.

## Intent and scope

The user requested realistic examples of Schema, trusted Data, Service/Layer composition, and correctness.
Scenario limits come from the existing demo walkthroughs; this review adds no product features.
`to-spec` supplies requirements-first derivation. `testing-policy` supplies public-boundary evidence.
This is an example review, not an accepted Workflow Spec or a full application contract.

[booking.ts](booking.ts) owns the workshop scenario; [routing.ts](routing.ts) owns routing and its sandbox.
[style.ts](style.ts) supplies separate recipes. Its settings and filesystem adapter have integration checks.
[lifecycle.ts](lifecycle.ts) models an upload's phases and its one transition, `advanceUpload`.
No check claims durable storage, remote delivery, authentication, or distributed atomicity.

## Requirements first

### Booking

| ID   | Intended observable requirement                                                         |
| ---- | --------------------------------------------------------------------------------------- |
| B-R1 | Admit only the declared JSON fields, types, bounds, and equivalent absence forms.       |
| B-R2 | Admit affordable new bookings when five-seat capacity and the three-ID limit permit.    |
| B-R3 | Replay the same admitted request ID without another debit during one ledger build.      |
| B-R4 | Reject changed affordable requests with a conflict; retain prior committed facts.       |
| B-R5 | Publish complete reservation decisions; rejection leaves committed state unchanged.     |
| B-R6 | Separate ledger builds start with independent empty state and all five seats free.      |
| B-R7 | Before-start cancellation reserves nothing; cancellation after commit does not undo it. |
| B-R8 | Each committed seat costs 12,500 cents.                                                 |
| B-R9 | Caller mutation of a returned receipt cannot alter retained reservation facts.          |

Admission and affordability precede ID comparison. An unaffordable changed request reports
`BudgetExceeded`; the current demo does not promise conflict precedence over failed preflight.
B-R7 names the two exercised interruption points; it is not evidence for every in-flight timing.

### Routing and shared capabilities

| ID    | Intended observable requirement                                                                |
| ----- | ---------------------------------------------------------------------------------------------- |
| P-R1  | Admit declared channel variants, complete severity routes, and bounded fields.                 |
| P-R2  | Resolve every route target to exactly one declared channel.                                    |
| P-R3  | Apply the default only to a missing limit; reject malformed present values.                    |
| P-R4  | Preview precisely the selected targets in channel declaration order.                           |
| P-R5  | Preserve policy meaning across wire encoding; summaries expose only summary fields.            |
| P-R6  | Declared channel IDs are unique, including unused channels.                                    |
| P-R7  | Each severity route names a target at most once.                                               |
| P-R8  | Admit Webhook destinations only when they use HTTPS.                                           |
| P-R9  | Reject Webhook destinations with embedded credentials.                                         |
| P-R10 | A preview returns detached channel definitions.                                                |
| G-R1  | One gateway build accepts at most four simulated attempts.                                     |
| G-R2  | Successful attempts receive distinct increasing sequence numbers in that build.                |
| G-R3  | Both consumers of one shared gateway observe the same quota.                                   |
| G-R4  | Separate builds and explicitly fresh branches have independent gateway state.                  |
| G-R5  | Gateway construction failures remain in the composed application's failure channel.            |
| G-R6  | Each gateway outcome identifies its originating channel.                                       |
| G-R7  | Each successful gateway outcome preserves its originating message.                             |
| G-R8  | Retaining services capture their own validated policy; later caller mutation cannot alter it.  |
| G-R9  | Reject a policy invalidated before capture rather than retaining invalid relationships.        |
| S-R1  | A checked setting retains its codec and supplies a valid value to its real consumer.           |
| S-R2  | The filesystem adapter returns real content or a typed error retaining the foreign cause.      |
| L-R1  | An upload changes phase only through `advanceUpload`; every other phase-event pair is refused. |

Schema values belong to callers and are not frozen. Policy queries assume their own input remains valid.
A Service retaining policy captures and validates a detached copy at entry; subsequent caller writes
cannot change that private copy. Preview results and booking receipts also detach owned records.

## Derived invariants

An Observation is a completed operation or a public availability/usage result.
A Build is one application Layer build. A committed ID is one successfully admitted booking ID.
Each row states one independently challengeable property; implementation choices are separate.

### Booking state and identity

| ID   | Property at Observation                                                                         | Source  | Checks        |
| ---- | ----------------------------------------------------------------------------------------------- | ------- | ------------- |
| B-I1 | Available seats stay between zero and five.                                                     | B-R2/R5 | B05, B09      |
| B-I2 | Available seats plus committed seat quantities equal five.                                      | B-R2/R5 | B03, B09      |
| B-I3 | The number of committed IDs never exceeds three.                                                | B-R2    | B06, B09      |
| B-I4 | One committed ID denotes one original reservation.                                              | B-R3/R4 | B04, B09, B10 |
| B-I5 | Each returned committed quantity equals its admitted request quantity.                          | B-R1/R2 | B03, B09      |
| B-I6 | A committed price equals 12,500 cents times its seat count.                                     | B-R8    | B03, B09, B11 |
| B-I7 | A committed price never exceeds its admitted budget.                                            | B-R2    | B01, B10, B11 |
| B-I8 | Retained receipt facts remain the original committed facts despite writes to returned receipts. | B-R9    | B12           |

B-I2/I4/I5 concern committed facts, not merely counters. B-I2 holds by construction: availability
is derived from committed receipts, not stored beside them. B12 exercises caller mutation. B13 enters
through the public Service directly; no public quote-taking reservation port remains.

### Routing value relationships

These predicates hold after successful admission or construction, before caller mutation.

| ID    | Property                                                      | Source | Checks   |
| ----- | ------------------------------------------------------------- | ------ | -------- |
| P-I1  | Declared channel IDs are unique.                              | P-R6   | P03      |
| P-I2  | Every route ID names a declared channel.                      | P-R2   | P03, P04 |
| P-I3  | Both warning and critical have routes.                        | P-R1   | P02      |
| P-I4  | Every route contains at least one target.                     | P-R1   | P06      |
| P-I5  | A route never repeats a target ID.                            | P-R7   | P03      |
| P-I6  | Each route length is at most maxChannelsPerAlert.             | P-R1   | P03, P08 |
| P-I7  | Channel count is between one and eight.                       | P-R1   | P06      |
| P-I8  | maxChannelsPerAlert is an integer between one and eight.      | P-R1   | P02, P06 |
| P-I9  | A Webhook destination uses HTTPS.                             | P-R8   | P05      |
| P-I10 | A Webhook destination contains no embedded credentials.       | P-R9   | P05      |
| P-I11 | Each channel has the required fields of its declared variant. | P-R1   | P02      |
| P-I12 | The policy name contains one to eighty characters.            | P-R1   | P06      |
| P-I13 | A channel ID contains one to forty characters.                | P-R1   | P06      |

These are admission facts for caller-owned values. A captured Service policy retains them for its
lifetime; G06 checks mutation isolation and G07 checks validation before retention.

### Gateway state and correspondence

| ID   | Property within a gateway Build                                | Source | Checks   |
| ---- | -------------------------------------------------------------- | ------ | -------- |
| G-I1 | Accepted count stays between zero and four.                    | G-R1   | G01, G05 |
| G-I2 | Accepted count plus remaining quota equals four.               | G-R1   | G01, G05 |
| G-I3 | Successful sequences are exactly 1 through the accepted count. | G-R2   | G01, G05 |
| G-I4 | Both consumers spend from the same shared quota.               | G-R3   | G01, G05 |
| G-I5 | Each outcome retains the channel ID of its originating call.   | G-R6   | G05      |
| G-I6 | A successful outcome retains its originating message.          | G-R7   | G05      |

## Transition obligations and evidence

These are postconditions and lifetime checks, not additional state invariants.

| Obligation                                         | Public observation                                                               | Checks        |
| -------------------------------------------------- | -------------------------------------------------------------------------------- | ------------- |
| Rejection preserves state                          | Availability and all prior receipts still match committed facts.                 | B01, B09, B10 |
| Replay performs no additional debit                | The original receipt and availability remain unchanged.                          | B03, B06, B09 |
| Competing admissions remain consistent             | At most the available seats are consumed.                                        | B05           |
| Inclusive admission limits                         | Exact budget and final-seat requests succeed.                                    | B11           |
| New builds isolate state                           | Both independent runs start with their full allowance.                           | B08, G02      |
| Explicit freshness isolates a branch               | One consumer's spend does not affect the fresh consumer.                         | G03           |
| Boundary cancellation preserves its stated outcome | Observe before-start and after-commit behavior.                                  | B02, B07      |
| Quota rejection consumes nothing                   | Usage remains four accepted and zero remaining.                                  | G05           |
| Defaults do not hide invalid present data          | Omission succeeds; null, zero, and fractions reject.                             | P01, P02      |
| No route target silently disappears                | Preview targets match independent expected definitions.                          | P01, P04      |
| Serialization preserves meaning                    | Reloaded routing previews and receipt facts match.                               | B03, P07      |
| Summaries do not expose destinations               | Decoded summary has exactly name and configured limit.                           | P07           |
| Constructors enforce relationships                 | Invalid route/limit combinations reject.                                         | P08           |
| Construction failures remain typed                 | The composed application reports GatewayUnavailable.                             | G04           |
| Checked settings cross actual boundaries           | Setting → codec → real Counter service → observation.                            | S01           |
| Foreign failures retain evidence                   | Real file read and missing-file failure carry original cause.                    | S02           |
| Lifecycles refuse unaccepted events                | Every refused phase and event pair names both; accepted pairs move once.         | L01, L02      |
| Receipt isolation                                  | Changes to returned receipts do not alter replay or availability.                | B12           |
| Service admission                                  | Direct Service calls validate before committing reservations.                    | B13           |
| Preview isolation                                  | Changing a preview destination does not change subsequent previews.              | P09           |
| Captured policy isolation                          | Changes to caller-owned channels/routes do not change the notifier.              | G06           |
| Validation at capture                              | Invalid policy rejects at construction or operation entry before quota spending. | G07, G08      |

## How the tests apply testing-policy

- Effectful scenarios use `@effect/vitest` `it.effect`; the runner owns Scope and test services.
- Pure configuration scenarios use plain `it`; they need no Effect runtime.
- Checks call public workflows, policy methods, constructors, and composed consumers with real owners.
- G04 substitutes only a failing gateway construction; it does not claim to test a remote adapter.
- B09 runs 64 generated sequences, seed `20261021`, each containing one to twelve seat requests.
  Its oracle uses independently expected capacity, ID limits, committed inputs, and a literal price table.
  Every operation is followed by a state check and replay of all previously committed identities.

B07 uses a completion gate, not a sleep. Its worker is interrupted only after booking has completed.
No test calls private pricing, reservation transitions, or quota transitions.
G01's construction counter observes the real Layer and does not replace the shared gateway.
Generated runs support the specified properties; they are not exhaustive proofs of all executions.

## Repaired boundaries and evidence limits

- **O1 resolved:** fresh flat receipt records cross the boundary on commit and replay; retained facts stay private (B12).
- **O2 resolved at retention boundaries:** previews detach channel records, and services copy/validate policy before retaining it (P09, G06, G07). Direct mutation can still invalidate a caller's own Schema value; no runtime freezing is promised.
- **O3 resolved:** `BookingLedger.book(json)` owns admission, pricing, and reservation. Quotes remain private; direct callers cannot bypass admission through the former `reserve(quote)` port (B13).
- **O4 remains:** cancellation checks cover before-start and after-commit observations, not every instruction boundary. The atomic transition has no suspension point; the tests make no remote rollback claim.
- **O5 remains:** payload byte limits, remote delivery, durable recovery, authentication, and cleanup-failure recovery remain outside these examples.

## Parcel tracking: time-policy boundary

[tracking.ts](tracking.ts) exposes `trackParcel`; [tracking.test.ts](tracking.test.ts) exercises it.
The carrier Service is an external adapter seam. Tests substitute that adapter, not the retry workflow.
Trusted carrier values require decoding in a real adapter; this example does not implement remote transport.

### Requirements → invariants → evidence

| Requirement                                                          | Derived invariant or transition obligation                                                                                  | Evidence |
| -------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- | -------- |
| Retry only transient, repeat-safe carrier reads, at most four times. | At most five adapter invocations per execution; terminal errors stop immediately.                                           | T02, T03 |
| Delay retries by 100, 200, 400, then 400 milliseconds.               | Invocation timestamps obey the bounded backoff sequence for immediate failures.                                             | T01, T02 |
| Return the successful status with its observation time.              | Successful output retains the carrier's status; timestamp uses the active Clock after lookup.                               | T01      |
| Bound the whole operation by a two-second deadline.                  | No new attempt starts after timeout; a hung attempt is interrupted and cooperative cleanup finishes before failure returns. | T04      |
| Honour caller interruption during backoff.                           | Once interruption completes, no future adapter call occurs for that execution.                                              | T05      |

These requirements are the new example's explicit scenario choices. They do not change booking or routing.
Invocation bounds and result correspondence are invariants; timeout completion and cleanup are transition
and progress obligations, conditional on interruptible adapters and terminating finalizers.
`testing-policy` is applied through the public workflow, real Effect scheduling, independent expected
absolute timestamps, fresh adapter state, and no wall-clock waits. `to-spec` is applied by deriving these
obligations from requirements before selecting checks. This remains a review, not a formal Workflow Spec.
No claim covers wire decoding, remote cancellation, jitter, durable recovery, or fleet-wide scheduling.

## Daily usage: calendar-time boundary

[reporting.ts](reporting.ts) exposes `dailyUsageReport(json)`; [reporting.test.ts](reporting.test.ts)
exercises real Schema decoding, DateTime zone rules, aggregation, and Clock injection. No dependency is mocked.

| Requirement                                                           | Derived invariant or obligation                                                                                                | Evidence                                  |
| --------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------- |
| Report the current local calendar day in a valid named zone.          | Both boundaries denote local day starts; the duration may be 23, 24, or 25 hours.                                              | D01: New York DST transitions and Kolkata |
| Count exactly the supplied events in `[start, nextStart)`.            | The opening instant belongs to the day; the closing instant belongs only to the next day. Older events contribute nothing.     | D01, D02                                  |
| Capture current time once for day selection and observation.          | Changing injected time across midnight selects the adjacent day without a stale captured clock.                                | D02                                       |
| Admit the entire wire request before calculating.                     | Invalid zones, unparseable timestamps, invalid units, excess fields, or oversized collections cannot produce a partial report. | D03, D04                                  |
| Bound each event to 1,000,000 units and each request to 1,000 events. | Total units remain a nonnegative exact integer at most 1,000,000,000.                                                          | D04                                       |

`code-composition`: Schema establishes valid zone/instant/quantity facts; DateTime consumes those facts;
aggregation applies the half-open membership rule. No extra Service is needed for a stateless calculation.
`to-spec`: the table derives invariants and transition obligations from explicit scenario requirements.
`testing-policy`: tests enter through the public JSON workflow, use independently worked UTC boundaries,
and drive the real Clock through TestClock. The decoder is used only to establish test clock instants,
not to compute expected calendar windows or totals.

Zone names may normalize to equivalent host-supported aliases; input spelling is not preserved.
The input is a supplied event list, not an authoritative usage store. Duplicate events count separately.
The report is a snapshot of that list, not a promise of completeness or billing settlement. Parsing follows
Schema.DateTimeUtcFromString (including offsetless-as-UTC behavior); strict timestamp syntax, historical
midnight transitions, every IANA zone, and time-zone database updates are not exhaustively tested.

## Announcements: one Service, two implementations

[announcements.ts](announcements.ts) defines `AnnouncementMemory.layer(text)` and
`AnnouncementFile.layer(path)`. Both supply the same Service to the unchanged `announcementBanner()`.
The file implementation captures FileSystem; the test composition supplies NodeFileSystem.layer.
The memory implementation is an alternative source of content, not a fixture implementing parsing/rendering.

| Requirement                                                                          | Derived obligation                                                                             | Evidence                                      |
| ------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------- | --------------------------------------------- |
| The consumer reads through AnnouncementSource, independent of implementation choice. | Both Layers supply identical content to the same decoder and renderer.                         | A01, parameterized over memory and real files |
| Content validity is established after source acquisition.                            | Invalid JSON, empty titles, and excess fields fail with SchemaError for either implementation. | A02, same cases for both Layers               |
| File access failures remain distinct from content failures.                          | A missing file yields AnnouncementUnavailable with the original NotFound platform cause.       | A03                                           |

`code-composition`: source acquisition, content admission, and rendering retain separate responsibilities.
`to-spec`: requirements above determine implementation substitutability obligations before shared checks.
`testing-policy`: tests exercise the exported consumer with both actual implementations and independent
expected output. A filesystem fixture only creates input files; it substitutes no production component.
Temporary directories are Scope-owned and released by the Effect test/Layer scopes.

The shared contract is reading wire content, not filesystem durability, mutation, or equivalent lifetimes.
Memory content is fixed at construction; file reads observe current content. Missing files are I/O failures,
not empty announcements. This example does not claim concurrent file replacement or crash consistency.

## Service pattern convention

These examples use explicit Service contracts and `Service.of` implementations, following the
Effect AI docs. Our naming convention uses `.layer` for both default and named alternative
implementations. `AnnouncementMemory` and `AnnouncementFile` supply the same `AnnouncementSource`.
Construction uses explicit Service names rather than `this`; dependency requirements remain in Layer types.
Use `Effect.fn` at trace boundaries and `Effect.fnUntraced` for reusable generators.
A function returning one existing Effect primitive does not need a generator wrapper.
No extra `make` indirection is required.

S03 checks that `CounterAndSettings` exposes the same configuration captured by Counter.
The misleading merge of a separately configured Settings with an already constructed Counter has been removed.
