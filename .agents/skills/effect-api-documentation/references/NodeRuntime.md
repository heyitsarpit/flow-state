# `NodeRuntime`

Source: [Effect v4 Node runtime guide](https://www.effect.website/docs/v4/platform/runtime). Examples assume `import { Effect } from "effect"` and `import { NodeRuntime } from "@effect/platform-node"`.

`NodeRuntime` adapts an Effect program to Node.js process startup, signal handling, execution, and shutdown.

## API index

1. [NodeRuntime.runMain](#noderuntimerunmain)

### Additional known APIs (not expanded)

`NodeRuntime`

### [NodeRuntime.runMain](/Users/arpit/Developer/flow-state/codebases/effect-v4/packages/platform-node/src/NodeRuntime.ts:39)

Runs an Effect as a Node.js process entrypoint with interruption for `SIGINT`/`SIGTERM`, failure reporting, exit codes, and final teardown.

```ts
const program = Effect.succeed("server started");
NodeRuntime.runMain(program, { disableErrorReporting: true });
```
