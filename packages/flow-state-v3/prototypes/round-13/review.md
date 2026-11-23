# Round 13: final independent review

Status: advice. **Everything here is proposed.** Reviewer: Opus, did not build round 13. Commit `e227a47e` (code at `3cce106b`). Marks: **[ran]**, **[read]**, **[reasoning]**.

Ages of code:

| Age | Commits |
| --- | --- |
| older | round 12 and before |
| r13-checkpoint | `ea087ca1`, which the mid review saw |
| r13-story | `1ee5e5f7`, `0d3c1137`: the Stories, `flow story`/`trace`/`graph`, the graph gate, the `turn` parts. **Not reviewed until now** |
| r13-post-mid | `42a1f4e8`: D221 and D222 redone, mid M3's `flow check` fix, `events.uncertain`. **Not reviewed until now** |
| r13-lies | `4bfecbfd` to `3cce106b`: D228, the lie records. **Not reviewed until now** |

Setup: Bun 1.4.2. A detached worktree at `scratchpad/r13-final/wt`, with `node_modules` linked to the main checkout's. Every command ran under `watch.ts` or `perl alarm`, at most 6 deterministic processes at once. Swapouts stayed at 25,790,043 from start to end: no swapping [ran].

## Verdict

**The Story API, the three commands and D228 can be built on. D221 and D222 cannot yet: each has one hole that typed code reaches with an ordinary release.**

- D221 is the right shape. A changed key is a changed op, and a standard upfront contract replaces three failed inferences. For a release that adds, removes or renames a key field, I could not strand a hold or send beside one [ran].
- But the version is the key field **names**. Change a key field's Schema and keep its name, and a second charge goes out beside the unsure one (H2).
- D222's rule is right: one default per field, at both doors. But the implementation evaluates each default once and caches it, so every actor gets the same per-call default (H1).
- The graph gate is sound in one direction only, and its own checks are not falsified (M1). Its 0 disagreements are real, and the 62 untaken edges look reachable.
- 16 of my 30 mutants die. 7 of the 14 survivors are D221 paths (M2), and one of those sends beside an old hold.

**The Highs:**

- **H1. D222's one default is computed once per door, then reused.** A `withConstructorDefault(Effect.sync(() => new Date()))` or a random id gives every actor the same value. Creation and restore freeze different values. Effect's own `make` gives a fresh value each call. This is a regression from the first D222 [ran].
- **H2. D221 versions an op by its key field names, not by the key's Schema.** A release changes `k` from `S.String` to `S.Number`. There is no `OldVersionLane`. `Go { k: "1" }` mints a second lane, `{"k":1}`, and **sends `att-1-2` beside the unsure `att-1-1` for the same order** [ran K1].

**Answers in short:**

- **Q1 (D221):**
  - Correct for changes to the field set.
  - The runtime never strands a hold. Typed code can, unless the restored `unknown` handler names the hold key-less, or someone writes an `as never` cast.
  - Two Attempts beside one: not for a field-set change [ran K5]. Yes for a change to a key field's Schema (H2).
  - The cost to a real app is large: every key of the op is blocked, with no end date, and the app sees `Rejected` (M3).
  - The cast is not acceptable for production (M3).
  - D221's paths are mostly unpinned (M2).
- **Q2 (D222):** the rule is sound. The implementation is wrong for per-call defaults (H1).
- **Q3 (the graph gate):**
  - Direction 1 has teeth: an over-shadowing graph and three misreporting runtimes all go red.
  - Two of its five checks compare the runtime's copy of the alternative's fields with themselves.
  - Direction 2 is not checked at all.
  - The gate's own checks are not falsified, and the gate is in no routine run.
  - `cli/graph.ts` imports only `conformance/graph.ts` and `check.ts`'s `poison`; `graph.ts` imports only types. They share no logic with the runtime, only the `Compiled` data.
  - The 62 untaken edges look reachable (M1).
- **Q4 (the Stories and D224):**
  - The Stories run the real runtime through the suite's harness on the suite's typed fixtures. They are a real API trial, but they add little coverage the suite lacks (L2).
  - `describe`'s count of 0 is real for fake closures. **`list`'s 0 is a literal**: a `list` that runs every Story still prints 0 (M4).
  - Three differences from 2.10 are not logged (L1).
- **Q5 (D228):**
  - Sound for the verdict. A stale record falls back to the whole suite, and an edit that no longer applies throws.
  - `--full` is enforced by nothing (L3).
  - A lie whose trigger stops firing can pass as "vacuous", but only in the one-lie vacuous map, and that lie now has a record, so the path is not taken at this tree.
- **Q6 (reruns):** every claim reproduced (below).

**What I'd read first:**

- H1: `conformance/compile/memory.ts:45-56` (`constructorDefault`, `defaultOf`), `:60-61`, `:92-93` and `:125`.
- H2: `round-13/lane.ts:539-554` (`sameFields`, `oldVersionLane`) and `round-13/gate.ts:243-247` (the key is the raw input pick).
- M3: `round-13/turn.ts:750-753` and the `as never` in `conformance/typed/round13.ts:45-46`.

## Reproduced

| Item | Claimed | I got |
| --- | --- | --- |
| Suite `--round 13 --no-search` | 761/761 | **761/761**. Output alone 0, unlogged none, removed none, stale lock 0. 69.0 s, 945 MB [ran] |
| `mutate-one` control | `{"killedBy":null}` | **`{"killedBy":null}`**. 207.3 s, peak 1,644 MB, beside the graph gate for its first 70 s [ran] |
| Graph gate with searches | 0 disagreements over 78,543 parts | **0**. 77,522 turns, 78,543 parts, 730 edges, 55 machines, 483 taken, 178 guarded, 62 unmarked, 5 unreached, 3 unsourced, `CartLoaded` injected ×1. 69.7 s, 1,584 MB [ran] |
| Targeted lie gate | 75/75 red, none fell back | **75/75 red, all `[targeted]`**, with `--parallel 6`. 59.7 s, 3,302 MB [ran] |
| `checks/*` | front 67, types 16, story 53, mailq, score, search vacuity | all the same [ran] |
| CLI pins | pass | pass [ran] |

## My mutants

**Written before I opened `RESULTS.md` or `STATUS.md`.** By then I had read:

- `AGENTS.md`, round 12's `review.md` (for its form), `review-mid.md`, `convergence-13.md`, `api-changes.md`, `run-costs.md`;
- `story/*`, `cli/story.ts`, `cli/graph.ts`, `conformance/graph.ts`, `conformance/graph-gate.ts`;
- `falsify.ts`'s lies part, `durable.ts` (`restore`, `placeLanes`), `lane.ts` (`cell`, `oldVersionLane`, `columnOf`, `guardCell`), `turn.ts` (guards, members, parts);
- the code part of `git diff 1f230e00 3cce106b`;
- `round13.scenario.ts` and `typed/round13.ts`.

**How they ran:**

- Each mutant was applied in its own copy of `conformance/` and `round-13/`, and each edit matched exactly once.
- Each ran the suite as `mutate-one` does (`--round 99 --no-catalog`).
- A survivor of the suite then ran its own gates: front, types, story, CLI pins, and the graph gate without searches.

| Part | Killed by the suite | Killed only elsewhere | Survivors |
| --- | --- | --- | --- |
| D221 runtime (12) | `old-any-actor`, `old-reject-only`, `guard-no-old`, `note-dropped`, `stamped-renamed` | | **`old-held-only`**, `member-names-old`, `retryable-sees-old`, `decline-why`, `samefields-ordered`, `unstamped-collision-unchecked`, `unstamped-one-pass` |
| D221/D222 compile (4) | `restore-decoding-only`, `create-ctor-only` | `keyfield-optional-ok` (front) | `twodefaults-equal-refused` |
| Graph and gate (6) | | `over-shadow` (gate), `no-unsourced` (CLI) | `no-shadow`, `reach-all`, `gate.callback-from-anywhere`, `gate.landing-unchecked` |
| Runtime `turn` parts (3) | | `part-node-root`, `part-target-self`, `moved-to-before`: **the graph gate only** | |
| Stories and CLI (5) | | `E-unchecked`, `lane-sources-memory-only` (story), `describe-runs-handler` (CLI) | **`list-runs-a-story`**, `verdict-any` (likely equivalent [reasoning]) |
| **All** | **7** | **9** | **14** |

**What the survivors mean:**

| Survivor | Meaning |
| --- | --- |
| `d221.old-held-only` (only a `Held` old lane blocks) | A commit **sends beside an old hold that is back on the wire**. Probe K5 under the mutant: 3 requests and 0 declined, against 2 and 1 without it. This is the mid review's W probe again, and still not a case (M2) |
| `d221.member-names-old` | A keyed `retry`/`cancel` with a *new* key names the old hold. The convergence table says it "names nothing"; nothing pins that |
| `d221.retryable-sees-old`, `d221.decline-why` | A keyed `retryable` beside an old hold, and the decline's reason, are unpinned. The reason matters: the app maps `NotSent` by reason (M3) |
| `d221.samefields-ordered` | The table says "fields reordered only: the same version, pinned by `sameFields`". No case runs it |
| `d221.unstamped-*` | The mid review's H1 fix for the hand-closure seam (two passes, a refused collision) has no case |
| `d222.twodefaults-equal-refused` | "Two equal defaults are allowed" is unpinned |
| `graph.no-shadow`, `graph.reach-all` | The graph's `shadowed` and `unreached` marks can be deleted and every gate passes (M1) |
| `gate.*` | The gate's own filling and landing checks can be switched off and nothing notices (M1) |
| `cli.list-runs-a-story` | `flow story list` can run every Story and still print `callbacks run: 0` (M4) |

---

## The questions

### Q1. D221: key fields are an op's version

**Probes** (`ZZ-PROBES`, worktree copy only; each is described well enough to rewrite it):

| Probe | What happened [ran] |
| --- | --- |
| **K1.** Release 1: `charge` keyed `[k]`, `k: S.String`. Hold `{k:"1"}` unsure. Release 2: `k: S.Number`, the same name. `Go {k:"1"}` commits `{k: 1}` | `OldVersionLane` 0. **Two lanes, `{"k":"1"}` and `{"k":1}`; two requests, `att-1-1` and `att-1-2`**; declined 0 → **H2** |
| K5. Release 2 adds `region`; its `unknown` handler does a key-less `retry` | At the boot the restored ending resends the old hold (2 requests). `Go {k:b}` declines while it is on the wire. After `ok`, `Go` sends. **The typed way out works, with no cast** |
| **K4, K4b, K4c.** The same with a key-less `cancel`: after a release, after a plain reload, and live with no reload | **All three are red by oracle (h)** ("may be at the server, and no head on disk says so"). The runtime writes `lane.cancel.Held` and `Released` for `att-1-1`, exactly as a keyed cancel does (K4e) → **M5** |
| K4d. A keyed `Cancel` event after a plain reload | lets go, no oracle fires |
| K6. Reloads | the old hold's `unknown { Restored }` runs again at every boot (unsure 2, then 4 after two more boots). This is older behaviour |

**Can a hold be stranded?**

- **Not by the runtime.** An old hold is reached by its own key (`laneKey` of the exact old key), and by a key-less member in its restored ending (K5).
- **By typed code, yes**, in two ways:
  - the `unknown` handler does not name it key-less (it targets a "check" state like Pay's UNSURE, whose keyed `O.pay.cancel(intent)` spells the *new* key);
  - nobody writes the cast.

  Then every commit of the op declines for that actor, at every boot, with no end. `OldVersionLane` is evidence (`note`), not an issue, so nothing tells the owner [read `durable.ts:402`].

**Can two Attempts be sent beside one?**

- For a change to the field set, no:
  - the old hold on the wire declines a commit (K5);
  - `serialize` queues nothing (suite);
  - two old holds that share a new key both stay (suite).
- For a change to a key field's Schema with its name kept, **yes (H2)**.
- The one guard against sending beside a resent hold is unpinned (`old-held-only`, M2).

**What "the op is blocked for that actor until its old holds end" costs a real app** [reasoning, from K5, K6 and the code]:

- **Every key, not one.** On a collection actor (Desk/Tickets' `rename`, keyed by ticket id), one unsure old rename of `t1` blocks renames of every ticket, until that hold ends.
- **No end date.** An unsure hold ends only by a retry that settles, or by a cancel. A long-lived, persisted actor (one per user) stays blocked across every boot.
- **The app cannot tell why.** The decline is `NotSent { Rejected }`, the same word as a double click. `BesideOldVersion` is evidence only. Pay's `PayNotSent` would show "already paying" forever.
- **A deploy is a migration.** A release that changes a key must ship handler code for the old holds. The typed spelling for that handler is not built yet.

**Is the cast acceptable?** No, not for production.

- `O.charge.retry(({ event }) => keyOf(event) as never)` turns off the check entirely (`typed/round13.ts:45-46`).
- A typo, or a key of the wrong version, names no lane. The member then does nothing, and the op stays blocked with nothing said.
- The upfront contract D221 wants should include the old versions as data. One way:

```ts
// user-defined: charge   existing: transaction, key   NEW: previous (proposed)
const charge = transaction({
  id: "lab/charge",
  input: { k: S.String, region: S.String },
  key: ["k", "region"],
  previous: [{ key: { k: S.String } }], // NEW: release 1's key, as a Schema. The compile stamps each version with fields + Schemas
  /* … */
});
// existing: retry, cancel   NEW: previous[0]
O.charge.previous[0].cancel(({ event }) => ({ k: event.k })); // typed by release 1's key; no cast
```

- That also gives `OldVersionLane` something to name as an issue, and a place for a reason of its own (`NotSent { OldVersion }`).

**Lies (probes built):** K1 is one: a commit that the stamp calls "same version" sends beside an unsure hold. K4 is another, against the harness rather than the runtime (M5).

### Q2. D222's single default

**The rule is sound.**

- One value source per field, the same at both doors.
- `TwoDefaults` for two different ones.
- `Flow.initial`'s constant counts as the default.
- It removes the mid review's M2: a constructor-only input no longer quarantines old actors (`R13-DEFAULTS`) [ran].

**The implementation is wrong for every default that is not a constant (H1).**

- `defaultOf` is evaluated once inside `lazy(...)` for creation, once for restore, and once more at the compile (`compileMemory`'s `TwoDefaults` pass).
- Probe (`round-13/zz-defaults.ts`, worktree only) [ran]:

```ts
// user-defined: ctor, dec   existing: Flow.input, withConstructorDefault, withDecodingDefaultKey
memory: {
  ctor: Flow.input(S.Number.pipe(S.withConstructorDefault(Effect.sync(() => ++i)))),
  dec: Flow.input(S.Number.pipe(S.withDecodingDefaultKey(Effect.sync(() => ++j)))),
}
// Effect's own Struct.make, twice:   ctor 2, 3            (fresh each call)
// Flow creation, twice:              {ctor 4, dec 102} ×2  (frozen)
// Flow restore, twice:               {ctor 5, dec 103} ×2  (frozen, and not creation's value)
```

- **Also:** `TwoDefaults` compares one evaluation of each side by JSON. Two `Effect.sync(() => new Date())` defaults can be refused or accepted depending on timing [reasoning].

### Q3. The graph gate

**Direction 1 (never smaller than what is observed) has teeth** [ran]:

- `graph.over-shadow` gives 295 "taken, and the graph says shadowed".
- Three runtime mutants that misreport a part are red by the gate alone: the node (`part-node-root`), the target (`part-target-self`) and the landing leaf (`moved-to-before`).

**But two of its five checks are self-confirming** [read `turn.ts:977`]:

- A part's `definition`, `at` and `target` are copied from the alternative object the runtime ran.
- So "not an edge" and "another target" can only catch a corrupted evidence record. They cannot catch a wrong choice of alternative.
- The non-trivial checks are three:
  - a filling's leaf is under the placing node;
  - a taken edge is never `shadowed` or `unreached`;
  - the moved leaf lands under the target.
- Choosing the right alternative is the suite's job, not the gate's.

**Direction 2 (never larger unless marked) is not a check:**

- 62 unmarked untaken edges and 178 "guarded" untaken edges are listed, and the gate passes.
- `graph.no-shadow` and `graph.reach-all` survive the gate and the CLI pins.
  - No fixture has a shadowed alternative at all (`shadowed 0`), so rule 13's static analysis has never been tested.
  - The 5 unreached edges are printed, not pinned.

**The gate itself has no falsification:**

- `gate.callback-from-anywhere` and `gate.landing-unchecked` survive. These checks found the round's 13 filling bugs.
- `graph-gate.ts` is in neither `falsify.ts` nor `mutate-one.ts` [read].
- So the `turn` parts that `flow trace` prints are guarded by a gate that no routine run calls (the three `rt.*` survivors of every routine gate).

**Shared code:**

- `conformance/graph.ts` imports only types from `fixtures/compiled.ts`.
- `cli/graph.ts` adds `poison` from `cli/check.ts`.
- Neither imports the runtime, and the runtime imports neither [read].
- What they share is the data. That is right, and it is exactly why the two checks above are tautological.

**Are the 62 reachable?** As far as I sampled, yes.

- Story probes `round-13/zz-reach.ts`: `PAID -Start-> CARD` and `PAID -Done-> IDLE` each took one step after `checkout/paid` [ran].
- The rest [read]:
  - most are unguarded `on` edges of an external event at a reached node;
  - the `[1]`/`[2]` ones are fallbacks after a guarded alternative;
  - many sit on boot-only fixtures (`R`, `M`, `N`, `S`, `V`) whose events no case sends.
- None looks like a graph that is too large. The suite just does not drive them.

### Q4. The Stories and the Story API as built (D224)

**Real behaviour:**

- `run()` boots the round 13 runtime through `makeHarness(port)`, the suite's harness, on the suite's typed fixtures (`payFixture`, `deskFixture`, `ThreeDS`).
- Fakes answer between the runtime's settles, and answers go through the commit's own classification.
- The checks read state, rows, server truth, endings and turn parts from checkpoints [read].
- `story-check` kills `E-unchecked` and `lane-sources-memory-only` [ran].

**But they add little coverage beyond the suite (L2):**

- They are the suite's paths, walked through a new API.
- The fake's dedupe by idempotency key never runs: no Story sends one Attempt twice.
- `release` answers FIFO, so `rename-latest` cannot show what `latest` is for: an older answer that arrives last.
- No runtime mutant of mine died by a Story that the suite or the graph gate missed.

**"No callback runs":**

- `describe`: true and counted, for fake handlers and controls. `describe-runs-handler` dies by the CLI pin [ran].
  - The subject's `Compiled` Slots are not poisoned, as `flow check` and `flow graph` poison them. That is true by construction today, not counted.
- **`list`: not counted.** `callbacksRun: 0` is a literal (`cli/story.ts:128`). `list-runs-a-story` survives (M4).
- Constructing a Story calls `fixture.make(api)` (`story.ts:66`, and `standIn` at `:166`). So importing `story/index.ts` compiles every subject and runs the author's builder functions. 2.10.1 says constructing and discovering start nothing. This is arguably compile, not run, but it is not logged (L1).

**Against design 2.10:** `api-changes.md` logs every row I checked, except the three in L1.

### Q5. Targeted lies (D228)

**Sound for its claim** [read, ran]:

- Each lie is red by its named oracle on its recorded cases. If those cases stop going red, the lie runs the whole suite.
- An edit whose find string vanished throws (`falsify.ts:114`).
- At this tree, 75/75 were red, all targeted.

**A lie whose trigger stops firing:**

- Recorded lies need a red. So a lie whose kill moved elsewhere falls back, and one that kills nowhere fails.
- The **vacuous** path is the exception. A lie in the `vacuous` map that is green everywhere passes if its probe also fires nowhere. A refactor that makes its condition false would pass it silently.
- That map holds one lie (`d154.moved-save-released`). It now has a record, so the path is not taken at this tree.

**Is `--full` enforced before a final commit?** No (L3).

- It is a sentence in D228. Nothing ties `lie-cases/` to the tree that wrote it.
- A stale record is never rewritten in the default mode (`save()` is `--full` only). Every targeted run then pays the whole suite for it, marked only `[full, the record was stale]`.
- The verdict stays honest. Only the cost drifts.

---

## High

### H1. D222's one default is computed once per door and reused for every actor. **r13-post-mid** (`42a1f4e8`), a regression [ran]

- **Where:** `conformance/compile/memory.ts`:
  - `:45-56` (`constructorDefault`, `defaultOf`) evaluate the Schema's default;
  - `:60-61` (creation's `built = lazy(...)`) and `:92-93` (restore's) keep the value in a map;
  - `:125` evaluates it a third time at the compile.
- **Before:** the first D222 called `Struct.make` per creation, which evaluates a constructor default per call.
- **Harm:**
  - `createdAt: Flow.input(S.Date.pipe(S.withConstructorDefault(Effect.sync(() => new Date()))))` gives every actor the same date.
  - A default client id (`crypto.randomUUID()`) gives every actor one id. If that id becomes an entity id or a business key, two actors name one server thing.
  - Creation and restore disagree with each other (4 against 5 in the probe), which breaks D222's own "one default".
  - Nothing pins it: `R13-DEFAULTS` uses `Effect.succeed` constants.
- **Proposed:**
  - Keep the *presence* of a default as compiled data.
  - Evaluate the value at each door, per field, per call: `Struct.makeOption({})` at creation, the codec's decode of `{}` at restore.
  - At the compile, run `TwoDefaults` on the AST (two default annotations), not on values. Refuse two different *constant* defaults. Refuse two non-constant ones outright, since they cannot be compared.
  - Pin it with a counter default: two creations differ, and two restores differ.
- **Cost:** small (one file).

### H2. D221's version is the key field names; a key field's Schema can change under the same name, and a commit then sends beside the old hold. **r13-post-mid** (`42a1f4e8`), the rule as designed [ran K1]

```ts
// K1 (worktree copy). user-defined: charge, Go   existing: transaction, key, release, reload
// rel 1: input { k: S.String, id }, key ["k"].   Go {k:"1"} → commit {k:"1"} → lost: unsure hold att-1-1
// rel 2: input { k: S.Number, id }, key ["k"].   (an id migrated from string to number; the same order)
// reload:          OldVersionLane 0; lane/…|charge|{"k":"1"} kept, stamp ["k"] = current fields
// Go {k:"1"} → commit {k: 1} → laneKey …|{"k":1}: a new lane → att-1-2 SENT. declined 0, BesideOldVersion 0
```

- **Where:**
  - `lane.ts:539-554`: `sameFields` compares names only.
  - `gate.ts:243-247`: the key is the raw input values, so the key text changes with the value's type.
  - `durable.ts:91`: the stamp holds names only.
- **Why it matters:**
  - D221's reason is "the Runtime cannot say whether an old server thing is the new one, so a changed key is a changed op".
  - A key field's Schema is part of the key exactly as its name is. The compile has it as data.
  - The convergence table claims to cover "every case", and this one is missing.
- **Also, nearby:** a restored Attempt's stored input is never checked against the release's input Schema. A `retry` of the old hold resends `{ k: "1" }` into a commit that is now typed `k: number` [reasoning].
- **Proposed:**
  - Stamp each lane with a fingerprint of the key's contract: the field set and each key field's encoded JSON Schema (`toJsonSchemaDocument` of the pick). Compare fingerprints, not names.
  - The same fingerprint is what `previous:` (M3) would declare per old version.
  - Pin K1, and a Schema change that keeps the JSON (`S.String` to a branded `S.String`), which should stay the same version.
- **Cost:** small in the runtime (one stamp value). The decision on what counts as "the same encoding" is **Arpit's call**.

## Medium

### M1. The graph gate checks one direction, two of its checks are self-confirming, and the gate itself is never falsified or run routinely. **r13-story** (`1ee5e5f7`) [ran]

- See Q3.
- **Proposed:**
  - Add `graph-gate.ts` to `falsify.ts` with three broken graphs (no fillings rule, no landing rule, an over-shadowing graph) and one broken runtime (a wrong part node).
  - Run the gate in `mutate-one` without searches (70 s), or as its own gate on every final commit.
  - Pin one shadowed and one unreached edge in the CLI pins, on a fixture written for it.
  - Make direction 2 a number under the lock: the count of unmarked untaken edges, so that a change says why.
  - Say in D227 that `at`/`target` agreement is by construction.

### M2. Seven of D221's twelve paths are unpinned, one of them a send beside an old hold on the wire. **r13-post-mid** [ran]

- Survivors: see the mutant table.
- `old-held-only` is the mid review's W probe. The convergence says the mid review's four survivors "name code that no longer exists". The code is gone, but the behaviour (an old hold on the wire must block) is the same, and still has no case.
- **Proposed:** add these as cases:
  - K5 (key-less retry at the boot, a commit while the hold is on the wire, then after);
  - a new key naming nothing (`retry({k:a, region:eu})`);
  - a reorder-only release;
  - the decline's reason;
  - the hand-closure collision, in both orders.

### M3. D221's cost to an app: every key blocked, with no end date and no word the app can tell apart, and the only keyed way out is an unchecked cast. **r13-post-mid** [ran K5, K6; reasoning]

- See Q1.
- **Proposed, for Arpit:**
  1. **Old versions as declared data** on the transaction (`previous: [{ key }]`), giving typed `O.x.previous[i].retry/cancel(k)`. No cast.
  2. **`OldVersionLane` as an issue**, not only evidence, and **`NotSent { OldVersion }`** in place of `Rejected`.
  3. **Optionally, an author-declared narrowing:** "these old fields are a prefix of the new key" (`previous: [{ key, within: ["k"] }]`). The decline then applies only to keys that agree on `k`. This is an upfront contract, not the inference that failed three times. It is worth it only for collection actors, so it is the first thing to cut.
- Either way, write the old-hold handling into the release story of the docs: a key change is a migration.

### M4. `flow story list` prints `callbacks run: 0` as a constant. **r13-story** [ran]

- `cli/story.ts:128`. `list-runs-a-story` survives the CLI pins.
- **Proposed:** wrap every fake of every Story before `list` reads them, as `describe` does, and print the count. Also poison the subject's `Compiled` Slots for both commands, as `flow check` does.

### M5. A key-less `cancel` of an unsure hold in its own `unknown` handler is red by oracle (h), with or without a release, live or restored. **older** (D158's ledger, `drive.ts:489-494`; round 10) [ran K4, K4b, K4c, K4e]

- The runtime writes `lane.cancel.Held` and `Released` for the attempt, as a keyed cancel does.
- The ledger pays a release only for a cause it saw. A key-less cancel in a live ending is not one, and the `self` path after a reload does not pay it either.
- No suite case has this shape, so it was never seen.
- **Why it matters now:** it is the most natural typed way out of an old-version hold. Since the conformance harness ports to production, an oracle that refuses legitimate app code is a production problem.
- **Who is wrong** is not settled. I lean to the ledger.
- **Proposed:** a case for each of K4c and K4b, then fix whichever side is wrong.

## Low

- **L1. D224, unlogged against 2.10:**
  - `story run` has neither the earliest-error-primary rule nor `UnusedWireRule` (2.10.14).
  - The `flow graph` row is marked **Design** and quotes "flow check and flow graph read its steps", but neither command reads a Story's steps.
  - A cut's `operations.<op>` is the first non-idle lane of a keyed op, picked by insertion order.
  - Constructing a Story compiles its fixture (Q4).
- **L2. The Stories are an API trial, not new coverage** (Q4). For the next Story round:
  - one Story that sends one Attempt twice (the fake's dedupe);
  - `release({ nth })` for an out-of-order answer under `latest`;
  - one release Story, which is now safe to write once H2 and M3 are settled.
- **L3. D228's `--full` is unenforced, and a stale record is never rewritten in the default mode.**
  - Record the tree hash of `round-13/` and `conformance/` in `lie-cases/`.
  - Have the targeted run print "records from <hash>; differs", and fail on a differing tree when given `--final`.
- **L4. `d222.twodefaults-equal-refused` survives:** two equal defaults are allowed by D222 and unpinned.
- **L5. The mid review's "+1 unsure per boot" is still there** (K6). Not round 13's.
- **L6. 13 `flow-falsify-*` folders from today, 15:07 to 16:18,** are in `$TMPDIR`. They predate my runs, and my lie run cleaned up after itself. They are not mine to delete.
- **L7. My own slips:**
  - Once, a `>` redirection wrote the first suite and graph-gate outputs into the scratchpad.
  - Once, `python3` rewrote my probe file there.
  - Both were scratch files only, and are removed with the worktree's folder.

| Age | High | All |
| --- | --- | --- |
| r13-post-mid | **2** | 5 (H1, H2, M2, M3, L4) |
| r13-story | 0 | 5 (M1, M4, L1, L2, part of M1's pins) |
| r13-lies | 0 | 1 (L3) |
| older | 0 | 3 (M5, L5, L6) |

## Assumptions: continued

| # | Assumption | State now | Note |
| --- | --- | --- | --- |
| 75 | A lane's key shape says which release keyed it | **Retired** by D221's stamp [ran suite] | |
| 76 | Every hold can be named by some typed member | **Partly.** Only key-less, in its restored ending (K5); otherwise only by a cast | M3 |
| 77 | A guard and the commit it guards see the same lane | **True for `idle(k)`** [ran suite]. `retryable(k)` sees its own lane only, by design, and unpinned | M2 |

**New:**

| # | Assumption | True? | Harm when false |
| --- | --- | --- | --- |
| 81 | An op's key field names say its version | **False** [ran K1] | H2: a send beside a hold |
| 82 | A field's default is evaluated per actor | **False** [ran] | H1: shared dates and ids |
| 83 | Every check of the graph gate is falsified | **False** [ran] | M1 |
| 84 | Every claimed edge is taken or marked | **False by design.** 62 + 178 are listed; the ones sampled are reachable [ran] | M1 |
| 85 | `callbacks run: 0` is a count | **False for `list`**, true for `describe`'s fakes [ran] | M4 |
| 86 | The lie records are from the current tree | **Unenforced.** Harmless for the verdict [read] | L3 |
| 87 | The harness's oracle (h) accepts every legitimate let-go | **False** for a key-less cancel in its own ending [ran] | M5 |

## What production must carry over or fix

1. **Fix H1 before anything else relies on D222.**
   - Evaluate each default per call at each door, keep only presence as data, and refuse on the AST at the compile.
   - Pin it with a counter default.
   - File: `conformance/compile/memory.ts:45-125`.
2. **Version an op by its key contract, not its key names (H2), and give old versions a typed spelling (M3).**
   - The stamp becomes a fingerprint of fields and Schemas.
   - `previous: [{ key }]` on the transaction gives `O.x.previous[i].retry/cancel`.
   - `OldVersionLane` becomes an issue, and the decline becomes `NotSent { OldVersion }`.
   - Files: `round-13/lane.ts:539-580`, `durable.ts:91, 386-426`, `turn.ts:175-180, 750-753`, `conformance/compile/operations.ts`.
   - **Arpit's call** on what "the same encoding" is, and on whether to allow the `within` narrowing.
3. **Carry D221's rule, D222's rule, the Story API (D224), `flow trace` (D225) and D228.** They are right, with the fixes above.
4. **Pin D221's paths (M2)** with K5, a new key naming nothing, reorder-only, the decline's reason and the seam's collision. **Settle M5** (ledger or runtime) with K4c and K4b as cases.
5. **Make the graph gate a gate (M1).**
   - Falsify it (three broken graphs, one broken runtime) and run it on every final commit.
   - Pin `shadowed` and `unreached`.
   - Put the count of unmarked untaken edges under the lock.
   - Keep `graph.ts` free of runtime imports, as it is.
6. **Make `callbacks run` a count everywhere (M4)**, with `Compiled` Slots poisoned in `story list` and `describe`.
7. **Tie lie records to a tree (L3)** before targeted lies become the only lie run.
8. **Still owed from earlier rounds:**
   - `Typed<R>` carrying its events, so `story.E` is typed;
   - a lane listing in Inspection;
   - rule 61's finish and `HostTimeWait`;
   - `Story.app`, tabs, `Fake.storage`, streams in Stories;
   - "+1 unsure per boot" (L5).

## Not checked

- `nub run verify`, the formatter, the linter: I changed no repo code.
- `--swap`, the 5 s gate and searches per mutant. The full (`--full`) lie gate. `falsify`'s other parts. Real browsers. Safari.
- Whether a resent old hold's input reaches the commit untyped (H2's "nearby"): reasoning only.
- Who is wrong in M5.
- The builder's own mutant list.

## Traces

All from `packages/flow-state-v3/prototypes` in the worktree `scratchpad/r13-final/wt` (detached at `e227a47e`).

- **Suite:** `bun conformance/watch.ts --rss-mb 1900 --seconds 280 -- bun conformance/main.ts --round 13 --runtime ../round-13/adapter.ts --no-search`.
- **Control:** `bun conformance/watch.ts --rss-mb 1900 --seconds 295 -- bun conformance/mutate-one.ts --runtime ../round-13/adapter.ts`.
- **Graph gate:** `bun conformance/watch.ts --rss-mb 1900 --seconds 280 -- bun conformance/graph-gate.ts --runtime ../round-13/adapter.ts [--list]`.
- **Lie gate:** `bun conformance/watch.ts --rss-mb 11000 --seconds 295 -- bun conformance/falsify.ts --runtime ../round-13/adapter.ts --part lies --parallel 6`. Each inner suite is capped at 1,700 MB by `falsify.ts`.
- **Checks:** `bun round-13/checks/<each>.ts` and `bun round-13/cli/main.ts`, each under `perl alarm 200`.
- **Mutants:**
  - the list is `scratchpad/r13-final/mutants.ts`;
  - the runner is `scratchpad/r13-final/run-mutant.ts <ids>`: each mutant in its own copy, the suite as `mutate-one` runs it, then each survivor's gates;
  - up to 6 at once.
- **Probes:**
  - K1-K6 are `scratchpad/r13-final/zz-review.scenario.ts`, run by `run-probe.ts [mutant]`, in a copy with `main.ts` patched to include them;
  - `round-13/zz-defaults.ts` (H1) and `round-13/zz-reach.ts` (Q3) live in the worktree only.
- No commits. Nothing written in the main checkout except this file. The worktree is removed by exact path.
