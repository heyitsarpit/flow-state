# Review of proposal-v4 (principles lens, focused on the additions)

This review reads [proposal-v4.md](../proposal-v4.md) against [principles.md](../principles.md) and
the prior-art notes (`prior-art/README.md` and its four notes, removed, see [the folder README](../README.md)). It covers
only what changed from v3, and ignores the uncommitted `.plan` edits. Line numbers (Lnn) refer to
proposal-v4.md.

Severity: **major** = a principle violation, a word with two meanings, or drift from a note that
changes behaviour; **minor** = wording.

## 0. Verdict

**v4 is ready for the user to read and decide on.** The fragment model stays cohesive.

- Most of v4's growth is not in the fragment layer.
  - **Fragment layer: two new words.** `keep` and `onLeave` are new. State tokens in guard arrays
    reuse existing syntax. Summaries and incarnations are new concepts, but not new words.
  - **Operations hardening (P14–P20): five words.** `failures`, `idempotency`, `createdAt`,
    `timeout`, `orphaned`.
  - **Tooling (T1–T3): three words.** `hot`, `invariants`, `ignore`.
- The six-step turn algorithm (2.5) is the most useful addition. An agent can follow it.
- Each change traces to a note. Two drifted, and the "Left out" section misses four recommendations
  (§4, §5).

**The main issue is presentation.** v4 bundles three independent decisions into one document:

1. the fragment model with its turn algorithm;
2. commit hardening (P14–P20);
3. exploration tooling (T1–T3).

The user can accept each without the others. The document should say so up front.

---

## 1. Length and cohesion

| | v3 (revised) | v4 | Change |
| --- | --- | --- | --- |
| Lines | 955 | 1,113 | +16 % |
| Keyword entries (§3.6 tables) | 19 + 14 = 33 | 21 + 21 = 42 | +27 % |
| Numbered fragment rules | 11 | 12, plus the six-step algorithm | |
| Plan rows | P1–P13 + fragment rows | P1–P21 + T1–T3 + 13 fragment rows | |

- **Words and rules grew faster than length.** The document is denser per line, but still readable.
- **The fragment layer is still cohesive.**
  - Rule 1's lifetime model (incarnation, `keep`, `resetOn`, history restores control only) is one
    paragraph about one idea.
  - `onLeave` reuses `callbacks` instead of adding a port kind. That is a good simplification over
    the notes' `abandon` port and `onAbandoned` callback.
- **The cohesion cost sits in the plan layer.** Durability and exploration are each a coherent group,
  but neither is about fragments. A reader of "the fragments proposal" now meets saga recipes and
  `orphaned`.

---

## 2. The new words

| Word | Earns its place? | One meaning? Clash? |
| --- | --- | --- |
| **`keep`** | **Yes.** It gives signup pages their fields back under history (3.2), and it is the note's recommendation (modal R2, synchronous R7). | One meaning. Open 2 (`keep` with `resetOn`) is a real question. |
| **`onLeave`** | **Yes.** It moves D7 from convention to "prevented where declared" (three notes agree). | One meaning, but it also fires on **freeze** (rule 6, L210). A kept trait is not ending, since its data stays, so firing there is surprising. Exclude freezing. |
| **State tokens in guard arrays** | **Yes.** They give `flow check` structural pruning without parsing closures. | No new word. But position now has **two spellings in guards**: a token element (`guard: [S.X, …]`) and a closure (`S.WIZARD.INVITE.is(state)`, L789). State the rule: "test position with a token element; closures only for data". |
| **`timeout`** | **Yes** (durable R3). It turns "a host schedule that exits the fenced state" into one option. | One meaning. |
| **`failures`** | **Yes** (durable R1). It closes H4/H5 for failure tags. | **Clash.** `failures: { Busy: "definite" }` on the descriptor sits next to `outcomes.failure: { Busy: E.Busy }` at the call. One letter apart, for different things. Rename (`failureKinds`, or `tags: { Busy: "definite" }`). |
| **`idempotency`** (`window`) | **Weakly.** v4 keeps only the window-expiry effect (`retry(attempt)` older than the window answers `notSent`). The note's other uses are dropped (§4). | One meaning. As it stands, it is mostly documentation. |
| **`createdAt`** | Needed by `idempotency`. | Fine. |
| **`orphaned`** | **Yes** for persisted actors (durable R5); rare in practice. | Pairs clearly with `abandoned` (machine-side late result) as the descriptor-side late result. |
| **`hot`** | **Yes, for exploration** (modal R3). | Placed as a Machines O2 state flag for what is a test-time property. Move it to `model(…, { hot: [S.TWO_FACTOR.VERIFYING] })`, beside `invariants`, so Machines gains no tool-only word. The `flow check` "hot state reachable with nothing pending" can read the same option. |
| **`invariants`** | Yes (modal R3), as a `model()` option. | Fine. |
| **`ignore`** | **Weakest.** It is a node-level keyword that only silences one warning (T3, modal R4, "medium value"). | One meaning, but it is a tool-facing annotation in authoring code. Cut it: let the warning stand, since warnings never fail the check. Or defer T3. |

Also unlisted but new:

- the adapter's invocation ordinal `n` (P15);
- `perAttempt` / `total` (P16);
- the concepts **incarnation**, **frozen**, **summary** and **source-updated memory**.

The last four are concepts, not keywords. The §3.6 table should name them as concepts, because an
agent meets all four in the rules.

---

## 3. Is the six-step turn algorithm readable by an agent?

**Yes.** Admit, select, reset and seed, expand, validate, commit: each step says what it reads and
writes. This is what the statechart and synchronous notes asked for (an SCXML-Appendix-D-style
algorithm). Five fixes:

1. **`check()` runs "steps 1–5"** (L274). Step 1 takes the oldest event from the mailbox, but
   `check(snapshot, event)` takes a given event. It should run **steps 2–5 on the given event**.
2. **Step 4, "Incarnations"** (L303-305): "A raise addresses the incarnation that is live once the
   turn's one state change is known." But the one state change may be selected later in the same
   expansion, for example by an exit filling reached after the raise. Say plainly: "a raise into a
   trait on a node this turn exits is a construction error (rule 12); otherwise it addresses the
   incarnation live after step 3."
3. **Step 4 order:**
   - An `onLeave` for an incarnation that step 3 reset runs after the raises into its fresh
     incarnation. That is correct, since `onLeave` reads pre-turn memory, but it is non-obvious.
     Add one clause saying so.
   - Also say where an `abandoned` pending run sits relative to exits.
4. **Step 6:** say that fresh incarnations created by a reset arm their entry schedules, not only
   nodes entered.
5. **Three read views.** Guards and mappers read pre-turn memory; `input` and `resetOn` read
   source-updated memory; new incarnations read `initial`. The algorithm states all three, which is
   better than v3. Add one table, "what reads what", above the steps. That is the single most
   useful thing for an agent.

Rule 6's "a late result never preempts live work" paragraph (L213-217) is still the densest
sentence in the document. Now that 2.5 exists, restate it as a step-2/step-4 selection rule for
turns sourced from `abandoned`.

---

## 4. Does each change follow its prior-art note?

I spot-checked synchronous R1–R9, modal R1–R8, durable R1–R10 and statechart R1, R6 and R7.

| Change | Note | Faithful? |
| --- | --- | --- |
| Turn algorithm, incarnations | synchronous R3, statechart R1 | **Yes** |
| Reset before react | synchronous R1 | **Yes** |
| `resetOn` reads | synchronous R2 | **Drifted.** The note offers (a) pre-turn plus the event ("simpler and matches rule 7") or (b) post-update reads with a static `flow check` rejection. v4 chose a third reading: source-updated memory, with declaration-order typing. It has a new cost the note avoided: "a key written by a callback or exit filling reaches `resetOn` only on a later turn" (L181), a one-turn lag caught only by a Story-trace warning. Defensible, because it shares one read with `input`, but record the deviation and the lag in §6 or as an open question. |
| Summaries | synchronous R4 | Yes. The type cost is correctly left open (Open 1). |
| Read-after-write lint | synchronous R5 | Yes |
| Leave hook | synchronous R6, statechart R2, modal R6 | **Extended.** The notes asked for subroutines on abandonment. v4 also covers traits, removal, reset and freeze. Traits and removal are a reasonable generalisation; freeze is not (§2). |
| History restores control only, plus a warning | synchronous R7 | Yes |
| No fallthrough on child refusal | synchronous R8 | Yes |
| `combine` | synchronous R9 | Left out, honestly |
| List incarnations | modal R1 | Yes |
| `keep` | modal R2 | Yes, including the kept-deadline restore rule |
| Exploration, `invariants`, `hot` | modal R3 | Yes (placement of `hot`: §2) |
| `ignore` | modal R4 | Yes, but low value (§2) |
| Stateful traits | modal R5 | Listed as pending, honestly |
| `failures`, `idempotency`, `createdAt` | durable R1 | **Partly.** v4 takes classification and window expiry. It drops the two effects that give `idempotency` its meaning in the note: `retry(attempt)` needing `{ unsafe: true }` without it, and `retry.on` allowing `unknown` with it. Without them, `idempotency` does little. Either keep the note's gating or defer `idempotency` and `createdAt` to the pending durable proposal (with R7). |
| One Attempt across retries | durable R2 | Yes |
| `timeout` | durable R3 | **Slight drift, simpler.** The note retries a per-attempt timeout under `idempotency`; v4 never retries it (L1037). Consistent with dropping the gating above. |
| Late result after cancel → `abandoned` | durable R4 | Yes |
| `orphaned` | durable R5 | Yes |
| `abandoned` compensation, saga recipe, no `compensate:` | durable R6 | Yes |
| Mailbox FIFO (P21) | statechart R7 | Yes |
| Coverage and dead-contract warnings | statechart R6 | Yes |

---

## 5. Is "Deliberately left out" honest?

It is honest about what it lists: fragment I/O (with its D4 and H5 costs), relays, regions and the
other non-recommended items, `combine`, and the five pending decisions. **It omits five things:**

1. **Node memory.** v3 listed it; v4 drops the line. `keep` covers traits, not host memory scoped to
   a node. The sign-in example avoids the gap by turning strikes into a `Lockout` list, so the gap
   remains for host keys. Restore the line.
2. **Modal R7, data-conditioned leaving** (`while:`). It is neither adopted nor listed.
3. **Durable R8, saved-state compatibility Stories** (`story.restore(fixture)`). It is neither
   adopted nor listed, although `orphaned` makes version changes a first-class case.
4. **The idempotency gating** from durable R1 (§4). Its omission changes what `idempotency` means.
5. **Synchronous R2's recommended reading** for `resetOn`, and the one-turn lag v4 accepts instead.

---

## 6. Cuts and merges with no loss

| Change | Loss |
| --- | --- |
| Move `hot` into `model()` options beside `invariants` | none; Machines vocabulary stays clean |
| Exclude freezing from `onLeave` | none; a kept trait's data stays readable |
| Rename `failures` (`failureKinds` or `tags`) | none; removes the clash with `outcomes.failure` |
| Drop `ignore`; keep the T3 warning as a warning | the warning cannot be silenced (warnings never fail a check) |
| Defer `idempotency` and `createdAt` to the pending durable proposal (with R7, R9) | window expiry for `retry(attempt)` (rare) |
| Name incarnation, frozen, summary and source-updated memory as concepts in §3.6 | none; clarity |
| One "position test" rule: token element, not closure, for purely positional guards | none |

---

## 7. Ready to read and decide on? The smallest changes first

**Yes.** None of these blocks reading. In order:

1. Add a three-line decision summary at the top: fragments plus turn (§2), commit hardening
   (P14–P20) and exploration (T1–T3) are separate decisions.
2. Algorithm fixes: `check()` runs steps 2–5 on the given event; clarify step-4 incarnation
   addressing; say where `onLeave` and `abandoned`'s pending run sit; arm schedules for reset
   incarnations; add a "what reads what" table.
3. Exclude freezing from `onLeave`.
4. Rename `failures`; move `hot` to `model()`; drop `ignore` or defer T3.
5. Name the four concepts in §3.6; state the position-test rule.
6. "Left out": restore node memory, and add modal R7, durable R8 and the idempotency gating. Record
   synchronous R2's deviation and the one-turn `resetOn` lag.
7. Decide `idempotency`: keep the note's gating, or defer it with `createdAt`.
