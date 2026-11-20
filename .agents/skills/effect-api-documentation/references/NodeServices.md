# `NodeServices`

Source: installed declarations and JavaScript in `@effect/platform-node@4.1.4` (`node_modules/@effect/platform-node/dist/NodeServices.d.ts`, `NodeServices.js`), with the shared implementations in `@effect/platform-node-shared@4.1.4` (`node_modules/@effect/platform-node-shared/dist/`). Examples assume `import { Console, Effect, Path } from "effect"` and `import { NodeRuntime, NodeServices } from "@effect/platform-node"`.

`NodeServices` is the Node.js platform layer. One `layer` provides the five standard services a program can require: `ChildProcessSpawner`, `FileSystem`, `Path`, `Stdio` and `Terminal`. Provide it at the program's edge, and run the result with `NodeRuntime.runMain` (see `NodeRuntime.md`).

**Stability:** the module and the layer are `@stability unstable` (`NodeServices.d.ts:9`, `:22`). Every export below carries the same marker.

**Requirement:** the layer's requirement is `never` (`NodeServices.d.ts:35`), so it satisfies the standard `effect/cli` environment (`Command.Environment`; see `Cli.md`).

## API index

1. [NodeServices.layer](#nodeserviceslayer)
2. [NodeServices.NodeServices](#nodeservicesnodeservices)

### Additional known APIs (not expanded)

`NodeChildProcessSpawner`, `NodeFileSystem`, `NodePath`, `NodeStdio`, `NodeTerminal`, `NodeRuntime.runMain`

### [NodeServices.layer](/Users/arpit/Developer/flow-state/node_modules/@effect/platform-node/dist/NodeServices.d.ts:35)

Provides the default Node implementation of every service in `NodeServices`. Use it as `Effect.provide(NodeServices.layer)` on a program's top-level effect.

**Signature**

```ts
export declare const layer: Layer.Layer<NodeServices>;
```

**Confirmed behaviour**

- Implementation: `Layer.provideMerge(NodeChildProcessSpawner.layer, Layer.mergeAll(NodeFileSystem.layer, NodePath.layer, NodeStdio.layer, NodeTerminal.layer))` (`NodeServices.js:15`). The spawner needs `FileSystem | Path` (`@effect/platform-node-shared/dist/NodeChildProcessSpawner.d.ts:47`); the merge supplies them, and the output includes all five services.
- `FileSystem`: `NodeFileSystem.layer` (`@effect/platform-node-shared/dist/NodeFileSystem.js:549`).
- `Stdio`: `NodeStdio.layer`, with `args` = `process.argv.slice(2)` (`@effect/platform-node-shared/dist/NodeStdio.js:29`). `Command.run` reads this (see `Cli.md`).
- `Terminal`: `NodeTerminal.layer`, which ends key input on Esc, Ctrl+C or Ctrl+D (`@effect/platform-node-shared/dist/NodeTerminal.js:180`-`183`, `:179`).
- Confirmed at runtime: a program that required all five services ran under `Effect.provide(NodeServices.layer)`. `Path.join("a", "b")` gave `a/b`; `Stdio.args` gave the script's arguments; `columns` was `0` with stdout piped.

```ts
import { Console, Effect, Path } from "effect"
import { NodeRuntime, NodeServices } from "@effect/platform-node"

const main = Effect.gen(function*() {
  const path = yield* Path.Path
  yield* Console.log(path.join("src", "index.ts"))
}).pipe(Effect.provide(NodeServices.layer))

NodeRuntime.runMain(main)
```

### [NodeServices.NodeServices](/Users/arpit/Developer/flow-state/node_modules/@effect/platform-node/dist/NodeServices.d.ts:26)

The union of the five services `layer` provides. Use it to type code that needs the Node platform without naming each service.

**Signature**

```ts
export type NodeServices = ChildProcessSpawner | FileSystem | Path | Stdio | Terminal;
```

**Confirmed behaviour**

- Declaration at `NodeServices.d.ts:26`.
- Providing `NodeServices.layer` satisfies a requirement of type `NodeServices.NodeServices`, because the layer's output is that union.

```ts
import { Effect, Path } from "effect"
import { NodeServices } from "@effect/platform-node"

export const runWithNode = <A, E>(effect: Effect.Effect<A, E, NodeServices.NodeServices>) =>
  effect.pipe(Effect.provide(NodeServices.layer))

export const joined = runWithNode(Effect.gen(function*() {
  return (yield* Path.Path).join("a", "b")
}))
```

## Project use (`packages/flow-state-v3`)

- No file in the project imports `@effect/platform-node`; the root `package.json` pins it at `4.1.4` (`package.json:38`-`39`).
- The CLI test builds its platform environment by hand (`tests/cli/cli.test.ts:55`-`82`) and does not use `NodeServices.layer`.
