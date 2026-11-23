# `ChildProcess`

Source: installed `effect@4.1.4`, module `effect/process` (`node_modules/effect/src/process/ChildProcess.ts`). Examples assume `import { ChildProcess } from "effect/process"`.

`@stability unstable`: the module's own doc header says so. It is published as `effect/process`; the stability tag is what marks it unstable.

`ChildProcess` builds command values. A `Command` is an `Effect` that, when run, asks the `ChildProcessSpawner` service to start the process and returns a `ChildProcessHandle`. Running a command needs `ChildProcessSpawner | Scope` in the environment. See [ChildProcessSpawner](ChildProcessSpawner.md) for running, exit codes, streams and killing.

## API index

1. [ChildProcess.make](#childprocessmake)
2. [ChildProcess.pipeTo](#childprocesspipeto)
3. [ChildProcess.KillOptions](#childprocesskilloptions)
4. [ChildProcess.CommandOptions](#childprocesscommandoptions)
5. [ChildProcess.Command](#childprocesscommand)
6. [ChildProcess.isCommand](#childprocessiscommand)

### Additional known APIs (not expanded)

`ChildProcess.StandardCommand`, `ChildProcess.PipedCommand`, `ChildProcess.isStandardCommand`, `ChildProcess.isPipedCommand`,
`ChildProcess.prefix`, `ChildProcess.setCwd`, `ChildProcess.setEnv`, `ChildProcess.parseFdName`, `ChildProcess.fdName`,
`ChildProcess.PipeOptions`, `ChildProcess.PipeFromOption`, `ChildProcess.PipeToOption`, `ChildProcess.CommandInput`,
`ChildProcess.CommandOutput`, `ChildProcess.Signal`, `ChildProcess.Encoding`, `ChildProcess.StdinConfig`,
`ChildProcess.StdoutConfig`, `ChildProcess.StderrConfig`, `ChildProcess.AdditionalFdConfig`

### [ChildProcess.make](/Users/arpit/Developer/flow-state/node_modules/effect/src/process/ChildProcess.ts:731)

Creates a `StandardCommand` from a template literal, from a program name with an array of arguments, or from an options object followed by a template.

Signatures (four overloads, in source order):

```ts
make(command: string, options?: CommandOptions): StandardCommand                       // ChildProcess.ts:783
make(command: string, args: ReadonlyArray<CommandLine.Word>, options?: CommandOptions): StandardCommand // :835
make(options: CommandOptions): (
  templates: TemplateStringsArray,
  ...expressions: ReadonlyArray<CommandLine.TemplateExpression>
) => StandardCommand                                                                   // :891
make(
  templates: TemplateStringsArray,
  ...expressions: ReadonlyArray<CommandLine.TemplateExpression>
): StandardCommand                                                                     // :946
```

Confirmed behaviour (source doc block, ChildProcess.ts:696-730):

- A template is parsed when `make` is called. Shell syntax such as `|`, `$HOME`, `*` or `~` throws `CommandLine.CommandLineError` at that point.
- Each `${}` value is one literal argument.
- The program name cannot be `Redacted`.
- A NUL character in the command, an argument or an `env` value fails with `BadArgument` at spawn time, not at `make`.
- With the `shell` option, a template cannot contain `${}` values.

Example:

```ts
import { ChildProcess } from "effect/process"

const fromTemplate = ChildProcess.make`echo "hello world"`
const withOptions = ChildProcess.make({ cwd: "/tmp" })`ls -la`
const fromArray = ChildProcess.make("git", ["status"])

const first = [fromTemplate.args[0], withOptions.options.cwd, fromArray.args[0]]
// first => ["hello world", "/tmp", "status"]
```

### [ChildProcess.pipeTo](/Users/arpit/Developer/flow-state/node_modules/effect/src/process/ChildProcess.ts:1024)

Pipes the output of one command into another, returning a `PipedCommand`. Dual: works data-last inside `.pipe` or data-first.

Signatures:

```ts
pipeTo(that: Command, options?: PipeOptions): (self: Command) => PipedCommand   // ChildProcess.ts:1061
pipeTo(self: Command, that: Command, options?: PipeOptions): PipedCommand        // ChildProcess.ts:1098
```

Confirmed behaviour: by default it pipes `stdout` of `self` to `stdin` of `that`. `PipeOptions.from` selects `"stdout" | "stderr" | "all" | "fdN"`, and `PipeOptions.to` selects `"stdin" | "fdN"` (types at ChildProcess.ts:96, 110, 131).

Example:

```ts
import { ChildProcess } from "effect/process"

const pipeline = ChildProcess.make`my-program`.pipe(
  ChildProcess.pipeTo(ChildProcess.make`grep error`, { from: "stderr" })
)
// pipeline._tag => "PipedCommand"; pipeline.options.from => "stderr"
```

### [ChildProcess.KillOptions](/Users/arpit/Developer/flow-state/node_modules/effect/src/process/ChildProcess.ts:258)

Options for terminating a child process. Used by `ChildProcessHandle.kill` and as part of `CommandOptions`.

```ts
interface KillOptions {
  readonly killSignal?: Signal | undefined      // default "SIGTERM"
  readonly forceKillAfter?: Duration.Input | undefined
}
```

Confirmed behaviour (ChildProcess.ts:258-282): `forceKillAfter` undefined means `SIGKILL` is never sent and termination waits for exit with no time limit. The spawner decides whether descendants are terminated; see [ChildProcessSpawner](ChildProcessSpawner.md#nodechildprocessspawnerlayer) for the Node behaviour.

Example:

```ts
import { ChildProcess } from "effect/process"

const cmd = ChildProcess.make("my-server", [], {
  killSignal: "SIGINT",
  forceKillAfter: "5 seconds"
})
```

### [ChildProcess.CommandOptions](/Users/arpit/Developer/flow-state/node_modules/effect/src/process/ChildProcess.ts:443)

Options accepted by `make`. Extends `KillOptions`.

Fields, all optional: `cwd`, `env`, `extendEnv`, `shell`, `detached`, `windowsHide`, `stdin`, `stdout`, `stderr`, `additionalFds`.

Confirmed behaviour (ChildProcess.ts:443-630):

- `env` with `extendEnv` unset or `false` replaces the inherited environment. The child then does not get `PATH` unless `env` includes it.
- `extendEnv: true` merges `env` over `process.env`. A `undefined` value removes the variable.
- `shell` runs the command as a script. Running a command with both `shell` and arguments fails with `BadArgument`.
- `Redacted` values in `env` and arguments are passed through and not shown in errors.

Example:

```ts
import { ChildProcess } from "effect/process"

const cmd = ChildProcess.make("node", ["script.js"], {
  cwd: "/app",
  env: { NODE_ENV: "production" },
  extendEnv: true,
  stdout: "pipe"
})
```

### [ChildProcess.Command](/Users/arpit/Developer/flow-state/node_modules/effect/src/process/ChildProcess.ts:37)

Union type of the two command shapes built by this module. Each member is an `Effect<ChildProcessHandle, PlatformError, ChildProcessSpawner | Scope>`.

```ts
type Command = StandardCommand | PipedCommand
```

Confirmed: `StandardCommand` has `_tag: "StandardCommand"`, `command`, `args`, `options` (ChildProcess.ts:48). `PipedCommand` has `_tag: "PipedCommand"`, `left`, `right`, `options` (ChildProcess.ts:69).

Example:

```ts
import { Effect } from "effect"
import { ChildProcess, ChildProcessSpawner } from "effect/process"

const run = (command: ChildProcess.Command) =>
  Effect.gen(function*() {
    const spawner = yield* ChildProcessSpawner.ChildProcessSpawner
    return yield* spawner.exitCode(command)
  })
```

### [ChildProcess.isCommand](/Users/arpit/Developer/flow-state/node_modules/effect/src/process/ChildProcess.ts:636)

Guard for `Command`.

```ts
const isCommand: (u: unknown) => u is Command
```

Example:

```ts
import { ChildProcess } from "effect/process"

const value: unknown = ChildProcess.make("ls")
const ok = ChildProcess.isCommand(value) // true
```
