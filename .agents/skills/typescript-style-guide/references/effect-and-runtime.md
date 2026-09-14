# Effect and runtime

Read this when a change adds an Effect, service, Layer, Promise bridge, retry,
resource, fiber, timer, or runtime entrypoint.

## Choose the smallest effect shape

- Keep pure work in plain TypeScript.
- Use `Result.Result<A, Diagnostic>` for pure, recoverable success or failure.
- Convert a `Result` once with `Effect.fromResult`.
- Use `Effect` when the operation needs services, async work, resources, cancellation, retries, or Effect recovery.
- Preserve `Effect<A, E, R>`. Do not erase channels with `unknown`, casts, or `any`.

## Keep foreign Promises at the boundary

- Prefer a native Effect API.
- Never use `Effect.promise`.
- Use `Effect.tryPromise` only when a foreign API exposes only a Promise.
- Use the object form.
- Pass the supplied `AbortSignal` when the API supports it.
- Map rejection to the canonical `Diagnostic`.
- Put this adjacent to the call:

  ```ts
  // FLOW_STATE_ALLOW_EFFECT_TRY_PROMISE: vendor SDK exposes only Promise.
  const loadAccount = (id: AccountId) =>
    Effect.tryPromise({
      try: (signal) => sdk.load(id, { signal }),
      catch: (cause: unknown) => accountUnavailableDiagnostic({ id, cause }),
    });
  ```

- For a proven impossible rejection, create an invariant `Diagnostic` and use `Effect.orDie`.
- Inline and extracted calls follow the same rule.

## Keep raw `try/catch` at an exceptional boundary

- Library code returns `Result` or `Effect`.
- Use native `try/catch` only at a final host boundary or unavoidable foreign interop.
- Add a local suppression that says why the boundary needs it.
- `try/finally` is valid for cleanup.

```ts
// oxlint-disable-next-line anti-slop/no-raw-try-catch -- CLI maps the final defect to an exit status.
try {
  await runCli();
} catch (cause) {
  process.exitCode = renderExitStatus(cause);
}
```

## Retry only safe work

- Retry the smallest repeat-safe operation.
- Bound the attempts.
- Filter typed transient failures.
- Do not retry a whole non-idempotent workflow.
- Defects and interruption are not typed transient failures.

## Build and run at the host edge

- Build Layers once.
- Reuse one `ManagedRuntime` per host.
- Dispose it during shutdown.
- Run Effects only from a public runtime bridge, final host adapter, test harness, or shutdown path.
- Never run an Effect from inside Effect code.

## Make lifetime and concurrency explicit

Every resource, fiber, timer, listener, queue, subscription, cache, and runtime
needs:

- One owner.
- One lifetime.
- One reachable cleanup path.

Keep acquisition, use, and release in one scope:

```ts
const withBrowser = <A, E>(use: (browser: Browser) => Effect.Effect<A, E>) =>
  Effect.scoped(Effect.acquireUseRelease(openBrowser, use, closeBrowser));
```

- Request, process, and detached background lifetimes are different contracts.
- Do not detach a fiber, timer, listener, or subscription without naming its owner and shutdown path.
- Use `Clock`, `TestClock`, and `Schedule` in deterministic Effect tests.
- Avoid `Date.now()` and real sleeps in those tests.

## Do not turn design rules into blanket bans

Classes, interfaces, type aliases, arrow functions, generics, `Promise`,
`throw`, `Effect.gen`, `flatMap`, `Effect.succeed`, `Effect.fail`, Layer
composition, public facades, internal barrels, and larger files need context.

Review their owner, meaning, boundary, and lifetime. Keep `Effect.promise`
banned. Preserve useful types and failure contracts.
