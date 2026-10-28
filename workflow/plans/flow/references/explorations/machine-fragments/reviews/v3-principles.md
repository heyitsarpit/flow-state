# Review of proposal-v3: principles, prior art, simplicity, coverage

This review reads [proposal-v3.md](../proposal-v3.md) against [principles.md](../principles.md),
with [comparison/amendments.md](../comparison/amendments.md) as its source. The lens is the same as
in the v2 review. Severity:

- **blocker**: a core rule is wrong as written;
- **major**: a correctness hole, a principle violation, or a gap that blocks building;
- **minor**: wording or presentation.

Line numbers (Lnn) refer to proposal-v3.md.

## 0. Verdict

**v3 reads like proposal.md again, and the fragment layer really is smaller.** It is one page of
model (§1–2.3), eleven rules, a "where things go" table, and one full example.

- It drops the fragment I/O layer: `requests`, `kind`, `operation`, `results`, `start` and the
  fragment-side `abandoned`.
- The three-layer split (Operations / Machines / fragments) is the right shape, and the comparison
  earned it.

**The whole design is not smaller, only redistributed.** About ten words and twelve rules moved from
the fragment layer into a plan-amendment table (P1–P13). Those rows are terse, and four of them
change existing plan sentences without saying so.

**Ready to build fragments against after six precise changes (§8).** The biggest is that §5 lists
only the plain-machine amendments. The fragment layer's own plan amendments (Machines
O1/O2/O3/O4/O8, Testing, Inspection, CommandLine) are not listed at all.

---

## 1. Cohesive and readable at a glance?

### Counts

| | proposal.md | v2 | **v3** |
| --- | --- | --- | --- |
| Lines | 367 | 2,293 | **689** |
| Fragment-layer keywords | ~18 | ~30 | **~21**: 14 listed (L586) + list events `Add`/`Remove` and payload `index` + Story `.enter`/`.leave`/`run.calls`/`checkpoint.exit` (unlisted) |
| Plan-layer keywords | – | (inside the 30) | **~14**: 10 listed (L587) + `abandoned` payload `outcome`/`tag`/`input` + retry options `on`/`schedule` |
| Fragment rules (atomic) | ~25 | ~58 | **~32**: 11 numbered; rules 2, 7 and 9 have sub-bullets |
| Plan rules (atomic) | – | spread through rules 9–12 | **~25**: 13 P-rows + 5 decided ambiguities |
| **Total new words / rules** | | ~30 / ~58 + plan rows | **~35 / ~57** |

- **The fragment layer** is about 30 % smaller than v2 in words and about 45 % smaller in rules.
  That is a real reduction, not just shorter prose.
- **The whole design** carries about the same number of new words and rules as v2. They now sit
  where every machine benefits, which the comparison justified. But a reader of "the fragments
  proposal" must also learn P1–P13 to read §3.1's machine:
  - `uncertain` (L257);
  - `abandoned` (L292);
  - `s.schedules` (L423);
  - `armOn` (L219).

### One canonical form per concept

| Concept | Forms | Status |
| --- | --- | --- |
| Placing a fragment | `traits`, bare or `.at`, or `.list`; `states` for subroutines | good |
| Filling | one block per instance, in the machine | good |
| A port's default | `"allow"` / `"required"` for guards vs `optional(…)` for callbacks | **two spellings** (the proposal admits it, Open 3) |
| Resetting a trait | leave its node; `resetOn`; or the fragment's own `Reset` hostEvent | three ways, but each has a different trigger. Acceptable. |
| Retrying | descriptor `retry` (P4) | one form. It sits on the descriptor, not the call site; see §3. |
| Reading time left | `s.schedules.….dueAt` | good: the copied-deadline idiom is gone |

### One obvious place for each thing

**Yes.** The §2.3 table (L96-101) is the best "where does code go" statement in any proposal:

- placement goes in the definition;
- fillings, `resetOn` and raises go in the machine;
- I/O stays in the machine.

### One question for an agent

- **Kind:** "does the actor have it, or go into it?" (L54) gives one answer.
- **Sender:** the three lists give one answer.
- **Reset:** reset by node, by `resetOn` or by event needs a second question: "what triggers it?".
  The answer is obvious once asked.

---

## 2. Do the new pieces fit, or are they bolted on?

| Piece | Fit | Notes |
| --- | --- | --- |
| **B2 `.list({ max })`** | **Partly bolted on** | It is the only dynamic thing in an otherwise static model, and it brings its own grammar: `E.invites[i]`, reserved `Add`/`Remove`, `index` in payloads, input "read for each added instance", `s.schedules.x[i]`. **Index addressing is a correctness hole, not just an open question** (Open 1). A `Changed` sent for row 3 just after `Remove { indexes: [1] }` lands on a different row. Every view that renders from an older snapshot can misroute input. Keys are needed before lists ship (§4, major 3). |
| **B3 defaults** (`"allow"` / `"required"`, `optional(…)`) | Fits, with two spellings for one idea | `"required"` is the absence of a default, so it says nothing. Use one wrapper for both port kinds: `optional(fields?)` for a callback (ignore) and `optional()` for a guard (allow). Drop `"allow"` / `"required"`. |
| **B4 `resetOn`** | Fits the lifetime story | "Re-activate when a selection changes" sits naturally beside `.at` and `restartOn`. Two precision gaps (§4, major 2): *when* in the turn it runs, and the declaration-order cascade. |
| **`uncertain()` marking** (P9) | Fits | It puts H5 into the event declaration, and the view and graph can show it. But it constrains only *targets*, not what the handler does. A host handler can still resend on an `uncertain` event (see §6, H5). |
| **`optional(…)` / `"allow"`** | see B3 | |
| **`abandoned { outcome, tag?, input }`** (P10) | Fits, and P1's `input` makes it useful (the late-strike example, L292-297) | **It lacks `attempt`.** A host that learns of an abandoned `unknown` cannot reconcile it with `O.x.retry(attempt)` without the Attempt. v2 had it. |
| **`armOn`, `dueAt`, arming ids** (P6, P7, P11) | Fits well | They remove the counter idiom and copied deadlines from every build. They are the best-earned additions. |
| **`.history`** (P5) | Fits | Standard shallow history (UML/SCXML). |
| **`retry` / `retrying`** (P4) | Fits the layer split, but placed on the descriptor | See §3. |
| **`revertOnUnknown`** (P13) | Bolted on | It is a narrow option for one example (the pin). It is a cut candidate (§7). |

---

## 3. Is the three-layer split clean or leaky?

The split itself is clean:

- fragments never touch I/O;
- the host maps outcomes onto its own events and raises facts into fragments;
- the §2.3 table states it.

The comparison's evidence (I/O fragments paid off in one app of three) supports it.

The split leaks in four places:

1. **P4 puts UI policy on the descriptor.** "Retry Busy three times, 1/2/4 s" is the signup screen's
   policy. A descriptor is shared by every caller, so a second screen that wants no retries, or
   different ones, cannot have them.
   - Put `retry` on the **commit call options**: `O.x.commit(select, { outcomes, retry })`. The
     policy then stays in the machine that owns the flow, and the descriptor is unchanged.
   - P4 also reverses an explicit plan sentence ("Flow … never retries automatically", Operations
     O3). The amendment must say so.
2. **P2 ties Operations results to Machines activations** ("fenced to the state its transition
   enters"). This is necessary, but it is a Machines rule as much as an Operations one, and it needs
   rows in both plans.
3. **`uncertain` is an Operations rule enforced on Machines declarations.** It needs a Machines O1
   row ("internal events may be marked uncertain") as well as the Operations one.
4. **The example host carries most of the logic** (`wrongAttempts`, `MAX_WRONG`, the lockout raises,
   the late-strike count), and the fragments are thin (Field, Countdown). This is not a leak; it is
   the honest cost of no-I/O fragments. The reader should know that v3 trades reuse of *policy* for
   reuse of *pieces*.

---

## 4. Findings

### Blocker

None.

### Major

1. **§5 omits the fragment layer's own plan amendments.** L6 says "section 5 lists the plan
   amendments it assumes", but §5 lists only P1–P13, "each useful without fragments" (L626).
   Fragments themselves need:
   - **Machines O1:** `traits`, `.at`, `.list`, `subroutine` states, contracts, filling blocks,
     `hostEvents`, `uncertain` marking, instance names and collisions.
   - **Machines O2:** exits, abandonment, nearest handlers across host and fragment.
   - **Machines O3:** fusion of notify, exits and raise; whole-turn refusal; disjoint keys; rule 8
     totality; `resetOn` timing.
   - **Machines O4:** guard inputs gain `s.schedules` and `.pending` (decided ambiguity 2), and
     `check()` evaluates through raises.
   - **Machines O8:** fragment slices, `s.schedules`, pending-call reads.
   - **Testing O1:** `story.machine(fragment)`, `.enter`, `.leave`, `run.calls`, `checkpoint.exit`.
   - **Inspection, CommandLine:** fragment clusters; rule 8 and the other checks.

   Without these rows, nobody can edit the plans from v3.
2. **`resetOn` timing and order.**
   - "Selections are compared after each committed turn" (L109). If a reset happens *after* commit,
     it is a second publication (against Machines O3's single publication) or an invisible
     post-commit write.
   - **Fix:** compare inside the turn, after updates and before validation and publication (as
     Machines O5 does for `restartOn` "at commit time"). The reset then joins the one publication.
   - The declaration-order cascade (L110, L568) is a hidden ordering rule. Say it once in rule 1:
     "each selection reads memory after earlier resets in the same turn".
3. **List identity by index misroutes input** (B2, §2). Before `.list` ships, address instances by
   key (`.list({ max, key })`, `E.invites.byKey(k).Changed`, or opaque ids minted on `Add`). The
   alternative is to cut `.list` from the first build and keep the invite list as host memory, as
   every build did.
4. **`abandoned` lacks `attempt`** (P10). Add `attempt?` (present whenever one was minted), or
   abandoned `unknown` commits cannot be reconciled.
5. **The P-rows change existing plan sentences without naming them.**
   - **P4:** Operations O3 "never retries automatically".
   - **P6:** Machines O8 "no … timers" in the snapshot.
   - **P3 / P6** (decided ambiguity 2): Machines O4's guard input list
     (`event, state, memory, context, activities`).
   - **P9:** the never-invoked restore under Persistence O6 (`interrupt` → `notSent`) and Operations
     O3's pre-invocation `interrupt`.
   - **P10:** `abandoned` as a new turn source (Machines O3, Runtime O4).
   - **P12:** Persistence O6, by row.

   Each row needs "Plan, outcome, sentence replaced".
6. **The §4 verdicts overclaim in three rows.**
   - **D4:** "As in the plans: an unmapped outcome publishes an issue" means **allows**. Say so. v2
     prevented it, and this is a deliberate regression worth stating.
   - **H5:** "a retry policy never retries them" covers descriptor retries only. A host handler on an
     `uncertain` event may still resend. Either keep v2's check 9 (an `uncertain` handler that can
     reach a fresh send of the same commit) or say "by convention for host code".
   - **D2:** prevented for descriptor retries; host-written resends read whatever their select reads.

### Minor

7. **P4 placement:** move `retry` to the call site (§3, item 1).
8. **Two default spellings** (B3): use one `optional(…)` wrapper for both port kinds.
9. **§3.2–3.4 are excerpts.** Fine for brevity, but P4, the most important new Operations feature,
   is never shown. Signup's SUBMITTING handles `Retrying`, `Busy` and `Unsure` (L496-500), but the
   commit with `retry` and `retrying:` mapped appears nowhere. Add one ten-line block.
10. **`memory.code.value`** in the verify select (L282) reads a slice that is `undefined` while
    inactive. Show the narrowing, or say that selects in TWO_FACTOR see it as present.
11. **`Remove`** is a public list event. Say whether it can refuse; rule 8 matters when it is raised
    from Next.
12. **The ledger misses** the list events, the Story words and the `abandoned` payload fields.
    "New, plans (10)" also counts `retry` / `retrying` as one entry.
13. **Rule 4's last sentence** (guards test position with tokens) is a Machines-wide style rule, not
    a fragment rule. Move it, or say it applies to every guard.

---

## 5. Are the plan amendments precise enough to edit the plans from?

**Not yet.** The P-rows are a good inventory: each has a rule and draft syntax, and the five decided
ambiguities settle the questions the builds hit. But an editor needs three things per row:

- the plan and outcome;
- the sentence replaced or added;
- the verification line.

Today only P2 and P9 come close.

Missing entirely: the fragment-layer rows (major 1), plus Diagnostics codes and React (`useNow`
already exists; `s.schedules` in views needs an O4 note).

---

## 6. Is "Deliberately left out" honest?

**Mostly yes.**

- **Fragment I/O, nested relays, parallel-region traits and node memory** are each stated with
  what replaces them and what it costs. The node-memory row correctly admits "resetting a few host
  keys by hand", and §4's L3 row repeats it.
- **The I/O cut is honest about its trade:** "if a second policy appears … v2's request semantics are
  the ready design".

Two omissions:

- **The regressions that came with cutting fragment I/O** are not listed as costs: D4 (unmapped
  outcomes now only publish an issue) and H5 for host-written retries. They belong in "left out",
  not as "prevented" in §4.
- **List identity** is listed only as an open question. It is a known correctness gap, so it should
  sit in "left out" (if lists ship by index) or be fixed.

---

## 7. Further cuts worth considering

| Cut | Gain | Cost |
| --- | --- | --- |
| **`"allow"` / `"required"`** → one `optional(…)` | −2 words, one form | none |
| **`revertOnUnknown`** (P13) | −1 word, −1 Operations rule | apps.md's pin "revert" becomes "revert after a confirming read" (Operations O5), as the baseline build accepted |
| **`.list`** in the first build | −~6 words, −1 rule, the index-identity hole | the invite list stays host memory with hand validation (D1 duplication), as every build did |
| **`retrying`** as a separate outcome | −1 word | no "retrying (n/3)" text; P4 would report only the final failure |
| **`.pending`** (P3) | −1 word | the second-click pin refusal returns to a host-kept set (as in all the builds) |

The first is free. `revertOnUnknown` and `.list` are the best simplicity-to-loss trades. Keep
`.pending` and `retrying`: they each removed a FAKED pattern in the builds.

---

## 8. Is v3 ready to build against?

**For the fragment layer, almost. For the plan amendments, not yet.** The smallest changes, in order:

1. **Add the fragment-layer plan amendment rows** (major 1). Give every P-row its plan, outcome and
   replaced sentence (major 5).
2. **Pin down `resetOn` timing** (inside the turn, before publication) and its cascade rule (major 2).
3. **Decide list identity:** keys, or cut `.list` from the first build (major 3).
4. **Add `attempt?` to the `abandoned` payload** (major 4).
5. **Correct the D4, H5 and D2 verdicts** and list the I/O-cut regressions in "left out" (major 6).
6. **Move `retry` to the commit call options**, and state that it reverses "never retries
   automatically". Merge the two default spellings into `optional(…)`.

None of these changes the model. With them, v3 is small, cohesive and buildable. It is the closest
yet to the size and feel of the original proposal.md, while keeping the correctness rules the
comparison showed every system needed.
