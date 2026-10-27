# Review: opus-trait-routine-actor.md (principles, prior art, simplicity, coverage)

This review uses the same lens as the round 1–3 principles reviews. Line numbers (Lnn) refer to
[opus-trait-routine-actor.md](../opus-trait-routine-actor.md). I checked the examples and the
reference-app rewrites against the proposal's own rules, against Machines.plan and the other plans,
and against the original Dispatch Desk sources.

## 0. Verdict in one paragraph

The model is the most cohesive one so far. There is one node lifecycle. Traits can sit on any node.
Exit and callback fillings have the same shape as `on` handlers. The ports table mirrors the actor's
own surface. Prior art supports this: UML gives every state entry behaviour and gives submachine
states named exits, and XState lets any state invoke. For someone writing fragments, it reads more
simply than opus-split.

It is not simpler for someone writing a plain machine, and it is not smaller:

- **Size.** The keyword and rule totals are within noise of opus-split.
- **New knowledge for plain authors.** They now need to know node memory, record-shaped `states`,
  input nodes that must be entered with `.from`, memory names unique across nodes, and narrowing in
  views.
- **Rewrite.** The Machines.plan change is a core rewrite (O1–O3, O5, O8).
- **Rewrite overclaims.** "Lost: nothing" and "persistence: none" are too strong. The rewritten
  Ticket editor is about 13 % *longer*, with seven behaviour changes the proposal does not mention.

**Recommendation:** use opus-split as the basis and add the separable pieces of this model: traits
on any node, per-edge entry input for routines, fillings shaped as handlers, `story.machine` for
pieces, and possibly `start` on any node. Defer node memory to its own decision after the S1 type
spike.

---

## 1. Is the one-lifecycle model simpler and more cohesive?

### For a reader and an agent writing fragments: yes

- **One lifecycle.** Rule 3 (L112-117) states entry and exit once, for plain substates, routines
  and the actor root. opus-split has state entry plus a separate fragment activation.
- **One handler shape.** Exit, callback and `abandoned` fillings are `on` handlers that must end
  unguarded (rule 8, L139-145). This removes opus-split's separate "filling" grammar.
- **One test entry point.** `story.machine` accepts pieces (L208), so there is no `story.fragment`.
- **The ports table** (L40-48) is a real teaching aid. Each piece port has an actor-level twin:

  | Piece port | Actor twin |
  | --- | --- |
  | `input` | `input` |
  | `live` | `context` |
  | `requests` | `operations` |
  | `callbacks` | `send` |
  | `exits` | disposal |

  An agent learns one shape.
- **Special cases removed** (L192-195, L2441):
  - "traits only at a root";
  - the staged-snapshot input exception;
  - "inputs forbidden on default paths" (replaced by `default: S.X.from(...)`).

  Each of these is a rule opus-split needs and this model does not.

### For someone writing a plain machine with no fragments: no

The proposal says ordinary machines change "one line" (L2448). The source holds for the queue: the
code is identical apart from `states`. But the *knowledge* an author needs grows. They must now
know:

1. `states` is a record of node contracts, and definition nodes may hold `input`, `memory`,
   `initial`, `traits` and `states`.
2. Every memory field raises a new placement question: on the root, or on its node?
   - This is a new "where does code go" decision (principle 6) with no single obvious answer.
   - Check 18 (L2400) only suggests an answer, from patch-key heuristics.
   - In the editor, `error` moved to FAILED, which forces views to narrow
     (`S.OPEN.FAILED.is(s) ? s.memory.error : …`).
3. Explicit re-entry, or targeting an active ancestor, now resets node memory and trait memory, and
   abandons routines. `"self"` versus an explicit target becomes a memory decision, not only a work
   decision. The rewrite removed EDITING's own `TitleChanged` self handler, so every keystroke
   re-enters EDITING.
4. Input nodes must be entered with `.from`, defaults included, and no target may pass through one
   (rule 4).
5. `start` exists, but is a construction error anywhere on the admission default chain.
6. Memory names are unique across the whole piece (rule 1). Two sibling states cannot both own an
   `error`, although only one is ever active.
7. Schedules gain arming ids: a firing queued before a `restartOn` restart is now discarded, where
   today it is delivered (L2273). This is arguably better, but it changes plain machines.

**Net:** more cohesive for composition, more to learn for the 90 % case. Principle 1 (correctness)
gains: L3 becomes structural for any node, and the T2 trait trap becomes a construction error.
Principle 2 (a glance at the code shows what it does) is mixed: a field's lifetime is visible in the
definition, but the views must narrow. Principle 3 (brevity) loses, because the editor grows.

---

## 2. Keyword and rule counts: the whole machine API

The method is the same as round 3: new spellings, and normative statements an author must know.
"Today" means Machines.plan O1–O8, counting authoring words only:

`definition`, `machine`, `id`, `states`, `events`, `internalEvents`, `input`, `memory`, `initial`,
`context`, `operations`, `default`, `on`, `target`, `"self"`, `guard`, `updateMemory`, `actions`,
`activities`, `schedules`, `schedule`, `send`, `restartOn`, `onContext`, `select`, `when`, `deny`,
`check`, `.from`, `.is`, `.child`, `S`, `E`, `O`.

| | Keywords (whole machine API) | Normative rules (whole machine API, approx.) | Rules a plain-machine author meets |
| --- | --- | --- | --- |
| Today (Machines.plan) | ~34 | ~70 (O1–O8 statements) | ~70 |
| Today + opus-split | ~34 + ~27 = ~61 | ~70 + ~43 = ~113 | ~70 (additive: nothing changes for plain machines) |
| This proposal | ~34 + ~24 (its count with sub-words, L2475) = ~58; plus 4 extended meanings (`states`, `memory`/`input`/`initial` on nodes, `default`.from, `.is` narrowing) | ~70 − 3 replaced O2 clauses + 12 numbered (~40 atomic, at opus-split's recount granularity; the proposal says ~27) = ~107 | ~70 + node lifecycle, scope, input entry, `start`, uniqueness, arming ids (about 8-10 more) = ~80 |

So the claim "fewer special cases than opus-split" holds. There are about four fewer
fragment-specific special cases, and the proposal's own ledger concedes it is not smaller in words
(L212-216). The whole-API totals are within about ±5 % of opus-split. The difference is
*distribution*: opus-split keeps the plain-machine path untouched, while this model moves about 10
rules into it.

`flow check` grows from 16 findings to 20.

---

## 3. Prior art

| Model | Correspondence | Verdict |
| --- | --- | --- |
| **UML submachine state** with entry and exit points | Routine = submachine state; exits = exit points; per-edge `.from` ≈ an entry-point argument | Exact fit, closer than opus-split's per-placement input. |
| **UML / Harel entry behaviour on every state** | `start` on any node | Standard. The plans exclude entry actions on purpose. This model reintroduces them as actions appended to an accepted transition, so Operations O3 still holds. Familiar to readers (principle 9). |
| **XState v5 `invoke` on any state; actor = machine** | Traits on any node ≈ state-scoped invocation (inlined); "the actor is a root routine" ≈ XState's "a machine is an actor" | Familiar and coherent. XState v5 also has state-scoped `entry` and invoke lifetimes; this model matches them without child actors. |
| **SCXML `<data>` with late binding** | Nearest analogue to node memory, but SCXML data is *global* in scope and only initialised late | Node-scoped memory has **no direct statechart precedent**. UML states have no local attributes; XState context is global; SCXML scope is global. |
| **Lexical block scope** in programming languages | Rule 2: inline nodes are transparent blocks; named pieces are opaque functions | Familiar to programmers, though not to statechart tools. A reader must know whether a node is inline or named (drawback 5, L2460). |

So the structural parts (routines, `start`, traits on any node, actor as root) are the most
standard model of the seven. Node memory is the novel part, and also the costly one.

---

## 4. Does the feature-coverage claim hold?

§5 marks almost everything "same" or "same, extended", and §5.2 ends with "Lost: nothing"
(L2314). Checked against the plans, most rows hold. These do not:

1. **Machines O2, "self" and re-entry: "same" is understated.** Explicit re-entry now resets node
   memory and trait memory and abandons routines. That changes semantics for any machine that adopts
   node memory.
2. **Machines O3, "one shallow patch": a semantic change, not an extension.** Several patches are
   routed by owning node with last-writer order (open question 3). Two cases are undefined:
   - A patch to a field of a node exited in the same turn.
   - A patch to a field of a node entered with `.from`: which wins, the patch or `initial`?
3. **Rule 5 contradicts the examples (major).** "Every callback in a turn reads the pre-turn
   snapshot" (L125) would make schedule durations read memory before that turn's update.
   - Poll arms its tick from `memory.failures` in the turn that increments it, and its Story expects
     a 10 s wait (L465-481, L1001).
   - CommitWithRetry's backoff has the same shape (L407-424).
   - Today `restartOn` and activity parameters are explicitly post-commit (Machines O5, O6).
   - Either rule 5 exempts arm-time callbacks, or the examples are wrong.
4. **Operations "interrupt: same, extended" (L2295): not the same.** For request-bound commits,
   `interrupt` now carries an Attempt and means "may have been invoked". Never-invoked work becomes
   `notSent`. One outcome name, two meanings, depending on whether the action is bound to a request.
   (opus-split shares this.)
5. **Machines O8 and Persistence O2: understated.**
   - Node fields make the Memory Schema depend on the active path, and the Schema cannot express
     "present only on this path".
   - A routine's internal states become part of every host's State Schema and persisted paths, so
     refactoring a routine's internals changes the host's persisted shape. Check 20 covers contract
     changes only.
6. **React O2.** Default `.from` mappers and node `initial` now run in render. The plan must state
   that they are pure and receive no `now`; the proposal does not.
7. **Pieces cannot subscribe or read `context` or `activities` in guards.** So the queue's
   `canAssign` pattern cannot move into a piece. (Same as opus-split, but "lost: nothing" hides it.)
8. **Undefined API used in the examples:**
   - `guard: [a, b]` arrays (L314);
   - raising from SAVING's exit filling into `autosave`, a trait of OPEN (L1674, L1723). That is
     legal only if rule 12's "direct child instance" means "any instance in this piece".

### Reference-app rewrite (§4.7, §4.8)

**Size:**

| | Original | Rewrite |
| --- | --- | --- |
| Editor, lines | 471 | 488 |
| Editor, code lines | 380 | 430 |
| Shared pieces | – | +116 |
| Queue | identical | identical (comments only) |

**What got shorter:**
- `LOCKED`;
- the duplicated `commitDraft` first send;
- the `error` / `lockRetries` resets.

**What got longer:**
- the request binding;
- `abandoned`;
- separate reconcile outcomes;
- a new RECONCILING state;
- the `onSettled` filling.

**Behaviour changes not in the proposal's "deliberate" list (L1969):**
1. A defect becomes "uncertain" instead of FAILED.
2. An unmapped `interrupt` now goes to UNCERTAIN.
3. Typing no longer stops lock retries: retries continue with the frozen old title.
4. Cancel is now possible during backoff.
5. Cancel is gone while reconciling.
6. A lock during the uncertain retry now goes to FAILED.
7. `reject` concurrency is now retried as `notSent` → Busy. This one is an improvement.

**Persistence:** `editorRef` is `persist: true`. The shape change (LOCKED removed, SAVING no longer
a leaf, fields moved off the root) needs a version bump and discards saved editors. Migration says
"persistence: none" (L2530). That is wrong in principle, even though nothing has shipped.

**Model exploration:** `exploreEditor`'s `stateKey` now misses `SAVING.attempts`, which a guard
reads (Testing O5).

**What holds:** the T2 finding against today's editor is correct. `restartOn` is idle on entry, so
`editedWhileSaving` could not pass as written. That is a real bug this model surfaced.

---

## 5. Plan impact and migration, honestly sized

The plan table (L2505-2518) is candid on Machines ("large") and roughly right elsewhere. Corrections:

| Plan | The proposal says | Honest size | Why |
| --- | --- | --- | --- |
| Machines | large | **large** | Rewrites O1 (`states` record, node contracts), O2 (scope, lifecycle), O3 (patch routing, fusion, a new turn source), O5 (arming ids, schedules in pieces), O8 (path-dependent memory). Rule 5 must be reconciled with O5/O6 post-commit reads. |
| Operations | medium | **medium** | Plus the `interrupt` meaning split, which should be stated as a change, not "same, extended". |
| Persistence | medium | **medium-large** | Path-dependent memory validation, ids, durable `abandoned`. Moving a field between root and node is a shape change that discards the scope (no migration API in v1). |
| React | small | **small** | Plus purity and no-`now` for `.from` and node `initial` in render. |
| Testing | medium | **medium** | Plus `stateKey` guidance for node and slice memory. |
| Reference app | "one focused session; persistence none" | **one session plus a persistence version bump**, and 7 behaviour changes to accept or revert | See §4. |
| Agent knowledge and skills | not sized | **medium** | Every machine example, skill and prompt uses list-form `states` and root-only memory. |

---

## 6. What it unlocks beyond fragments

1. **Fresh-on-entry memory for any state** (L3 structural everywhere). The editor's six hand resets
   disappear. This is the largest benefit, and only node memory gives it.
2. **Typed entry data for any state** (`S.X.from`). There is no more parking event data in root
   memory before entering.
3. **`start` on any node.** Duplicated first actions go: `commitDraft` is on four transitions today.
4. **State-scoped behaviour without wrappers.** A debounce on OPEN lives exactly as long as editing
   does.
5. **Better pictures.** Memory ownership per node, `start` on the node, input on the edge.
6. **A path to placing a whole machine inline.** "The actor is a root routine" suggests a machine's
   body could later be reused as a routine. The proposal does not claim this; it is the natural next
   step.

Items 2, 3 and 4 do not need node memory. Item 1 does.

---

## 7. Head to head with opus-split

| | opus-split | trait-routine-actor | Principles favour |
| --- | --- | --- | --- |
| Correctness on fragment problems | same request and abandonment semantics | same; plus L3 for any node, T2 trait form structural | **trait-routine-actor**, narrowly (L3, T2) |
| D6 (seeding from the same turn's patch) | prevented (staged read) | by convention (`.from` from the event only) | opus-split |
| A2 (one block per instance) | exact (input in the block) | input on the edge | opus-split, narrowly; the round-2 review preferred the edge for typing |
| Lifecycle rules | two (state entry, fragment activation) | one | **trait-routine-actor** |
| Fillings | own grammar | `on` handlers | **trait-routine-actor** |
| Traits | root only | any node | **trait-routine-actor** |
| Testing alone | `story.fragment` | `story.machine` extended | **trait-routine-actor** |
| Keywords and rules (whole API) | ~61 / ~113 | ~58 / ~107 | tie (within noise) |
| Plain-machine author | unchanged | about 10 more rules, record `states`, narrowing | **opus-split** |
| Machines.plan change | additive, medium | core rewrite, large | **opus-split** |
| Type-spike risk | moderate | high (lexical memory views, path-dependent fields) | **opus-split** |
| Spec quality now | 3 majors (`defect` routing, defect mapper, amendments) | rule 5 vs schedules, patch routing gaps, rewrite overclaims | opus-split, slightly |

---

## 8. Recommendation

**Use opus-split as the basis, plus these separable pieces of this model:**

1. **Traits on any node** (needs a node-keyed `traits` placement in the definition). This removes
   "traits only at a root" and makes the T2 trait trap a construction error. It does not need node
   memory.
2. **Per-edge entry input for routines** (`S.X.from(mapper)`, defaults included). It is typed by the
   exact payload and removes opus-split's staged-read exception and its default-path ban. The A2
   cost is mitigated by named edge values.
3. **Fillings shaped as total `on` handlers**, and the rule "only declared guard ports refuse a
   piece's event".
4. **`story.machine` accepting a trait or routine**, instead of a new `story.fragment`.
5. **`start` on any node: a user decision.** It is standard (UML entry behaviour) and removes
   duplicated first actions in plain machines. But it reverses the plans' "no entry actions" stance
   for every machine, not only fragments. If declined, keep `start` on routines only.

These five are exactly the proposal's own fallback (L2538-2542), and they keep most of its benefits:
one handler shape, traits anywhere, typed entry, one test entry point. **Defer node memory** (and
with it record-shaped `states` and lexical memory views) to a separate Machines-level proposal,
decided after the S1 spike. Reasons:

- It is the only part with no statechart precedent.
- It carries the type risk, the persistence shape changes and the plain-author cost.
- Its one benefit (L3 for any node) is real, but it is a general Machines feature, not a composition
  feature. It can be judged on its own merits.

**Do not adopt this model whole now.** Its correctness equals opus-split's on fragments. Its
cohesion gain is real, but most of that gain survives in the fallback. The rest costs a core
rewrite, a harder type spike and new knowledge for every plain-machine author, and its own coverage
and migration claims overreach in the places listed in §4 and §5.

**Before any adoption, fix these in either document:**
- reconcile rule 5 with post-commit arming and activity reads;
- define patch routing for nodes entered or exited in the same turn;
- state the `interrupt` meaning split;
- size persistence version bumps honestly.
