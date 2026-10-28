# Review of the fresh v3 build (principles lens)

This review covers [build-v3.md](../build-v3.md). It compares the build with
[build-b-locked-split-amended.md](../build-b-locked-split-amended.md) and
[build-baseline-amended.md](../build-baseline-amended.md), and checks it against
[proposal-v3.md](../../proposal-v3.md) as revised.

The author worked from the document alone, which makes this build the best test so far of whether
v3 can be read without prior context. Line numbers (Lnn) refer to build-v3.md.

## 0. Verdict

**v3 can be built from the document alone, and the result reads well.** The author answers every
placement question with v3's own one question (L1983-1999).

- **Mechanical checklists.** Rule 8 and P2 gave the author mechanical checklists to follow.
- **One-line features.** These each turned into one line of app code:
  - `.at`, `resetOn`, `armOn`, `dueAt`;
  - `.history`;
  - descriptor `retry`;
  - `uncertain`;
  - keyed lists.
- **Size.** The build ties the amended baseline and is about 9 % smaller than the amended B build.
- **Fakes.** It has 8 FAKED markers in code. The B author, who knew the amendments, had 1.

**The 19 UNCLEAR items are mostly small**, as the table below shows. Two of them shape behaviour and
need a rule rather than wording: what a raise's `.from` mapper reads (item 15), and whether host
events fall through while inside a subroutine (item 16).

| Kind of gap | Items |
| --- | --- |
| Missing syntax | 5 |
| Ambiguous rules | 8 |
| v3 contradicting itself | 2 |
| v3 contradicting the plans | 2 |
| Gaps in the plans | 2 |

**Two concepts went unused:**

- fragment nesting (rule 10), because no syntax is shown;
- testing a fragment alone (`story.machine(fragment)`), with zero uses.

---

## 1. Size, recounted

I counted non-blank, non-comment code lines, by file kind. Operations files and Stories are
excluded.

| | v3 build | B (amended) | Baseline (amended) |
| --- | --- | --- | --- |
| Shared fragments or helpers | 144 | 228 | 10 |
| Sign-in: definition + machine + component | 35 + 148 + 66 = **249** | 35 + 119 + 77 = **231** | 39 + 137 + 96 = **272** |
| Signup | 40 + 116 + 191 = **347** | 43 + 103 + 198 = **344** | 56 + 134 + 177 = **367** |
| Issue list | 37 + 138 + 116 = **291** | 47 + 143 + 144 = **334** | 53 + 169 + 161 = **383** |
| App code | 887 | 909 | 1,022 |
| **Total** | **1,031** | **1,137** | **1,032** |
| Stories | 236 | 159 | 191 |
| FAKED markers in code | 8 | 1 | 7 |

My numbers match the author's own method (L31-32).

- **v3 and the amended baseline are the same size.** The plan amendments (P1–P12) help the baseline
  as much as they help fragments. So fragments still win on structure (lifetimes, named pieces,
  host-only facts), not on lines.
- **The v3 fragment file is the smallest of any build** (144 lines for 8 fragments). Thin pieces
  plus no I/O keep it small. The cost moves to the host: the sign-in machine is 148 lines, with
  `wrongAttempts` and `lockedChallenge` reset by hand on five paths (L353). This is the node-memory
  gap v3 defers.

---

## 2. Readable at a glance?

- **Definitions read as the app.**
  - Sign-in shows `PASSWORD → TWO_FACTOR [ENTERING, VERIFYING, LOCKED_OUT] → SIGNED_IN`. Three
    traits with visible lifetimes (`.at("TWO_FACTOR")` versus the root lockout) explain S1 without
    prose (L327-345).
  - Signup and the issue list are equally direct.
- **Machines are clear but host-heavy.**
  - The sign-in machine opens with three shared handler objects (`lockNow`, `resend`, `toEntering`)
    and a type workaround (UNCLEAR 3). The lockout's late-strike path takes about 40 lines across
    PASSWORD, ENTERING and the `canEdit` array.
  - A reader can follow it, but the policy is not visible at a glance. That cost comes from the
    lack of node memory and from `abandoned` being unable to act (items 2 and 3 of "What strained").
- **Components are short.**
  - The issue list's component, at 116 lines, is the shortest of the three builds.
  - Reasons: `check()` drives every button, `dueAt` drives the countdowns, and keyed lists remove
    index bookkeeping.

---

## 3. Every UNCLEAR item, classified

| # | Item | Kind | What v3 should say |
| --- | --- | --- | --- |
| 1 | `operations: { Auth }` vs Machines O1 "a flat record" | **contradicts the plan** | Either allow one namespace level (amend Machines O1), or write `operations: { verifyCode, resendCode }` in v3's examples. |
| 2 | How to spell a *required* port | missing syntax | Show one: `guards: { canPress: guard() }` / `callbacks: { onHeld: {} }`, or state "a bare payload record is required". |
| 3 | Types for helpers and shared handlers declared outside a node | ambiguous rule | Export `Guard<typeof Def>` and `Handler<typeof Def, typeof S.X>` types, or state that shared handlers are checked where they are used. |
| 4 | `S.X.is(state)` vs Machines O2 `token.is(snapshot)` | **contradicts the plan** | Amend Machines O2 so `is` accepts a state path, or write `S.X.is(g)` in guards. |
| 5 | P1 mapper argument: merged, or a second argument | v3 contradicts itself (the `retrying` example destructures `({ retry })`) | One signature: `(value, { input, attempt })`. Fix the `retrying` example. |
| 6 | How a Story seeds list keys | missing syntax | `story.machine(M, { keys: { invites: ["a", "b"] } })`, or a `.add(path)` command whose key the Story names. |
| 7 | Where a subroutine's schedules appear | ambiguous rule (P6 covers traits only) | `s.schedules.<STATE>.<name>`, `undefined` while inactive. |
| 8 | Where the host's own schedules appear, and whether they share a namespace with instances | ambiguous rule | Host schedules are `s.schedules.<name>`; instance names collide with schedule names (a construction error). |
| 9 | Syntax for nesting (rule 10) | missing syntax | A five-line example of a fragment with `traits` in its contract and its filling in its body. Its absence produced a FAKED duplicate (Flash re-implements Countdown, L245). |
| 10 | Does a trait without memory have a slice? | ambiguous rule | "No memory, no slice; its schedules still appear under `s.schedules`." |
| 11 | Does a raised `hostEvent` arm an `armOn` schedule? | ambiguous rule (P7 says "a transition … is accepted") | "Any accepted transition handling an `armOn` event, raised ones included." |
| 12 | A subroutine with no states | v3 contradicts itself (the §2.1 table says it has states; `Confirm` declares none) | Table row: "States of its own: optional; without them it is one leaf". |
| 13 | May a fragment guard over its own memory? | ambiguous rule (only port guards are shown) | "A fragment's transitions may have ordinary guards; `guards` ports are where the *host* may refuse". |
| 14 | No guard port on a list's `Add` / `Remove` | missing feature | A list-level guard port (`.list({ max, guards: ["canAdd"] })`), or the rule that a list's `Add` honours the element's `canEdit`. Its absence produced a FAKED item (L883). |
| 15 | What a raise's `.from` mapper reads | **ambiguous rule, with a behavioural effect** | Add to rule 7: "raise and notify payload mappers read the pre-turn snapshot and the event, like action parameters". The pin flash depends on it. |
| 16 | Do host handlers fall through while the actor is inside a subroutine? | **ambiguous rule, with a behavioural effect** | Add to rule 4/6: "Host events not handled inside a subroutine fall through to the host's ancestors as usual; only the fragment's own events stop at its boundary". Rule 8 depends on it for root outcomes during a hold. |
| 17 | Shape of the `optimistic` option | gap in the plans | An Operations O3 example. |
| 18 | Does a Story `send` run its own turn? | gap in the plans | A Testing O1 sentence. |
| 19 | Can a view read WIZARD's remembered child while CANCELLING is active? | missing syntax | A P5 read form, e.g. `S.WIZARD.history.child(s)`, or "history is not readable; views keep their own". |

**Bottom line:** 13 of the 19 items need one sentence or one example each; 15 and 16 are rule
additions; 14 is a small feature; 1 and 4 need a plan decision.

---

## 4. Which v3 concepts carried their weight?

| Concept | Uses in the build | Verdict |
| --- | --- | --- |
| `.at` (lifetime by placement) | 7 | **Carried S1 alone**: lockout kept, code and cooldown dropped, with no reset code. |
| Three sender lists (`hostEvents`) | 7 | **Carried S2**: `SelectAll` as a hostEvent means the view cannot send ids. |
| `resetOn` | 8 | **Carried** the page and selection resets. Its ordering rule was clear enough to rely on (L1997). |
| `armOn` + `dueAt` | 12 + 10 | **Carried** every timer and countdown. There are no copied deadlines anywhere. |
| `.history` | 7 | **Carried** Keep → same page in one line. |
| P4 `retry` / `retrying` | 1 + 9 | **Carried** the Busy retries with the "(n/3)" text. |
| `uncertain` + `notSent` | 4 + 14 | **Carried** H5 routing. It forced a policy choice for bulk delete, which is good. |
| `abandoned` | 9 | **Half carried.** It records the late strike, but cannot act on it (FAKED L422; v3 open question 3). |
| Keyed `.list` | 19 | **Carried** the invite list. Keys fixed the index hole, but there is no guard port (item 14) and no Story syntax (item 6). |
| `optional(…)` | 7 | **Carried**, as one spelling now. A required port's spelling is still missing (item 2). |
| Subroutines + `exits` | 2 subroutines | Carried `Confirm` and `HoldToConfirm`. These are small but correct. |
| `callbacks` + `notify` | 5 | Light use. Carried timer-done and hold-done notices. |
| `.pending` (P3) | 1 | Used once (second-click pin refusal). Still the right tool there. |
| **Nesting (rule 10)** | **0** | No syntax was shown, so nobody used it, and a duplicate followed. |
| **`story.machine(fragment)`** | **0** | **Never used.** All three Stories test apps. Principle 10 ("testable alone") was not exercised by a fresh author. |

---

## 5. Compared with the amended B and amended baseline builds

| | v3 build | B (amended) | Baseline (amended) |
| --- | --- | --- | --- |
| Size (§1) | 1,031 | 1,137 | 1,032 |
| Reuse across apps | `Field` (2 apps), `Countdown` (twice in sign-in); 6 fragments used once | `Field` (3 apps), others mostly once | helpers only |
| Clarity of flow | definitions read as the app; host-heavy sign-in | definitions read as the app; machines as today's | the flow is clear; overlapping concerns in memory |
| FAKED | 8: node memory, late strike, nesting, list guard, non-null assertion, pin title copy, no immediate revert | 1 | 7 |
| Written by | a fresh author, from the document | an author who knew the amendments | an author who knew the amendments |

The comparison favours v3 on size and on the shortest components. The FAKED gap with B is mostly
**document gaps** (nesting, the list guard, the abandoned action), not model gaps. B's author knew
the amendments well enough to avoid them, which is the point of the UNCLEAR list.

---

## 6. v3 changes needed, smallest first

### Wording (one sentence or one example each)

1. Show a required port's spelling beside `optional(…)` (item 2).
2. Fix the §2.1 table: a subroutine's states are optional (item 12).
3. "A fragment's transitions may carry ordinary guards" (item 13).
4. "A trait without memory has no slice" (item 10).
5. P7: "any accepted transition handling an `armOn` event, raised ones included" (item 11).
6. P6: give the subroutine and host schedule paths, and say instance names collide with schedule
   names (items 7 and 8).
7. P1: one mapper signature, `(value, { input, attempt })`, and fix the `retrying` example (item 5).
8. Rule 7: payload mappers for raise and notify read the pre-turn snapshot and the event (item 15).
9. Rule 4/6: host events fall through from inside a subroutine to host ancestors (item 16).

### Syntax (one short example each)

10. Rule 10 nesting: a fragment with `traits` in its contract and its filling (item 9).
11. Story key seeding for lists (item 6), plus one `story.machine(fragment)` example under rule 11.
    Nobody used it, which suggests it is not discoverable.
12. A typed helper or handler alias for shared handlers (item 3).
13. A view read for history's remembered child, or a statement that there is none (item 19).

### Plan decisions

14. Machines O1: allow namespaced `operations`, or flatten v3's examples (item 1).
15. Machines O2: `is` accepts a state path (item 4).
16. Operations O3 `optimistic` example, and Testing O1 "send runs its turn" (items 17 and 18). These
    are plan gaps, independent of fragments.

### Small features

17. A list-level guard port for `Add` / `Remove` (item 14).
18. Decide open question 3: let `abandoned` raise into unguarded hostEvents, so a late strike can
    start the lockout when it settles. Or keep the documented delay and say so in §6, "left out".
    The build shows it is visible behaviour.

### Cuts

None suggested by this build. Every v3 concept was used, except nesting and fragment-alone testing.
Both are better fixed by an example (items 10 and 11) than cut. Rule 10 is cheap once shown, and
testing alone is a principle. `.pending` was used once, but no other tool covers it.
