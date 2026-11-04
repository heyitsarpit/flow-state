# lint-bomb in Flow State

Status: proposed, 2026-11-04. Arpit has not reviewed these choices yet.

The lint rules for Flow State v3 production code. The config is the `lint` block of the root
`vite.config.ts`. This note gives the reason for each choice. Change both together.

## Source

- Vendored from `/Users/arpit/Developer/workflow/lint-bomb` at commit
  `183d43b995bc5488a811c19e326a463eafbb4c67` ("Five rule changes from Flow State"), with no local
  changes. Copied: `src/`,
  `test/rules.test.ts`, `LICENSE`, `RULES.md`, `STYLE.md` and `examples/`, as its README says.
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
- `check` and `lint` pass `--no-error-on-unmatched-pattern` because `packages/flow-state-v3/src/`
  does not exist yet. Remove the flag when the first source file lands, so that a wrong path can't
  pass by linting nothing.

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
  `no-swallowed-cleanup-error`). The conformance harness runs on a fake clock, and a microtask turn
  proves nothing.
- **Path options set now:** `no-direct-process-env`, `no-module-level-mutable-state`,
  `no-object-type` and `no-unknown` are scoped to `packages/flow-state-v3/src`, and
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
- `no-large-production-file`: `warn` at 500 lines, 1000 for tests. Line count alone doesn't
  justify a split, and a lane or edge module owns one invariant. 173 of Effect's 417 source
  files are over 500 lines.

Rules that misfire on a library with public types:

- `no-object-freeze`: `warn`. Snapshots published to React may need freezing by contract, and
  the matcher flags every reference.
- `prefer-effect-native-tagged-types`: `warn`. `Compiled` and records are JSON data (D194), so
  Schema owns those variants. The rule can't resolve imported models, so it would report each
  module.
- `no-readonly`: `off` (Arpit, 2026-11-04). The rule exists to stop agents overusing `readonly`.
  Here `readonly` is the only zero-cost guard against a turn mutating the previous turn's state:
  316 internal findings on the round 13 runtime (`packages/flow-state-v3/lint-eval.md`). Its
  `allowInExportedTypes` option stays in lint-bomb for other projects.
- New in lint-bomb on 2026-11-04, from the prototype's failure history (`packages/flow-state-v3/lint-eval.md`):
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
- Added on 2026-11-04 (Arpit), each from a prototype finding. Proved by probe files that tripped
  every one, then deleted. In the core, meaning `src` except tests and `src/host/` (a proposed name):
  - Host APIs banned: `window`, `document`, `navigator`, `indexedDB`, `localStorage`,
    `sessionStorage`. Only `src/host/` touches the platform: the freeze bug, the bfcache lock, and
    Safari's false `oncomplete`.
  - Scheduling banned: `setTimeout`, `setInterval`, `queueMicrotask`, `Promise`. The core returns
    work as data for the driver.
  - No Effect runtime: `Effect.gen`, `runSync`, `runPromise`, `runFork`, `try`, `tryPromise`. This
    keeps the turn's hot path pure (0.2 ms p99; `Effect.try` costs 170 ns against 7 ns).
  - Determinism: `Math.random` and `crypto` are banned. Ids come from the runtime's mint, so
    stories, replays and searches reproduce a run (round 13's H1).
  - `JSON.stringify` is banned: equality goes through `Schema.toEquivalence`, keys through their
    Schema codec (round 10's text-order equality, the prototype's `canon`).
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
  - `Date` and `performance` are banned outside tests ("use the supplied Effect Clock").
  - `setTimeout`, `setInterval`, `Effect.sleep` and `Effect.delay` are banned in tests ("use
    TestClock").
  - `no-param-reassign`, `no-var` and `import/no-mutable-exports`.

## Deferred, with what triggers each

- When the module layout is decided:
  - Enable `no-inward-module-dependency` and `no-public-entrypoint-export-drift`.
  - Scope `no-optional-domain-properties` to internal modules as `error`, and turn it off on
    public modules.
  - Allow plain `try/catch` in exactly one module, the one that calls user callbacks and returns a
    `Result`. `Effect.try` costs about 170 ns against 7 ns per callback and would put Effect in the
    turn. `no-raw-try-catch` stays `error` everywhere else.
  - Narrow `no-allocation-in-loop` to the turn's hot modules.
  - Replace the proposed `src/host/` in `vite.config.ts` with the real host adapter directory, and
    narrow the "no Effect runtime" ban to the turn's modules if the compiler needs Effect.
  - Add the host adapter directory to `no-effect-runner-in-domain`,
    `no-unwrapped-promise-in-effect-core` and `no-unsafe-fiber-methods`.
- When v3 has an issue or diagnostic type: port `no-parallel-diagnostic-errors` to v3's path.
- When the first file lands in `src/`: remove `--no-error-on-unmatched-pattern`.
- Examples and docs apps: add each to the linted paths when it is created.
