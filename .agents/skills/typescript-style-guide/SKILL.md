---
name: typescript-style-guide
description: Review or write Flow State TypeScript using clean ownership, boundary, Effect, API, and proof patterns with compact good and bad examples.
---

# TypeScript Style Guide

Use this skill for how to write TypeScript, examples, tests, adapters, and public
API proofs. Optimize for code that is easy to read because ownership is simple,
not code that merely satisfies syntax bans.

## The target

Prefer:

```text
host input -> decode once -> domain value -> port/service -> live implementation -> host runtime
```

Before editing, identify the module owner, required dependencies, pure versus
effectful work, observable outcomes, lifetime/cleanup, and public versus
internal boundaries.

## One owner per module

Give each production module one primary responsibility. Contracts, domain
values, implementations, host adapters, composition roots, and fixtures should
not become one utility drawer.

```typescript
// Bad: unrelated owners share a file.
export const applyTransition = () => {};
export const startTimer = () => {};
export const serializeTrace = () => {};

// Good: transition, timer, and artifact modules own those concepts separately.
```

Split when ownership, dependency direction, lifetime, or test seam differs. Do
not split a short cohesive concept merely to satisfy a line-count target.

## Package composition and dependency direction

Dependencies flow inward:

```text
domain/core <- ports/contracts <- live implementations <- adapters/CLI/React/server/host
```

Core must not import host frameworks, generated output, CLI code, or the public
barrel. Put replaceable behavior behind a port and compose it at the host edge.

```typescript
// Good: the core owns the seam; the host supplies the implementation.
export interface StageLifecyclePort {
  readonly deploy: (stage: string) => Effect.Effect<DeployResult, StageLifecycleError>;
  readonly destroy: (stage: string) => Effect.Effect<void, StageLifecycleError>;
}

export const StageLifecycleLive = Layer.effect(StageLifecycle, implementation);
```

Use a port for replacement, testing, or a different runtime. Import-direction
lint catches obvious violations; ownership of a new concept still needs review.

## Choose file boundaries by responsibility

Use file names as signals, not proof:

- domain modules: values, types, pure transformations, and laws;
- `*Repository.ts`, `*Client.ts`, `*Port.ts`: narrow contracts and errors;
- `*Live.ts`: one implementation and its Layer construction;
- `*Schema.ts`: executable boundary schemas beside their types;
- `bin.ts`, `server.ts`, `react-entry.ts`: process/framework integration;
- tests: behavior proofs and local fakes, not production convenience exports.

```typescript
// Bad: utils.ts owns URL rules, row conversion, and process configuration.
export const joinUrl = () => {};
export const rowToAccount = () => {};
export const readConfig = () => {};
// Good: joinPreviewUrl, accountRowToAccount, and host configuration have owners.
```

Keep a contract and its errors close, mapping beside its implementation, and
process configuration at the host edge.

## Keep functions small by semantic phase

Extract an independent policy, validation rule, or boundary when the name makes
the behavior clearer. Do not extract every expression for a line-count metric.

```typescript
// Bad: phases disappear into nested plumbing.
const run = (stage: string) => port.deploy(stage).pipe(
  Effect.flatMap((deployed) => port.previewSeed(deployed)),
);

// Good: each meaningful phase is visible and cleanup stays at the boundary.
export const runStageLifecycle = (
  port: StageLifecyclePort,
  stage: string,
): Effect.Effect<StageRunResult, StageLifecycleError> =>
  Effect.gen(function* () {
    const deployed = yield* port.deploy(stage);
    yield* port.previewSeed({ target: deployed.target });

    const testModule = yield* port.mintTestModule(deployed);
    yield* port.runHook({ stage, ...deployed, testModule });

    return { stage, ...deployed, testModule } satisfies StageRunResult;
  }).pipe(Effect.onExit(() => port.destroy(stage)));
```

Prefer a short linear sequence to a maze of generic helpers. Name phases after
the domain rather than `step1` or `processData`.

## Infer implementation return types by default

Let named function implementations, methods, and callbacks infer their return
values. Repeating the computed type adds maintenance and can hide more precise
inference. Keep meaningful function names; do not inline helpers to avoid a type.
Consumer callback contracts and type-only signatures remain explicit.

The rewrite warning `anti-slop/prefer-inferred-return-types` covers `src/` and
`test/`, including static compiler fixtures. It requires a local
justification when an implementation needs an annotation. Put a standalone
`// RETURN_TYPE: <specific reason>` immediately above the function or its single
variable declaration, export, method, or property. The reason must identify the
contract or inference limitation: recursive inference, contextual callback
parameters, a predicate/assertion, overload compatibility, deliberate public
abstraction, readonly publication, or a precise compile-proof fixture.
"Readability" or "exported function" alone does not explain a required type.

```ts
const stateKey = (path: readonly string[]) => path.join(".");

// RETURN_TYPE: Prevents callers from mutating the published collection.
const collectNames = (names: readonly string[]): readonly string[] => [...names];
```

Do not mechanically delete annotations, replace them with casts, or move a
redundant annotation onto a local variable to silence the warning. Check callers,
readonly/literal/tuple information, predicates, Result/Effect channels, public
declarations, and type proofs. An exception for an outer function does not cover
nested callbacks. Existing examples elsewhere in this guide that show explicit
implementation returns illustrate their own topic; they do not override this
inference-first convention or its required local justification.

## Name domain helpers, not generic utilities

```typescript
// Bad: no invariant or domain is visible.
const transform = (value: unknown) => {};
const normalize = (left: string, right: string) => {};

// Good: the operation says what it protects.
const joinPreviewUrl = (previewUrl: string, route: string): string =>
  new URL(route, previewUrl).toString();

const accountRowToAccount = (row: AccountRow): Account =>
  Account.make({ id: AccountId.make(row.id), accountNumber: AccountNumber.make(row.account_number) });
```

Keep a helper beside its only caller. Promote it when it has a stable owner, an
independent contract, or multiple meaningful consumers. Avoid `utils.ts`,
`helpers.ts`, `manager.ts`, and `common.ts` as drawers. A `typeBrand` or
`copyObject` helper is not an abstraction until it protects a named concept.


## Make services narrow and implementations explicit

A service is one capability. Do not pass a god dependency record and carve it
up with `Pick`.

```typescript
// Bad: every consumer receives unrelated capabilities.
type Dependencies = { readonly database: Database; readonly email: EmailClient; readonly metrics: Metrics };
const readAccount = (deps: Pick<Dependencies, "database">) => {};

// Good: the port is cohesive and its implementation preserves the contract.
interface AccountReader {
  readonly findById: (id: AccountId) => Effect.Effect<Option<Account>, PersistenceError>;
}
const load: AccountStore["load"] = (id) => /* ... */;
const save: AccountStore["save"] = (account) => /* ... */;
const AccountStoreLive = { load, save } satisfies AccountStore;
```

Use `Context.Service` and a `FooLive` Layer for a real dependency seam. Capture
stable dependencies once at Layer construction; keep request values in the
operation and configuration at the composition root/host.

## Keep Promises at foreign boundaries

Never use `Effect.promise`. Prefer an Effect API over `Effect.tryPromise`; use
`tryPromise` only for an unavoidable foreign Promise. Add an adjacent
`FLOW_STATE_ALLOW_EFFECT_TRY_PROMISE:` comment, use object form, and map the
rejection to `Diagnostic`.

```typescript
// FLOW_STATE_ALLOW_EFFECT_TRY_PROMISE: vendor SDK exposes only Promise.
const loadAccountFromVendor = (id: AccountId): Effect.Effect<Account, Diagnostic> =>
  Effect.tryPromise({
    try: (signal) => sdk.loadAccount(id, { signal }),
    catch: (cause: unknown): Diagnostic => accountUnavailableDiagnostic({ id, cause }),
  });
```

Pass the supplied `AbortSignal` when supported. For a proven impossible
rejection, create an invariant `Diagnostic` and use `Effect.orDie`. Inline and
extracted calls follow the same rule.

## Keep raw `try/catch` at exceptional boundaries

Library code returns `Result` or `Effect` instead of catching errors. Use native
`try/catch` only at a final host boundary or unavoidable foreign interop, with a
local suppression explaining why. `try/finally` is fine for cleanup.

```typescript
// oxlint-disable-next-line anti-slop/no-raw-try-catch -- CLI boundary maps the final defect to an exit status.
try {
  await runCli();
} catch (cause) {
  process.exitCode = renderExitStatus(cause);
}
```

## Retry the smallest safe operation

Retry only the smallest repeat-safe operation. Filter typed transient failures
and bound the attempts. Never retry a whole non-idempotent workflow. Defects and
interruption are not typed transient failures.

## Execute Effects once at the host/runtime edge

Build Layers once. Reuse one `ManagedRuntime` per host and dispose it on
shutdown. Never call runners inside Effect code. Run only from the public
Runtime bridge, final host adapter, test harness, or shutdown path.

## Keep contract metadata external to the code.

Do not put project names, contract IDs, proof IDs, module paths, boundary
labels, "Flow" or "Flow State" name, or owner labels in production code, comments, or behavior-test names.
Map that metadata in the task tracker and review record. Use neutral symbols and
behavior names in the source:

```ts
export const valueBrand = Symbol("value");
it("rejects invalid names before construction", () => {});
```

## Make lifetime and concurrency ownership visible

Every resource, fiber, timer, listener, queue, subscription, cache, and runtime
needs one owner, one lifetime, and one reachable cleanup path. Request,
process, and detached background lifetimes are different contracts.

```typescript
// Bad: ownership and release are invisible.
const browser = yield* openBrowser;
return yield* useBrowser(browser);

// Good: acquisition, use, and release share one scope.
const withBrowser = <A, E>(use: (browser: Browser) => Effect.Effect<A, E>) =>
  Effect.scoped(Effect.acquireUseRelease(openBrowser, use, closeBrowser));
```

Do not detach fibers, timers, listeners, or subscriptions without documenting
their owner and shutdown path. Use `Clock`, `TestClock`, and `Schedule` instead
of `Date.now()` and real sleeps in deterministic Effect tests.

## Model outcomes instead of hiding them

Keep success, absence, no-op, refusal, expected failure, defect, interruption,
and cleanup failure distinct. Do not encode meaning as `undefined`, `false`, an
empty collection, or a generic error.

```typescript
// Bad: absence and operational failure collapse into one value.
const findAccount = async (id: string): Promise<Account | undefined> => {
  try { return await database.find(id); } catch { return undefined; }
};

// Good: the contract names absence and expected failure.
interface AccountReader {
  readonly findById: (id: AccountId) => Effect.Effect<Option<Account>, AccountLookupError>;
}
```

Use `Option` for expected absence and typed errors for expected operational
failure. Keep defects out of that vocabulary. Treat cleanup failure as part of
the resource contract, and model no-op/refusal when callers distinguish them.

## Use schemas as executable domain boundaries

Decode external data completely once and derive the type from the schema when
possible. Use an adapter when wire and domain shapes intentionally differ.

```typescript
// Bad: one marker is checked and the rest is asserted.
const account = JSON.parse(input) as Account;

// Good: the whole boundary is executable and typed.
const AccountNumber = Schema.String.pipe(Schema.pattern(/^[0-9]+$/u), Schema.brand("AccountNumber"));
type AccountNumber = typeof AccountNumber.Type;
const Account = Schema.Struct({ id: Schema.String, accountNumber: AccountNumber });
const account = Schema.decodeUnknownSync(Account)(JSON.parse(input));
```

Validate configuration, environment data, HTTP payloads, persisted data, and
fixtures at their real boundary. Do not maintain an independently edited type
beside a schema when drift can break the contract.

## Use `unknown` and `never` deliberately

Use `unknown` for unvalidated input and foreign failures, then narrow it once at
the boundary. Do not publish unexplained `unknown` Effect channels. Use `never`
for genuinely impossible states, not to skip validation.

## Model expected failures with the canonical Diagnostic

Use the canonical `Diagnostic` for expected failures. Its owner defines the one
`Schema.TaggedError`; feature code maps failures through named projectors. Do
not define feature-level `Data.TaggedError`, `Schema.TaggedError`, or error
classes.

Keep failure diagnostics in `E`. Keep defects and interruption separate until
the final host renderer.

## Use Result for explicit local success and failure

Use `Result.Result<A, Diagnostic>` for pure recoverable work. Convert it once
with `Effect.fromResult`. Return Effect directly only when the operation needs
Effect semantics.

```ts
const parseCount = (value: string): Result.Result<number, Diagnostic> =>
  /^\d+$/u.test(value)
    ? Result.succeed(Number(value))
    : Result.fail(invalidCountDiagnostic());

const program = Effect.fromResult(parseCount(input));
```

## Use Predicate for reusable narrowing

Use an Effect `Predicate` when a type guard or boolean check has a stable name,
will be reused, or composes with other predicates. Inline a one-use condition.

```ts
import { Predicate } from "effect";

const isText = Predicate.isString;
const input: unknown = "ready";
if (isText(input)) input.toUpperCase();
```

## Use @effect/vitest for Effect tests

Use `@effect/vitest` for Effect-aware test declarations and assertions. Use
`it.effect` for an Effect-returning test and regular `it` for pure synchronous
behavior.

```ts
import { assert, describe, it } from "@effect/vitest";
import { Effect } from "effect";

describe("lookup", () => {
  it.effect("returns the value", () =>
    Effect.sync(() => assert.strictEqual("ready", "ready")));
});
```

## Treat mutation and readonly as semantic choices

Keep mutable state private. Local mutation is good for a bounded algorithm when
it clarifies order and ownership; publish once. Copy once at a real boundary.
Do not use `Object.freeze`: readonly types and ownership boundaries are the
project standard. freezing objects in general is not useful so do not invent 
new alternative ways for doing it.

```typescript
// Good: mutation is private; the published snapshot is readonly by type.
const collectAccounts = (rows: readonly AccountRow[]): readonly Account[] => {
  const accounts: Account[] = [];
  for (const row of rows) accounts.push(accountRowToAccount(row));
  return accounts;
};
```

Avoid a forest of shallow copies and runtime-freezing workarounds. Prefer a
private mutable class field over a public mutable property. Use readonly forms
when they communicate a boundary, not as redundant wrappers. Compute a summary,
then construct one result object; use one spread copy for a persistent snapshot.

## Design public entrypoints as a deliberate surface

Public entrypoints are contracts, not convenience barrels. Internal modules
import their owner directly; consumers and public-surface proofs import the
facade.

```typescript
// Bad: every internal helper becomes public.
export * from "./internal/index.js";

// Good: exports are curated and outward-only.
export { Account, AccountId } from "./account/Account.js";
export { AccountRepository, AccountRepositoryLive } from "./account/AccountRepository.js";
export type { AccountLookupError } from "./account/errors.js";
```

Review the supported values, types, constructors, errors, and adapters. Preserve
type information, avoid package-dist/self-imports, and prove public reachability
with a type test. Do not make a facade an excuse for inward imports or an
unreviewed `export *` tree.

## Write tests that prove laws and failure paths

Test at the smallest real seam: pure laws; service/port behavior; schema and
type boundaries; database/HTTP/CLI/React integration; then lifetime,
interruption, ordering, cleanup, and concurrency.

```typescript
// Bad: mocks and snapshots hide the contract.
vi.mock("./AccountRepositoryLive.js");
expect(await run()).toMatchSnapshot();

// Good: a named fake makes the observable law explicit.
const calls: string[] = [];
const port: StageLifecyclePort = {
  deploy: (stage) => Effect.sync(() => { calls.push(`deploy:${stage}`); return deployed; }),
  previewSeed: (request) => Effect.sync(() => { calls.push(`preview:${request.target}`); }),
  mintTestModule: () => Effect.succeed(testModule),
  runHook: () => Effect.void,
  destroy: (stage) => Effect.sync(() => { calls.push(`destroy:${stage}`); }),
};
```

Name tests after laws and failure paths. Share fixture scaffolding, not scenario
identity or mutable state. Avoid real sleeps, module mocks, conditional
assertions, and snapshots that hide important semantics.

## Comments should explain decisions

Comments preserve ownership, invariants, compatibility, failure, lifetime, or
safety. They do not narrate syntax.

```typescript
// Bad: the code already says this.
// Call deploy with stage.
const deployed = yield* port.deploy(stage);

// Good: this explains why cleanup is attached here.
// The port owns this temporary deployment through failure and interruption.
const result = workflow.pipe(Effect.onExit(() => port.destroy(stage)));
```

If a comment is needed because ownership is invisible, prefer making ownership
visible in the type or module boundary.

## Vertical spacing between meaningful work chunks

Put a blank line between meaningful phases in a sequential workflow. Use it as
a visual boundary for preparation, execution, and publication/cleanup—not after
every statement.

```typescript
const deployed = yield* port.deploy(stage);
yield* port.previewSeed({ target: deployed.target });

const testModule = yield* port.mintTestModule(deployed);
yield* port.runHook({ stage, ...deployed, testModule });

return { stage, ...deployed, testModule } satisfies StageRunResult;
```

Keep statements in one phase together. Add spacing when the reader should pause
before a new responsibility; remove it when it fragments one expression.
Formatter settings should preserve this intent.

## Greenfield rewrite order

1. Write the owner sentence and target pipeline.
2. Define domain values, schemas, errors, and outcome vocabulary.
3. Define narrow ports and public contracts.
4. Implement pure policies and projections.
5. Implement `*Live` services and explicit adapters.
6. Compose Layers, scopes, queues, schedules, and owned fibers.
7. Add the host entrypoint and run Effects once at the edge.
8. Curate exports and type-level reachability proofs.
9. Add behavior, failure, cleanup, ordering, and integration proofs.

Do not begin with a framework-shaped runtime, god service, or public barrel and
infer ownership later.

## Explicit non-bans

These require context, so they are not blanket violations: classes, interfaces,
type aliases, arrows, declarations, `readonly`, `Readonly<T>`, bounded local
mutation, generics, `NoInfer`, `Parameters`, `ReturnType`, `Promise`, `throw`,
`typeof`, `Effect.gen`, `flatMap`, `Effect.succeed`, `Effect.fail`, Layer
composition, public facades, internal barrels, larger files, and default
exports when deliberately owned. Restrict runners and native `try/catch` to the
boundaries above. `Effect.promise` is always banned.

Review them for meaning, ownership, and boundary placement. Never erase a useful
type or failure contract with `unknown`, a cast, a meaningless comment, or a
broad lint exemption merely to satisfy a mechanical rule.

## Enforcement and review

Preserve the `Effect<A, E, R>` story. Typed failures or service requirements must be preserved.
Anti-slop lint rules own deterministic syntax, type shape, and configured imports.
Formatters own layout. This skill owns composition, API shape, service cohesion,
Effect boundaries, lifetime, failure meaning, copying, decomposition, fixture
design, comments, spacing, and proof quality.

For each change: read the module, contract, callers, tests, and package boundary;
apply mechanical replacements without erasing evidence; review dependency
direction, `A/E/R`, scope, time, concurrency, runner placement, cleanup,
Promise cancellation, retry safety, trace names, exports, naming, copying,
helper promotion, fixture identity, comments, and spacing; then run the smallest
focused lint, type, and behavior checks. Record intentional exceptions with
their owner and invariant.

God dependency bags, duplicate fixture semantics, unstructured Layers,
mixed-owner files, and accidental public exports are review findings—not reasons
to add broad syntax bans.
