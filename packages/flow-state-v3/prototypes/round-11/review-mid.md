# Round 11: mid-session review at checkpoint 62b9b290

Independent review, Opus, in a detached worktree. Everything here is advice. Marks: [ran] I ran it, [read] I read the code, [reasoning] inferred.

## Verdict

D194 (in-process, with `machine()` as the compile) is the right call, and the plain suite on typed output is real: 742/742 cases pass with whole output unchanged against the `expected-output.txt` written on hand fixtures. No assertion got weaker in the switch. Two things do not hold yet:

- **The types gate fails.** Round 10 passed it. The round's own front-end growth broke event typing in machine bodies.
- **The machines the suite now boots are outside the lock.**

Three claims are overstated:

- The codec numbers compare forms that are additive by construction.
- The `CompiledData` contract is not checked by anything in the suite.
- F2 is not a public-API gap of the kind it says.

One latent front-end bug is the other half of the history bug the port found.

Mutants against the front end: 8 of 11 killed. All 3 survivors are features no booted case uses.

## High

### H1. The types gate fails at the checkpoint; round 10's passes [ran]

- `bun round-11/checks/types-check.ts` gives `TYPES FAIL`, with two failures:
  - `lab.ts(23,23) TS2345`.
  - The round-10 pin "`text` is not on `Saved`" (`round-11/typed/type-tests.ts:51`) now errors for the wrong reason: `TS18046 'event' is of type 'unknown'`.
- `bun round-10/checks/types-check.ts` gives `TYPES PASS  tsc clean, 8 directives`. The two type-tests files are identical (diffed).
- Cause [ran]: D204's new `P` generic on `machine`, in `d: ReturnType<typeof definition<T, Ev, In_, M, O, P>>` (`conformance/typed/flow.ts:732`). With `P` removed from that one line, every `type-tests.ts` error disappears. Event payloads stop being inferred in the body, so handlers see `event: unknown`.
- Separately, `tsc -p round-11/typed/tsconfig.json` reports 24 errors in the lab fixtures (`round7/8/9/9b.ts`, `lab.ts`). `pay.ts`, `threeds.ts`, `form.ts` and `flow.ts` are clean. There are two kinds:
  - **`TS18046 event unknown` (11).** Mostly action and key selectors such as `O.save.commit(({ event }) => …)`. The handles' `<Ev>` is a free generic, not tied to the handler's event. So reading `event` in a selector is untyped by design of the handle. Pay never does it.
  - **`TS2345` (13).** `fixture(typed)` takes `Typed<unknown>`, and `Typed<FakeApi>` and `Typed<never>` are not assignable to it under `exactOptionalPropertyTypes` (the `_R?: (r: R) => void` phantom).
- Why High: "written in the public API" is the point of the round. At the type level it is currently unchecked for the lab machines, and it regressed for every machine.
- STATUS does say "every gate but the plain suite" is not done, so this may be known. The cause is the round's own change, though, not a pending port.

### H2. The machines the suite now boots are outside the lock [read][ran]

- `main.ts` `SHARED` walks `scenarios/`, `search/`, `fixtures/`, `bench/`, `reference/` and named files. It does not walk `conformance/typed/`, and `expected.lock` has 0 `file:typed/…` lines. The unlogged list from my run names no typed file either.
- D195 planned the typed modules in `conformance/fixtures/typed/`, under the walk, and said "the same suite" would be "shown by the lock: … only `file:` lines". D205 then moved them to `conformance/typed/`, out of reach.
- The hand fixtures, which most switched cases no longer boot, are still locked. The typed ones, which they do boot, are not.
- Editing a typed fixture is guarded only by the `output:` lines, a change detector that hashes memory and state but only counts evidence and issue codes. The D113/D135 rule ("an expectation changed with no log line fails") no longer covers the machine under test.
- Fix: add `walked(here, "typed", /\.ts$/)` to `SHARED`, and log the move once.

### H3. History in the object form is silently dropped [ran]

- The fix the port found (`flow.ts:390`, `one.history === true`) is only in the bare-token branch. The object branch (`flow.ts:422`) is `target: … one.target.node`, with no `history`.
- Probe: `Back: St.A.history` compiles with `history: true`. `Back2: { target: St.A.history, updateMemory }` compiles with `history: undefined`, so it becomes a plain transition to `A`'s default.
- It type-checks, because `target?: StateTok` accepts the history token.
- Latent today. The only typed use (`threeds.ts:53`) and the two unported hand ones (`real.compiled.ts:124`, `:239`) are bare tokens. The first port that writes `{ target: S.X.history, updateMemory }` gets wrong behaviour with no error.
- Same root as the found bug: "is this a history target" is decided per call site, not once.

## Medium

### M1. Two Slots can share one path in a guard array [ran]

- Closure guards are numbered among closures (`guard[${closures.length}]`, `flow.ts:404`), but a token's key is numbered by position (`guard[${position}]`, `:402`).
- `guard: [O.save.idle(() => ({ id: "a" })), () => true]` gives both Slots `on.Go[0].guard[0]`. `toData` reports `duplicate path`.
- Consequences:
  - `drive.ts` fault injection matches by `at.path` alone (`drive.ts:1098-1106`), so a fault aimed at one fires on both.
  - A table keyed by path, as in `codec.ts`, binds both to the last closure.
- D206 says "a Slot's path is its place in the definition", and for guards it is not: in `[S.LEFT, capturable]` the closure is `guard[0]` at position 1.
- No current typed fixture hits it: `toData` losses are 0 on all 24 typed fixtures.

### M2. The codec numbers are additive by construction; the decision survives on other grounds [read][ran]

- **The data and module forms both start from in-process.** In `cold.ts` and `measure.ts` they first import the typed module (which runs `machine()`), then build their table with `toData(pay)`, then parse or import. So "in-process is cheapest" is true by construction, not by measurement.
- **The module form is not the brief's option 1.** The brief asks for "Slots are imports of the real functions"; the built module reads a `globalThis.__codecTable`. Its cold time also includes Bun transpiling a 20 KB `.ts` file, which a production bundle would not pay.
- **The stated reason is too strong.** `codec.ts:79` says "no generator can copy out" a closure. A source-transform compiler that hoists closures, with scope analysis (Qwik's optimizer is the prior art), could emit real imports with no `machine()` at run time.
- **The real reasons hold.** The compile costs about 0.03 ms warm and about 1.3 ms cold over hand per process. Only in-process has no drift between the suite's object and production's. I would restate D194 on those grounds, and reject the hoisting compiler for its cost (complexity and capture rules), not as impossible.
- **The bundle and cold numbers in STATUS are older than the checkpoint code.** My reruns:

  | | STATUS | My rerun at the checkpoint |
  |---|---|---|
  | In-process bundle, gzip | 7.1 KB (front end 2.9 KB) | 8.0 KB (front end 3.9 KB) |
  | In-process bundle, raw | 24.1 KB | 26.6 KB |
  | Cold medians: hand / in-process / data / module | 1.05 / 2.00 / 3.11 / 3.38 ms | 1.07 / 2.42 / 3.79 / 4.00 ms |

  The order is the same.
- **Chrome:** without cross-origin isolation, `performance.now()` is clamped to 100 µs. The 1x n=100 and n=1000 rows sit at that resolution, and only the n=10000 rows support the call. The "records stay a JSON string" conclusion is fine.

### M3. `CompiledData` is real but shallow, and nothing in the suite runs it [ran]

- **Not run by the suite:** `grep` finds `CompiledData` and `CompiledLoaded` only in `codec/codec.ts` and `codec/measure.ts`. D194's "checked by the suite, not at each boot" has no step behind it.
- **Accepts every typed fixture.** Strict decode (`onExcessProperty: "error"`) passes on all 24 typed fixtures. It refuses every hand fixture (bare `commit`), so it cannot check the other side of `compare`.
- **What it catches:** an op `kind: "writ"`, which `seal` passes, and a missing `tokens`.
- **What it misses:**
  - a target or `default` naming no node, which `seal` misses too and `flow check` shows only as rule-20 noise;
  - `keyFields: ["nope"]`, which `seal` and `flow check` miss too. Only TypeScript's `K extends keyof I` stops it at the front end, and `compileOp` ends in `as unknown as Op`.
  - a mapped event declared nowhere, which `flow check` does catch (`UnknownEvent`).
- **Other gaps:**
  - `domain` and `streams` are `S.Unknown`.
  - Nothing ties `Schema.Type<typeof CompiledLoaded>` to the `Compiled` type, so the two can drift silently.
- **The tools do not use `toData`.** `check` and `explain` take the loaded `Compiled` and poison every function themselves (`cli/check.ts:20`). So `measure.ts`'s "check on data = check in-process: true" is trivially true.
- What tools actually need is the definition module evaluated. That runs `machine()`, the body and `operations` callbacks, and the author's module top level, but no Slot. Say that rather than "no callback run". A module top level that builds an SDK client runs under `flow check`.
- Make it real cheaply: decode every typed fixture's `toData` with `CompiledData` in the plain pass, and add a type-level `Equals<Schema.Type<…>, Compiled>` pin.

### M4. F2 is misclassified [read][ran]

- **The cases.** The kept-hand variants are at 6 sites, not 7 as STATUS says:
  - 2 return a `Set` as the key: `Doors.readKey`, `Kept.oddKey`;
  - 4 key by bigint: Kept `GoKey` ×2, Edge `GoBig` ×2.
- **The Set keys are unreachable from the public API.** The key closure is generated from `keyFields` (`flow.ts:627`). An input field that cannot be named cannot be carried either, so the door refuses it first (`gate.ts:52-61`, D119/D139).
- **The bigint keys are unreachable too.** In the public API key ⊆ input, and D124 declines every input that contains a bigint. `form.ts:26` `form-key-bigint` is exactly that machine, and it declines.
  - So M5's original symptom, "a typed `Schema.BigInt` key could never send", is still true on the public path. Round 9 fixed it only for a hand `Compiled` that keys `BigInt(i.o)` off a string input.
- **What to record:**
  - (a) The 6 variants are runtime-only robustness cases on a shape no compiler emits (root cause 1). Label them that way.
  - (b) A design question: should the door carry an input by its contract Schema's encoding (`toCodecJson`: bigint becomes a string)? That makes bigint keys reachable with a plain field list.
- Do not add a key closure to the public API (rule 39).

### M5. Where the front end bends the public API [read]

| Spelling | Design (or what is wrong) | Front end |
|---|---|---|
| Alternative path | none: the path is the alternative's place (D206) | `index?: number` on `AltSpec` (`flow.ts:291`, `pay.ts:352,358,417,425`) sets a Slot's path to the hand-flattened Pay's. It contradicts D206, and `pay.scenario.ts:366,380` fault addresses depend on it. D206's own approach is to change the scenario's path, not add a knob. |
| `unknown` by reason | "`unknown` takes a record by tag, as `failure` does" (2400, C6) | `unknown: { byReason: {…} }` (D201), `Compiled`'s internal spelling leaked |
| Optional key | a bare `Schema.optionalKey` field (2.2.2) | `Flow.absent(schema)` |
| Placement | in the definition: `Flow.state(…, { traits })`, `{ NAME: Sub }`, parameters such as `Countdown({ length })`; filling in the machine (2.3: "Placement is structure … so it lives in the definition") | placement and filling together in the machine body (`traits: { x: { fragment: F, …fill } }`, `into:`), plus `places` on the definition for raises |
| A fragment's op asked by its host | not public; rule 50 says only the fragment acts on its operations | `round9b.ts:210` writes `{ opGuard: { op: "job", verb: "idle" } }` literally, which is `Compiled` in a typed fixture (F3). Not counted the way D203's seam is. |
| `unknown:` targets | only `Flow.uncertain` events | any event |
| A read's function | `lookup` | `commit` |

Placement in the body means `S` and `E` cannot see instance events, though the compiled output is the same.

### M6. Mutants against the front end: 8 of 11 killed; the survivors are untested features [ran]

Each mutant was a single exact text swap in `conformance/typed/flow.ts`, run against the full plain suite (`main.ts --round 11 --runtime ../round-11/adapter.ts --no-search --no-catalog`), then reverted.

| # | Mutant | Result |
|---|---|---|
| M1 | wrong target: a bare token after the first alternative targets self | **survived** |
| M2 | wrong target: an object alternative with actions loses its target | killed, 667/742, plus 46 by output alone |
| M3 | dropped guard: closure guards after the first | **survived** |
| M4 | dropped guard: a state token in a guard array | killed, 702/742, plus 7 by output |
| M5 | wrong key field: the lane key projects the whole input | killed, 686/742, plus 4 by output |
| M6 | wrong key: `O.x.idle(k)` forgets `k` | killed, 736/742, plus 3 by output |
| M7 | lost `resetOn` | killed, 730/742, plus 11 by output |
| M8 | lost raise `.key(f)` | killed, 741/742: one case, `REV9-KEPT/a-raise-with-no-name…` |
| M9 | lost `whenAbandoned` release | killed, 741/742: one case, `REV9-EDGE/a-release-lets-a-kept-ending-go` |
| M10 | a hoisted fragment op loses `fragment:` | killed, 728/742 |
| M11 | lost `disarmOn` | **survived** |

- No typed fixture uses any of these yet: `disarmOn`, `unknown.byReason` (D201), guard ports, two closures in one guard array, a bare-token fallback after a guarded alternative, a multi-field key.
- They were all grown for the port (D199-D206) and are unexercised until Notes, Form, Feed and the desk machines arrive. M8 and M9 hang on one case each.
- Suggestion: a small front-end case per D-numbered feature, so the grown surface is covered before the ports that need it.

## Low

- **L1. Memory [ran].**
  - `initialOf` does not decode the input. 2.2.2 says "decode the input with the derived Input schema". A missing required `Flow.input` becomes an explicit `undefined` key (`{"who": undefined}`), not a refusal.
  - `restoreOf` gives a field a release added the value `f.value`. That is `undefined` for a computed `Flow.initial` and for a `Flow.input`, against its Schema; the comment says "takes its initial value".
- **L2. Census [ran].**
  - 222/742 cases boot only typed output. STATUS estimates 183 plus "about 80" for Pay; the real gain is about 39.
  - 43 cases still boot the hand `Checkout/Pay`, through pay-full in `frag.scenario.ts`.
  - So "the suite runs on what production loads" holds for 30% of cases at the checkpoint.
- **L3. Findings F1 and F3 exist only as code comments,** and RESULTS is not written yet (D198). Expected mid-round; noted so they are not lost.
- **L4. D205 puts a front end with non-public seams in the folder that ports to production.** The seams are `labFollowUps` and `index`; the folder is `conformance/`, per the harness-ports-to-production memory. Mark `conformance/typed/flow.ts` as the fixture front end, not the compiler.
- **L5. Two gaps in fault injection.**
  - It is keyed by path with no definition, so a fragment and a machine with the same path collide.
  - Nothing checks that an armed fault fired. Today whole output covers both, since every fault path I listed matches a Slot by the unchanged output.
- **L6. `flow check` has no direct finding for a target that names no node** [ran]. It shows only as rule-20 noise.
- **L7. A fragment's `default` is a string in the declaration, while a machine's is a token in the body.**

## What holds [ran unless noted]

- **The plain suite:** 742/742, "by output alone: 0", RECIPIENTS red 0. Exit 1 only for the pending lock lines, which STATUS states.
- **Expectations untouched:** `expected-output.txt`, `expected.lock` and `expected-changes.log` are unchanged by the checkpoint commit. So output was compared against hand-written expectations.
- **The scenario edits are only:**
  - import paths;
  - D206's ten fault addresses (`operations.X.NotSent` → `operations.X.failure.NotSent`);
  - 6 variants switched to hand.

  No assertion was removed or loosened [read]. Body hashes moved for exactly the 5 edited ids (REV8-M9, REV9-M1, REV9-KEPT, REV9-NAMES, REV9-EDGE).
- **`compare-all.ts`:** 17 pairs, 0 unexplained. It compares closures by position only, so behaviour rests on the suite, as its header says.
- **`compare.ts` (Pay, ThreeDS, Countdown):** 52 differences, all stated.
- **Spot-checks** (Kept `resetOn` BigInt, Edge decline paths, Pay `Confirmed[1].guard[0]`): typed output equals hand output by the locked output line. The Pay one holds only through `index` (M5).
- **Warm codec numbers reproduce:** Pay in-process 0.031 ms, data rebind 0.042 ms, contract 0.12 ms, codec 0.17 ms.
- **The Chrome direction at n=10000 is plausible:** clone object 3.3 ms against stringify 0.7 ms.
- **`toData` loses nothing on any typed fixture,** and both contracts accept all of them.

## Traces

All from `packages/flow-state-v3/prototypes` in the worktree, with `node_modules` linked to the main checkout's.

- `bun conformance/watch.ts --rss-mb 1900 --seconds 280 -- bun conformance/main.ts --round 11 --runtime ../round-11/adapter.ts --no-search`
- `bun round-11/checks/types-check.ts`; `bun round-10/checks/types-check.ts`; `node_modules/.bin/tsc -p round-11/typed/tsconfig.json`
- `bun round-11/typed/compare-all.ts --all`; `bun round-11/typed/compare.ts`; `bun round-11/typed/census.ts`
- `bun round-11/codec/measure.ts`; `bun round-11/codec/measure-cold.ts` (their `.txt` outputs restored afterwards)
- Probes, written for this review and removed with the worktree:
  - `round-11/review-probe.ts`: H3, M1, L1.
  - `round-11/review-probe2.ts`: M3's contract and corruptions.
  - Mutants: `mutate.pl` in the scratchpad (M6).
