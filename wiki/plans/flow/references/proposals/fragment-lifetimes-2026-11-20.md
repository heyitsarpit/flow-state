# Fragment lifetimes: one address, two holders (proposed, 2026-11-20)

**Bottom line (proposed):** every fragment incarnation has one address, its subject path, and every placement kind
only adds parts to it: a copy key, a reset value, or (new) a node trait's or subroutine's creation input. Work has
one of two holders, fixed by the operation's kind and never by the placement: the incarnation holds reads, lookups,
sessions and schedules; the subject holds write lanes. Placements differ only in when four events happen (start, end,
freeze, thaw); one rule then decides admission, keeping and release for all of them. In the host the Owner tree from
@task.V3.T99 mirrors the incarnation tree, so ending or freezing an incarnation is one `Owner.end`, bounded by
`waitAtMost` (`ReleaseOverdue`). The freedom removed: a placement kind (trait, `.each`, nesting, `.resumable()`,
subroutine) deciding on its own what its work does.

Answers question 2 of code:wiki/plans/flow/references/proposals/advisor-questions-2026-11-20.md. Consistent with
@plan.Rules.O7 (rules judged per live incarnation, not while frozen). Builds on the merged fragment-operations record
(FO3 to FO6, FO12; at commit `20986677`), now spread over @plan.Runtime.O3, @plan.Operations.O7, @plan.Persistence.O2.

## 1. Class and freedom

- **Class:** "work outlives, or dies before, the thing that should hear it". Today's rules are per kind: reads die
  with the incarnation, writes outlive it, a freeze parks lookups, mapped writes are banned under subroutines
  (@spec.Compile.I12), node traits have no subject part (open item 21), `.each` keys past `max` say nothing about
  `whenAbandoned`.
- **Freedom:** each combination of placement (root, node, copy, nested, resumable, subroutine) and work kind (read,
  write, session, schedule) can pick its own start, keep and release. Six by four cells, each a rule to write.
- **Removed by structure:** placement kinds may only (a) add address parts and (b) fire lifetime events. Holders and
  the rule below are the same for all of them, so a new placement kind adds no lifetime rule.

## 2. The model

**Address.** An incarnation's subject path lists, from the actor's root to it, one part per placement that names what
it is about: a `.each` copy's key, a `resetOn` value, and (new) a node trait's or subroutine's creation input as
canonical text. A root trait without `resetOn` adds nothing. The instance path says where; the subject path says what
about. The address is taken once at start and stored on the incarnation (one fact; input fields stay writable).

**Lifetime events.** Every placement maps onto four, and only these:

| Event | Fired by |
| --- | --- |
| start | entry of the node, a key added, a `resetOn` change or present, actor start; never restore (same incarnation) |
| end | node left, key removed, `resetOn` change or absent, own exit; actor disposal ends all, running no event |
| freeze | a `.resumable()` trait's node left |
| thaw | that node entered again (same incarnation) |

A key past `max` never starts, so it never ends and runs no `whenAbandoned`. Nesting composes: an end or freeze
applies to every incarnation beneath, deepest first (@plan.Machines.O3's exit order).

**The rule.** Work is admitted only by a live incarnation, and its ending is delivered to the live incarnation whose
address equals the work's. It is kept while its holder lives and released when its holder ends.

- **Incarnation-held** (lookups, one-off reads, sessions, activities, schedules): end releases them; freeze releases
  sessions and lookups (each lookup's `Interrupted` parked in the frozen slice, @plan.Persistence.O2) and keeps
  schedules frozen as data; thaw places activities again and delivers the parked endings first.
- **Subject-held** (write lanes): no incarnation event touches them. With no live incarnation at the address (left,
  removed, reset, frozen) an ending applies to lane and store and is parked for the address; the next start or thaw
  at that address adopts it (@plan.Runtime.O3). Released only when the lane is Idle with nothing parked, or marked
  releasing by a key-less `O.x.cancel` in `whenAbandoned` (@plan.Operations.O7).

**Host.** The core returns lifetime events as data (`EndWork` already lists owners). The driver's per-incarnation
Owner (code:packages/flow-state-v3/src/host/driver.ts#ownerOf) gains a child per fragment incarnation, named by
instance and subject path; nested placements nest Owners. Lookups and sessions fork in that Owner; writes keep forking
in the Runtime's `work` Owner (code:packages/flow-state-v3/src/host/driver.ts#perform, `Invoke`), so no leave or
freeze can interrupt a write: the split is structural, not a check. Freeze and end both call `Owner.end`.

**What `whenAbandoned` sees.** It runs in the turn that ends the incarnation (@spec.Turn.I11), never on its own exit,
a freeze, a restore or actor disposal. It reads the before memory of that incarnation and its own address parts
(`key`, reset value); its outputs are callbacks to the host and key-less releases. It gets no `why` (left, removed,
reset): a reason would hand the freedom back to each kind (Q3).

**How `ReleaseOverdue` bounds release.** In the core a release is immediate: state, membership and timers go in the
turn. Only the host's cleanup takes time. Each `Owner.end` is awaited with `waitAtMost` and the disposal bound (D25,
code:packages/flow-state-v3/src/host/owners/owners.ts#waitAtMost); past it the Runtime records `ReleaseOverdue` naming
instance and subject path, never interrupts again, and later cleanup failures still reach whoever ended the work
(`CleanupFailed`, @plan.Runtime.O6). A new session for the same (actor, operation, key) waits for its releasing
predecessor, as today. Effect has no bounded Scope close, so this bound is Flow's (Sidecar log, E3).

```ts
// existing: subroutine, Flow.input, Flow.initial, whenAbandoned, O.x.cancel   user-defined: ThreeDSecure, intentId,
//   confirm, Abandoned   NEW: a subroutine's input is a subject part, so a mapped write may live here
const ThreeDSecure = subroutine(
  { id: "ThreeDSecure", memory: { intentId: Flow.input(Schema.String) }, /* operations: { confirm }, … */ },
  ({ O, S }) => ({
    default: S.CHALLENGE,
    // re-entry with the same intentId adopts confirm's lanes; another intentId does not
    whenAbandoned: [O.confirm.cancel], // existing: releases this address's confirm lanes, nothing else
  }),
)
```

## 3. Open items under this model

- **3 (`.history` versus interrupts):** stays closed. An interrupt, if ever revived, is a freeze of the paused
  subtree and its resume a thaw: two existing events, no new lifetime rule.
- **21 (subject path for node traits and subroutines):** accept, with the creation input as the part. It lifts
  @spec.Compile.I12's ban on mapped writes beneath subroutines; an input field without canonical text is a construction
  error where the fragment owns a mapped write (reuse `InvalidKey`).
- **22 (placements sharing an operation across paths):** keep `SharedContract`. Lanes are (identity, contract, key)
  and carry no instance path, so two placements could collide on a key; folding into one `.each` stays the recipe.
- **24 (releasing without interrupting):** the model already separates them (the releasing mark is the subject's; the
  interrupt is the host's `Interrupt` command). Defer: no step 2 row needs it.
- **26 (per-copy fan-out of write members):** covered. A fan-out raise (@spec.Turn.R30) reaches each copy, which calls
  its own member on its own address. Close; the cost is R30's rule that one copy's denial refuses the turn.

## 4. How each part is shown, and its cost

- **Holder by kind:** a run rule over every Story: no incarnation-held task outlives its incarnation's end or
  freeze, read from `OwnerRecord`s; planted fault: fork a lookup in `work`. Cost: one rule; the Owner trace exists.
- **Writes survive leave and freeze:** a Story per step 2 row (commit, leave, land, re-enter at the same and at
  another address), with a reload at every step. Cost: one Story per row.
- **Address parts:** a pure core test of nested copy, reset and subroutine paths; a type test refusing a writing
  subroutine's input without canonical text. Cost: small.
- **`whenAbandoned`:** a type test (no `why`); a Story that it runs on removal and reset, never on exit, freeze, a key
  past `max` or disposal. Cost: small.
- **`ReleaseOverdue`:** a host test with a never-ending finalizer (evidence at the bound, close continues); planted
  fault: an unbounded wait. Cost: one test.

## 5. Check against step 2 rows and @plan.Machines.O1

| Case | Placement | Address | Fits? |
| --- | --- | --- | --- |
| shop `AddressForm` | node trait on address step | its input | yes; lookup released on leave |
| shop `ThreeDSecure` | subroutine in pay step | its input | yes; needs item 21 if it writes |
| shop `CartLine`, clear cart | `.each` on `Cart` | line key | yes; raise per R30 |
| sync `RateLimit` | root trait on `Repo` | `[]` | yes; schedules only |
| transfers `StepUp`, sign-in `Reauth` | subroutine | its input | yes |
| wizard `Vehicle`, `Driver` (reused) | two subroutines | input each | reads yes; shared write: `SharedContract` |
| home `Panel`, `Sensor`, offscreen | trait, `.each`, resumable | `[]`, key | yes; freeze keeps timers, ends sessions |
| kanban `Column`, `Card`, `ChecklistItem` | nested `.each`, collapsed resumable | nested keys | yes; nesting composes |
| O1 `Upload` in `Editor` | `.each` by `ref`, max 10 | `[ref]` | yes; 11th ref never starts |

## 6. Spikes and sidecars

- Spike (passed): with the real Owner, ending a nested fragment Owner interrupted its lookup, a write forked in `work`
  finished, a later fork into the closed Owner was Interrupted, and a never-ending finalizer was caught by
  `waitAtMost` at the bound. Scratch: `scratchpad/q2/spike.mts` (outside the repo, not kept).
- Sidecar log (Haiku, effort medium):
  - E1 accepted: `Scope.close` runs finalizers in reverse and folds every failure (effect `internal/effect.ts:4077`).
  - E2 accepted: interrupting a fiber waits for its finalizers (`internal/effect.ts:987`), checked.
  - E3 accepted: no bounded Scope close in Effect 4.1.4; matches the spike.
  - E4 rejected as unanswerable: no XState copy in the repo, so XState prior art is from memory only (Uncovered).
  - S1 rejected: "frozen trait still counts" (@plan.Machines.O5) against frozen timers not firing is not a
    contradiction; wall time runs while frozen, and the timer fires once at thaw.
  - S2 accepted: no rule says whether a key past `max` runs `whenAbandoned`; answered above (never starts).
  - S3 changed: thaw places activities again but `Flow.entry` schedules do not re-arm; that is the freeze rule
    (schedules frozen, not released), now stated once.

## 7. Open questions for the user

1. **Q1. The subject part of a node trait or subroutine.** A: its whole creation input (recommended; no keyword).
   B: a declared `subject: ["intentId"]` (explicit, one new keyword). C: none; keep the ban on writes beneath
   subroutines.
2. **Q2. Item 22.** A: keep `SharedContract` (recommended). B: add the instance path to lane identity (touches the
   saved-records question, 4).
3. **Q3. `whenAbandoned`'s argument.** A: before memory and address parts, no reason (recommended). B: also a `why`.
4. **Q4. `ReleaseOverdue`'s severity.** A: a warning issue with evidence (recommended). B: quarantine the actor ref,
   as a failed end does.
5. **Q5. Items 24 and 26.** A: defer 24, close 26 as covered by R30 (recommended). B: build both now.

## Uncovered

- XState v5 invoke and spawn semantics were not checked against source (no local copy).
- Restore when a writing placement's re-taken input differs from its recorded address (FO3 resets on `resetOn`; an
  input change on restore is not decided).
- Parked endings for addresses that never return (item 25) and `Interrupted` on restore (item 27) stay open.
- How an emit is addressed by instance and subject path is question 3's.

## Review findings (Sonnet review, 2026-11-20)

Findings for the next lead to resolve; ✓ marks one the coordinator checked in the code. Nothing here is decided.

1. ✓ Wrong: Compile I12 bans mapped writes under any placement but root traits, `.each` copies and `.resumable()`
   traits (Compile.spec:266), so item 21 lifts it for node traits too; edit I12, R11, Machines.O1 and the
   CommandLine finding together.
2. Wrong: delivering an incarnation-held ending by address sends a removed-and-re-added key's old `Interrupted` to
   the new incarnation. Bind those endings to the incarnation id and counter; only subject-held ones to the address.
3. Undefined: a placement that ends while frozen (`resetOn` change, key removed, parent copy deleted), as the Draft
   `ImageUpload` row does; whether `whenAbandoned` runs and when `resetOn` is evaluated.
4. Delivering parked write endings at thaw is new to the Plans; R30's fan-out skips frozen copies.
5. Lanes still collide across subroutine inputs (a lane is identity, contract, key); extend the SharedContract
   lint and require the key to include the input.
6. Unbounded subroutine inputs make item 25 (parked endings) a blocker for item 21.
7. Wrong: `ReleaseOverdue` is a diagnostic flag that decides nothing; no mid-life cleanup bound exists today
   (`EndWork` fires only at retire and disposal). Name a separate mid-life default and who hears its failure.
8. `Owner.end` may close nested children one after another, so one hung copy delays siblings (not checked).
9. Shared reads joined by another incarnation must stay in `work` (Operations.plan, last-owner rule).
10. "Incarnation" collides with the actor-level word; call it a placement incarnation. Thaw is judged against the
    frozen slice's memory under Rules O7; say so.
