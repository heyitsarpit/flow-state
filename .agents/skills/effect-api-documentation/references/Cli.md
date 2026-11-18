# `effect/cli`

Source: installed declarations and JavaScript in `effect@4.1.4` (`node_modules/effect/dist/cli/`). Examples assume `import { Console, Effect, Option } from "effect"` and `import { Argument, CliError, Command, Flag } from "effect/cli"`, and that `NodeServices` and `NodeRuntime` come from `@effect/platform-node`.

`effect/cli` builds typed command-line applications. A `Command` combines a name, `Flag` and `Argument` parameters, optional subcommands, help metadata and an Effect handler. Runners read the arguments, render help and errors, and run the selected handler with the services it requires.

**Stability:** every export below is marked `@stability unstable`, so a minor release may break it. The module-level marker is at `Command.d.ts:11`, and each module in `cli/index.d.ts` carries the same marker.

**Import path:** the brief named `effect/unstable/cli`. In 4.1.4 the path is `effect/cli`: `package.json` maps `"./cli"` to `./dist/cli/index.js` (`package.json:37`), and there is no `dist/unstable/` directory. This reference uses `effect/cli`.

## API index

1. [Command.make](#commandmake)
2. [Command.withDescription](#commandwithdescription)
3. [Command.withSubcommands](#commandwithsubcommands)
4. [Command.withHandler](#commandwithhandler)
5. [Command.provide](#commandprovide)
6. [Command.run](#commandrun)
7. [Command.runWith](#commandrunwith)
8. [Command.Environment](#commandenvironment)
9. [Flag.String](#flagstring)
10. [Flag.Boolean](#flagboolean)
11. [Flag.withDefault](#flagwithdefault)
12. [Flag.withAlias](#flagwithalias)
13. [Flag.withDescription](#flagwithdescription)
14. [Flag.optional](#flagoptional)
15. [Argument.String](#argumentstring)
16. [Argument.withDefault](#argumentwithdefault)
17. [Argument.variadic](#argumentvariadic)
18. [Argument.withDescription](#argumentwithdescription)
19. [CliError.ShowHelp](#clierrorshowhelp)

### Additional known APIs (not expanded)

`Command.Command`, `Command.Config`, `Command.Error`, `Command.Services`, `Command.Example`, `Command.isCommand`, `Command.validate`, `Command.withShortDescription`, `Command.withAlias`, `Command.withExamples`, `Command.withSharedFlags`, `Command.withGlobalFlags`, `Command.unlisted`, `Command.annotate`, `Command.annotateMerge`, `Command.provideSync`, `Command.provideEffect`, `Command.provideEffectDiscard`, `Command.wizard`, `Command.CommandContext`, `Command.ParsedTokens`, `Command.Variance`, `Flag.Flag`, `Flag.Int`, `Flag.Finite`, `Flag.Date`, `Flag.ChoiceWithValue`, `Flag.Literals`, `Flag.Path`, `Flag.File`, `Flag.Directory`, `Flag.Redacted`, `Flag.FileText`, `Flag.FileParse`, `Flag.FileSchema`, `Flag.KeyValuePair`, `Flag.Never`, `Flag.withOptionalValue`, `Flag.withNegation`, `Flag.withoutNegation`, `Flag.withFallbackConfig`, `Flag.withFallbackPrompt`, `Flag.map`, `Flag.mapEffect`, `Flag.mapTryCatch`, `Flag.filter`, `Flag.filterMap`, `Flag.atLeast`, `Flag.atMost`, `Flag.between`, `Flag.orElse`, `Flag.orElseResult`, `Flag.withSchema`, `Argument.Argument`, `Argument.Int`, `Argument.Finite`, `Argument.Date`, `Argument.Literals`, `Argument.File`, `Argument.Directory`, `Argument.Path`, `Argument.Redacted`, `Argument.FileText`, `Argument.FileParse`, `Argument.FileSchema`, `Argument.Never`, `Argument.optional`, `Argument.map`, `Argument.mapEffect`, `Argument.mapTryCatch`, `Argument.atLeast`, `Argument.atMost`, `Argument.between`, `Argument.filter`, `Argument.filterMap`, `Argument.orElse`, `Argument.orElseResult`, `Argument.withSchema`, `Argument.withMetavar`, `Argument.withFallbackConfig`, `Argument.withFallbackPrompt`, `Argument.ChoiceWithValue`, `GlobalFlag.Help`, `GlobalFlag.Version`, `GlobalFlag.Wizard`, `GlobalFlag.Completions`, `GlobalFlag.LogLevel`, `GlobalFlag.Action`, `GlobalFlag.Setting`, `CliError.CliError`, `CliError.isCliError`, `CliError.userMessage`, `CliError.getUserMessage`, `CliError.UnrecognizedOption`, `CliError.DuplicateOption`, `CliError.MissingOption`, `CliError.MissingArgument`, `CliError.UnexpectedArgument`, `CliError.InvalidValue`, `CliError.UnknownSubcommand`, `CliError.ValidationError`, `CliError.UserError`, `CliError.NonShowHelpErrors`, `CliConfig`, `CliOutput`, `Completions`, `HelpDoc`, `Param`, `Primitive`, `Prompt`, `TerminalCapabilities`, `CommandSpec`

### [Command.make](/Users/arpit/Developer/flow-state/node_modules/effect/dist/cli/Command.d.ts:568)

Creates a `Command` from a name, an optional configuration record, and an optional handler. Each key of the configuration is a `Flag` or `Argument`; the handler receives the parsed values.

**Signature (overloads, in declaration order)**

```ts
<Name extends string>(name: Name): Command<Name, {}, {}, never, never>
<Name extends string, const Config extends Command.Config>(name: Name, config: Config): Command<Name, Command.Config.Infer<Config>, {}, never, never>
<Name extends string, const Config extends Command.Config, R, E>(name: Name, config: Config, handler: (config: Command.Config.Infer<Config>) => Effect.Effect<void, E, R>): Command<Name, Command.Config.Infer<Config>, {}, E, Exclude<R, BuiltInSettingContext>>
```

**Confirmed behaviour**

- The overloads are at `Command.d.ts:659`, `:750` and `:841`.
- The handler must return `Effect.Effect<void, E, R>`; its error `E` and requirements `R` appear in the command type, with built-in setting contexts removed from `R`.
- A parsed command passes `{ name, count }` to the handler. Confirmed at runtime: `--name Alice --count 2` produced `Hello Alice x2`.

```ts
import { Console, Effect } from "effect"
import { Command, Flag } from "effect/cli"

const greet = Command.make("greet", {
  name: Flag.String("name"),
  loud: Flag.Boolean("loud").pipe(Flag.withDefault(false))
}, (config) => Console.log(config.loud ? `HELLO ${config.name}` : `hello ${config.name}`))
```

### [Command.withDescription](/Users/arpit/Developer/flow-state/node_modules/effect/dist/cli/Command.d.ts:1806)

Sets the help description of a command and keeps its type unchanged.

**Signature (overloads)**

```ts
(description: string): <const Name extends string, Input, E, R, ContextInput>(self: Command<Name, Input, ContextInput, E, R>) => Command<Name, Input, ContextInput, E, R>
<const Name extends string, Input, E, R, ContextInput>(self: Command<Name, Input, ContextInput, E, R>, description: string): Command<Name, Input, ContextInput, E, R>
```

**Confirmed behaviour**

- Overloads at `Command.d.ts:1860` and `:1914`. The description is part of the help text; the declaration doesn't give the exact rendering.

```ts
import { Effect } from "effect"
import { Command } from "effect/cli"

const list = Command.make("list", {}, () => Effect.void).pipe(
  Command.withDescription("Name every Story the config lists")
)
```

### [Command.withSubcommands](/Users/arpit/Developer/flow-state/node_modules/effect/dist/cli/Command.d.ts:1522)

Adds subcommands to a command, creating a hierarchy. Subcommands can be listed plainly or in groups (`Command.SubcommandEntry`).

**Signature (overloads)**

```ts
<const Subcommands extends ReadonlyArray<Command.SubcommandEntry>>(subcommands: Subcommands): <Name extends string, Input, E, R, ContextInput>(self: Command<Name, Input, ContextInput, E, R>) => Command<Name, Simplify<Input | ContextInput>, ContextInput, E | ExtractSubcommandErrors<Subcommands>, R | Exclude<ExtractSubcommandContext<Subcommands>, CommandContext<Name>>>
<Name extends string, Input, E, R, ContextInput, const Subcommands extends ReadonlyArray<Command.SubcommandEntry>>(self: Command<Name, Input, ContextInput, E, R>, subcommands: Subcommands): Command<Name, Simplify<Input | ContextInput>, ContextInput, E | ExtractSubcommandErrors<Subcommands>, R | Exclude<ExtractSubcommandContext<Subcommands>, CommandContext<Name>>>
```

**Confirmed behaviour**

- Overloads at `Command.d.ts:1594` and `:1666`.
- Confirmed at runtime: `flow story list --root shop` and `flow story run abc -v` each reached the right handler.
- An unknown subcommand fails with `ShowHelp` whose `errors` hold an `UnknownSubcommand`.
- A parent command invoked without its subcommand fails with `ShowHelp` and an empty `errors` array. `src/host/cli/main.ts:135` treats that as exit code 0.

```ts
import { Console, Effect } from "effect"
import { Argument, Command } from "effect/cli"

const run = Command.make("run", { id: Argument.String("id") }, (c) => Console.log(c.id))
const story = Command.make("story").pipe(Command.withSubcommands([run]))
const flow = Command.make("flow").pipe(Command.withSubcommands([story]))
```

### [Command.withHandler](/Users/arpit/Developer/flow-state/node_modules/effect/dist/cli/Command.d.ts:902)

Adds or replaces a command's handler. The command keeps its existing error type; a replaced handler's errors stay in the type.

**Signature (overloads)**

```ts
<A, R, E>(handler: (value: A) => Effect.Effect<void, E, R>): <Name extends string, XR, XE, ContextInput>(self: Command<Name, A, ContextInput, XE, XR>) => Command<Name, A, ContextInput, XE | E, Exclude<R, BuiltInSettingContext>>
<Name extends string, A, XR, XE, R, E, ContextInput>(self: Command<Name, A, ContextInput, XE, XR>, handler: (value: A) => Effect.Effect<void, E, R>): Command<Name, A, ContextInput, XE | E, Exclude<R, BuiltInSettingContext>>
```

**Confirmed behaviour**

- Overloads at `Command.d.ts:962` and `:1022`.
- The handler receives the parsed input type `A` of the command.

```ts
import { Console, Effect } from "effect"
import { Command } from "effect/cli"

const version = Command.make("version").pipe(
  Command.withHandler(() => Console.log("1.0.0"))
)
```

### [Command.provide](/Users/arpit/Developer/flow-state/node_modules/effect/dist/cli/Command.d.ts:2386)

Provides a command's handler with the services from a layer. The layer can be a function of the parsed input, so the services depend on the flags.

**Signature (overloads)**

```ts
<Input, LR, LE, LA>(layer: Layer.Layer<LA, LE, LR> | ((input: Input) => Layer.Layer<LA, LE, LR>), options?: {
    readonly local?: boolean | undefined;
} | undefined): <const Name extends string, E, R, ContextInput>(self: Command<Name, Input, ContextInput, E, R>) => Command<Name, Input, ContextInput, E | LE, Exclude<R, LA> | LR>
<const Name extends string, Input, E, R, ContextInput, LA, LE, LR>(self: Command<Name, Input, ContextInput, E, R>, layer: Layer.Layer<LA, LE, LR> | ((input: Input) => Layer.Layer<LA, LE, LR>), options?: {
    readonly local?: boolean | undefined;
} | undefined): Command<Name, Input, ContextInput, E | LE, Exclude<R, LA> | LR>
```

**Confirmed behaviour**

- Overloads at `Command.d.ts:2450` and `:2516`.
- The `local` option is declared but its semantics are not documented in the declaration; this reference does not expand it.
- The doc example at `Command.d.ts:2386`-`2449` provides `FileSystem` from the `--env` flag.

```ts
import { Console, Effect, Path } from "effect"
import { Command, Flag } from "effect/cli"

const show = Command.make("show", { env: Flag.String("env") }, (config) =>
  Effect.gen(function*() {
    const path = yield* Path.Path
    yield* Console.log(path.join("envs", config.env))
  })
).pipe(
  Command.provide(Path.layer)
)
```

### [Command.run](/Users/arpit/Developer/flow-state/node_modules/effect/dist/cli/Command.d.ts:2764)

Runs a command with the arguments read from the `Stdio` service (`Stdio.args`), instead of an explicit array.

**Signature (overloads)**

```ts
(config: {
    readonly version: string;
    readonly renderErrors?: boolean | undefined;
}): <Name extends string, Input, E, R, ContextInput>(command: Command<Name, Input, ContextInput, E, R>) => Effect.Effect<void, E | CliError.CliError, R | Environment>
<Name extends string, Input, E, R, ContextInput>(command: Command<Name, Input, ContextInput, E, R>, config: {
    readonly version: string;
    readonly renderErrors?: boolean | undefined;
}): Effect.Effect<void, E | CliError.CliError, R | Environment>
```

**Confirmed behaviour**

- Overloads at `Command.d.ts:2830` and `:2899`.
- The implementation is `Stdio.Stdio.use(({ args }) => Effect.flatMap(args, (args) => runWith(command, config)(args)))` (`node_modules/effect/dist/cli/Command.js:1140`-`1142`).
- Confirmed at runtime with `Stdio.layerTest({ args })`: the handler received the `--name Bob` supplied through `Stdio`.
- Its requirements are `R | Environment`, so the caller provides `NodeServices.layer` or equivalent layers.

```ts
import { Console, Effect } from "effect"
import { Command, Flag } from "effect/cli"
import { NodeRuntime, NodeServices } from "@effect/platform-node"

const greet = Command.make("greet", { name: Flag.String("name") }, (c) => Console.log(`hello ${c.name}`))

NodeRuntime.runMain(Command.run(greet, { version: "1.0.0" }).pipe(Effect.provide(NodeServices.layer)))
```

### [Command.runWith](/Users/arpit/Developer/flow-state/node_modules/effect/dist/cli/Command.d.ts:2970)

Runs a command against an explicit array of arguments. Tests and embedding code use it; `main` in `src/host/cli/main.ts:129` does the same with its own `argv`.

**Signature**

```ts
<const Name extends string, Input, E, R, ContextInput>(command: Command<Name, Input, ContextInput, E, R>, config: {
    readonly version: string;
    readonly renderErrors?: boolean | undefined;
}) => (input: ReadonlyArray<string>) => Effect.Effect<void, Exclude<E, Terminal.QuitError> | CliError.CliError, R | Environment>
```

**Confirmed behaviour**

- Declaration at `Command.d.ts:2970`; implementation at `Command.js:1209`.
- Help asked for (`--help`) prints help and succeeds (runtime check: `Success`). The built-in `Help` action is `GlobalFlag.d.ts:115`.
- A missing required flag or argument prints help and fails with `ShowHelp` (`MissingOption` or `MissingArgument` in `errors`). The rethrow is in `Command.js:1328`.
- A `Terminal.QuitError` interrupts the run (`Command.js:1338`).
- `renderErrors: false` leaves user-error rendering to the host (`Command.d.ts:223`).

```ts
import { Effect } from "effect"
import { Command, Flag } from "effect/cli"

const greet = Command.make("greet", { name: Flag.String("name") }, (c) => Effect.log(`hello ${c.name}`))

export const test = Command.runWith(greet, { version: "1.0.0" })(["--name", "Alice"])
// Effect<void, ..., Environment>: provide the platform layers before running it
```

### [Command.Environment](/Users/arpit/Developer/flow-state/node_modules/effect/dist/cli/Command.d.ts:355)

The union of services a command runner requires: `FileSystem`, `Path`, `Terminal`, `ChildProcessSpawner` and `Stdio`. The runners add it to their requirement types (`Command.d.ts:2830` onward).

**Signature**

```ts
type Environment = FileSystem.FileSystem | Path.Path | Terminal.Terminal | ChildProcessSpawner | Stdio.Stdio
```

**Confirmed behaviour**

- `NodeServices.layer` provides all five (see `NodeServices.md`), so one `Effect.provide(NodeServices.layer)` satisfies it.

```ts
import { Effect, Path } from "effect"
import { Command } from "effect/cli"

const needsPath: Effect.Effect<void, never, Command.Environment> = Effect.gen(function*() {
  yield* Path.Path
})
```

### [Flag.String](/Users/arpit/Developer/flow-state/node_modules/effect/dist/cli/Flag.d.ts:53)

Creates a required string flag, given as `--name value`.

**Signature**

```ts
(name: string) => Flag<string>
```

**Confirmed behaviour**

- Declaration at `Flag.d.ts:53`; the implementation is `Param.String(Param.flagKind, name)` at `Flag.js:23`.
- A missing required flag makes the command fail with `ShowHelp` whose `errors` hold `MissingOption` (confirmed at runtime).

```ts
import { Console } from "effect"
import { Command, Flag } from "effect/cli"

const greet = Command.make("greet", { name: Flag.String("name") }, (c) => Console.log(`hello ${c.name}`))
```

### [Flag.Boolean](/Users/arpit/Developer/flow-state/node_modules/effect/dist/cli/Flag.d.ts:72)

Creates a boolean flag. `--name` sets it to `true`.

**Signature**

```ts
(name: string) => Flag<boolean>
```

**Confirmed behaviour**

- Declaration at `Flag.d.ts:72`.
- The negated form defaults to `--no-<name>` (`Flag.d.ts:695`; `withNegation` renames it). Confirmed at runtime: `--no-verbose` gave `false`.

```ts
import { Console } from "effect"
import { Command, Flag } from "effect/cli"

const list = Command.make("list", { verbose: Flag.Boolean("verbose") }, (c) => Console.log(String(c.verbose)))
```

### [Flag.withDefault](/Users/arpit/Developer/flow-state/node_modules/effect/dist/cli/Flag.d.ts:1071)

Provides a default value for a flag when it is not given. The default can be a value or an `Effect` that yields one.

**Signature (overloads)**

```ts
<const B>(defaultValue: B | Effect.Effect<B, CliError.CliError, Environment>): <A>(self: Flag<A>) => Flag<A | B>
<A, const B>(self: Flag<A>, defaultValue: B | Effect.Effect<B, CliError.CliError, Environment>): Flag<A | B>
```

**Confirmed behaviour**

- Overloads at `Flag.d.ts:1096` and `:1121`.
- Confirmed at runtime: `Flag.Int("count").pipe(Flag.withDefault(1))` gave `x1` when the flag was absent.

```ts
import { Console } from "effect"
import { Command, Flag } from "effect/cli"

const repeat = Command.make("repeat", {
  count: Flag.Int("count").pipe(Flag.withDefault(1))
}, (c) => Console.log(`count ${c.count}`))
```

### [Flag.withAlias](/Users/arpit/Developer/flow-state/node_modules/effect/dist/cli/Flag.d.ts:441)

Adds a short alias to a flag.

**Signature (overloads)**

```ts
<A>(alias: string): (self: Flag<A>) => Flag<A>
<A>(self: Flag<A>, alias: string): Flag<A>
```

**Confirmed behaviour**

- Overloads at `Flag.d.ts:441` (the declaration block).
- Confirmed at runtime: `-v` set `verbose` to `true`.

```ts
import { Console } from "effect"
import { Command, Flag } from "effect/cli"

const run = Command.make("run", {
  verbose: Flag.Boolean("verbose").pipe(Flag.withAlias("v"))
}, (c) => Console.log(String(c.verbose)))
```

### [Flag.withDescription](/Users/arpit/Developer/flow-state/node_modules/effect/dist/cli/Flag.d.ts:517)

Adds help text to a flag.

**Signature (overloads)**

```ts
<A>(description: string): (self: Flag<A>) => Flag<A>
<A>(self: Flag<A>, description: string): Flag<A>
```

**Confirmed behaviour**

- Overloads at `Flag.d.ts:517`. The help rendering is not given in the declaration.

```ts
import { Console } from "effect"
import { Command, Flag } from "effect/cli"

const deploy = Command.make("deploy", {
  env: Flag.String("env").pipe(Flag.withDescription("Target environment"))
}, (c) => Console.log(c.env))
```

### [Flag.optional](/Users/arpit/Developer/flow-state/node_modules/effect/dist/cli/Flag.d.ts:1046)

Makes a flag optional; its value becomes an `Option`.

**Signature**

```ts
<A>(param: Flag<A>) => Flag<Option.Option<A>>
```

**Confirmed behaviour**

- Declaration at `Flag.d.ts:1046`.
- Confirmed at runtime: with `--tag t1` the value was present, and with no `--tag` `Option.getOrElse` returned the fallback `-`.

```ts
import { Console, Option } from "effect"
import { Command, Flag } from "effect/cli"

const story = Command.make("story", {
  tag: Flag.String("tag").pipe(Flag.optional)
}, (c) => Console.log(Option.getOrElse(c.tag, () => "-")))
```

### [Argument.String](/Users/arpit/Developer/flow-state/node_modules/effect/dist/cli/Argument.d.ts:55)

Creates a required positional string argument.

**Signature**

```ts
(name: string) => Argument<string>
```

**Confirmed behaviour**

- Declaration at `Argument.d.ts:55`.
- Used by `main.ts:32` for `story-id`.

```ts
import { Console } from "effect"
import { Argument, Command } from "effect/cli"

const show = Command.make("show", { id: Argument.String("id") }, (c) => Console.log(c.id))
```

### [Argument.withDefault](/Users/arpit/Developer/flow-state/node_modules/effect/dist/cli/Argument.d.ts:371)

Provides a default value for a positional argument that is not given.

**Signature (overloads)**

```ts
<const B>(defaultValue: B | Effect.Effect<B, CliError.CliError, Environment>): <A>(self: Argument<A>) => Argument<A | B>
<A, const B>(self: Argument<A>, defaultValue: B | Effect.Effect<B, CliError.CliError, Environment>): Argument<A | B>
```

**Confirmed behaviour**

- Overloads at `Argument.d.ts:388` and `:405`.
- Confirmed at runtime: an absent `file` gave `none`.

```ts
import { Console } from "effect"
import { Argument, Command } from "effect/cli"

const open = Command.make("open", {
  file: Argument.String("file").pipe(Argument.withDefault("none"))
}, (c) => Console.log(c.file))
```

### [Argument.variadic](/Users/arpit/Developer/flow-state/node_modules/effect/dist/cli/Argument.d.ts:569)

Makes a positional argument accept many values, returned as a `ReadonlyArray`.

**Signature (overloads)**

```ts
(options?: Param.VariadicParamOptions | undefined): <A>(self: Argument<A>) => Argument<ReadonlyArray<A>>
<A>(self: Argument<A>, options?: Param.VariadicParamOptions | undefined): Argument<ReadonlyArray<A>>
```

**Confirmed behaviour**

- Overloads at `Argument.d.ts:598` and `:627`. Options are `Param.VariadicParamOptions` (`Param.d.ts:1796`).
- Confirmed at runtime: `a.ts b.ts` gave `["a.ts", "b.ts"]`. Both `.pipe(Argument.variadic)` and `.pipe(Argument.variadic())` produced an `Argument`.

```ts
import { Console } from "effect"
import { Argument, Command } from "effect/cli"

const cat = Command.make("cat", {
  files: Argument.String("files").pipe(Argument.variadic())
}, (c) => Console.log(c.files.join(",")))
```

### [Argument.withDescription](/Users/arpit/Developer/flow-state/node_modules/effect/dist/cli/Argument.d.ts:315)

Adds help text to a positional argument.

**Signature (overloads)**

```ts
<A>(description: string): (self: Argument<A>) => Argument<A>
<A>(self: Argument<A>, description: string): Argument<A>
```

**Confirmed behaviour**

- Overloads at `Argument.d.ts:315`. Used by `main.ts:32`.

```ts
import { Console } from "effect"
import { Argument, Command } from "effect/cli"

const show = Command.make("show", {
  id: Argument.String("id").pipe(Argument.withDescription("The Story's own id"))
}, (c) => Console.log(c.id))
```

### [CliError.ShowHelp](/Users/arpit/Developer/flow-state/node_modules/effect/dist/cli/CliError.d.ts:667)

The error a runner fails with when it has shown help. It carries `commandPath` and `errors`; an empty `errors` means help was implicit (a parent with no subcommand, or `--help`). Its `_tag` is `"ShowHelp"`.

**Signature**

```ts
class ShowHelp extends ShowHelp_base {
    readonly [TypeId] = "~effect/cli/CliError";
    readonly [Runtime.errorExitCode]: number;
    readonly [Runtime.errorReported] = false;
    get message(): string;
}
```

**Confirmed behaviour**

- Declaration at `CliError.d.ts:667`. Runners emit it at `Command.js:1239` and rethrow it at `Command.js:1328`.
- Confirmed at runtime: a missing argument gave `ShowHelp` with `errors: ["MissingArgument"]`; an unknown subcommand gave `["UnknownSubcommand"]`; an unrecognized flag gave `["UnrecognizedOption"]`.
- `main.ts:135` maps it to exit code 2 when `errors` is non-empty and 0 otherwise.

```ts
import { Console, Effect } from "effect"
import { Argument, Command } from "effect/cli"

const show = Command.make("show", { id: Argument.String("id") }, (c) => Console.log(c.id))

export const main = Command.runWith(show, { version: "1.0.0" })([]).pipe(
  Effect.catchTag("ShowHelp", (help) => Console.log(`help shown for ${help.errors.length} errors`))
)
```

## Project use (`packages/flow-state-v3`)

- `src/host/cli/main.ts:3` imports `Argument`, `Command`, `Flag` from `effect/cli`.
- `src/host/cli/main.ts:27`-`32` define `Flag.String`, `Flag.withDefault` and `Argument.String` with `withDescription`.
- `src/host/cli/main.ts:129`-`136` run `Command.runWith` and map `ShowHelp`, `UnknownStory` and `RunRejected` to exit codes.
- `tests/cli/cli.test.ts:55`-`82` provide the environment by hand, including `Terminal.make`. Its `Terminal.make` call omits `size`, which 4.1.4 requires; see `Terminal.md`.
