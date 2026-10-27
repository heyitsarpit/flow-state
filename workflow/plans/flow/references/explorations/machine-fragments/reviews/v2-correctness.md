# proposal-v2: correctness and static analysis review

Lens and severity scale are the same as research/reviews rounds 1–3:
- **blocker:** a legal program silently reaches a wrong state that matters;
- **major:** a claimed guarantee is only convention, or a sample breaks a rule or a plan;
- **minor:** a sharp edge or wording.

Checked against [principles.md](../principles.md) (now including L5–L8, E4, E5, H4, H5, D5–D7, A7,
T1, T2) and the plans.

**Verdict: no blockers, two majors, eight minors.** The request protocol, the round 3 policy points
and the new combinations hold. The two majors are:
- the flagship editor sample dead-ends after an uncertain save;
- one unspecified case of entry `input` (`event` when a callback enters a step).

Both are small. v2 is correct enough for the S1 type spike once they are fixed.

---

## 1. Decisions applied consistently? (rules, checks, code)

| Decision | Rules / checks | Code | Verdict |
| --- | --- | --- | --- |
| Two constructors, opus-split surface | R1, check 1 | all samples | ✓ |
| codex-split request semantics: lexical, class-typed tokens; payload-only select; one outstanding call | R9, checks 1 and 8 | Delete, Checkout, Editor | ✓ |
| Live props cut | — (no `live` anywhere) | Poll uses `SetSlow` | ✓ |
| Nested subroutines deferred; requests only on fragments a machine places directly | R1, check 1 | AddressStep holds traits only | ✓ |
| Per-placement `input`: staged memory plus event | R3 | Checkout PLACING and Editor SAVING read post-patch memory | ✓, with M2 (the callback-entry `event`) |
| `start` on subroutines only | R4 | CommitWithRetry | ✓ |
| Pre-invocation cancel is `notSent` (reads: `interrupt`) | R9, R12, Story `.cancel` | CommitWithRetry retries `NotSent` | ✓ |
| No `allow` on request commits | R9, check 10 | descriptors noted as `reject` | ✓ |
| One `abandoned` per binding | R10 | all three commit hosts | ✓ |
| Pending/leaving key overlap is a construction error | R10, R11, check 5 | Editor and Checkout leave edges write nothing | ✓ |
| Staged-input policy (round 3 point 2) | R3; decision 11 | — | ✓ |
| Traits on any node via `.at()` | R1, R2, R11, check 5 | Editor `autosave.at("OPEN")` | ✓, with m3 |
| Fillings are total `on`-style handlers | R7, R8, R10, R13, check 4 | `onSettled`, `Done` and `Busy` alternatives end unguarded | ✓ |
| `notify` instead of callbacks in `actions` | R7 | Debounce, Field, HoldToConfirm | ✓ |
| A commit `defect` is uncertainty; a throwing mapper delivers a fixed `defect` | R9 | `defect: E.Unsure` bare; reads `defect: E.Failed`/`Unverified` bare | ✓ |
| Machines O5 `restartOn` baseline = the entering turn's committed memory | R2, §11 | Debounce comment | ✓ |
| `story.machine` harness with fixtures | §5 | Debounce, Field, Hold, Delete, Poll tests | ✓ |

Retraced in the samples:
- CommitWithRetry: Busy and NotSent back off; unknown, interrupt and defect exit Uncertain; totals
  are unguarded at the end.
- Checkout `cancelWhilePlacing`: `pending` is set in the Cancel turn, `Start` is denied, a late
  success leads to Placed, and Reconcile reaches PLACED.
- The editor autosave, including the equal-deadline race at t=2s. If `Due` and the save completion
  coincide, either order works: `Due` in SAVING is consumed by `NotEditing`; or `Done` raises
  `Input`, and the arming id fences the older queued `Due`.

---

## 2. Majors

### M1. The editor never saves again after an uncertain outcome, unless the user stays in UNCERTAIN

- `canSave` denies when `unsettled !== null` (the L7 gate).
- `reconcile` is reachable **only** from UNCERTAIN (`SaveRequested` there).

Two scenarios:
1. A save ends `unknown`, so SAVING exits `Uncertain` → UNCERTAIN with `unsettled.settled = true`.
   The user types one character: OPEN's `TitleChanged` moves to EDITING. Now `SaveRequested`
   (EDITING and FAILED) and the autosave's `onSettled` are all denied with
   `PreviousSaveUnresolved`. No transition leads back to UNCERTAIN or RECONCILING. The hint reads
   "Your last save is still being confirmed" forever, Close/Reopen included.
2. Close or CancelSave during SAVING, after invocation. The cancel reports `unknown`, and
   `abandoned` sets `settled: true`. The same dead end follows: the actor is never in UNCERTAIN.

The protocol is right (no double write), but the workflow is stuck: L4 at the product level, and
the sample is the one the decisions are proved on (FlowState O2 amendment).

**Fix:** route reconciliation from wherever the gate denies. For example, an OPEN-level
`SaveRequested` alternative ahead of the per-state ones:
`{ target: S.OPEN.RECONCILING, guard: unsettled?.settled === true, actions: [reconcile] }`.
Or make the abandoned `unknown`/`interrupt`/`defect` cases, and typing in UNCERTAIN, keep the
user in UNCERTAIN. Add a Story: unknown, type, Save → RECONCILING.

### M2. Entry `input` when a *callback filling* enters a step: what is `event`?

R3 says `input` reads the staged snapshot "plus the entering `event`. An exit's payload counts as
the event." The editor's autosave `onSettled` filling targets `S.OPEN.SAVING`. The transition is
triggered by the trait's **internal** `Due` (a timer). If `event` there is `Due`, a host `input`
mapper reads a fragment-internal event, which leaks implementation (D9/E2). Swapping Debounce's
internals would also change the type of SAVING's input mapper. If it is `undefined`, the
`event` union in R3 is wrong.

The editor's mapper reads only `memory`, so the sample works. But the spike is told to infer "the
`event` union in `input` fillings" (open risk 1), and that union is undefined for this edge.

**Fix:** one sentence in R3: "a callback's payload counts as the event, as an exit's payload
does; a fragment's internal events never reach a host mapper." The same applies to a trait
`.at(node)` activated by a callback-driven entry of its node.

---

## 3. Minors

- **m1. `check()` and filling payloads.** R11 says `check()` evaluates *raise* payload mappers.
  Fillings are total, so their guards only choose an alternative. But the chosen alternative may
  raise into a child whose guard declines, so `check()` must know which alternative is chosen. When
  a filling guard reads `payload` (the editor's `Done` reads `payload.title`), that requires the
  fragment's `notify`/exit `.from` mappers too. Say "raise, notify and exit payload mappers that
  feed a guard". Otherwise `check()` and handling can disagree (T1 parity).
- **m2. Trait `input` at admission.** R3 says only a *root* trait's `input` reads initial memory
  with no event. A trait `.at(node)` whose node is on the admission default chain
  (`autosave.at("OPEN")`, since OPEN is the default) also activates at admission. Extend the sentence
  to "any trait activated at admission".
- **m3. Explicit re-entry silently resets traits.** R2 re-activates a node's traits on explicit
  re-entry, which drops a pending debounce or hold. Check 16 warns, which is adequate. Only a raise
  into it is an error (check 5); a re-entry that doesn't raise is only warned. The editor uses
  `"self"` in EDITING for exactly this reason.
- **m4. Pushed values (D1).** The verdict "allows" is honest. Add one sentence: `abandoned` cannot
  raise (R10), so a host value changed by a late outcome can never be pushed into an active
  fragment. It stays stale until the fragment re-enters. Suggest "push from an ordinary later
  event" as the documented pattern.
- **m5. No subroutine on the admission path.** Sound, and consistent with React O2's pre-attach
  snapshot and with restore. A subroutine as the default of a *non-admission* compound is still
  allowed; its `event` is the event of the transition entering that compound. The open risk for the
  spike covers it; worth one example.
- **m6. A Checkout late success reconciled to PLACED leaves `orderId` null.** The `Placed` branch
  doesn't carry the order id. Store it from the abandoned `success` (R10 would need the value in the
  payload, as codex-split had), or reconcile via `retry` to obtain it.
- **m7. An editor late success leaves the autosave consumed.** Once `unsettled` clears, a draft that
  differs from `saved` is not autosaved until the next keystroke. Same class as the documented
  "typing during SAVING" gap; document it together with that one.
- **m8. "A success also reaches `saved` through the ticket subscription"** assumes `saveTitle`
  declares `writes` (or the domain repairs the entry). State it in the editor definition, or
  write `saved` from the abandoned success directly (that needs the value; see m6).

---

## 4. The new combinations, attacked

| Combination | Finding |
| --- | --- |
| Traits `.at()` on non-root nodes | Lifecycle follows the node (R2); slices are `undefined` while inactive (R14); requests on a `.at` trait are covered by `abandoned` when its node is left (R10 says "activation ends"). Callback scope is checked (check 11). Sound, plus m2 and m3. |
| `.at()` on a node the same edit enters | Raising into it is a construction error (R11, check 5), so the T2 trap cannot be rebuilt. The editor places Debounce on OPEN for this reason. ✓ |
| `hostEvent` pushes replacing live props | Poll is correct: `SetSlow` is handled unguarded at the root (total, so it is legal from terminal contexts), and WAITING re-enters to re-arm. A transition that enters LIVE and changes `hidden` is covered by the staged `input`. Cost: D1 by convention (m4). |
| No subroutine on the admission path | Sound. The Queue starts PAUSED and the panel sends `Resume`. React O2 and restore are consistent. |
| `check()` evaluating payload mappers | Pure, pre-turn, throws on defect (open risk 3); widen it to notify/exit payloads (m1). |
| Editor autosave fix | Correct for its stated scenario, including the equal-deadline race (arming ids). It is broken by the L7 gate's missing reconcile route (M1). |
| Commit `defect` as uncertainty | Closes the round 3 double-order path; reads keep `defect` as a plain failure. ✓ |
| Fixed `defect` on a throwing mapper | Bare standard mappings make "no mapper" true by construction. ✓ |

## 5. Problem table (§7) verdicts

All verdicts are accurate. Specifically:
- L3 "in fragments", L7 "record; guard by convention", D1 "allows", D3 "by convention", and
  D7 "allows" are correctly hedged.
- H1 is correctly "author's choice".
- T2 is correctly "prevents for traits; warns for host schedules".

Two qualifications:
- **D6 "prevents"** holds once M2 defines `event` for callback-driven entries.
- **T1 "prevents"** holds once m1 widens `check()`'s mapper evaluation.

Neither verdict is wrong in design; both rely on a sentence that is missing.

---

## 6. Ready for the S1 type spike?

**Yes, after two small changes:**
1. **M2 (spec):** define `event` for callback-entered steps and traits as the callback payload. This
   feeds directly into the spike's "`event` union in `input` fillings" item.
2. **M1 (sample):** give the editor a reconcile route from EDITING/FAILED (or keep the user in
   UNCERTAIN), plus a Story for unknown → type → Save.

Recommended in the same pass (wording only):
- m1: `check()` evaluates notify/exit payload mappers that feed guards;
- m2: any trait activated at admission;
- m4: the D1 note about `abandoned`.

Nothing in the remaining list changes the type surface or reopens a yardstick problem.
