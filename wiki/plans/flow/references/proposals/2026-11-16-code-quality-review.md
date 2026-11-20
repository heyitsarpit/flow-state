---
review code-quality-review
status open 2026-11-16
---
# Code-quality review of flow-state-v3 (2026-11-16)

Nothing here is decided; the builder who runs the convergence pass decides each item.

**Bottom line:** the core is pure and deterministic (no clock, entropy, timers, promises or Effect runtime outside
`src/host/`), and `nub run report:unused` plus `tsc --noUnusedLocals` find little dead code. The debt is structural:
eight root causes, of which four carry most of the weight. (1) The step's working state `tx` has no edit operations,
so a dozen modules spread-and-copy `World` maps by hand and repeat the same scans. (2) Four lifecycles are still
encoded as flags, sentinels, string markers or side maps: the owed row's route, an identity's
Live/Resting/Ended state, timers found by scanning, and the persistence edge. (3) Diagnostics, lookups, keys and
codecs have no single home, so each is written two to six times. (4) A second test harness (`testing/seam.ts`)
runs Flow beside Story and Fake, against the Epic's "one runtime, one way to run it". One convergence pass in the
order given at the end removes most of it without changing behaviour. Six behaviour questions were found on the
way (section 9). Each needs a Story before anyone changes the code.

Reviewed at HEAD `9d4d3e72` in a detached worktree. All paths are under `packages/flow-state-v3/`. Sizes: S under
an hour, M a few hours, L a day or more. Risk is the risk to behaviour.

## 1. The step's working state has no edit operations (duplication, hot path)

Every module edits the world as `tx.set({ ...tx.world(), field: withEntry(tx.world().field, k, v) })`, and
`withEntry`/`without` (`src/core/tx.ts:52-62`) copy the whole Map on each call. So the same three lines repeat,
and a step that touches n entries copies O(n²) entries.

- **`core/lanes.ts:200,227`, `answers.ts:35`, `persist.ts:171`, `lane-moves.ts:374`, `step.ts:84`,
  `incarnations.ts:158,296,319,329`, `serve.ts:321`** What repeats: world-spread plus a map copy.
- **`core/lanes.ts:197-201` = `:224-228`** What repeats: same "interrupt this incarnation's reads of an operation"
  loop.
- **`core/incarnations.ts:290-300` = `:312-323`** What repeats: `end` and `dispose` share the whole retire block.
- **`core/lanes.ts:276-279`, `:292-295`, `:305-307`** What repeats: "apply a cue to every lane matching p, then
  promote".
- **`core/incarnations.ts:216`, `:342`, `:69`, `:293`** What repeats: "find this incarnation's timer of kind K" by
  scanning all timers.
- **`core/tx.ts:155-159`, `ledger.ts:123-135,335-347`, `persist.ts:74,127,143,253`, `serve.ts:393-407`** What repeats:
  per-item copy of a Map, Set or array inside a loop.

**Fix.** Give `tx` typed edit operations over the World's maps (`put(field, key, value)`, `drop(field, key)`,
`update(field, key, f)`) that copy a map once per step on first write, then mutate that copy. The world stays
immutable between steps, as `tx.ts:87-90` promises. Then extract `interruptReads(match)` in `lanes.ts`, a
`retire(incarnation)` shared by `end` and `dispose`, and `applyWhere(pred, cue)` for the three lane loops.
**Size** M. **Risk** low if the bench (`bench/`) and the full suite stay green. Measure the copy cost with the
bench before and after, and keep the change only if it wins (store facts, cache only when measured).

## 2. Lifecycles encoded as flags, sentinels, strings or side maps (implicit state machines)

- **2a** Where: `core/ledger.ts:44-58`; written at ~12 sites (`lane-moves.ts:123,251,292,313,350,402`, `lanes.ts:125`,
  `ledger.ts:152,318`, `answers.ts:53`, `record.ts:230,273`); read at `serve.ts:283-286`; Encoding today: the route is
  `current: boolean` beside `owner`; `oweOf` (`lane-moves.ts:63-72`) builds two literals that differ only in `owner`,
  and `current: !live` repeats `owner === ROOT`; One closed variant instead: `route: Leaf | Late({ owner })` on
  `Owed`; Size: M; Risk: med.
- **2b** Where: `core/ledger.ts:97-100`, `record.ts:284-295`; Encoding today: "restored" is the marker `channel ===
  "unknown" && reason === "Restored"`; `attempt`/`lane` are two Options whose `(none, some)` pair is never built; One
  closed variant instead: a tagged ending kind: `Commit{attempt, lane} | Declined{why} | Lookup | Restored{attempt}`;
  Size: M; Risk: med.
- **2c** Where: `core/world.ts:277-293` (`incarnations`, `records`, `ended`); `host/snapshot.ts:79-116`; Encoding
  today: an identity's Live/Resting/Ended state is "which maps hold its key"; `ended` and `records` both hold state
  and memory for a persisted identity; One closed variant instead: one `identities: Map<key, Live{incarnation} |
  Resting{record} | Ended{terminal}>`, or at least one `identityOf(world, actor)` that returns that union; Size: L;
  Risk: med.
- **2d** Where: `core/world.ts:55-60` (`Armed` has no timer id); `incarnations.ts:216-225,337-357`; `tx.ts:142-148`;
  Encoding today: which timer serves a schedule or a grace is found by scanning `world.timers` (O(I·T) per step in
  `graces`); One closed variant instead: `Armed` carries `timer: TimerId`; `Incarnation` carries `grace:
  Option<TimerId>` (STYLE: a phase's fact lives in its variant, not a side map); Size: M; Risk: med.
- **2e** Where: `core/world.ts:94-98`; built at `serve.ts:265,306,331,365`, `context.ts:88,198,230`,
  `incarnations.ts:134`; Encoding today: an issue's source is a string (`"event X"`) matched by equality; One closed
  variant instead: `IssueSource` tagged union; format the text once in `host/snapshot.ts:48-50`; Size: S; Risk: low.
- **2f** Where: `host/edge.ts:11-16,58-150`; Encoding today: `out: boolean`, `due` = `+Infinity` idle / `-Infinity`
  now / finite, plus the WAKE fiber; One closed variant instead: `Flight = Idle | Out` and `Wake = None | At{at} |
  Now`, one transition function; Size: M; Risk: med.
- **2g** Where: `host/testing/generate.ts:425-443,603-700`; Encoding today: `offline`, `offlineLeft`, `online`,
  `rest`, `quieted`, `+Infinity` step placeholders; `timers` mix `due` and `afterCalls`; One closed variant instead:
  `Network = Online | Offline{span, left} | Recovering`, `Timer = Due{at} | AfterCalls{n}`; Size: M; Risk: low.
- **2h** Where: `host/testing/sweep.ts:151-188`; Encoding today: five booleans; `fired` means two things; `replayed`
  and `stood` diverge; One closed variant instead: `Phase = Driving | Given{stood} | Fired | Refused`; Size: S; Risk:
  low.
- **2i** Where: `host/testing/fake.ts:375-421`; Encoding today: `Batch.status` plus `answered: Option` (Some iff not
  held); `keys` duplicates `writes`; One closed variant instead: `Batch = Held{answer} | Settled{status, at}`; Size:
  S; Risk: low.
- **2j** Where: `core/turn.ts:440-455`; Encoding today: `handled` is exactly `reasons.length > 0`; One closed variant
  instead: drop the flag; Size: S; Risk: none.
- **2k** Where: `core/world.ts:73-87`, `serve.ts:170-199`; Encoding today: `activations` is a positional array kept
  aligned with `chainOf(state)` by length arithmetic; One closed variant instead: `chain: Array<{ path, activation
  }>`; Size: M; Risk: med.

Do 2j, 2e, 2h and 2i first: they are local. 2a and 2b touch the same type, so do them together. 2c is the
largest. Do it only if 2a, 2b and 2d leave it clearer, and keep `snapshotIn` as the one reader.

## 3. Diagnostics, lookups, keys and codecs have no single home (duplication)

- **3a** Evidence: `invalid` Finding builder, identical, at `compile-body.ts:49-54`, `construction.ts:53-58`,
  `core/well-formed.ts:8-13`; Fix: export one beside `Finding` in `error.ts`; Size: S.
- **3b** Evidence: "throw the first finding" at `machine.ts:160-164`, `definition.ts:545-549`,
  `host/runtime.ts:75-84,281-285`; Fix: `throwFindings(findings)` in `error.ts`; Size: S.
- **3c** Evidence: RuntimeNotReady/Disposed text written twice: `host/driver.ts:191-206` (`check`) and
  `host/runtime.ts:333-349` (`rejected`); Fix: one `lifeRejection(code, path, what)` beside the codes; Size: S.
- **3d** Evidence: one-finding `flowError([{…}])` wrappers: `host/wiring.ts:8-9`, `definition.ts:406-414`,
  `host/driver.ts:238-261`, `host/runtime.ts:150-158,439-447`; Fix: `flowError` takes one finding, or a `finding(code,
  path, summary, help)` helper; Size: S.
- **3e** Evidence: `defect` thrower at `host/driver.ts:104-107`, `core/lane-moves.ts:46-49`, `core/tree.ts:141`; Fix:
  one exported `defect` in the core; Size: S.
- **3f** Evidence: `machines.get(m)?.operations.get(op)` at `core/lane-moves.ts:31-34,74-75`,
  `host/driver.ts:109-111`, `core/record.ts:239-241`, `host/inspect.ts:72-73`, `host/testing/seam.ts:38-40`; Fix: one
  `operationOf(machines, actor, name)` in `core/compiled.ts`; Size: S.
- **3g** Evidence: key text encoded at `core/lane-moves.ts:24-26`, `record.ts:249-251`, `lanes.ts:129-131` (picks
  twice), `testing/seam.ts:38-40`; Fix: every site calls `keyTextOf`; Size: S.
- **3h** Evidence: actors compared by building two `actorKey` strings (three `replaceAll` each) per element:
  `core/tx.ts:177`, `serve.ts:33`, `context.ts:151`, `step.ts:31`, `host/snapshot.ts:59`, `driver.ts:248`,
  `testing/samples.ts:114`, `sweep.ts:233`; Fix: `sameActor(a, b)` comparing `machine` and `name` in `world.ts`;
  `lanesOf` runs per turn; Size: S.
- **3i** Evidence: private-field filter written three times: `core/context.ts:18-27`, `host/snapshot.ts:119-131`,
  `definition.ts:604-612`; Fix: `publicMemory(compiled, memory)` in `core/compiled.ts`; Size: S.
- **3j** Evidence: struct of field schemas at `compiled-parts.ts:101-102`, `core/identity.ts:19-22`,
  `definition.ts:598-600`; field-text codec at `contract.ts:128-133` (with `toCodecJson`) and `identity.ts:19-23`
  (without it, rebuilt per call); Fix: one `fieldsText(fields)` codec, built once per Compiled; see 9c; Size: S.
- **3k** Evidence: `MAX_DELAY_MS` at `compile-body.ts:61` and `core/turn.ts:281`; `DERIVED` at `core/data-view.ts:5`
  and `well-formed.ts:101`; `byCodeUnits` rewritten at `core/identity.ts:16`, `host/snapshot.ts:29`; Fix: one owner
  each, imported; Size: S.
- **3l** Evidence: the user-callback call `Result.try({ try: () => s.run(…), catch: () => s.slot })` at
  `core/turn.ts:138-140`, `context.ts:81,103,213,220`, `tree.ts:182`, `serve.ts:260`; Fix: one `callSlot` beside
  `Slot` in `core/compiled.ts`, the one boundary FLOW-STATE.md asks for; Size: S.
- **3m** Evidence: marker unwrap at `compiled-parts.ts:85-87`, `construction.ts:275`, `definition.ts:558-563`; `~flow`
  guards at `compile-body.ts:33-46`, `construction.ts:21,232`; `compiled-parts.ts:109` re-derives `isUncertain`; Fix:
  export `unwrapPrivate`, `schemaOfField` and one tag guard from `construction.ts`; Size: S.
- **3n** Evidence: events plus internal events merged three ways: `machine.ts:153`, `compiled-parts.ts:112-115`,
  `definition.ts:593`; node index by path at `machine.ts:150,168`, `definition.ts:469`; Fix: `allEvents(definition)`,
  `indexByPath(nodes)`; Size: S.
- **3o** Evidence: failure endings walked twice: `compiled-parts.ts:37-43`, `operation-checks.ts:8-19`; Fix: one
  endings enumerator in `contract.ts`; Size: S.
- **3p** Evidence: `RELEASED` (`core/evidence-of.ts:78`) restates the `"Released"` rows of `REPLACED` (`:82-88`); Fix:
  derive it from `REPLACED`; Size: S.
- **3q** Evidence: sleep until an instant at `host/driver.ts:136-142` and `host/edge.ts:123-130`; Fix:
  `sleepUntil(clock, at)` in `host/fibers.ts`; Size: S.

**Risk** none to low: these are moves of identical code. 3h and 3j change hot or boundary code, so run the bench
and the identity tests after them.

## 4. A second harness beside Story and Fake (test tooling)

`src/host/testing/seam.ts` builds Runtimes through `buildRuntime` and drives `driver.input` directly. Four host
test files use it (`lanes.test.ts` 738 lines, `ledger.test.ts` 916, `life.test.ts` 324, `identity.test.ts` 57).
Its header says it reaches "uses, forget, the Runtime's bounded disposal", but Story steps already cover attach,
detach, `dispose … how: "forget"`, `disposeRuntime` and reload (`testing/steps.ts:46-52`). The Epic constraint is
"One runtime, one way to run it" (`wiki/tasks/V3/epic.task:55-58`).

The second harness brings its own copies:
- a store write and refusal, at `seam.ts:74-82` and `fake.ts:408-414,461`;
- `Host.of({ hidden: () => false, … })`, at `seam.ts:65-70`, `testing/run.ts:249-254` and `platform/browser.ts:22-27`;
- a 32-hex session seed built three ways, at `seam.ts:68`, `run.ts:101-106` and `browser.ts:5-10`;
- `Bell` declared again at `host/runtime.test.ts:18-22`, though `seam.ts:48-52` exports it;
- `ring`/`Door` copied between `host/lanes.test.ts:28-66` and `host/runtime.test.ts:23-65`.

**Fix.** Port the seam tests to Story and Fake, rule by rule, then delete `seam.ts`. Until that is done, have
seam reuse Fake's store and one `hostOf(seed, store)`. **Size** L. **Risk** medium, since test coverage must
not drop: port one file at a time and keep every rule id each test cites.

## 5. Host idiom (Effect)

- **5a** Evidence: the CLI turns an Effect into a Promise and back: `testing/run.ts:467-490` (`runEffect`, then `run =
  runPromise`), `cli/discover.ts:26` (`run: () => Promise`), `cli/main.ts:48-56` (`Effect.tryPromise`); Fix: `Found`
  carries `runEffect`'s Effect; the CLI composes it; the Promise stays only on the public Story; Size: S.
- **5b** Evidence: `cli/main.ts:140` `Effect.catch(() => Effect.succeed(2))` exits 2 and prints nothing; Fix:
  `Effect.catchCause` that prints the cause with `Console.error`, then 2; Size: S.
- **5c** Evidence: run faults sorted by `instanceof` in three try/catch blocks: `testing/run.ts:473-478`,
  `generate.ts:857-886`, `sweep.ts:207-219`; Fix: one `classifyRunFault` (or `Effect.catchTag` once the callers are
  Effects); Size: S.
- **5d** Evidence: `Host.onHidden` (`host/host.ts:53`) returns no unsubscribe; `edge.ts:135` registers per Runtime and
  `dispose` never removes it; Fix: return a remover and register it with `Scope.addFinalizer` on the Runtime's scope;
  Size: S.
- **5e** Evidence: Effect-returning arrows that are not `Effect.fn`: `host/runtime.ts:400` (`ready`),
  `testing/run.ts:467`, `cli/main.ts:48`, `cli/discover.ts:81`; Fix: `Effect.fn` with a name, as `boot` already is;
  Size: S.
- **5f** Evidence: `host/runtime.ts:271-540`: `buildRuntime` validates, wires, builds driver and boot, and makes
  handles and the Runtime object; Fix: split into `validate`, `boot`/`ready` and `handles`; it is the module's whole
  API; Size: M.

## 6. Dead code and stored derived values

The unused-exports report (`nub run report:unused`) lists 15 unused exports and 36 unused exported types. Each was
checked with grep across `src/`, `tests/`, `fixtures/`, `bench/` and `apps/docs`. 44 of them are `export` on a
name its own file uses: drop the `export`. One is a re-export nobody imports (`definition.ts:649`, `Row`). These
are dead outright:

- **`ReturnType` aliases `AnswerSteps`, `ContextSteps`, `DisposalSteps`, `ServeSteps`, `Moves`** Evidence:
  `core/answers.ts:100`, `context.ts:256`, `disposal.ts:122`, `serve.ts:419`, `lane-moves.ts:413`; no reference.
- **`CompoundNamesOf`** Evidence: `definition.ts:118`; no reference.
- **`Member.kind` `"cancelAll" | "release"`, `MemberTarget.Every`, `RecordedWhy` `"ignored"`** Evidence:
  `core/evidence.ts:22,31,45`; no producer in the package or docs.
- **`Decline` `"OldVersion"`** Evidence: `core/vocabulary.ts:14`; produced only in `prototypes/`.
- **`Move.Answer.asked`** Evidence: `core/cells.ts:94,180,189`; `lane-moves.ts:296` never reads it.
- **`mayHaveApplied` in the lane record** Evidence: written `core/record.ts:39,148`, never read on decode
  (`record.ts:253-264`); it is derived from `retryCount` and phase.
- **`KEY`** Evidence: `tests/checkout.ts:15`; no reference.

**Also derived, kept as stored:**
- `rows.ts:7-11`: `pending` is always `!uncertain`. This is the public row shape, so the user decides.
- `record.ts:147`: the stored `retryCount` is the head's count plus 1 when Recapturing. One field carries two
  meanings; name the stored one apart.
- `testing/run.ts:149,281,324,377`: a host `disposed` flag repeats the core's `life`; read the life instead.

**Fix.** Delete what is listed. Removing `mayHaveApplied` changes the record `FORMAT`, so either bump it or leave
the field and stop writing it. **Size** S. **Risk** none, except the record format.

## 7. Readability (STYLE.md points lint can't see)

- **Comments.** About 300 non-doc `//` comments remain in production `src/` (core 119, host 112, testing 75,
  counted without SAFETY, oxlint, RETURN_TYPE and ALLOW markers). AGENTS.md allows comments only where an outside
  constraint forces one. Most restate the rule the next line enforces; delete those or fold the rule into a name.
  Some are wrong for their place: `core/lane-moves.ts:295` describes `hold` above the `Answer` branch, and the
  section divider at `incarnations.ts:335`. **Size** M.
- **Record names in doc comments.** "(Turn's composition note)" at `core/tx.ts:84` and `core/world.ts:318` names a
  Spec note inside src; drop it.
- **Long multi-job functions.** `testing/generate.ts` `sourceOf` (~320 lines, see 2g), `testing/run.ts` `runFrom`
  (~270), `testing/fake.ts` `makeWorld` (~220), `host/runtime.ts` `buildRuntime` (see 5f). The core's
  `make*` closures (`makeMoves`, `makeIncarnations`) are the house pattern and stay.
- **Small items.** `edge.ts:18-26` `purposeOf` builds three typed constants to return literals. Use a
  `satisfies Purpose` return. The `REPLACED` table (`evidence-of.ts:82`) is `Partial<Record<Phase, …>>`. A total
  table would force a decision for each phase, which STYLE asks for.

## 8. Core purity: clean

There is no `Date`, `Math.random`, timer, `performance`, `process`, promise or Effect runtime outside `src/host/`.
The only core import from `src/host/` is the public barrel `src/index.ts`, which the Scope allows. The hot-path
costs are section 1's map copies and 3h's key strings. Measure both with the bench before and after the change.

## 9. Behaviour questions found on the way (verify with a Story before changing)

- **9a** Evidence: `core/lanes.ts:148` vs `core/tx.ts:129-133`; Question: `persisted` says a local actor never
  persists. But a local actor of a `persist: true` machine, in a Runtime without persistence, has its commits declined
  `NoPersistence`. With persistence on, the same actor works and is never saved. Likely the decline should use
  `persisted`'s rule. Only a shared identity is tested (`host/lanes.test.ts:511-528`).
- **9b** Evidence: `core/incarnations.ts:297,321`; Question: `end` and `dispose` drop the incarnation's reads with no
  `Command.Interrupt`, so a hung lookup's fiber lives until Runtime disposal. `graces` (`:341-344`) does not count an
  open read as busy, with `GRACE_MS` at 100 (`tx.ts:32`). Lookups are Life-scoped, so dropping the ending looks
  intended; the leaked fiber does not.
- **9c** Evidence: `core/identity.ts:19-23,48-51`; Question: the name codec skips `toCodecJson`, which
  `contract.ts:131` uses for key text. `inputOfName` falls back to `{}` on a decode failure. A non-JSON input field (a
  `Date`) may encode a name that does not decode, so the actor is created with no input and no error.
- **9d** Evidence: `host/snapshot.ts:96-116`; Question: an identity that grace-ended reads `"active"` when it is
  persisted (a record exists) and `"disposed"` when it is not. Neither was disposed.
- **9e** Evidence: `host/edge.ts:121,103`; Question: if a due-now accept lands while a batch is out and the batch is
  refused, `wakeAt` returns early on `due = -Infinity`. The 5 s backoff is then skipped once, so one extra immediate
  retry goes out. Section 2f's union removes this.
- **9f** Evidence: `host/edge.ts:135-137`; Question: after `dispose`, a hidden event still calls `issue()`, which
  forks into the closed scope (see 5d).

## 10. Proposed order for one convergence pass

1. Delete the dead code (section 6), drop the 44 needless `export`s, and do the moves in 3a-3q (S each, no
   behaviour change). Gate: `nub run check`, `nub run test`.
2. Write Stories for 9a-9d, and get the user's call on any that changes public behaviour (9a, 9d).
3. Give `tx` its edit operations and extract `retire`, `interruptReads` and `applyWhere` (section 1). Bench
   before and after.
4. Do the local unions (2j, 2e, 2h, 2i), then the owed row (2a with 2b), then timers (2d), then the edge
   (2f, which fixes 9e and 9f with 5d).
5. Fix host idiom 5a-5e, then split `buildRuntime` (5f).
6. Port the seam tests to Story and Fake, and delete `seam.ts` (section 4).
7. Optional, if steps 3-4 leave it clear: the identity union (2c) and the activation chain (2k).
8. Trim the comments (section 7). Run `nub run check:fix`, `nub run verify`, and `nub run faults`, since the test
   tooling changes.

## 11. Sidecar log

There were four Haiku sidecars: (a) a blind duplication hunt, (b) dead code, (c) state machines and derived
values, (d) Effect idiom and purity. I re-read the code behind every finding used above.

- **Accepted:** (a) 1-8, 10-28, 30 (as 2f), 31, 32, 33, 35, 38, 39, 41. (b) every knip classification, plus `KEY`
  and `OldVersion`. (c) 1, 2, 5, 8, 11, 13, 14, 15, 16, 17, A, B, D. (d) 2.1-2.13 (folded into section 1), 3c.6,
  3d.11, 3e.12-13, 3g.16-18 and .20, 3h.21.
- **Changed:** (c) 3 is kept as a field-meaning note (6), not a Phase split. (c) E: only the harness's `disposed`
  mirror is accepted. (c) 4 is marked optional (2k). (a) 9 and 10 are folded into 3g.

**Rejected:**
- (a) 29, the schedule projection: four sites project to three different shapes, so sharing them gains nothing.
- (a) 34, 36, 37, 40: local one-liners in testing files. A helper would be a pass-through.
- (a) 17 and 18, the cast helpers: each cast carries its own SAFETY reason, and one shared `erase` would hide them.
- (a) 42, the test literals: `{ machine, name }` literals in tests are clearer inline.
- (b) `secretOf` (`tests/types/tree.compile.ts:82`): it is a `@ts-expect-error` type test, not dead.
- (b) the barrel-only names in `testing/index.ts`: they are a public-surface decision, not dead code.
- (c) 6, Delivery and mail: `Retrying` carries the fact "refused once", mail carries the order, and `queue` and
  `unreferenced` are the only writers.
- (c) 7, Held overloaded after restore: the in-flight bit wakes the identity, by design. Not a defect without a
  failing Story.
- (c) 9, grace as a cache: it is reconciled every step, so it is folded into 2d.
- (c) 10, the turn route: it is mostly 2a's route. Fixing 2a removes `late` and `from`.
- (c) 12, positional baselines: they are bounded by the reaction list. Low value.
- (c) E, the harness `uses` count: the harness models the page's holders, which a reload must keep. This is
  outside-world state, not a mirror.
- (c) F and G, per-step `fresh`, `touched` and `started`: these are step-local working state, which tx owns.
- (d) Ref for `let pending`/`world`/`services`: the callbacks are synchronous observers on one thread, so a Ref
  adds nothing. The fix is the union in 2f.
- (d) `Schedule` for `RETRY_MS`: the retry re-merges newer dirty writes, so it is a wake time, not a retry of one
  effect.
- (d) `Fibers` as a Context service, and `Crypto` for browser entropy: construction is synchronous by contract,
  and the platform module is the allowed edge. Low value.
- (d) Effect `Duration`, `Cause`, `Exit` or `SchemaAST` in top-level `src`: these are compile-time or boundary
  code, not the turn. `flow.ts` `Outcome` builds the commit body's Effect by design.
- (d) `encodeJsonText` throwing: the core hands it Json values, so a failure there is a defect.
- (d) `Stream.unfold` for `runFrom`, and `Hash.string` for the seeded mix: the first is not simpler, and the second
  re-baselines every seeded run.
