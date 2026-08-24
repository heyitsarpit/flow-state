# `Runtime`

Source: [Effect v4 `Runtime` API](https://www.effect.website/docs/v4/api/effect/Runtime). Examples assume `import { Effect, Exit, Runtime } from "effect"`.

## API index

1. [Runtime.makeRunMain](#runtimemakerunmain)
2. [Runtime.defaultTeardown](#runtimedefaultteardown)
3. [Runtime.errorExitCode](#runtimeerrorexitcode)
4. [Runtime.getErrorExitCode](#runtimegeterrorexitcode)
5. [Runtime.errorReported](#runtimeerrorreported)
6. [Runtime.getErrorReported](#runtimegeterrorreported)

### Additional known APIs (not expanded)

`Teardown`

### [Runtime.makeRunMain](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Runtime.ts:201)

Builds a host-specific main runner around a forked fiber, teardown policy, and optional automatic error reporting.

```ts
const runMain = Runtime.makeRunMain(({ fiber, teardown }) => {
  fiber.addObserver((exit) => teardown(exit, (code) => console.log(code)));
});
runMain(Effect.succeed("started"));
```

### [Runtime.defaultTeardown](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Runtime.ts:117)

Maps success, interruption, and failure exits to conventional process exit codes.

```ts
Runtime.defaultTeardown(Exit.succeed("ok"), (code) => console.log(code));
```

### [Runtime.errorExitCode](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Runtime.ts:307)

Marks an error with the exit code that the default teardown should use.

```ts
const error = Object.assign(new Error("invalid input"), {
  [Runtime.errorExitCode]: 2,
});
```

### [Runtime.getErrorExitCode](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Runtime.ts:333)

Reads a custom exit code from unknown error data and falls back to `1` when no valid marker exists.

```ts
const code = Runtime.getErrorExitCode({ [Runtime.errorExitCode]: 2 });
```

### [Runtime.errorReported](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Runtime.ts:399)

Marks an error as already reported so a main runner can avoid logging it again.

```ts
const error = Object.assign(new Error("already logged"), {
  [Runtime.errorReported]: false,
});
```

### [Runtime.getErrorReported](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/effect/src/Runtime.ts:424)

Reads the reporting marker from unknown error data; missing or invalid markers default to `true`.

```ts
const shouldReport = Runtime.getErrorReported(new Error("unreported"));
```
