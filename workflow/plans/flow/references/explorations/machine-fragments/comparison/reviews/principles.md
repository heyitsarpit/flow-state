# Build comparison: principles review

This review looks at three apps ([apps.md](../apps.md)), each built in four systems:

- **A**: [proposal-v2](../build-a-v2.md)
- **B**: the locked-island split ([build](../build-b-locked-split.md),
  [spec](../spec-b-locked-split.md))
- **C**: the single stateless fragment ([build](../build-c-single-fragment.md),
  [spec](../spec-c-single-fragment.md))
- **Baseline**: plain machines ([build](../build-baseline.md))

The lens is the same as in the proposal reviews: correctness first, then reading at a glance, then
brevity, with agents as the main authors.

## How I counted

I recounted every code block myself. A script reads the file name in each block's first comment
(or the `###` heading in the baseline) and counts **non-blank, non-comment lines**.

- Operation and service code is **excluded**: only the baseline writes it out, and the others treat
  adapters as out of scope.
- Stories are counted separately.

The builds' own metrics blocks use different methods: some include comments, some include blank
lines. Neither those numbers nor this file's numbers should be compared across methods.

---

## 1. Line counts

| | A (v2) | B (split) | C (single) | Baseline |
| --- | --- | --- | --- | --- |
| Shared fragments or helpers | 261 | 265 | 369 | 11 (helpers) |
| **Sign-in**: app fragment + definition + machine + components | 161 + 13 + 33 + 92 = **299** | 38 + 110 + 74 = **222** | 24 + 95 + 68 = **187** | 43 + 133 + 96 = **272** |
| **Signup**: definition + machine + components | 65 + 160 + 191 = **416** | 42 + 120 + 192 = **354** | 33 + 98 + 169 = **300** | 59 + 170 + 177 = **406** |
| **Issues**: definition + machine + components | 54 + 207 + 169 = **430** | 48 + 146 + 150 = **344** | 47 + 148 + 149 = **344** | 58 + 177 + 165 = **400** |
| App code (three apps) | 1,145 | 920 | 831 | 1,078 |
| **Total with shared** | **1,406** | **1,185** | **1,200** | **1,089** |
| Stories | 204 | 149 | 182 | 184 |
| `// FAKED:` markers in code | 21 | 13 (+1 ASSUMED list) | 27 | 21 |

**Across these three apps, no fragment system is smaller than the baseline.**

- **B and C** write about 15–23 % less host code (definition, machine and components), but pay for it
  in shared fragments that are mostly used once.
- **A** is the largest, about 29 % above the baseline. Its I/O contracts (`requests`, `abandoned`,
  outcome maps) cost lines in both the fragment and the host, and it adds a single-use 161-line
  subroutine for the two-factor step.

---

## 2. Per app

### 2.1 Two-factor sign-in (a step)

| | Flow visible at a glance? | New concepts used | FAKED | Fits or fights |
| --- | --- | --- | --- | --- |
| **Baseline** | **Yes.** `TWO_FACTOR: [ENTERING, VERIFYING, LOCKED_OUT]` is the spec. | none | 4: resend cooldown as memory + counter; lockout deadline copied for the countdown; the resend handler repeated on two states | Fits the sequence. Fights the one overlapping concern (the resend cooldown across all three sub-states). |
| **A** | **Split across two files.** The host reads `{ TWO_FACTOR: TwoFactorStep }` plus request bindings; the flow lives in a 161-line single-use subroutine. | subroutine, traits, `requests`, `kind`, `operation`, `outcomes`, `notSent`, `abandoned`, `exits`, `raise`, `notify` (~12) | 2: a hand-kept `resending` flag, because the one-outstanding-call rule rejects a turn instead of denying; the lockout deadline copied | Fits "Back to password keeps nothing": abandoning the step drops everything. Fights reuse: `CommitWithRetry` cannot nest inside the step, so its result handling is inline. The subroutine is used as **scoped memory**, not as reuse. |
| **B** | **Yes.** `TWO_FACTOR: [ENTERING, VERIFYING, { LOCKED_OUT: Timeout }]`, plus two traits `.at("TWO_FACTOR")`. The machine reads like today's. | trait, subroutine, `.at`, `exits`, `raise`, `guards`, `callbacks` (~7) | 2: guard by leaf-path string prefix; the host's own step memory reset by hand | Fits best. Side concerns (code field, resend cooldown) are traits on the step; the lockout is a state. |
| **C** | **No.** The lockout is invisible in the state list: it is `strikes.lock.until !== null`, rebuilt by guards and views. | fragment, `.at`, `raise`, `callbacks`, `guards` (~5) | 2 here, plus 16 inside its shared fragments | Fights. With no fragment states, a mode of the step becomes timestamps in two nested slices. |

### 2.2 Signup wizard (a flow)

| | Flow visible? | New concepts | FAKED | Fits or fights |
| --- | --- | --- | --- | --- |
| **Baseline** | **Yes:** WIZARD pages, CONFIRM_DISCARD, `SUBMITTING: [SENDING, BACKING_OFF]`. | none | 4: `returnTo` history; four-way `Keep`; Cancel declared per page; a `role!` assertion | Fits the sequence. Fights drafts and validation: every field is memory, handlers and hand-written validity. |
| **A** | **Yes:** `FILLING` pages, `DISCARD: Confirm`, `SUBMITTING: CreateAccount`. | traits, subroutines, request binding, `abandoned`, `exits` | 6: history (3), invites as a host array (3) | **Fits best of all four.** `CommitWithRetry` matches "retry Busy 1/2/4 s, never retry unknown → UNSURE" almost word for word. Root `Field` traits keep drafts for free. |
| **B** | **Yes:** flat pages, `CANCELLING: Confirm`, `SUBMITTING`, `BUSY: Timeout`. | traits, subroutines, `exits` | 3: history; retry policy written as host code; `FieldList` duplicating `Field` | Fits, except the retry policy is host code the next feature will copy. |
| **C** | **Partly:** pages are states, but the discard dialog is a flag. Next and Submit stay enabled under it unless every guard reads the flag. | fragment, `.at`, callbacks | 5: fields at the root by convention (`.at` would reset drafts); a freeze-while-submitting guard filled per field; the dialog flag; a cast | Fights. Without states in fragments, a modal dialog cannot refuse what is under it. |

### 2.3 Issue list (a screen of many pieces)

| | Flow visible? | New concepts | FAKED | Fits or fights |
| --- | --- | --- | --- | --- |
| **Baseline** | **The tree is honest but small** (`IDLE`, `HOLDING`, `DELETING`). Everything else is a memory soup: `flash` + `flashes`, `pinning`, `selected`, two search fields. | none | 7: flash mode, per-row pins, clear-selection-on-query by convention, row id on the error, `unknown` cannot revert | Fights. Five overlapping concerns cannot be states. |
| **A** | **Yes:** `BROWSING`, `DELETING: DeleteIssues`, plus traits `searchSettle`, `hold`, `flash`. | traits, a request-bound subroutine, `abandoned` | 8: per-row pins (host array, row id via the error and the Attempt key), `CommitWithRetry` with `maxRetries: 0`, a review-fix note | Fits the overlapping concerns. Misuses `CommitWithRetry` as a single-shot commit just to get fenced outcomes. |
| **B** | **Yes:** `BROWSING`, `HOLDING: Hold`, `DELETING`, with `search`, `searchSettle`, `pager`, `selection` and `flash` traits. | traits, subroutines | 1 here, plus the shared host-only ones | **Fits best.** Each concern is a named trait, and bulk delete is a visible sequence. |
| **C** | **Mostly:** `OPEN: [BROWSING, DELETING]`, with fragments `searchBox`, `selection`, `pins`, `flash`, `hold`. | fragment, `.at` | 4: clear-selection as five repeated raises; row id; hold's stale `Held` | Fits nearly as well as B. Holding is a flag, not a state. |

---

## 3. Which system fits which kind of app

| Kind | Best | Why |
| --- | --- | --- |
| **Steps** (one sequential task with timed modes) | **Baseline ≈ B** | The state list is the spec. B adds traits for the one overlapping concern without hiding the flow. A moves the flow into a single-use subroutine; C moves modes into memory. |
| **Flows with I/O policy** (wizard + submit with retry/backoff/uncertainty) | **A** | A reusable retry step that owns its I/O is the one thing only A can express. B and C repeat the policy as host code; the baseline repeats it per machine. |
| **Screens of many pieces** (overlapping concerns) | **B, then C, then A** | Traits name each concern. The baseline's state tree cannot hold them, and they become memory plus root schedules. |

---

## 4. What the FAKED patterns say

| Pattern | Who faked it | What it says |
| --- | --- | --- |
| **Host-only events** forced public | B (4 fragments), C (7 fragments) | **A missing concept.** Without a host-only sender list, the UI can forge facts the host owns (`Field.Set`, `Debounce.Input`, `Flash.Show`, `Strike`). A has `hostEvents` and fakes none of these. This validates v2's three sender lists. |
| **No history** ("Keep" returns to the page Cancel came from) | **all four** | **A missing concept, in every system.** Each one writes `returnTo` plus one guarded alternative per page. Shallow history is standard (UML and SCXML history pseudostates). |
| **Timer deadlines copied into memory; "arm now" via counter + `restartOn`** | all four: A 5, C 5+, baseline 3, B 2 (plus `Countdown`/`Timeout` duplication and a stray tick) | **A missing concept below fragments.** Snapshots expose no schedule deadlines (Machines O8), so every countdown copies the deadline beside the schedule that enforces it. A readable `dueAt` for armed schedules would delete most timer fragments' memory, A's `lockedUntil`, the baseline's `resendUntil`/`lockedUntil`, and B's need for two timer kinds. |
| **Per-row instances** (invite list, pins in flight) | A, B, C (the baseline too, as memory) | Fragments are static; dynamic keyed instances are a big feature. All three fragment systems fall back to host arrays. **Correct to leave out for now.** |
| **Row identity for concurrent commits** (outcome mappers see values only) | all four | **A missing concept at the Operations layer, not a fragment gap.** Mappers that also received the commit's input or key would fix pins in every system. |
| **Modes kept in memory** | C (≈8), baseline (6), B (2), A (≈1) | C's "no states in fragments" is the largest single source of fakes, and of hidden flow. **This validates the trait/subroutine split.** |
| **Retry policy as host code** | B, C, baseline | A's I/O fragments pay off here: signup in A is the only build where "never retry unknown" is guaranteed by a reused piece. But it was the **only** app where they paid. Sign-in could not reuse `CommitWithRetry` (no nesting), and issues misused it (`maxRetries: 0`). |
| **Scoped memory for a step** | B (step memory reset by hand), baseline (resets everywhere), A (uses a single-use subroutine to get it) | **Node memory (deferred in v2) is wanted.** A's `TwoFactorStep` exists mainly to scope memory, which goes against "extract on the second use". |
| **Outstanding call not readable** | A (`resending` flag) | v2's "a second call rejects the turn" should be a **denial** visible to `check()`, not a turn rejection. |
| **Spec gaps** | B (where subroutine memory lives; may ordinary transitions `raise`; guards on string paths) | Clarity only. A and C had none marked. |

---

## 5. Do fragments beat the baseline enough to be worth it?

**On size: no**, not across these three apps. Every fragment system is as large or larger in total,
because most fragments are used once (A: 6 of 8; B: 5 of 10; C: 9 of 11). The yardstick says
extract on the second use. These builds extracted early to show the pieces.

**On correctness and structure: yes, for three things:**

1. **`Field`**, reused 5–7 times across apps. It removes per-field memory, handlers, the
   error-after-first-edit flag and drift. All three fragment systems reused it unchanged.
2. **Lifetime by placement.**
   - Root traits keep wizard drafts for free.
   - `.at("TWO_FACTOR")` or a subroutine makes "Back keeps nothing" free.
   - The baseline does both by hand resets, which are conventions.
3. **Naming overlapping concerns on screens.** Traits for debounce, selection, flash and pager turn
   the baseline's memory soup into named, testable pieces.

**A's request ports earn their cost once:** signup's retry. Elsewhere they added lines (sign-in
bindings, `abandoned: {}` twice, the misused delete) and a hand-kept flag.

---

## 6. Ranking

| Rank | System | Reasons |
| --- | --- | --- |
| **1** | **B** (with v2's `hostEvents`) | Flow visible in all three apps. Fewest concepts of the two-kind systems (~7–10). Machines read like today's. Best fit for steps and screens. Its biggest fake (public host-only events) is closed by one concept v2 already has. The lost item is reusable I/O policy (signup retry as host code), a known and contained cost. |
| **2** | **A** (v2) | The only system that reuses I/O policy, and correct by construction there (D2, D4, H5). It is also the largest (+29 % over the baseline) and has the most concepts (~15–18). It hides the sign-in flow in a single-use subroutine, and misfits two of three apps' I/O. |
| **3** | **Baseline** | Smallest, and steps read as the spec. But overlapping concerns become memory soup, nothing timed or field-like can be shared, and "keep nothing" and "keep drafts" are hand conventions. |
| **4** | **C** | The smallest host code, but the most fakes (27). Modes in memory hide the flow (lockout, dialog), a modal flag cannot refuse what is under it, and all host-only events are public. It confirms that fragments need states. |

**A and B are close under correctness first.** The deciding evidence is that A's extra correctness
machinery paid off in one of three apps and cost readability in the other two. B plus `hostEvents`
gets the same correctness on everything except reusable I/O policy.

---

## 7. Smallest set of changes to the leading system (B), suggested by the builds

1. **Add `hostEvents`** (from v2): a host-only sender list. Removes B's most frequent fake and the
   UI-can-forge-facts hole.
2. **Add a shallow history target** (UML/SCXML), for example `S.PAGES.history`: "return to the child
   that was active when left". Removes `returnTo` and the four-way `Keep` in every build.
3. **Make armed schedule deadlines readable** in the snapshot (`dueAt`). Removes the copied
   deadlines and the counter idioms, and lets one timer piece serve both B's `Timeout` and
   `Countdown`. This is a Machines O8 change, useful without fragments too.
4. **Let outcome mappers receive the commit's input or key** (an Operations change), so concurrent
   per-row commits can be attributed. This fixes pins in every system.
5. **Clarify B's three spec gaps:**
   - where subroutine memory lives (`s.memory.<STATE>`);
   - that ordinary transitions may `raise`;
   - that guards test position with tokens (`S.X.is`), not string prefixes.

Not suggested by the builds:

- dynamic keyed instances (big, and every system lived without them);
- node memory (wanted, but already deferred in v2);
- I/O requests in fragments. Revisit them if a second retry policy appears. Then B's host retry
  code is the evidence, and v2's request semantics are the ready design.

If the user keeps **A (v2)**, the builds argue for:

- making a second outstanding call a **denial**, not a turn rejection;
- not wrapping single-shot commits in `CommitWithRetry`;
- adding items 2–4 above.

---

## 8. Fix before the user reads it (clarity only)

**A (build-a-v2.md)**

1. Say at the top of 2.1 that `TwoFactorStep` is single-use and exists for its lifetime ("keep
   nothing on Back"), not for reuse.
2. The two "v2 review fix" markers are not workarounds. Label them "relies on review fix" so they
   are not counted as fakes.
3. Explain `abandoned: {}` in sign-in in one line: it accepts losing a late result after Back.
4. Explain the `maxRetries: 0` choice where `DeleteIssues` is defined, or use a plain host commit.
5. State the counting method in the summary metrics; 285 there vs 261 non-comment lines here.

**B (build-b-locked-split.md)**

1. Move the ASSUMED A1/A2 readings next to their first use, not only in the preamble.
2. One line at the definitions saying why there are both `Countdown` and `Timeout`.
3. Replace the leaf-path string-prefix guard, or explain it where `canEdit` is filled.
4. Flag in the component that "select all on this page" trusts the ids the view sends.
5. Give per-app totals; the totals table is per file kind only.

**C (build-c-single-fragment.md)**

1. At the sign-in state list, say where the lockout lives; a reader looking for it in `states`
   will not find it.
2. At the signup definition, list which fields belong to which page (currently only components
   say it).
3. Say plainly that Next and Submit stay enabled under the discard dialog, and that this differs
   from a modal state.
4. Explain the `?.` on fragment slices once, instead of leaving readers to infer it.
5. Note Hold's stale `Held` being refused, at the Hold fragment, not only in the reflection.

**Baseline (build-baseline.md)**

1. Relabel `// FAKED: informal reuse` (6) as something like `// HELPER:`. They are shared helpers,
   not workarounds, and they inflate the fake count.
2. Mark the operations and service blocks as outside the comparison; the other builds omit them.
3. State the counting method (it includes blank lines; the others do not).
4. At the issue-list definition, list the five overlapping concerns and where each lives in
   memory. That is the key fact a reader needs.
5. Point from the Cancel-per-page duplication to the `Keep` chain, so the history workaround reads
   as one thing.
