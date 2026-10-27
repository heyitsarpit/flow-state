# Review: opus-trait-routine-actor.md (correctness and static analysis)

Lens and severity scale are the same as [round 1](round1-correctness.md) to
[round 3](round3-correctness.md).

The request, reply and abandonment semantics are copied from opus-split and codex-split, which are
reviewed already. Those parts were checked only for faithful copying, and they are faithful: `notSent`
versus `interrupt`, class-branded results, synchronous `pending`, a non-targeting `abandoned`,
call and arming ids, transitive terminal totality and projection-defect closure.

This review concentrates on what is new:
- node-scoped memory and lexical scope;
- per-edge `S.X.from` input, including on `default`;
- traits on any node;
- one lifecycle on every node;
- node memory in the snapshot and on restore;
- the feature-coverage claim;
- the reference-app finding.

**Verdict:** no blockers. There are four majors, all in the new scoping and lifecycle rules, not
in the request protocol. The coverage claim ("nothing lost") holds for existing programs, with
three meaning changes that should be listed. The reference-app bug claim is **correct**.

---

## 1. Majors

### M1. A late `abandoned` run is type-checked against memory that no longer exists

Rule 2 scopes code lexically: a handler sees node memory from its node up to the piece root. The
`abandoned` filling sits in the body at the routine's placement node. Its settled run happens
"as a later host turn" (rule 11), often after that node *and its ancestors* have been left.

Scenario: a routine `SEND` is placed under an inline node `REVIEW`, which owns node memory
`{ note }`. Its `abandoned` writes `note` on success. The user Escapes to a root state, leaving
REVIEW. Later the commit settles and `abandoned` runs with `note` in its lexical scope, but REVIEW's
memory is gone. Either the patch targets an absent node (undefined behaviour: drop, defect or
resurrect?) or the read sees `undefined` while the type says `string`.

The editor sample avoids this only because it writes root fields (`saved`, `uncertain`).

**Fix:** type the settled run's scope as the **binder's piece root only** (fields that outlive
every departure), or as the nearest ancestor that the departure provably keeps. Reject node fields
in `abandoned` at construction. The `"pending"` run is fused into the departure, where the pre-turn
scope is still valid, so it can keep the full scope.

### M2. Ancestors cannot read the node memory they abandon (D7 and checkpoint regression)

By rule 2, an ancestor handler cannot see a descendant inline node's memory. Only child
*instance* slices are visible. Today every handler can read all memory, so `OPEN.Close` can
checkpoint `draft`. If an author follows the proposal's own advice (check 18, "consider node
memory") and moves a draft into its node, then every ancestor departure (Close, Escape, revoked
permission) loses it, and no handler can save it. That is D7, made structural by the scoping
rule. Views can read the field (narrowed by `S.X.is`), but the transitions that abandon it cannot.

**Fix:** let any handler in the piece read descendant node fields as optional, narrowed by its
`state` (the same narrowing views use). Writes stay lexical. Alternatively, have check 18 never
suggest node memory for a field that an ancestor-leaving edge would need.

### M3. Per-edge `.from` makes D6 a convention on every entry edge (a regression against opus-split)

Rule 5: every callback reads the pre-turn snapshot; a `.from` mapper sees the event or payload,
not the transition's own patch. The proposal labels D6 "by convention" (row D6, drawback 7). The
exposure is much larger than in codex-split. Here `.from` is the **only** way to seed any node,
including plain states (`FAILED.from`), routines and `default` edges, and today's natural idiom is
"update memory, then target".

Scenario: a future `SaveAs({ title })` handler in EDITING is written
`{ updateMemory: ({ event }) => ({ draft: event.title }), target: save }`. `save` is
`S.OPEN.SAVING.from(({ memory }) => …memory.draft)`, so it commits the **old** draft, and every
retry resends it (D2-shaped). Nothing reports it: the check reads patch keys from types, but it
cannot see which keys a mapper closure reads.

**Fix:** adopt opus-split's narrow staged read for `.from` mappers only. They read surviving
ancestors' memory *after* the entering transition's patch, plus the event or payload. That is a
single, documented O3 exception, and it covers default edges too (defaults already read the
parent's fresh memory, rule 5). Otherwise keep D6 as an explicit weakness and add a check that
warns when an edge both patches memory and enters through a `.from` that reads `memory`.

### M4. Explicit re-entry now resets node memory, traits and `start`, and the samples use it on every keystroke

Machines O2: "an explicit target re-enters itself if active". Today that restarts the node's work
(schedules, activities) and leaves memory alone. Under rule 3 it also discards the node's memory,
re-activates its traits (fresh trait memory, cancelled trait timers, fenced trait requests) and
**re-runs `start`**.

The rewritten editor's OPEN `TitleChanged` targets `S.OPEN.EDITING` while EDITING is active
(EDITING no longer handles `TitleChanged` itself), so EDITING is re-entered on every keystroke:
- **Node memory:** any node memory or trait later added to EDITING silently resets on each
  keystroke.
- **`start`:** any `start` on EDITING runs again on each keystroke. If it holds a request,
  one-outstanding then *rejects the user's keystroke turn* (rule 10).

This is a meaning change to an existing idiom. "Re-enter to restart the timer" is the plans' own
debounce pattern, and sonnet-split's AutoSave uses `Edit: target S.DIRTY` for exactly that.

**Fix:**
- A `flow check` warning or error when an explicit self or ancestor re-entry targets a node that
  owns memory, traits or `start`, with "use `"self"`" advice.
- A distinct `restart` target for "restart work only".
- Have the editor sample handle `TitleChanged` in EDITING with `"self"`.

---

## 2. Minors

- **m1. The editor `abandoned` ignores `"pending"`.** "pending, failure and notSent leave nothing to
  keep". The L7 gap is still benign here, because `saveTitle` is `concurrency: "reject"`: a new SAVING
  after Reopen gets `notSent`, then Busy, then a backoff retry until the old call settles. So the
  older write cannot land last. The UI shows nothing during the gap, though. Record `pending` (one
  line), as opus-split's Checkout does.
- **m2. CancelSave, then an immediate SaveRequested.** The post-invocation cancel later reports
  `unknown` and sets `uncertain`, but EDITING's `SaveRequested` guard (`canSave`) ignores
  `uncertain`. A new save starts while the old write's fate is unknown. The title is an idempotent
  overwrite, but the old one could apply after the new one. Gate on `uncertain === null`, as
  FAILED and UNSURE do elsewhere.
- **m3. `states` as a record: integer-like keys reorder.** JS objects put integer-like keys first,
  so `"1"` or `"2"` state names would lose declaration order. Machines O5 uses declaration order for
  equal deadlines, and today's list form preserves it. Reject integer-like state names, or keep
  ordering metadata.
- **m4. Patch overlap in fused transitions uses "documented order"** (open question 3), which is a
  silent last-writer. Make overlapping keys a construction error (codex-split R13). It matters more
  here, because `pending` patches now route to owning nodes as well.
- **m5. A target "may not pass through an input node it would enter"** (rule 4). Today any
  descendant is targetable, so this is a real (if reasonable) loss. It is listed in §5, but the
  verdict table still says "same".
- **m6. Trait raise on an entering node.** Correctly a construction error (rule 12, check 8). Note
  the consequence: a trait that must see the *entering* edit has to live on an ancestor that
  survives it. This is a placement rule authors will hit (the editor moved Debounce from EDITING
  to OPEN for this reason).
- **m7. Snapshot validity.** "Node fields validated against the restored state path" is right.
  Also state that a node field present outside its node, or missing inside it, is an invalid
  capture (InvalidSnapshot), not a partial reset. The same applies to SSR transfer.

---

## 3. Special-attention items, answered

| Topic | Finding |
| --- | --- |
| Node-scoped memory and cross-node reads | Sound for writes and for siblings (they don't exist). Two gaps: an ancestor cannot read what it abandons (**M2**), and late `abandoned` scope is unsound (**M1**). |
| Edge-supplied input, including default edges | Typed per event or payload: good. Default `.from` reads the parent's fresh memory (rule 5) and is pure for React O2 pre-attach: fine. D6 is a convention on every edge, a regression (**M3**). |
| Traits on any node, including a node the same edit enters | Correct: raising into a trait on an entering or leaving node is a construction error (check 8), so T2's trait form is prevented. Placement consequence (m6). |
| One lifecycle on every node versus Machines O5 | Consistent with O5 for schedules (entry arms, exit cancels, descendants and `"self"` preserve); arming ids are an improvement. The real change is **explicit re-entry semantics** for memory, traits and `start` (**M4**). The `restartOn` baseline is unchanged. |
| Snapshot, persistence and restore of node memory | Flat-per-piece memory with absent node fields; validated against the state path; ids persisted; restore runs no `initial`, `start` or trait input. Adequate, plus m7. |
| Coverage claim | Holds for existing programs (see §4), with three meaning changes to list: explicit re-entry (M4), unreachable deep targets into input nodes (m5), and record ordering (m3). |
| Reference-app bug | **Confirmed** (see §5). |

## 4. Coverage claim against Machines.plan O1–O8

Checked row by row against [Machines.plan](../../../../Machines.plan).

| Plan item | Lost? | Notes |
| --- | --- | --- |
| O1 construction, validation, inference, Schemas | No | `states` list → record is syntax (m3 ordering caveat). The Memory Schema gains optional node fields. |
| O1 `input`/`memory`/`initial` rules | No | Root unchanged. Node `initial` runs per entry, never on restore. |
| O2 one leaf, `S.X.is`, `.child`, handler fallthrough | No | — |
| O2 "substates share the actor's memory" | Replaced | Only for fields the author moves into a node. Ancestors then lose read access (M2). |
| O2 explicit re-entry / unchanged boundary | **Meaning extended** | Re-entry now also resets node memory and traits and re-runs `start` (M4). |
| O2 target any descendant | **Narrowed** | Not through an input node (m5). |
| O3 pre-turn reads, one patch, `now`, batch validation, defects | No | Patches route by owner. The patch-overlap order is unspecified (m4). |
| O4 guards, `check()` | No | `check()` evaluates raise payload mappers (shared amendment). |
| O5 schedules, `restartOn`, restore | No | Improved by arming ids. One more tie-break for traits. |
| O6 activities and outcomes | No | Actor piece only; pieces use requests. |
| O7 `onContext` | No | Root only. It cannot read node fields (M2 applies). |
| O8 snapshot | No | `memory` is wider; views must narrow node fields. |

**Net:** nothing is lost for programs that don't use the new features. The three meaning changes
are real but opt-in, except M4, which bites as soon as any node memory, trait or `start` is
added to a node that is re-entered by an explicit self-target.

## 5. The reference-app finding

**Confirmed.** In `features/Tickets/editor/editor.machine.ts`:
- `EDITING.schedules.autosave` uses `restartOn: ({ memory }) => memory.draft`.
- `SAVING.Saved`'s second alternative targets `S.OPEN.EDITING` when the draft moved on.
- OPEN's `TitleChanged` targets `S.OPEN.EDITING` from SAVED, FAILED, LOCKED or UNCERTAIN.

Each of these *enters* EDITING with the newer draft already committed. Machines O5: "restartOn …
establishes a silent baseline and leaves the schedule idle on entry". So no autosave fires, and the
`editedWhileSaving` Story's `autosaving-newer-draft` expectation (SAVING) cannot hold. The first edit
after SAVED or FAILED also never autosaves.

One caveat for the plan: O5 should state explicitly that the entry baseline is taken from the
entering turn's **committed** memory. Codex-split, sonnet-split and this proposal all read it that
way.

The proposal's fix holds. Debounce is a trait on OPEN, which survives those transitions. The
"draft moved on" exit alternative and OPEN's `TitleChanged` raise `autosave.Input`. `onSettled`
saves only in EDITING (otherwise it consumes the firing). Traced: type, Save, type during the save,
`Done` (draft moved on) → EDITING plus raise; 2 seconds later `onSettled` → `save` → SAVING; then
`Done` → SAVED. This matches the rewritten test.

One residual: typing *during* SAVING does not raise `Input` (SAVING handles `TitleChanged` itself).
If that save ends in FAILED, the newer draft waits for the next keystroke. That is acceptable, but
document it.

---

## 6. Head to head with opus-split (correctness only)

| Area | opus-split | trait-routine-actor |
| --- | --- | --- |
| Request, abandonment and identity protocol | Same | Same (faithful copy) |
| L3 leftover memory | Prevented inside fragments | Prevented on any node. **Better.** |
| T2 trait trap | Check warns | Construction error. **Better.** |
| D6 same-turn seeding | Prevented (staged `input`) | Convention on every entry edge. **Worse** (M3). |
| D7 / checkpoint on abandonment | Host memory is readable by all handlers | An ancestor cannot read descendant node memory. **Worse** (M2). |
| Late `abandoned` scope | Host root only; sound | Lexical; can reference dead node memory. **Worse** (M1). |
| Re-entry semantics | Unchanged for host states; fragments reset by design | Every node with memory, traits or `start` resets on explicit re-entry. **New hazard** (M4). |
| Blast radius of the plan change | Additive | Rewrites Machines O1–O3 and O8 core; larger type spike |

**Pick: opus-split**, on correctness. Both share the protocol that carries most of the correctness.
opus-split adds it without changing the meaning of anything that exists, and keeps D6 prevented.
This proposal's two genuine correctness wins (L3 on any node, T2 as an error) come with four new
scoping and lifecycle holes.

If the user wants node-scoped memory and traits anywhere for their design value, this proposal
becomes acceptable once these four are fixed:
- **M1:** `abandoned` is scoped to the piece root.
- **M2:** descendant node fields are readable, narrowed, by ancestors.
- **M3:** `.from` gets a staged read of the entering patch.
- **M4:** a check on explicit re-entry of nodes with memory, traits or `start`.

None of these touches the request protocol. Its own fallback (open question 1: root memory plus
piece memory, traits anywhere, per-edge `.from`, `start` anywhere) removes M1, M2 and most of M4,
but keeps M3.
