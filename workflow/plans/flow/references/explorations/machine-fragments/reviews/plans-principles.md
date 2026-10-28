# Review of the v3 plan edits (principles lens)

**Scope:** `git diff -- workflow/plans/flow/*.plan`, read together with `references/design/principles.md`
and `references/design/minimal-library.md`. Line numbers are those of the edited plans
(`Machines.plan:Lnn`, and so on).

**Severity:**
- **blocker**: a reader cannot use the model from the plans as written.
- **major**: a principle violation, a word with two meanings, a statement made twice, or an
  unrecorded scope change.
- **minor**: wording.

## 0. Verdict

The edits mostly keep the plans' voice: short, normative, present tense, with `@plan` references
instead of rationale. They are not bloat for the most part. Machines grew from 185 to 317 lines
(+71 %). That pays for:

| Addition | Approx. lines |
| --- | --- |
| Fragments (O9, O10) | 60 |
| Fused turns and total deliveries (O3) | 16 |
| History, `armOn`, arming ids, readable deadlines | 15 |
| Guard inputs | 6 |
| Three decisions | 13 |
| Four verification items | 9 |

That is proportionate to the scope. Three spots are overgrown:

- the list paragraph in O9;
- the third paragraph of O10, which CommandLine repeats;
- the `abandoned` paragraph in Operations O3.

The plans have four problems:

1. **One blocker:** the transition shape in Machines O2 never gained `raise` or `notify`. A reader of
   the plans alone cannot write the fragment model's two core moves.
2. **Five words now have two or more meanings:** `retry`, `key`, `abandoned`, `guard`, `optional`.
3. **Rules are said twice or more:** delivery totality appears in five places, and the construction
   reject list in two.
4. **Version 1 scope changed silently:** FlowState now puts fragment and history proofs in the S1
   and S3 gates without a decision, and `minimal-library.md` still lists history states as a
   version-1 non-goal.

---

## 1. Readable from Machines O9/O10 alone?

**Mostly yes.** O9's first two paragraphs (L218-232) define the two kinds, placement, lifetime and
`resetOn` well enough for someone who never saw the proposal. O10 states the boundary rules clearly.
Four gaps stop a newcomer:

- **Blocker 1. `raise` and `notify` are never given a syntax.** O2's `on` shape is still
  `{ target, guard?, updateMemory?, actions? }` (Machines.plan:L66). O3 talks about "the callbacks
  it notifies … the events it raises" (L99), and O9 and O10 say "raises facts into its fragments",
  but no plan shows `raise: [E.child.X]` or `notify: [callbacks.x.from(f)]`. Nor does any plan show
  how a fragment uses its ports in its own transitions (`guard: guards.canEdit`,
  `target: exits.Done.from(f)`).
  - **Fix:** extend O2's `on` shape to `{ target, guard?, updateMemory?, actions?, raise?, notify? }`.
  - Add one O9 sentence: "A fragment uses its ports as `guard: guards.x`, `notify: [callbacks.x]`
    and `target: exits.X`; payloads use `.from`, as events do."
- **"Port" and "filling" are used but never defined** (L221, L237). Add to O9: "A contract's ports
  are input, guards, callbacks and exits; the host's block for an instance is its filling."
- **The body of a subroutine with states is not described.** "The body … returns on, schedules and
  fillings" (L221) omits the `default` and `states` tree that a stateful subroutine's body needs.
- **`.at(state)` (L225):** say whether it takes a path string. The definition has no `S` yet, so a
  string is forced; the plan should say so.

---

## 2. One canonical form, and words with two meanings

| Word | Meanings now | Where | Fix |
| --- | --- | --- | --- |
| **`retry`** | `O.x.retry(attempt)` reconciles one Attempt; `retry: { on, schedule }` is an automatic policy; `retrying` is an outcome | Operations.plan:L138 vs L145 | **Major.** Rename the option (`retryOn: { tags, schedule }`, or `autoRetry`). Two opposite safety meanings under one word is exactly the H5 confusion the plans guard against. |
| **`key`** | operation key (`key(params)`, Operations O1); an activity's canonical parameter key (Machines O6); "disjoint memory keys" (Machines O3); a list instance key, a `.list({ key })` option and a `Remove { keys }` payload (Machines O9) | Machines.plan:L104, L171, L242-248 | **Major.** Call list identity `id` (`.list({ id })`, `E.invites.id(k)`, `Remove { ids }`). Say "memory fields", not "memory keys". |
| **`abandoned`** | a subroutine left without an exit (Machines O2); the commit option that receives late results (Operations O3) | Machines.plan:L83; Operations.plan:L97 | **Major.** These meet in one sentence ("abandonment by host transitions" next to "every abandoned handler"). Rename the commit option (`late`, `afterLeave`), or call the subroutine case "left". |
| **`guard`** | the transition field; the `guards` port; the definition helper `guard(path?, g)` | Machines.plan:L30 | **Minor.** Rename the helper (`Def.typedGuard`, or one `Def.at(path, { guard })`). |
| **`optional`** | flow's `optional(...)` port marker (Package export), next to Effect's `Schema.optional` in the same files | Package.plan:L14 | **Major for agents.** Both will be imported side by side. Use a port-specific spelling (`port.optional(...)`, or `.optional()` on the declaration). |
| **`input`** | actor input; fragment input; `{ input }` in commit mappers (the admitted commit input) | Machines O1/O9; Operations.plan:L88 | **Minor.** Each is "the data fixed at start", so they are related. Keep, but write "the commit's admitted input" once in Operations. |
| **"fenced"** | commit activation fencing (Operations O3); the older "fencing ensures a revert never overwrites newer data" for optimistic writes | Operations O3, O5 | **Minor.** Keep one meaning. |

**One canonical form:**

- The filling shorthand "A bare token is shorthand for `{ target: token }`" (L239) restates O2's
  `on` rule. Cut it, or point to O2.
- Machines O6 now lists `notSent` for **all** finite actions (L176), while Operations defines
  `notSent` for commits only. Write "commits also declare `notSent` and `retrying`".

---

## 3. Said twice, or with the wrong owner

| Rule | Places | Fix |
| --- | --- | --- |
| **Deliveries are total** | Machines O3 (L108-112); Machines D2 (L285-288); Machines O10 (L273, "undeliverable deliveries"); CommandLine O5 (L104); Operations O3 ("each run must be correct alone") | **Major.** Keep O3 as the rule and D2 as the reason. O10 and CommandLine should only cite @O3. |
| **Construction rejects and `flow check` pruning** | Machines O10 third paragraph (L272-279); CommandLine O5 (L103-110), nearly verbatim | **Major.** Machines should say only "construction rejects every violation of @O3, @O9 and @O10". `flow check` behaviour (state-token pruning, warnings) is CommandLine's to own. |
| **Fencing** | Operations O3 (owner); Machines O6 (L178-179); Persistence O6 | **Minor.** Machines O6 should keep only the reference. |
| **The `abandoned` turn rule** ("an alternative whose target would exit a state holding a fenced commit … counts as denied … A late result may move an idle user, never a busy one") | Operations.plan:L99-106 | **Major, wrong owner and hard to read.** It is a Machines turn rule (what a fused transition may target), written inside Operations. It also reverses v3's settled "abandoned never moves the actor" (v3 P10, E5): `abandoned` may now raise into root traits, whose callbacks may move the host. Either move a plain version to Machines O3 and record the reversal as a D-item, or return to "abandoned writes memory only". The aphorism in its last sentence is not normative; cut it. |
| **Overlap behind a non-token guard is a pre-commit defect** | Machines O3 (L106-107); O10 (L277-279); CommandLine | **Minor.** State it once, in O3, in plain words: "If fused parts that write the same field are separated only by a non-token guard, overlapping at run time is a pre-commit defect." |

---

## 4. Decisions

| D-item | Sound? | Minimal? |
| --- | --- | --- |
| Machines D1: fragments do no I/O | Yes; it is the comparison's main finding | Yes |
| Machines D2: deliveries cannot be refused | Yes | Yes |
| Machines D3: optional guards allow | Sound as a policy | It reads as guidance more than a decision. Acceptable. |
| Operations D1: commits are fenced | Yes, and it honestly states the breaking change (outcome handlers outside the starting state move to `abandoned`) | Yes |
| Operations D2: a commit may declare retry | Yes; it records the reversal of "never retries automatically" | Yes, but see the `retry` naming in §2 |
| Operations D3: uncertain targets; `notSent` | Yes | Yes |
| **Missing:** `abandoned` may move the actor through raised trait callbacks | It reverses a settled v3 decision | Record it, or revert it (§3) |
| **Missing (FlowState):** fragments, history and `armOn` are in version 1 | See §5 | Needed |

---

## 5. Scope: version 1, silently

- **Major. FlowState folds the new proofs into existing gates without a decision:**
  - Machines V10 goes into S1;
  - V11 to V13 go into S3;
  - Operations V11 and V12 go into S4;
  - Testing V10 goes into S7.

  The fragments exploration was "not part of version 1" (principles.md). The earlier fragments
  draft proposed a stage after S3.

  **Fix:** add a FlowState decision ("fragments, history and readable schedules are version 1"), or
  a stage S3b with its own gate. Note that `abandoned` and fencing need S4 (Operations), so
  fragment proofs that touch commits cannot pass at S3.

---

## 6. Design documents the edits now contradict

| Document and line | Statement | Status |
| --- | --- | --- |
| `minimal-library.md:547-548` | "Documented non-goals for version 1: … **history states** …" | **Contradicted** (Machines O2, `S.X.history`). Update it. |
| `minimal-library.md:444`, `:465`, `:740` | snapshot `timers` deleted; "a countdown puts `dueAt` in memory"; snapshot timers → Inspection | **Contradicted** (Machines O8 `schedules.….dueAt`). Update all three. |
| `minimal-library.md:282-283` | `unknown` "fires for a commit that may have reached the server: cancelled after sending, restored mid-flight, **or abandoned**" | **Contradicted.** Abandoned commits now go to the `abandoned` handler (Operations O3). |
| `minimal-library.md:287-290` | `flow check` **warns** when a transition leaves a state waiting on a commit's outcome events, "Leaving can be intended" | **Contradicted.** Outcome handlers outside the fenced state are now construction errors, and late results go to `abandoned`. |
| `minimal-library.md:276-278` | optimistic writes revert "on failure or defect" and stay on `unknown` | **Out of date:** add `notSent`, `interrupt` and `revertOnUnknown`. |
| `minimal-library.md:190` | internal events are referenced only from schedules, `onContext` and outcomes | Still true for host internal events. Add a note that fragment `hostEvents` are raised, and that internal events may be declared `uncertain`. |
| `machine-fragments/principles.md` (header) | "Status: exploration, not part of version 1" | **Contradicted** by §5. Update after the FlowState decision. |
| `design/principles.md` | no direct contradiction found | The Machines row ("memory holds keys and drafts, never copies") still holds. |

---

## 7. Other findings

- **Minor.** Machines O4 (L134) says `check()` evaluates raise payloads, but not what it reports when
  a raised event is **unhandled**. Is it Denied with a framework code, or Unhandled? Name the code.
- **Minor.** The list paragraph (L242-249) grew beyond v3: `owner: "host"`, `canAdd`, `canRemove`,
  host-raised `Remove` never refused, removal after other parts, and the delivery rule for raised
  `Add`. These are correct but dense. Consider cutting `owner` (use `canAdd` / `canRemove`, or
  declare the list's events as `hostEvents` in the contract) and moving the delivery clause to O3.
- **Minor.** The definition helpers `handler(path, h)` and `guard(path?, g)` (L29-31) are new
  authoring API introduced in a sentence of O1. List them in the vocabulary that agents read. They
  are not Package exports, so they live only here.
- **Minor.** Testing O1's "send runs its turn before the next command" (Testing.plan:L29) is a
  general Story rule, and a welcome one. It is not fragment-specific; keep it.
- **Minor.** Persistence, Inspection, Package and Diagnostics are clean, short and in voice.

---

## 8. What to change, smallest first

1. **Machines O2:** add `raise?` and `notify?` to the `on` shape. Add one O9 sentence on using ports
   (`guards.x`, `callbacks.x`, `exits.X`) (blocker 1).
2. **O9:** define "port" and "filling" in one sentence; describe a subroutine body's
   `default`/`states`; say `.at` takes a path string.
3. **Machines O6:** limit `notSent` and `retrying` to commits. Cut the repeated fencing sentence and
   the "bare token is shorthand" sentence.
4. **O10 third paragraph:** reduce to "construction rejects every violation of @O3, @O9 and @O10".
   CommandLine O5 keeps the `flow check` detail.
5. **Rename:**
   - the commit `retry` option;
   - list `key` to `id`;
   - the commit `abandoned` option, or the subroutine verb;
   - the `guard` helper;
   - the `optional` port marker.
6. **The `abandoned` turn rule:** move it to Machines O3 and record the reversal as a D-item, or
   restore "abandoned writes memory only".
7. **FlowState:** add the version-1 decision, or a stage, for fragments, history and readable
   schedules, with commit-dependent proofs at S4.
8. **Update `minimal-library.md`:** history non-goal, snapshot timers and `dueAt`, `unknown` on
   abandon, the leave-while-waiting warning, optimistic reverts. Update the exploration's status
   line.
