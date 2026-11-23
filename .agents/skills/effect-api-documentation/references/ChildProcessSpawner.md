# `ChildProcessSpawner`

Source: installed `effect@4.1.4`, module `effect/process` (`node_modules/effect/src/process/ChildProcessSpawner.ts`). Platform implementation: `@effect/platform-node-shared@4.1.4` (`node_modules/@effect/platform-node-shared/src/NodeChildProcessSpawner.ts`), re-exposed through `@effect/platform-node`. Examples assume `import { ChildProcess, ChildProcessSpawner } from "effect/process"`.

`@stability unstable`: every export in `ChildProcessSpawner.ts` and `NodeChildProcessSpawner.ts` is tagged unstable.

`ChildProcessSpawner` is the service that starts processes for `ChildProcess` commands. Platform backends implement it; application code uses the `ChildProcess` module to build commands and the spawner to run them. See [ChildProcess](ChildProcess.md).

## API index

1. [ChildProcessSpawner](#childprocessspawner)
2. [ChildProcessHandle](#childprocesshandle)
3. [ExitCode](#exitcode)
4. [ProcessId](#processid)
5. [make](#make)
6. [NodeChildProcessSpawner.layer](#nodechildprocessspawnerlayer)

### Additional known APIs (not expanded)

`ChildProcessSpawner.Reref`, `ChildProcessSpawner.makeHandle`, `ChildProcessSpawner.ChildProcessHandle` (expanded above as a member list), `NodeChildProcessSpawner.flattenCommand`, `NodeChildProcessSpawner.FlattenedPipeline`, `NodeServices.layer` (from `@effect/platform-node`)

### [ChildProcessSpawner](/Users/arpit/Developer/flow-state/node_modules/effect/src/process/ChildProcessSpawner.ts:276)

Context tag and service interface for running processes.

Members (ChildProcessSpawner.ts:276-350):

```ts
spawn(command: Command): Effect<ChildProcessHandle, PlatformError, Scope>
exitCode(command: Command): Effect<ExitCode, PlatformError>
streamString(command: Command, options?: { includeStderr?: boolean }): Stream<string, PlatformError>
streamLines(command: Command, options?: { includeStderr?: boolean }): Stream<string, PlatformError>
lines(command: Command, options?: { includeStderr?: boolean }): Effect<Array<string>, PlatformError>
string(command: Command, options?: { includeStderr?: boolean }): Effect<string, PlatformError>
```

Confirmed behaviour:

- `spawn` needs a `Scope`. The process is stopped when the scope closes; see `NodeChildProcessSpawner.layer` below.
- `exitCode` (doc at ChildProcessSpawner.ts:293) reads and discards piped `stdout` and `stderr` until the process exits. A read failure before then, such as from an output `Sink`, fails the effect.
- `lines`, `string`, `streamLines`, `streamString` read `stdout` only unless `includeStderr: true`. Without it, piped `stderr` is drained and discarded until `stdout` ends (ChildProcessSpawner.ts:300-350).

Example:

```ts
import { Effect } from "effect"
import { ChildProcess, ChildProcessSpawner } from "effect/process"

const exitOf = (command: ChildProcess.Command) =>
  Effect.gen(function*() {
    const spawner = yield* ChildProcessSpawner.ChildProcessSpawner
    return yield* spawner.exitCode(command)
  })
```

### [ChildProcessHandle](/Users/arpit/Developer/flow-state/node_modules/effect/src/process/ChildProcessSpawner.ts:86)

Handle to a running process, returned by `spawn`.

Members (ChildProcessSpawner.ts:86-225):

```ts
interface ChildProcessHandle {
  readonly pid: ProcessId
  readonly exitCode: Effect<ExitCode, PlatformError>
  readonly isRunning: Effect<boolean, PlatformError>
  readonly kill: (options?: KillOptions) => Effect<void, PlatformError>
  readonly stdin: Sink<void, Uint8Array, never, PlatformError>
  readonly stdout: Stream<Uint8Array, PlatformError>
  readonly stderr: Stream<Uint8Array, PlatformError>
  readonly all: Stream<Uint8Array, PlatformError>
  readonly getInputFd: (fd: number) => Sink<void, Uint8Array, never, PlatformError>
  readonly getOutputFd: (fd: number) => Stream<Uint8Array, PlatformError>
  readonly unref: Effect<Reref, PlatformError>
}
```

Confirmed behaviour:

- `exitCode` waits for exit (ChildProcessSpawner.ts:96).
- `kill` defaults to `SIGTERM` (ChildProcessSpawner.ts:109). Node implementation: `kill` runs `terminateProcessGroup`, so it waits for the signalled process group, not only the leader (NodeChildProcessSpawner.ts:759-761, 584).
- `stdout` and `stderr` can be consumed separately; `all` interleaves them, and combining `all` with `stdout` or `stderr` may interleave output (ChildProcessSpawner.ts:122-135).
- `getInputFd` and `getOutputFd` work only for descriptors configured in `additionalFds` (ChildProcessSpawner.ts:86-208).
- `unref` lets the parent exit without waiting for the child; the returned `Reref` restores the default (ChildProcessSpawner.ts:208).

Example:

```ts
import { Effect, Stream } from "effect"
import { ChildProcess, ChildProcessSpawner } from "effect/process"

const run = Effect.gen(function*() {
  const spawner = yield* ChildProcessSpawner.ChildProcessSpawner
  const handle = yield* spawner.spawn(ChildProcess.make("node", ["--version"]))
  const out = yield* handle.stdout.pipe(Stream.decodeText(), Stream.mkString)
  const code = yield* handle.exitCode
  return { out, code }
}).pipe(Effect.scoped)
```

### [ExitCode](/Users/arpit/Developer/flow-state/node_modules/effect/src/process/ChildProcessSpawner.ts:31)

Branded number for a process exit code.

```ts
type ExitCode = Brand.Branded<number, "ExitCode">
const ExitCode: Brand.Constructor<ExitCode>   // ChildProcessSpawner.ts:40
```

Example:

```ts
import { ChildProcessSpawner } from "effect/process"

const ok = ChildProcessSpawner.ExitCode(0)
```

### [ProcessId](/Users/arpit/Developer/flow-state/node_modules/effect/src/process/ChildProcessSpawner.ts:50)

Branded number for an OS process id.

```ts
type ProcessId = Brand.Branded<number, "ProcessId">
const ProcessId: Brand.Constructor<ProcessId>   // ChildProcessSpawner.ts:59
```

Example:

```ts
import { Effect } from "effect"
import { ChildProcess, ChildProcessSpawner } from "effect/process"

const pidOf = (command: ChildProcess.Command) =>
  Effect.gen(function*() {
    const spawner = yield* ChildProcessSpawner.ChildProcessSpawner
    const handle = yield* spawner.spawn(command)
    return handle.pid
  }).pipe(Effect.scoped)
```

### [make](/Users/arpit/Developer/flow-state/node_modules/effect/src/process/ChildProcessSpawner.ts:237)

Builds a `ChildProcessSpawner` service from a `spawn` function. The helpers `exitCode`, `string`, `lines` and `streamLines` are derived from `spawn`.

Signature:

```ts
const make: (spawn: ChildProcessSpawner["Service"]["spawn"]) => ChildProcessSpawner["Service"]
```

Confirmed behaviour: `exitCode` returns once the process exits, even if descendants keep the pipes open (ChildProcessSpawner.ts:254-260, `Effect.raceFirst(handle.exitCode, ...)`). Helper output not read is drained so a full pipe cannot block the child (ChildProcessSpawner.ts:238-239).

Example:

```ts
import { Effect } from "effect"
import { ChildProcess, ChildProcessSpawner } from "effect/process"

const custom = ChildProcessSpawner.make((command: ChildProcess.Command) =>
  Effect.die(new Error("replace with a platform spawn for " + command._tag))
)
```

Use the platform layer for real processes, not this constructor.

### [NodeChildProcessSpawner.layer](/Users/arpit/Developer/flow-state/node_modules/@effect/platform-node-shared/src/NodeChildProcessSpawner.ts:872)

Layer providing the Node implementation of `ChildProcessSpawner`. Used by `NodeServices.layer` from `@effect/platform-node`.

Signature:

```ts
const layer: Layer<ChildProcessSpawner, never, FileSystem | Path>
```

Confirmed behaviour (module doc at NodeChildProcessSpawner.ts:1-30 and code):

- Scoped release and `kill` wait for the signalled process group (NodeChildProcessSpawner.ts:584-640).
- Without `forceKillAfter`, cleanup waits for the leader to exit with no time limit, then gives remaining group members 1 second to exit (`processGroupGraceMillis`, NodeChildProcessSpawner.ts:101). It does not escalate to `SIGKILL`.
- With `forceKillAfter`, cleanup can take the configured duration plus one more second after `SIGKILL`.
- On Windows, `taskkill` terminates the tree while the leader runs; descendants that outlive the leader keep running.
- POSIX cleanup targets a numeric process-group id; if the group is gone and the id is reused, an unrelated group may be signalled (module doc).
- `exitCode` races the process exit against input-stream failure (NodeChildProcessSpawner.ts:743-760). A failed stdin stream takes precedence over the exit status.

Example:

```ts
import { NodeServices } from "@effect/platform-node"
import { Effect } from "effect"
import { ChildProcess, ChildProcessSpawner } from "effect/process"

const program = Effect.gen(function*() {
  const spawner = yield* ChildProcessSpawner.ChildProcessSpawner
  const version = yield* spawner.string(ChildProcess.make("node", ["--version"]))
  return version.trim()
}).pipe(Effect.provide(NodeServices.layer))
```

### Release-note cross-check (not confirmed)

- Release page for 4.1.4 (`https://github.com/Effect-TS/effect/releases`) lists only 4.1.4 and no entries for #9846, process-group cleanup or #9930. Releases 4.0.5 through 4.1.3 were not on the page.
- The exit-code and drain behaviour above is cited from source comments, not from #9846.
- Process-group behaviour is cited from the module doc in `NodeChildProcessSpawner.ts`, not from release notes.
