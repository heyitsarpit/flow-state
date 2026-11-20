---
proposal fragment-lifetimes
status accepted user 2026-11-20 [@review.advisor-holes]
    proposed 2026-11-20
---
# Fragment lifetimes: one address, two holders (2026-11-20; revised after review and hole-poking)

Every recommendation was accepted; see @review.advisor-holes, 11 to 16.

**Bottom line (proposed):** every placement incarnation (one life of a placed fragment; "incarnation" below) has
one address, its subject path, and a placement kind only adds a part to it: a `.each` copy's key or a `resetOn`
value. The address cannot change during a life, because a change of either part ends the incarnation. Work has one
of two holders, fixed by the operation's kind and never by the placement: the incarnation holds reads, lookups,
sessions and schedules; the subject holds write lanes. Placements differ only in when four events happen (start,
end, freeze, thaw); one rule then decides admission, keeping and release for all of them. In the host a fragment
Owner (from @task.V3.T99) mirrors each incarnation that has forked work, so ending or freezing one is one
`Owner.end`. The freedom removed: a placement kind (trait, `.each`, nesting, `.resumable()`, subroutine) deciding
on its own what its work does.

Answers question 2 of @questions.advisor-questions. Consistent with @plan.Rules.O7 (rules are judged per live
incarnation, not while frozen). Builds on @plan.Runtime.O3, @plan.Operations.O7 and @plan.Persistence.O2. The lane
and owed record fields named here are defined once, in @proposal.saved-records.

## 1. Class and freedom

- **Class:** "work outlives, or dies before, the thing that should hear it". Today's rules are per kind: reads die
  with the incarnation, writes outlive it, a freeze parks lookups, mapped writes are banned under node traits and
  subroutines (@spec.Compile.I12), `.each` keys past `max` say nothing about `whenAbandoned`.
- **Freedom:** each combination of placement (root, node, copy, nested, resumable, subroutine) and work kind (read,
  write, session, schedule) can pick its own start, keep and release. Six by four cells, each a rule to write.
- **Removed by structure:** placement kinds may only (a) add address parts and (b) fire lifetime events. Holders
  and the rule below are the same for all of them, so a new placement kind adds no lifetime rule.

## 2. The model

**Address.** An incarnation's subject path lists, from the actor's root to it, one part per placement that says
what it is about: a `.each` copy's key, or a `resetOn` value. A placement with neither adds nothing. The instance
path says where; the subject path says what about. No part is ever read from a writable field: a fragment's input
stays writable (@plan.Machines.O1), so an address taken from input could differ from the keys the incarnation
commits on, and a lane made under the old address would decline the next life's members forever. How a node trait
or subroutine names its subject is question 1; the text below assumes `resetOn` (1 D).

**Lifetime events.** Every placement maps onto four, and only these:

| Event  | Fired by                                                                                    |
| ------ | ------------------------------------------------------------------------------------------- |
| start  | entry of the node, a key added, a `resetOn` value present or changed, actor start           |
| end    | node left, key removed, a `resetOn` value absent or changed, own exit; live or frozen alike |
| freeze | a `.resumable()` trait's node left                                                          |
| thaw   | that node entered again (the same incarnation)                                              |

A restore fires none of them: it gives every incarnation a new id (@spec.Restore.R1), runs no start and no
`whenAbandoned`, and keeps frozen ones frozen. Actor disposal ends all and runs no event. A key past `max` never
starts, so it never ends. While frozen, `resetOn` is not evaluated; a thaw evaluates it first, and a changed value
ends the frozen incarnation and starts a new one. A key removed, or a parent copy deleted, ends a frozen
incarnation at once, and its `whenAbandoned` reads the frozen slice's memory. Nesting composes: an end or freeze
applies to every incarnation beneath, deepest first (@plan.Machines.O3's exit order).

**The rule.** Work is admitted only by a live incarnation. It is kept while its holder lives and released when its
holder ends.

- **Incarnation-held** (lookups, one-off reads, sessions, activities, schedules): their endings belong to that one
  incarnation, never to its address, so a key removed and added again hears nothing of the old life. End releases
  them. Freeze releases sessions and lookups, each lookup's `Interrupted` parked for the frozen incarnation, and
  keeps schedules frozen as data; thaw places activities again and is judged against the frozen slice's memory.
- **Subject-held** (write lanes): no incarnation event touches them. With no live incarnation at the address (left,
  removed, reset, frozen) an ending applies to lane and store and is parked for the address; the next start or
  thaw at that address adopts it. Released only when the lane is Idle with nothing parked, or marked releasing by a
  key-less `O.x.cancel` in `whenAbandoned` (@plan.Operations.O7).
- **One parked order.** Both kinds of parked ending are the identity's owed rows, in the order they were owed
  (@spec.Restore.R3). A row carries the address; an incarnation-held one also names its incarnation by the saved
  counter (@plan.Persistence.O2), and closes as evidence if that incarnation is gone. So a thaw after a lookup and
  a write both ended replays in one order on every build.

**Host.** The core returns lifetime events as data (`EndWork` already lists owners). The driver's per-actor Owner
(code:packages/flow-state-v3/src/host/driver.ts#ownerOf) gains a child per fragment incarnation, created at its
first fork (a copy with no work has none), named by instance and subject path. Lookups and sessions fork there;
writes keep forking in the Runtime's `work` Owner, so no leave or freeze can interrupt a write: the split is
structural. A shared read also forks in `work`, and each incarnation's Owner holds only its wait, so the request
stops at its last owner (@plan.Operations.O7). Sibling fragment Owners must close together: today `Owner.end`
closes children one after another (code:packages/flow-state-v3/src/host/owners/owners.ts, the `children` loop), so
one hung copy would delay the rest.

**What `whenAbandoned` sees.** It runs in the turn that ends the incarnation (@spec.Turn.I11), never on its own
exit, a freeze, a restore or actor disposal. It reads the before memory of that incarnation and its own address
parts (`key`, reset value); its outputs are callbacks to the host and key-less releases. It gets no `why` (left,
removed, reset): a reason would hand the freedom back to each kind (question 4).

**The release bound.** In the core a release is immediate: state, membership and timers go in the turn. Only the
host's cleanup takes time, and no mid-life bound exists today: `EndWork` is awaited only at retire and disposal.
Proposed: every fragment `Owner.end` is awaited with `waitAtMost` and the one disposal bound (D25,
code:packages/flow-state-v3/src/host/owners/owners.ts#waitAtMost). Past it the Runtime reports `ReleaseOverdue` as
an actor issue naming instance and subject path, and goes on; the flag decides nothing, and a later cleanup failure
reaches the same actor's issues as `CleanupFailed` (@plan.Runtime.O6), since the turn that ended the work is over.

```ts
// existing: subroutine, Flow.input, whenAbandoned, O.x.cancel, resetOn   user-defined: ThreeDSecure, intentId,
//   confirm   NEW: resetOn on a subroutine's (or node trait's) filling, so a mapped write may live in it
const ThreeDSecure = subroutine(
  { id: "ThreeDSecure", memory: { intentId: Flow.input(Schema.String) }, /* operations: { confirm }, … */ },
  ({ O, S }) => ({
    default: S.CHALLENGE,
    whenAbandoned: [O.confirm.cancel], // existing: releases this address's confirm lanes, nothing else
  }),
)
// in the host's filling of ThreeDSecure: resetOn: ({ memory }) => memory.intentId
//   another intent is another address; with no resetOn the subroutine adds no part and re-entry adopts by key
```

## 3. Open items under this model

- **3 (`.history` versus interrupts):** stays closed. An interrupt, if ever revived, is a freeze of the paused
  subtree and its resume a thaw: two existing events, no new lifetime rule.
- **21 (subject path for node traits and subroutines):** accept, with the part named by question 1. It lifts
  @spec.Compile.I12's ban for node traits and subroutines alike, so I12, @spec.Compile.R11, @plan.Machines.O1's
  write scope and the CommandLine finding change together (proposed; none edited).
- **22 (placements sharing an operation across paths):** keep `SharedContract`. Lanes are (identity, contract, key)
  and carry no instance path, so two placements could collide on a key; folding into one `.each` stays the recipe.
- **24 (releasing without interrupting):** the model already separates them (the releasing mark is the subject's;
  the interrupt is the host's). Defer: no step 2 row needs it.
- **25 (parked endings of a path that never returns):** unchanged in size under 1 D (parts are still only keys and
  reset values); under 1 A or B it becomes routine and must be settled with item 21 (question 2).
- **26 (per-copy fan-out of write members):** covered. A fan-out raise (@spec.Turn.R30) reaches each live copy,
  which calls its own member on its own address; frozen copies are skipped, and hear their endings at thaw.

Delivering parked write endings at a thaw, the one parked order, and the mid-life bound are new to the Plans
(@plan.Runtime.O3 says "start"; @plan.Persistence.O2 keeps a freeze's `Interrupted` in the slice): proposed edits.

## 4. How each part is shown, and its cost

- **Holder by kind:** a run rule over every Story: no incarnation-held task outlives its incarnation's end or
  freeze, read from `OwnerRecord`s; planted fault: fork a lookup in `work`. Cost: one rule; the Owner trace exists.
- **Writes survive leave and freeze:** a Story per step 2 row (commit, leave, land, re-enter at the same and at
  another address), with a reload at every step. Cost: one Story per row.
- **Address is stable:** a Story that changes the `resetOn` source mid-life (one end, one start, the old lane not
  declining the new life); a pure core test of nested copy and reset paths. Cost: small.
- **One parked order:** a Story that freezes during a lookup and a write, lands both, reloads, thaws; the same
  order before and after the reload. Planted fault: slice endings first.
- **`whenAbandoned`:** a type test (no `why`); a Story that it runs on removal, reset and an end while frozen, never
  on exit, freeze, restore, a key past `max` or disposal. Cost: small.
- **Release bound:** a host test with a never-ending finalizer in one copy (issue at the bound, siblings closed on
  time, close continues); planted fault: an unbounded wait. Cost: one test, one change to `Owner.end`.

## 5. Check against step 2 rows and @plan.Machines.O1

| Case                                     | Placement                           | Address                   | Fits?                                     |
| ---------------------------------------- | ----------------------------------- | ------------------------- | ----------------------------------------- |
| shop `AddressForm`                       | node trait on address step          | `[]`                      | yes; lookup released on leave             |
| shop `ThreeDSecure`                      | subroutine in pay step              | `[intentId]` by `resetOn` | yes; needs item 21 if it writes           |
| shop `CartLine`, clear cart              | `.each` on `Cart`                   | line key                  | yes; raise per R30                        |
| sync `RateLimit`                         | root trait on `Repo`                | `[]`                      | yes; schedules only                       |
| transfers `StepUp`, sign-in `Reauth`     | subroutine                          | `[]`                      | yes; reads only                           |
| wizard `Vehicle`, `Driver` (reused)      | two subroutines                     | `[]` each                 | reads yes; shared write: `SharedContract` |
| home `Panel`, `Sensor`, offscreen        | trait, `.each`, resumable           | `[]`, key                 | yes; freeze keeps timers, ends sessions   |
| kanban `Column`, `Card`, `ChecklistItem` | nested `.each`, collapsed resumable | nested keys               | yes; nesting composes                     |
| Draft `ImageUpload` removed while frozen | `.each`, resumable                  | key                       | yes; ends frozen, `whenAbandoned` runs    |
| O1 `Upload` in `Editor`                  | `.each` by `ref`, max 10            | `[ref]`                   | yes; 11th ref never starts                |

## 6. Spikes and sidecars

- Spike (passed, `scratchpad/q2/spike.mts`): with the real Owner, ending a nested fragment Owner interrupted its
  lookup, a write forked in `work` finished, a later fork into the closed Owner was Interrupted, and a never-ending
  finalizer was caught by `waitAtMost` at the bound.
- First-pass sidecar log (Haiku, effort medium): E1 to E3 accepted (Scope close folds failures; interrupt waits for
  finalizers; no bounded Scope close in Effect 4.1.4); E4 rejected (no local XState); S1 rejected; S2 accepted
  (a key past `max` never starts); S3 changed (schedules frozen, not released).

## 7. Open questions for the user

1. **How a node trait or subroutine names its subject.** A: its whole creation input; needs input fields made
   read-only, or the address strands lanes. B: a new `subject: ["intentId"]` on the fragment, those fields
   read-only. C: none; keep I12's ban. D: `resetOn` on its filling, as root traits and copies already have
   (recommended: no new keyword, and a subject that changes is already defined as a reset).
2. **A fragment's own exit while it holds a lane.** A: nothing special: the ending parks for the address and the
   next incarnation there adopts it (recommended with 1 D, where the address recurs). B: own exit also runs the
   key-less releases `whenAbandoned` lists (recommended instead if 1 is A or B, with item 25's age bound). C: a
   construction error for a fragment that can exit with a non-Idle lane.
3. **Item 22.** A: keep `SharedContract` (recommended). B: add the instance path to lane identity (changes the lane
   key in saved-records).
4. **`whenAbandoned`'s argument.** A: before memory and address parts, no reason (recommended). B: also a `why`.
5. **A release past its bound.** A: a warning issue with evidence, on the one D25 bound (recommended). B: also
   quarantine the actor ref, as a failed end does. C: a separate, shorter mid-life default.
6. **Items 24 and 26.** A: defer 24, close 26 as covered by R30 (recommended). B: build both now.

## Uncovered

- XState v5 invoke and spawn semantics were not checked against source (no local copy).
- The host's filling syntax for `resetOn` on a subroutine state, and whether a subroutine restarting on a reset
  mid-challenge reads well in the shop fixture: not built or spiked.
- Whether a new session for the same (actor, operation, key) waits for its releasing predecessor mid-life as it
  does at disposal (@plan.Runtime.O6): assumed, not read in the code.
- `Interrupted` on restore for live lookups (item 27) stays open.
- How an emit is addressed by instance and subject path is question 3's.

## Revision log

Review = the Sonnet review; Hole and HQ = @review.advisor-holes §3 holes and questions. No sidecars were
started for the revision; items were checked against the Plans, @spec.Restore.R1 and `owners.ts` directly.

- Review 1: fixed. Item 21 lifts I12 for node traits too; the four records to edit are listed.
- Review 2: fixed. Incarnation-held endings belong to the incarnation (saved counter), not the address.
- Review 3: fixed. A frozen incarnation ends on key removal or parent deletion; `resetOn` is evaluated at thaw.
- Review 4: fixed in the text as a proposed Plan edit; frozen copies are skipped by R30 and hear at thaw.
- Review 5: fixed by 1 D (no part comes from input, so inputs cannot collide); stands under 1 A.
- Review 6, Hole 3, HQ2: left to the user (question 2); item 25 is unchanged in size under 1 D.
- Review 7: fixed. The mid-life bound is stated as new, on D25, heard as actor issues; severity is question 5.
- Review 8: verified in `owners.ts` (children close in sequence); a change to `Owner.end` is named and tested.
- Review 9: fixed. Shared reads fork in `work`; an incarnation holds its wait.
- Review 10: fixed. "Placement incarnation"; thaw is judged against the frozen slice's memory.
- Hole 1, HQ1: fixed by structure under 1 D (a changed subject ends the incarnation); the choice is question 1.
- Hole 2, HQ3: fixed. A restore re-ids and fires no event; parked endings are placed by address and counter.
- Hole 4, HQ4: fixed. One parked order: owed rows in owed order (changes @plan.Persistence.O2's slice, proposed).
- Hole 5: fixed. A fragment Owner is created at its first fork.
