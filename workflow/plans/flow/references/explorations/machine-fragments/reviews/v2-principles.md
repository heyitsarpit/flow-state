# Review of proposal-v2: principles, prior art, simplicity, coverage

This review reads [proposal-v2.md](../proposal-v2.md) against
[principles.md](../principles.md), which now includes the problems the reviewers added. The lens is
the same as in rounds 1–3. Severity: **blocker** means a core rule is wrong as written; **major**
means a correctness hole, a principle violation or a broken example; **minor** means naming,
consistency or presentation.

A helper checked every example (§4, §5) against the rules and against the original Dispatch Desk
editor. I re-checked its key findings in the source. Line numbers (Lnn) refer to proposal-v2.md.

## 0. Verdict

v2 is the first document that reads as **one system**:

- two constructors;
- three sender lists;
- one contract table, with one filling block per instance;
- one handler shape for every filling;
- one test entry point;
- one written list of decisions and of plan amendments.

The borrowed pieces mostly fit:

- `.at()`, total-handler fillings, `story.machine` and `notify` each remove a rule or a form rather
  than adding one.
- `abandoned` and the staged-`input` exception still feel bolted on.

Correctness is close to complete, with three gaps:

1. **One blocker:** rule 8, read literally, abandons a step on any `"self"` handler above it.
2. **Two major undefined areas:** nested trait input, and guard arrays.
3. **The "L7 by convention" pattern is broken in two of the five commit examples.** That is evidence
   it should not stay a hand-written convention.

**Ready for the S1 type spike after five small changes** (§8). None of them is a redesign.

---

## 1. Simple and cohesive as one system?

### Counts

| | Keywords | Rules | Checks |
| --- | --- | --- | --- |
| v2, as claimed | 19 new + 3 Story = 22 (~25 with `abandoned` payload words) | 14 numbered, ~50 atomic | 18 |
| v2, recounted | **18** new authoring words (the "19" list holds 18) + 3 Story + 3 `abandoned` payload words + 5 cut fields + the guard-array form ≈ **~30** | 14 numbered. Rule 9 alone holds ~12 clauses and rule 11 ~8, giving **~55–60** atomic, plus scattered rules in §1, §5 and the checks | 18 |
| opus-split, round 3 | ~27 | ~43 | 16 |
| Whole machine API | today ~34 + v2 ~30 ≈ **~64** | today ~70 + v2 ~58 ≈ **~128** | |

- **Keywords:** about the same as opus-split.
- **Rules:** about 15 more than opus-split. The difference is codex-split's request semantics:
  `notSent`, fixed outcome shapes, throwing-mapper `defect`, admission ban, disjoint keys and
  terminal totality.
- That is the price of correctness, ranked first, and it is a fair price. But "~50 atomic" undercounts.

### One canonical form per concept

| Concept | Forms | Status |
| --- | --- | --- |
| Filling (callback, exit, `abandoned`) | one `on`-style handler | **good** |
| Testing a fragment | `story.machine` | **good** |
| Placing a trait | `traits`, bare or `.at("PATH")`; filled in the root `traits` block | **good** |
| Data entering a handler | `event` (handlers, guard fills, step `input`) vs `payload` (fillings, selects) | **two names**; 4.8 has two toast helpers for one toast (L1647, L1648) |
| `.from` mapper | value-only `(result) =>` for outcomes vs context `({ event, memory }) =>` for transitions | both already exist in the plans; acceptable |
| Mapping a declared result | `.from` (rule 9, L387) vs bare (Poll L465; host L914) | **two spellings**; rule 9 says `.from` |
| Guards | one function vs an array (rule 6, L311) | **new form**; not in the ledger or the plans |
| Tracking a commit that outlived its step (L7) | `unresolved` (4.5), `late` (4.7), `unsettled` (4.8) | **three hand-rolled shapes**; two of them deadlock (§4) |

### One obvious place for each thing

- **Mostly yes.**
  - Placement is in the definition; every filling sits in one block per instance.
  - `abandoned` sits next to its `operation`, and `start` belongs to the subroutine.
  - `.at()` keeps every trait in one `traits` block. Decision 18 rejects a second compound form,
    which is right.
- **One weak spot:** a step's entry input is filled at the placement, but it reads the staged
  snapshot plus the event (rule 3). A reader needs one more rule to know what `memory` means there.

### Can an agent decide where code goes with one question?

- **Kind:** "does the actor *have* it, or *go into* it?" One answer each.
- **Sender list:** "who may send it: anyone, my host only, or only me?" One answer each. The H1 choice
  is "must the host mediate?", which is clear.
- **Port:** the contract table's question column (L41-50) answers it. This is good teaching material.
- **Left without a single answer:**
  - How to track an abandoned commit for L7 (three shapes in the examples).
  - Whether a changing host value is pushed by `hostEvent` or kept in the host (live values were
    cut, so D1 copies are now the author's call).

---

## 2. Do the borrowed pieces fit?

| Piece | From | Fit |
| --- | --- | --- |
| `.at("PATH")` on one `traits` block | opus-trait-routine-actor | **Fits.** Traits live with their node through the existing lifecycle (rule 2), and no new compound form appears. A string path is forced, because `S` does not exist yet in the definition. The S1 spike must type it (listed, L2256). |
| Fillings as total `on` handlers | opus-trait-routine-actor | **Fits.** Removes a grammar, and terminal totality (rule 13) falls out of "ends unguarded". |
| `story.machine` harness | opus-trait-routine-actor | **Fits**, with one contradiction: a subroutine is "the harness's only state" (L1976), which puts it on the admission path that rule 3 and check 7 forbid. Give the harness an idle default state and enter the subroutine with `.enter`. |
| `notify` | codex-single | **Fits.** Required by Machines O3 once callbacks may target. |
| One-sentence callback rule | opus-single | **Fits** (rule 7). |
| Request semantics | codex-split | **Fit, but heavy.** Rule 9 is the densest rule. It is justified by D4, H4, H5 and L6. |
| `abandoned` with `pending` | codex-split / opus-split | **Bolted on.** It is the only filling that runs as a separate later turn, and the only one whose use depends on host convention (L5, L7). Two examples get that convention wrong. |

---

## 3. Findings

### Blocker

1. **Rule 8: `"self"` above a step abandons it** (L126-127). "Any host transition handled at or above
   the subroutine's state abandons it." Machines O2 says `"self"` changes no state.
   - In 4.8, OPEN's `TicketLoaded` and `RefreshRequested` are `"self"` handlers above SAVING (L1702,
     L1715).
   - `TicketLoaded` is likely *during* a save, because commit writes update the cache.
   - Read literally, each one abandons SaveTitle.
   - **Fix:** "any host transition that **exits** the subroutine's state abandons it; `"self"` and
     transitions that keep it active do not."

### Major

2. **Nested trait input is undefined.** AddressStep fills its fields' input from its own `input`
   (`({ input }) => input.address.street`, L1197, L1202). The port table (L43) and rule 3 offer
   `{ memory, context, event }`.
   - **Fix:** a trait inside a fragment fills its input from that fragment's `input` and fresh
     memory. This must be defined before the type spike.
3. **Guard arrays** (rule 6, L311) are a new shape. Machines O1 and O4 allow one guard function.
   - It is missing from the ledger and from the plan table.
   - The `check()` reason order for an array is undefined.
   - **Fix:** ledger it and add Machines O4 rows ("all must pass; first denial reported"), or drop it.
4. **Two examples break the hand-written L7 pattern.**
   - **4.5:** the `Uncertain` exit sets `unresolved` (L934). UNSURE → Dismiss → VIEWING never clears
     it, so `Delete` is denied forever (L898).
   - **4.8:** CancelSave after invocation records `pending`, then `unknown`, so
     `unsettled.settled = true` while the editor is in EDITING. Two consequences:
     - `canSave` then denies forever (`PreviousSaveUnresolved`, L1621).
     - UNCERTAIN, the only reconcile entry, cannot be reached from there.

     Close, Escape and PermissionRevoked hit the same path, because the record survives CLOSED → OPEN.
   - Separately, 4.7's abandoned `success` loses `orderId` while its test claims "success is
     recovered" (L1374, L1496).
   - These follow from decisions 10 and 15 plus "L7 by convention". **Fix:** see §6, item 1.
5. **4.8 changes behaviour that the proposal does not list** (compared with the original editor):
   - a `defect` now goes to UNCERTAIN, where it used to go to FAILED;
   - an unmapped `interrupt` now goes to UNCERTAIN;
   - a new RECONCILING state, where a lock goes to FAILED and there is no cancel;
   - typing no longer stops lock retries;
   - a save that settles after Close no longer toasts;
   - the uncertain notice is gone while CLOSED.

   Also:
   - `editorRef` is `persist: true` and the saved shape changes, but no version bump is stated.
   - `editor.tabs.test.ts` asserts `memory.uncertain`, which no longer exists.
   - **Fix:** list the changes, accept or revert each one, and state the version bump.
6. **Example names collide with keywords.**
   - The request is named `send` (L366, L1355). Rule 14 forbids `send` in fragments, and `send` is
     also the schedule key.
   - Field's input is named `start`, the step keyword.
   - In an agent-facing example these read as the keywords. **Fix:** rename to `submit` and
     `initialValue`.
7. **Completeness (principles §7.2).**
   - 4.3 elides the password input.
   - 4.7's components cover only AddressForm and CartActions. There is no UI for REVIEW, PLACING,
     UNSURE, PLACED or `error`.
   - 4.8's EditorPanel drops the progress lane and the load-failure notice of the original.

### Minor

8. **Two names for incoming data** (`event` / `payload`), and **two spellings for result maps** (bare /
   `.from`). See §6.
9. **The `abandoned` payload `attempt` is unconditional.** A `notSent` from `reject` never minted an
   Attempt (Operations O3). Type it as optional for `notSent`.
10. **4.6's host maps `failure` as one untagged token** (L1078). Rule 9 says "every failure tag".
    Allow the untagged form for untagged errors, as Operations O2 does.
11. **Test fixtures.** The Story's inline `requests` adapter (L1984) is a new fixture form; §11 says
    Testing O3 is "unchanged". It is defensible, because the adapter *is* the generated service
    function, but say so.
    - `model()` needs a command-empty base Story, and a subroutine harness needs `.enter`, so L1993
      does not work for subroutines as written.
    - `notSent`, `interrupt`, `defect` and commit abandonment are described but not shown in
      fragment-alone tests.
12. **Ledger gaps.**
    - "New (19)" lists 18 words.
    - The cut fields, the Story options (`input`, `guards`, `requests`), the guard arrays and
      `Actor` are not ledgered.
    - `requests` has six roles: contract, body, host binding, action token, Story option and cut
      field.
13. **Smaller example issues.**
    - 4.7 triggers its own warning 12 (`Next` unhandled in VERIFYING).
    - `GaveUp` ignores `payload.reason` (L1388).
    - `TicketList`, `AddressesFixture` and the `Actor` import are undefined.
    - The 4.8 bug write-up says "three transitions" and lists two.

---

## 4. Decisions: are the reasons sound, and are the rejections fair?

| # | Decision | Reason sound? | Rejected alternatives fairly stated? |
| --- | --- | --- | --- |
| 1 | Two constructors | Yes | Yes |
| 2 | The fragment declares its senders | Yes (E4) | Yes |
| 3 | Live values cut | Partly. "No D2 convention gap" is weak, because request selects already read only `payload`. The real reason is one port and one rule less, and the D1 cost is honestly stated (§7 D1 row). | Yes |
| 4 | Nested subroutines deferred | Yes; the deepest rules go | Yes |
| 5 | Trait callbacks may move the host, under one rule | Yes | Yes |
| 6 | Every port required, `{}` means ignore | Yes (A6) | Yes |
| 7 | Read requests kept | Yes | Yes |
| 8 | `raise` only into `hostEvents` | Yes | Yes |
| 9 | Request ports kept | Yes | Yes |
| 10 | Leaving mid-commit allowed | Yes; the trade is correctly sized | Yes |
| 11 | Per-placement input, staged read | Sound (A2, D6 by construction) | **Partly.** The per-edge alternative is described only as "D6 by convention". It omits per-edge's real advantage: exact payload typing with no `event` union (which the S1 risks list has to carry, L2257) and no O3 exception. |
| 12 | `start` on subroutines only | Yes | Yes |
| 13 | Pre-invocation cancel is `notSent` | Yes. The retry argument is decisive. | Yes |
| 14 | No `allow` on request commits | Yes | Yes |
| 15 | One `abandoned` per binding, next to its operation | Sound for reading | Partly. The per-operation observer was rejected as "far from the binding", but the examples show the L7 gating it would centralise is where the bugs are (§3, item 4). |
| 16 | Disjoint keys | Yes | Yes |
| 17 | Commit `defect` is uncertainty; fixed `defect` reply | Yes | Yes |
| 18 | Traits on any node via `.at` | Yes | Yes |
| 19 | Total-handler fillings | Yes | Yes |
| 20 | `notify` | Yes | Yes |
| 21 | `story.machine` | Yes | Yes |
| 22 | No subroutine on the admission path | Yes | Yes |

---

## 5. Is the plan-change table honest?

It is mostly honest and well sized, and much better than any earlier list. Gaps:

| Plan | Missing or wrong |
| --- | --- |
| Machines O2 | The "`"self"` does not abandon" clause (blocker 1). |
| Machines O1 / O4 | Guard arrays (major 3). |
| Machines O5 | "The `restartOn` entry baseline is the entering turn's committed memory" changes plain machines too. Say so explicitly; it is listed, but as a fragment item. |
| Testing O1 / O3 / O5 | "O3 and O5 unchanged" (L2289) is inaccurate. There is the inline adapter fixture form, and `model()` over a harness that needs `.enter` (O5 command-empty base). |
| Persistence / reference app | The host's own shape change (4.8 editor) and its version bump. |
| Diagnostics | New codes (`RaisedCommandUnhandled`, admission, outstanding call, …) are not listed. |
| React O4 | Fragment slices and `.is` narrowing in views; small, but unlisted. |

---

## 6. Further no-loss simplifications

1. **Let the runtime keep the pending ledger.** The `pending` / terminal record is already durable
   (rule 10). Expose it read-only:
   - as a snapshot field, e.g. `s.unsettled.<placement>`, holding the outcome and the Attempt;
   - or through a generated guard helper.

   Hosts then *read* it instead of hand-rolling `unresolved` / `late` / `unsettled`:
   - `abandoned` shrinks to "what else should the host do", and is often `{}`;
   - the two deadlocks in §3, item 4 become impossible to write.

   This is not strictly no-loss, because it adds a snapshot field and a plan row, but it removes
   10–15 lines per commit placement (risk 2) and a "by convention" (L7). It is the best
   simplification left.
2. **One name for incoming data.** Use `event` in fillings and selects too, or define `payload` as the
   only name in fillings and say so in rule 7. One rule removes a split the examples already trip on.
3. **One spelling for result maps:** "bare when payload-free or the shapes are equal, `.from`
   otherwise", stated once in rule 9.
4. **Fold rule 14's `E` clause into rule 11**, where `raise` is defined.
5. **Give the Story harness an idle default state.** This removes the admission contradiction without
   any new rule.

---

## 7. Prior art, briefly

v2's structure is now standard:

- subroutines are UML submachine states with named exit points;
- `start` is a submachine's initial-transition effect;
- traits on any node match XState's state-scoped invoke, but inlined;
- fusion is static composition, with SCXML-like decline semantics made total.

The novel parts:

- **The request port** (closest analogue: an Effect service requirement with exhaustive tags);
- **The `abandoned` route** (no common prior art; it plays the role of a saga compensation hook).

Both are justified by L5–L8 and H5. That is why they deserve the simplification in §6, item 1.

---

## 8. Ready for the S1 type spike?

**Yes, after these changes.** The type surface the spike must test is stable and listed in L2250-2258:

- nested `E` paths;
- branded result tokens;
- fixed outcome shapes;
- Schema-generic fragments;
- `.at` paths;
- the `event` union in `input`;
- fragment-relative `state`.

Must change first (each is small):

1. **Rule 8:** only transitions that *exit* the step abandon it; `"self"` does not (blocker 1).
2. **Define nested trait input** (the parent fragment's `input` and fresh memory), so the spike can
   type it (major 2).
3. **Ledger and type guard arrays,** with an O4 row, or drop them (major 3).
4. **Story harness:** an idle default state, and `.enter` for subroutines (§2). Fix the
   `model()` claim.
5. **Rename the colliding example names** (`send`, `start`), and pick one name for incoming data in
   fillings (major 6, §6 item 2).

These can run in parallel with the spike, but must land before any plan amendment:

- fix the two L7 deadlocks, ideally through the runtime-held ledger (§6, item 1);
- list 4.8's behaviour changes and its persistence version bump;
- complete the 4.3 and 4.7 components;
- correct the plan table (§5) and the counts (§1).
