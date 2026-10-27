# Round 2 simplicity audit

The user asked for this audit. For each revised proposal:

- **(a) No-loss drops:** APIs that can go without losing a feature, and what replaces each one.
- **(b) Feature cuts:** ranked by simplicity gained against what is lost. Each lists the use cases
  that break and the yardstick problems that reopen ([principles.md](../../principles.md) §4,
  plus the IDs the proposals added: E4 refusal by forwarding, A7 forgotten first send, H4
  misrouted results, L5 abandoned commit, L6 request left waiting, D5 restore in flight, D6
  seeding).
- **(c) Counts** of new keywords and rules, before and after the no-loss drops.

The cuts are recorded for the user to decide against "correctness first". The audit recommends no
cut.

How I counted:

- **Keywords:** new framework spellings (constructors, fields, helpers, reserved literals, Story
  API), verified against the code, not only each proposal's ledger.
- **Rules:** normative statements an author must know: numbered rules plus normative rules
  scattered in prose or check tables. Checks that only restate a type error are not counted.
- All counts are approximate, ±2.

---

## 1. sonnet-single-fragment.md

### (a) No-loss drops

| Drop | Replaced by |
| --- | --- |
| `ignore` | An empty binding `{}`. |
| `R` result namespace and the `.send(select, table)` result→internal-event table | Results arrive directly as fragment events named by the result keys; `unknown`, `interrupt` and `defect` are reserved names. This also removes the duplicate `internalEvents` entries. CommitWithRetry currently declares `Done` three times (result L370, internal event L357, exit L374). |
| `start` as a shape trigger | Shape is decided by `exits` / `states` alone. `start` is then just a field. |
| Rule 9 (exits cannot be sent) | Implied by rule 10 (only `accepts` can be sent). |
| Rule 3 (no direct target into a fragment) | Implied by rule 15 and D9. |
| Most of `unrefusable` | Already in the author's control (the fragment simply does not guard it). It only needs to stay for "a host raise not under a host guard". |
| Separate callback-binding and exit-mapping shapes | One handler shape, plus opus-single's rule "a callback never leaves its node; an exit must". |

### (b) Feature cuts, ranked

1. **`expose`** (1 word, rule 10, 2 checks, per-level string lists). Biggest gain for the least loss.
   - Breaks: the UI typing straight into a nested field unless the fragment declares the event
     public.
   - Reopens: nothing, if fragment-declared `events` replace it. If nothing replaces it, A1 (host
     forwarding returns).
2. **`unrefusable`** (1 word, rule 11, check 10).
   - Breaks: protecting `Release` from a host raise under a host guard.
   - Reopens: E1, E4.
3. **Request reads (`request.read`)** (half the request surface).
   - Breaks: Poll's refetch reply.
   - Reopens: D4 for reads only. The host maps read outcomes onto fragment events itself.
4. **`raise` fusion** (rule 8, 7 table rows, 2 checks).
   - Breaks: Debounce fed by the host, AutoSave `Edited`.
   - Reopens: A1, H1.
5. **Requests entirely** (8 words, rules 12-14, about 10 checks, 3 plan amendments).
   - Breaks: CommitWithRetry, Poll, AutoSave.
   - Reopens: D2, D4, H3, H4, L2, L5, L6, A5, D5.

### (c) Counts

| | Keywords | Rules |
| --- | --- | --- |
| Before | ~33 (27 framework + 6 Story) | ~25 numbered-effective, plus 26 checks |
| After no-loss drops | ~30 | ~22 |

---

## 2. opus-single-fragment.md

### (a) No-loss drops

| Drop | Replaced by |
| --- | --- |
| Second `.reply` form (by name vs by kind) | One form: reply by kind (`success`, `failure:Tag`, `defect`, …). |
| `raise` into public `events` | `raise` only into `hostEvents`. The placer has one route per event. |
| Checks 1, 4 and 5 (restate type errors) | One line: "type errors are mirrored by `flow check` for untyped callers". |
| Rule 13; the second half of rule 17; the last sentence of rule 26 | Already stated by D9, rule 16, and rules 9-10. |
| Derived kind (rule 2, check 5) | Two constructor names. Plus one word, minus one derivation rule and its glance cost; no feature loss. |
| `payload` beside `event` in callback and exit handlers | `event`. Optional: the host never sees the fragment's own event, so there is no clash, but `payload` does say "not my event". |

### (b) Feature cuts, ranked

1. **Live `prop`** (1 word, rule 7). Unused in any example, so the cheapest cut.
   - Breaks: Paginate `hasMore`-style live reads.
   - Reopens: D1 (pushed copies).
2. **Request reads** (half of `.replies`, the read restore rule).
   - Breaks: Poll, AddressStep `verify`.
   - Reopens: D4 for reads.
3. **`story.fragment`** (5 identifiers, a Testing amendment).
   - Breaks: testing alone without a hand-written harness.
   - Reopens: principle 10.
4. **`raise` plus `hostEvents` plus whole-turn decline** (3 words, 4 rules, 2 checks).
   - Breaks: Debounce fed by the host, policy-first inputs.
   - Reopens: H1, E4 (if replaced by forwarding).
5. **Replying callbacks with fencing, abandonment and restore** (about 9 words, rules 19-25,
   5 checks, 4 plan amendments).
   - Breaks: every I/O-driven step.
   - Reopens: L2, L5, L6, D2, D4, D5, H3, H4.

### (c) Counts

| | Keywords | Rules |
| --- | --- | --- |
| Before | ~25, plus 5 reused outcome keys | 26 numbered (+ ~4 elsewhere), 17 checks |
| After no-loss drops | ~23 (two constructors +1, `.reply` form −1, `payload` −1, derived-kind term −1) | ~22 |

---

## 3. codex-single-fragment.md

### (a) No-loss drops

| Drop | Replaced by |
| --- | --- |
| `kind` field with `"embedded"` / `"state"` | Two constructor names. −3 spellings, +2 names; removes the conditional-legality rules. |
| Callback calls inside `actions` | A separate field (`notify`), or callbacks as raises of the owner's binding. `actions` keeps its Machines O3 meaning. This is a clarity change, not a feature change. |
| Two exit spellings (whole transition vs `target:` value) | `target: exits.X.from(…)` only. |
| Abandoned plumbing repeated per binding (`abandoned: { unknown, success }`, plus 2 internal events and 2 root handlers per host) | One machine-level observer per operation, or one handler `{ outcome, attempt }`. Behaviour is unchanged: observers are already forced to `"self"`, with no guard and no raise. |
| Required handlers for impossible replies (E = never) | Omission allowed when the bound operation cannot produce the reply. The compiler already knows the type (L1500). |
| `E.input` and `E.control` Story namespaces | One generated namespace with reserved names. |
| Required `() => true` guard bindings | `guard().optional()` listed in inspection. The author rejects this for review reasons (L1879), so it is a user decision. |

### (b) Feature cuts, ranked

1. **Live `fragment.prop`** (never shown).
   - Breaks: live host values.
   - Reopens: D1.
2. **The `lookup` request kind** (never shown).
   - Breaks: read replies.
   - Reopens: D4 for reads.
3. **Request relay and nested correlation** (relay rules, nested generations, persistence of
   routes).
   - Breaks: a middle fragment passing a child's I/O up.
   - Reopens: A5 at depth: the middle fragment must expose the child or own I/O.
4. **`story.fragment`** (7 terms, generated-host semantics, a parity obligation).
   - Breaks: testing alone.
   - Reopens: principle 10.
5. **Same-turn composition** (`raise`, targeting callbacks, decline semantics, the 10,000 bound;
   about 8 rules, 4 checks).
   - Breaks: DebounceHost, AutoSave Flush, idle→LOCKED.
   - Reopens: H1, A1.
6. **Request ports entirely** (about 15 rules, about 12 checks).
   - Reopens: D2, D4, L2, H3, H4, L5, L6, D5.

### (c) Counts

| | Keywords | Rules |
| --- | --- | --- |
| Before | ~34 (20 core, 2 new uses of `input`, 7 Story, 5 unledgered) | ~60-70 (10 numbered; the rest in prose and a 27-row check table) |
| After no-loss drops | ~29 | ~55 |

---

## 4. sonnet-split.md

### (a) No-loss drops

| Drop | Replaced by |
| --- | --- |
| `story.trait` + `story.subroutine` | One `story.fragment`; the kind is known from the value. |
| `prop({ default })` beside `gate` / `callback({ optional })` | One `optional` option, with an optional default. |
| Rule 9's "always `.from`" (contradicted by the examples) | "Bare only when payload-free", the plans' existing rule. |
| Rules 15 and 17 (advice) | Check 18 plus docs. |
| Rule 7's default-path ban | Check 9. Keep one; check 9 also covers `start`. |
| `contract` wrapper block | Optional. It groups the outside surface (an A2 gain), so keeping it is defensible. |
| Example-level: `NotSent` and `Cancelled` exits (mapped identically in both hosts) | One "not sent" exit, unless a host distinguishes them. |

### (b) Feature cuts, ranked

1. **`request.read`** (no example, no use case; principle 8).
   - Breaks: nothing shown.
   - Reopens: D4 for reads, if a read step appears later.
2. **`P` as a separate token namespace.** Cost: A4 risk from overloading `props`.
   - Breaks: nothing.
   - Reopens: nothing; only a naming-clarity loss. The author rejected this merge with a sound
     reason.
3. **Nested-subroutine-in-subroutine** (AddressStep embedding Confirm: 2 events, 2 `also` lines,
   an `exits` block).
   - Breaks: composite steps built from steps.
   - Reopens: D1 in prior art (rebuilding composites by hand).
4. **`also` composition** (checks 6-8, a Machines O3 change).
   - Breaks: SettledField, AddressStep, Catalogue.
   - Reopens: A1, E4/H1.
5. **Requests entirely.**
   - Reopens: H3, H4, D2, D4, L2, L5, L6, D5.

### (c) Counts

| | Keywords | Rules |
| --- | --- | --- |
| Before | ~33 (25 ledgered + ~8 unledgered: reply suffixes, `outcome`, Story fields, script literals) | ~25 (17 numbered + ~8 scattered), 16 error checks |
| After no-loss drops | ~30 | ~21 |

---

## 5. opus-split.md

### (a) No-loss drops

| Drop | Replaced by |
| --- | --- |
| Rule 5's "hostEvents raised only by the direct parent" | Rule 9 already states it. |
| Rule 9's "a fused target may not leave a node whose child is raised into" | Follows from "the child is active before and after". |
| Rules 1 and 11, restated as checks 1, 14 and 15 | Keep the rule, drop the restatement. |
| `story.trait` + `story.subroutine` | One `story.fragment`. |
| Two select rules (reads may read host memory, commits only `payload`) | One rule: every select reads only `payload`, and the fragment's request input declares the key fields. A small cost: read keys move into the fragment's Schema. |
| `ignored` inspection label | The listing of `{}` fillings is enough. Cosmetic. |

### (b) Feature cuts, ranked

1. **`live`** (1 word, no rule, no example).
   - Breaks: live host reads in a fragment.
   - Reopens: D1.
2. **"Every port required, `{}` means ignore."** Cost: one rule and verbosity in every placement.
   - Breaks: nothing functional.
   - Reopens: A6 (silence discovered late).
3. **Story harness with `reply` injection** (3 words, `run.*`, a Testing amendment).
   - Replace with fixture-backed Stories rather than cut.
   - Reopens: nothing, if replaced. Principle 10, if cut outright.
4. **Staged `input` / `start` exception** (one O3 exception, the default-path rule, check 10).
   - Breaks: seeding from the same turn's patch.
   - Reopens: D6 (holds only by convention).
5. **Fused raise plus `hostEvents`** (2 words, rule 9, checks 7-8).
   - Breaks: Debounce input, Field `Set`.
   - Reopens: H1, D3, E4.
6. **Requests subsystem** (about 9 words, rule 7's seven bullets, 7 checks, 3 amendments).
   - Reopens: D2, D4, D5, H3, H4, A5, A7, L2, L5, L6.

### (c) Counts

| | Keywords | Rules |
| --- | --- | --- |
| Before | ~25 (20 ledgered + `ignored`, `outcome` / `attempt`, `run.*`, the exit-to-exit form) | 11 numbered (~30 atomic) + ~6 elsewhere, 22 checks |
| After no-loss drops | ~24 | ~31 atomic |

---

## 6. codex-split.md

### (a) No-loss drops

| Drop | Replaced by |
| --- | --- |
| Two request-binding shapes (production `{ actions, abandoned }`, Story `{ operation, select, outcomes }`) | The production shape everywhere; the Story fills `abandoned` automatically. Removes `operation` and `select` as new spellings. |
| Per-outcome `abandoned` handler set (`pending`, `success`, each failure tag, `unknown`, `interrupt`, `defect`; 21 lines in RenameHost) | One handler receiving `{ attempt, outcome }`, where `outcome` is `Pending` or an outcome value. |
| `start: { target: "self" }` on stateless steps | Implied when a subroutine has no `states`. |
| Required `exits: {}` and `events: {}` | Absence means none. |
| `replies` as both the contract key and the handler block | Rename the contract key (for example `answers`). This is a rename, not a drop. |
| Two totality rules (raise from reply/return must be total; reply alternatives need an unguarded fallback) | One rule: "a terminal delivery cannot decline". |
| Two callback-target rules (trait: containing scope; subroutine: own mount) | One rule: "a callback never leaves the fragment's own node". |
| "Required" qualifier on raises | Delete it; no optional raise exists. |

### (b) Feature cuts, ranked

1. **`check` evaluating payload mappers** (a Machines O4 amendment, defect sites in render).
   - Breaks: a child guard that reads a transformed raised payload.
   - Reopens: nothing in §4. The alternative is to forbid transformed payloads into guarded child
     commands.
2. **`start` as a transition rather than actions.**
   - Breaks: a composite step calling a first child that needs arguments.
   - Reopens: A7 for composites only.
3. **Per-arming timer identity and per-occurrence reply identity** (runtime rules, not syntax).
   - Breaks: protection against a queued old firing or reply after a restart within the same
     activation.
   - Reopens: L1 and L2 in narrow races.
4. **Abandoned recovery protocol** (about 8 rules, durable routes, about 40 host lines).
   - Shrink with the one-handler drop instead of cutting.
   - If cut: L5, and D4 in part.
5. **Request kinds plus branded reply producers** (brand and origin checks).
   - Reopens: H3, H4, D4, L6.
6. **Fused composition with whole-candidate decline** (`raise`, the decline code, acyclicity,
   totality).
   - Breaks: Reset-all-fields, Replace after save.
   - Reopens: T1, D3, H1.

### (c) Counts

| | Keywords | Rules |
| --- | --- | --- |
| Before | ~36 (6 constructors, 18 composition, 10 Story, 2-3 unledgered) | ~60 (5 summary rules; the rest across §2, §4, an 8-row table, a 17-row construction table and an 8-row heuristics table) |
| After no-loss drops | ~32 (`operation`, `select`, `pending`-set keys, `RaisedCommandUnhandled` qualifier) | ~54 |

---

## 7. Across proposals

### No-loss drops that apply to all

1. **One Story entry point, `story.fragment`.** Where `story.trait` and `story.subroutine` exist,
   the kind is known from the value.
2. **One abandoned handler, `{ outcome, attempt }`**, rather than a handler per outcome (codex-split,
   codex-single) or an undeclared payload (sonnet-split).
3. **One callback-target rule:** "a callback never leaves the fragment's own node; an exit must".
   This replaces per-kind statements in every proposal.
4. **`raise` targets only `hostEvents`.** Public `events` already arrive directly, so a second route
   into them is redundant.
5. **One optional form.** Pick "every port required, `{}` means ignore" or `.optional()`, never both
   alongside `ignore`, `fallback` or `default`.
6. **One terminal-totality rule** covering replies, exit continuations and timer-fired
   notifications. It replaces the separate "unguarded fallback" and "total raise" rules.
7. **Checks that restate type errors** collapse into one line: "`flow check` mirrors type errors
   for untyped callers".
8. **Imply empty declarations** (`events: {}`, `exits: {}`, `start` for stateless steps).
9. **Two constructor names** instead of a derived or declared kind, in the three single proposals.
   No feature is lost, and the derivation rule goes.

Applied together, these save roughly 3-5 keywords and 3-6 rules per proposal.

### Feature cuts available to the whole design

Ranked by simplicity gained against what is lost. Every proposal carries all of these.

| # | Cut | Simplicity gained | What breaks | Reopens |
| --- | --- | --- | --- | --- |
| 1 | **Requests for reads** (keep requests for commits; reads stay host activities or host-mapped refetches) | About a third of the request rules: read restore, read kind, read select keys | Poll and verify steps owning their refresh reply | D4 for reads; L2 for reads (a late read reply reaches a later step's handler) |
| 2 | **Live value props** (frozen `input` only) | 1 word, 1 rule, the D2 convention gap. Unused in most examples. | Fragments reading changing host values (pagination limits, permission flags) | D1: values pushed by `hostEvents` become copies |
| 3 | **Fragments containing steps** (keep traits inside steps; no step inside a step) | Request relay, nested call/start, nested generations, nested `abandoned` routing: the deepest rules in every proposal | Composite steps (wizard → address step → confirm) | Prior-art D1 (rebuild composites by hand); A1 inside composites |
| 4 | **`start`** (the host's entering transition sends first) | 1 word, the default-path rule, a Machines O3 exception | Self-contained first sends | A7, D2 (two places choose the request) |
| 5 | **Abandoning a step with a commit in flight** (`flow check` error unless the leaving transition cancels or the step is not sending) instead of the `abandoned` route | The whole abandoned protocol: rules, durable routes, host handlers | Leaving mid-commit without waiting | L4 partly (the host cannot always leave), L5 instead becomes a static rule |
| 6 | **Trait callback targets** (callbacks never target) | 1 rule, the per-kind distinction | Idle timeout → LOCKED, hold → DELETING from a trait | Coverage only; no §4 problem. The workaround is a step. |
| 7 | **`raise` (same-turn composition)** | The composition table, decline semantics, acyclicity, totality, `check` expansion: the largest semantic addition after requests | Host feeding a fragment (Debounce, Replace after save, Reset) | H1, D3, A1 |
| 8 | **Request ports entirely** (the host maps outcomes onto fragment `hostEvents`, as in the round-0 draft) | The largest cut: about 8-15 words and 10-15 rules per proposal, plus most plan amendments | Fragment-owned retries, fenced replies, exhaustive outcome ownership | D2, D4, H3, H4, L2, L5, L6, D5, A7 |

**The best ratios are cuts 1, 2 and 6:** each is small, rarely used in the examples, and the loss is
contained. **Cuts 3 and 5 are large wins** with moderate, nameable losses; they deserve a
deliberate decision. **Cuts 7 and 8 remove the reason fragments exist**, which is correctness for
I/O-driven and host-fed behaviour, and they reopen the most problems.

### What every proposal carries that is pure cost today

- **Story vocabulary:** 5-10 terms each. One `story.fragment` with fixture bindings would serve all
  six.
- **Abandoned plumbing in host code:** 10-40 lines per commit placement. One handler shape, or one
  operation-level observer, removes most of it.
- **Rules restated as checks:** about 20-30 % of each check table.
