# Review 2 of operations-in-definition, revision 2 (2026-10-31)

Two independent Sonnet reviews: correctness and authoring (five new apps; scratch in the session scratchpad,
`ops-review-2/`). Both: not yet sound enough for the owner. Advice, not decisions.

## Correctness

- **H1. Plain writes over non-entity rows lost their on-demand keyed lane.** Per-field autosave on a settings page:
  title in flight, description waiting, a tag edit supersedes the description, and the description edit is never
  saved. "Mirror ids into memory" reintroduces C1's leak. Fix: `.each` may take its member from the contract's input
  (`.each({ by: "id" })` or a pure projection), lanes created by work; `latest` without `.each` or an explicit
  `.single()` is a declaration error.
- **H2. C4 not removed for a plain `unknown` under `latest`.** A superseded write's unknown reaches the main handler,
  whose `retry`/`retryable` act on the newer Attempt: the wrong-write retry again. Fix: `superseded:` takes a full
  `{ success, failure, unknown }` set, so a superseded ending never reaches the main handlers.
- **H3. `pending` on the record doesn't match its definition.** Many-record writes never show it; absent records (an
  optimistic delete that ends unknown) have nowhere to show it; two actors disagree. Fix: derive it from the store's
  record-queue entries belonging to this actor's Attempts, with unknown/retryable status on the same entry.
- M1 `retryCount` doesn't survive restore, so each reload resets the budget: persist it per Attempt.
- M2 Persistence binding: joined lanes store which name?; per-Attempt binding; a member/plain shape mismatch on
  restore; `.was` clashing with an existing name should be an error.
- M3 Entity lanes: a deleted record never clears its mark (retained unknowns fill the cap); clearing by another
  actor's write mutates this actor's lane outside a turn.
- M4 Draining lanes: `cancel`/`retry` on a draining non-member; queued starts under `serialize` still sent after
  removal.
- M5 `Inactive { data }` keeps data across different params.
- M6 `.joins` on `.each` operations must share the same source.

## Authoring

- **H1. A live read can't be per member** (one `doc` per open document): state it, or support it.
- **H2. One-off reads have no ordering**: a search box needs a hand-written stale guard. Fix: a read's `start`
  interrupts the operation's previous start by default (`.overlap()` to opt out).
- **H3. A bare operation under `latest` contradicts the required `superseded:`.** Fix: `superseded` optional,
  dropped by default (every example mapped it to an ignored event).
- **H4. The member is spelled several times** (`by`, `at`, the select; repeated `at` selectors). Fix: one member handle
  per list, `const doc = O.at(({ event }) => event.docId)`, then `doc.save.retry`, `doc.load.start`.
- M1 `.joins`: one row under two names; which name retries; persistence step 3 fails. Fix: members, rows and `retry`
  on the primary only; secondaries get `start` only; or drop `.joins` for one operation plus a memory check.
- M2 `*.operations.ts` holds contracts: rename to `*.contracts.ts`.
- M3 Starting an `.each` workflow operation before its member joins is a runtime `InvalidTurn` that `flow check`
  can't see.
- M4 Keyed-schedule re-arm per key is unspecified.
- Vocabulary grew by about 8 words and 2 modes, mostly for rare cases (`.joins`, `.was`, `Inactive`, the cap,
  draining). Definitions: 42–47% operations; readable up to 3–5 operations.
- Names: `joins` → `sharesLane`; `was` → `renamedFrom`; `with` reads as a modifier; `.emits` can be misread.
