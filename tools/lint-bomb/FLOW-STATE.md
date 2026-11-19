# lint-bomb in Flow State

Status: proposed, 2026-11-04. Arpit has not reviewed these choices yet.

The lint rules for Flow State v3 production code. The config is the `lint` block of the root
`vite.config.ts`. This note gives the reason for each choice. Change both together.

## Source

- Vendored from `/Users/arpit/Developer/workflow/lint-bomb` at commit
  `59ee78311065e30137d31c5293304a6ddc9e0815` ("Style: store facts, derive views;
  booking derives remaining seats"), with no local changes. Copied: `src/`, `test/rules.test.ts`,
  `LICENSE`, `RULES.md`, `STYLE.md` and `examples/`, as its README says.
- Oxlint loads `src/index.ts` directly, the same way lint-bomb's own config does. So there is no
  esbuild step and no new dependency. The repo already pins `oxlint` and `@oxlint/plugins` at
  1.89.0, and the copied rule tests pass on 1.89.0 (`nub run lint:rules`). lint-bomb itself was
  tested on 1.81.0.
- Not vendored: `personal/flow-state/no-parallel-diagnostic-errors`. It is hard-wired to
  `packages/flow-state-rewrite/src/`. It should come back once v3 has its own issue or diagnostic
  type (see "Deferred").

## Scope

- Linted and formatted: `packages/flow-state-v3/`, except `prototypes/`. Type-aware rules use
  `packages/flow-state-v3/tsconfig.json`, which extends `tsconfig.base.json`.
- Never linted or formatted: `packages/flow-state/`, `packages/flow-state-rewrite/`,
  `packages/flow-state-v3/prototypes/`, `codebases/`, `reference/`, `tools/lint-bomb/` and the old
  `tools/oxlint/` plugin.
- Folders and imports, enforced by `no-restricted-imports` (`vite.config.ts`) with a planted
  violation of each in `tools/flow-state-lint/imports.test.ts`:
  - everything in `src/` outside `src/host/` imports nothing from `src/host/`, except the public
    entry `src/index.ts`, which re-exports the host's Runtime;
  - `src/` imports nothing from `fixtures/`, `tests/` or `bench/`;
  - `fixtures/` imports from `src/` only `src/index.ts` and `src/host/testing/index.ts`, and nothing
    from `tests/` or `bench/`;
  - `tests/` and `bench/` import from `src/` only `src/index.ts`, `src/host/testing/index.ts`,
    `src/host/inspect.ts`, `src/host/trace.ts` and `src/host/cli/main.ts` (the CLI tests call
    `main(argv)`, since there is no `flow` bin yet).
- Owners, enforced by `flow-state/owners-only` with plants in
  `tools/flow-state-lint/rules/owners-only.test.ts`: in `src/host/` outside `src/host/owners/`,
  `src/host/testing/` and `src/host/platform/`, no code forks, runs a fiber, races or times out
  work (`Effect.fork*`, `Effect.runFork*`, `Effect.runCallback`, `Effect.race*`, `Effect.timeout*`,
  `FiberMap`, `FiberSet`, `FiberHandle`, `Fiber.interrupt*`, `interruptUnsafe`) or reads a Cause
  (`Cause.has*`, `Cause.find*`, `Exit.isFailure`), under any import name. Every task runs in an
  Owner, whose one judge hands its caller an `Ending`; a second reader of an Exit is how a
  cleanup's failure is misread or lost.

## Rules: 70 in lint-bomb

### Applied as shipped: 59, all `error`

Every rule not listed below. They fit this codebase as they are:

- **Effect use** (`no-context-tag`, `no-effect-promise`, `no-throw-in-effect-gen`,
  `no-manual-effect-error-tag`, `no-implicit-effect-concurrency`, `no-numeric-duration`,
  `no-unmanaged-effect-scope`, `no-effect-ref-read-then-write` and the rest). They match
  `codebases/effect-v4` usage and STYLE.md. In a runtime, explicit concurrency and owned scopes are
  correctness issues, not style.
- **Type evidence** (`no-explicit-any`, `no-unknown`, `no-escape-hatch-assertion`,
  `require-safety-comment-for-type-assertion`, `no-shallow-json-domain-cast` and others). Public
  types are the product, and `Compiled` crosses a JSON boundary (D194). Each erasure gets a reasoned
  suppression, a `SAFETY:` comment or a `FLOW_STATE_ALLOW_UNKNOWN:` comment.
- **Promises and runners** (`no-effect-runner-in-domain`, `no-unwrapped-promise-in-effect-core`,
  `no-unsafe-fiber-methods`, `no-raw-try-catch`, `no-unjustified-effect-try-promise`). The runtime
  is a host boundary: IndexedDB, Web Locks and page lifecycle events. So these need explicit
  allowances, and the allowances get added with the host adapter's directory, not before.
- **Tests** (`no-module-mocking`, `no-expect-in-if`, `no-promise-microtask-barrier`,
  `no-swallowed-cleanup-error`). Flow State's tests run on a fake clock, and a microtask turn
  proves nothing.
- **Path options set now:** `no-direct-process-env`, `no-module-level-mutable-state`,
  `no-object-type`, `no-unknown` and `no-optional-domain-properties` cover all Flow State v3
  production code, the whole package `packages/flow-state-v3` (the suite 2026-11-09, the user:
  "flow-state-v3 should be covered"; `fixtures/` and `bench/` 2026-11-14). The suite is an edge, so
  the core-only rules (`no-throw-in-core`, `no-allocation-in-loop`) stay on `src`. The prototypes stay
  frozen. Before this, the suite's 73 `unknown`s went unchecked. Also
  `no-package-dist-or-self-import-in-src` to the package `flow-state-v3`. With no global state,
  several runtimes and tests can share a page.
- `no-excessive-cognitive-complexity` uses the rule's default (15, at least 3 branches), not the
  demo's 8. A transition selector branches by nature, and RULES.md says not to extract helpers
  only to lower the score.
- `use-consistent-type-definitions` prefers `type`. The rule skips interfaces with heritage and
  merged interfaces, which are the cases Effect needs `interface` for.

### Softened: 9

Review signals, which RULES.md itself says syntax can't prove:

- `no-eager-stateful-effect-succeed`, `no-stateful-effect-construction`: `warn`. RULES.md: "a
  review warning, not proof of a leak".
- `no-god-service-shape`: `warn` at 16. RULES.md: "a review prompt, not proof".
- `no-large-production-file`: `warn` at 500 lines, 1000 for tests, not counting comment-only
  lines (2026-11-07), since public docs live in the source. Line count alone doesn't justify a
  split, and a lane or edge module owns one invariant. 173 of Effect's 417 source
  files are over 500 lines.

Rules that misfire on a library with public types:

- `no-object-freeze`: `warn`. Snapshots published to React may need freezing by contract, and
  the matcher flags every reference.
- `prefer-effect-native-tagged-types`: `warn`. `Compiled` and records are JSON data (D194), so
  Schema owns those variants. The rule can't resolve imported models, so it would report each
  module.
- `no-readonly`: `off` (Arpit, 2026-11-04). The rule exists to stop agents overusing `readonly`.
  Here `readonly` is the only zero-cost guard against a turn mutating the previous turn's state:
  316 internal findings on the round 13 runtime. Its
  `allowInExportedTypes` option stays in lint-bomb for other projects.
- New in lint-bomb on 2026-11-04, from the prototype's failure history:
  - `no-throw-in-core`: `error` on `src`. The core returns expected failures as values; only
    `Defect` and `unreachable` may be thrown. The names are proposed until the issue catalog exists.
  - `no-allocation-in-loop`: `warn` on `src`, a review signal (Arpit asked for it). It reports
    allocations inside loop bodies and iteration callbacks. Narrow it to the turn's modules once
    the layout exists.
  - `no-chained-type-assertions` no longer exempts `as unknown as T`. The prototype had 7 of them.
- `no-empty-object-type`, new in lint-bomb on 2026-11-04: `error`. It replaces Oxlint's
  `typescript/no-empty-object-type` (now `off`) and allows `{}` only as an empty
  `Data.TaggedEnum` variant (Arpit: `{}` there is correct).
- `no-optional-domain-properties`: `warn`. Public option bags use `?:` under
  `exactOptionalPropertyTypes`, as Effect does (4,182 uses). Internal records should use `Option`.
- `no-runtime-typeof`: `error`, with no exemption (Arpit, 2026-11-04). Every user value arrives
  through its Schema: keys through `keyFields`, memory through `Schema.toCodecJson`, records
  decoded once at boot. A `typeof` means a value skipped its Schema. The prototype's 79 uses were
  hand-written encoding (`canon`) and hand-checked records, which production replaces.

`no-optional-domain-properties` is `warn` only until the layout exists. Then it becomes `error`
on internal modules and `off` on public entrypoint modules.

### Disabled: 2

- `no-inward-module-dependency` and `no-public-entrypoint-export-drift` need real module roots and
  an entrypoint list. Without them they only report "Configure explicit nonempty architecture
  boundaries". Turn them on at the foundation stage.

## Also in the config (built-in Oxlint rules)

- The built-in set from lint-bomb's own config, all `error`: `complexity`, `no-else-return`,
  `typescript/no-unnecessary-condition`, `typescript/switch-exhaustiveness-check` and the rest.
- One rule per ban in `tools/flow-state-lint`, each over the whole package (the user, 2026-11-14: "things
  can get lost in a refactor"). `vite.config.ts` lists each rule with its options `only` and `except`
  (folders relative to the package, never single files) and `exceptTests` (a pattern); the plugin's
  default is no exceptions. each rule has its file and planted-violation test in `tools/flow-state-lint/rules/` (the tests run
  in `lint:rules`); `bans.test.ts` plants violations
  and checks each rule fires inside, stays silent in its exception folders, catches the `globalThis`,
  `global` and `window` forms and ignores type positions. Effect is resolved through the imports:
  - `no-json-stringify` (no exception): equality goes through `Schema.toEquivalence`, keys through their
    Schema codec, report files through a Schema JSON codec, display through `Formatter.format`.
  - `no-entropy`: `Math.random` and `crypto`. Ids come from the runtime's mint, so stories, replays and
    searches reproduce a run. Except `src/host/platform`.
  - `no-clock`: `Date` and `performance`. Time comes from Effect's Clock or the fake world's. Except
    `src/host/platform`, `bench`.
  - `no-timers`: `setTimeout`, `clearTimeout`, `setInterval`, `queueMicrotask`. The core returns work as
    data for the driver. Except the same two folders.
  - `no-host-apis`: `window`, `document`, `navigator`, `indexedDB`, `localStorage`, `sessionStorage`. Only
    the platform touches them: the freeze bug, the bfcache lock, Safari's false `oncomplete`. Except
    `src/host`.
  - `no-effect-runtime`: `Effect.gen`, `runSync`, `runPromise`, `runFork`, `try`, `tryPromise` and
    `Promise`, in `src` only. The turn's hot path is pure (0.2 ms p99; `Effect.try` costs 170 ns against
    7 ns). Except `src/host` and tests (`*.test.ts`, `test/`).
  - Each also catches the name through `globalThis`, `global` and `window`; `Effect` is any binding of
    `effect/Effect`, or the `Effect` export of `effect`, under any name.
  - `no-mark-probe`: `hasProperty(x, "~...")`, `Object.hasOwn(x, "~...")` and `"~..." in x`, in `src`
    only, tests excepted. A `~` mark is copyable, so Flow recognises a value it made by identity (a
    `WeakSet` or `WeakMap` filled where it makes the value). Each remaining probe carries a disable with
    its reason: construction's own markers and tokens, until its decode checks identity, and the test
    tooling's own read targets.
  - `no-raw-event`: a raw `{ _tag: ... }` literal in `fixtures/<app>/stories` (any), or inside a `send(...)`
    call in `fixtures/<app>/machines`. Build events with the definition's token (`Cart.E.Add({ ... })`); a
    helper returning tokens is fine. Fake servers, adapters, services and `tests/` are not covered.
- `no-throw-in-core` is off in `src/error.ts` (`raise`, the one throw of a FlowError) and `src/entry.ts`
  (the public-function wrappers); every other FlowError goes through `raise`. The listed defect sites
  keep a disable with their reason: `core/defect.ts`, `core/frozen.ts` (a write to an admitted value),
  `core/tree.ts` (a computed start reading a computed field), the driver's rethrow of a host callback's
  throw, and the test tooling's run failures and its own defects (`src/host/testing`: `StoryFailed`,
  `StoryTurnLimit`, a script or index fault).
- Everywhere in `src`:
  - `switch-exhaustiveness-check` with `considerDefaultExhaustiveForUnions: false`: a `default:`
    no longer hides a variant (it hid lane phases).
  - `no-param-reassign` with `props: true`: a turn never mutates a value it was given. With
    `no-readonly` off, this is the guard on shared turn state.
  - `unicorn/no-array-sort`, `unicorn/no-array-reverse`: no in-place sort or reverse.
  - `typescript/no-floating-promises`: a dropped promise at the host boundary is a lost write.
- Better as types than lint, for the foundation stage: user callbacks callable only through one
  boundary module (a branded `Slot` type), and deeply readonly `Compiled` types.
- Carried over from the old config, scoped to v3 `src`:
  - `Effect.sleep` and `Effect.delay` are banned in tests ("use TestClock"); the test timers fall under
    `no-timers`.
  - `no-param-reassign`, `no-var` and `import/no-mutable-exports`.

## Deferred, with what triggers each

- When the module layout is decided:
  - Enable `no-inward-module-dependency` and `no-public-entrypoint-export-drift`.
  - Scope `no-optional-domain-properties` to internal modules as `error`, and turn it off on
    public modules. Done 2026-11-11 (T16): off on `contract.ts`, `definition.ts`, `machine.ts`,
    `flow.ts`, `host/runtime.ts` and the suite's `machines/`.
  - Allow plain `try/catch` in exactly one module, the one that calls user callbacks and returns a
    `Result`. `Effect.try` costs about 170 ns against 7 ns per callback and would put Effect in the
    turn. `no-raw-try-catch` stays `error` everywhere else.
  - Narrow `no-allocation-in-loop` to the turn's hot modules. Done 2026-11-11 (T16): `src/core/turn.ts`.
  - Replace the proposed `src/host/` in `vite.config.ts` with the real host adapter directory, and
    narrow the "no Effect runtime" ban to the turn's modules if the compiler needs Effect.
  - Add the host adapter directory to `no-effect-runner-in-domain`,
    `no-unwrapped-promise-in-effect-core` and `no-unsafe-fiber-methods`.
- When v3 has an issue or diagnostic type: port `no-parallel-diagnostic-errors` to v3's path.
- When the first file lands in `src/`: remove `--no-error-on-unmatched-pattern`. Done 2026-11-11 (T16).
- Examples and docs apps: add each to the linted paths when it is created.
