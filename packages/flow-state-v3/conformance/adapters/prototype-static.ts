/// <reference types="node" />
import { Effect, Option, Predicate, Result, Schema } from "effect";
import { spawnSync } from "node:child_process";
import { join } from "node:path";
import type { Json } from "../port.ts";
import {
  Admission,
  Built,
  type CliRun,
  type CompiledHandle,
  Default,
  type Handler,
  MemoryField,
  type Operation,
  type Source,
  type Surface,
  Tamper,
} from "../surface.ts";
import { load, PrototypeLoadFailed } from "./prototype.ts";

declare const Opaque: unique symbol;

/**
 * A value the prototype's compiler makes and takes back, never read here.
 */
type Made<Name extends string> = { readonly [Opaque]: Name };

type Token = Made<"Token">;

type Tokens = Readonly<Record<string, Token>>;

type Bound = Made<"Bound">;

type Denial = Made<"Denial">;

type MadeField = Made<"MemoryField">;

type Uncertain = Made<"Uncertain">;

type Definition = Made<"Definition">;

type NoFields = Readonly<Record<string, never>>;

type ProtoCompiled = {
  readonly nodes: Readonly<Record<string, Made<"Node">>>;
  readonly root: string;
  readonly events: {
    readonly external: ReadonlyArray<string>;
    readonly internal: ReadonlyArray<string>;
    readonly uncertain: ReadonlyArray<string>;
  };
  readonly ops: Readonly<Record<string, Made<"Operation">>>;
  readonly memory: Made<"Memory">;
};

type HandlerConfig =
  | { readonly guard: ReadonlyArray<() => true | Denial> }
  | { readonly guard: ReadonlyArray<() => true | Denial>; readonly target: Token };

type Compile = {
  readonly definition: (d: {
    readonly id: string;
    readonly states: ReadonlyArray<string>;
    readonly events: Readonly<Record<string, NoFields>>;
    readonly internalEvents: Readonly<Record<string, NoFields | Uncertain>>;
    readonly memory: Readonly<Record<string, MadeField>>;
    readonly operations: (t: { readonly E: Tokens }) => Readonly<Record<string, Bound>>;
  }) => Definition;
  readonly machine: (
    d: Definition,
    body: (t: { readonly S: Tokens }) => {
      readonly default: Token;
      readonly on: Readonly<Record<string, HandlerConfig>>;
    },
  ) => { readonly compiled: ProtoCompiled };
  readonly transaction: (spec: {
    readonly id: string;
    readonly input: Readonly<Record<string, Schema.String>>;
    readonly key: ReadonlyArray<string>;
    readonly concurrency: "reject";
    readonly commit: () => Effect.Effect<void>;
  }) => {
    readonly outcomes: (o: {
      readonly success: Token;
      readonly failure: Readonly<Record<string, Token>>;
      readonly unknown: Token;
    }) => Bound;
  };
  readonly Flow: {
    readonly initial: (
      schema: Schema.Top,
      value: number | ((fields: Readonly<Record<string, Json>>) => string),
    ) => MadeField;
    readonly input: (schema: Schema.Top) => MadeField;
    readonly uncertain: (fields: NoFields) => Uncertain;
  };
  readonly deny: (reason: string) => Denial;
};

type Seal = (c: ProtoCompiled, given: ReadonlySet<string>) => ProtoCompiled;

type ToData = (c: ProtoCompiled) => {
  readonly data: Json;
  readonly table: ReadonlyMap<string, Made<"Closure">>;
};

type Module = Effect.Success<ReturnType<typeof load>>;

const member = <A>(module: Module, name: string, path: string) =>
  Predicate.hasProperty(module, name)
    ? // SAFETY: trusted prototype code, loaded by path; the shapes above are its public exports.
      // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- a dynamic import has no static type to narrow from
      Effect.succeed(module[name] as A)
    : Effect.fail(new PrototypeLoadFailed({ path, why: `no export ${name}` }));

const CODE = /^([A-Z][A-Za-z0-9]*):/u;

/**
 * A source names a state or event it never declares: a suite defect.
 */
class Undeclared extends Error {}

// FLOW_STATE_ALLOW_UNKNOWN: a construction throws whatever the prototype throws; its code is read here, once.
const codeOf = (thrown: unknown) => {
  if (thrown instanceof Undeclared) throw thrown;

  const message = thrown instanceof Error ? thrown.message : String(thrown);

  return CODE.exec(message)?.[1] ?? `Unnamed(${message.slice(0, 80)})`;
};

/**
 * A handle this adapter never gave out: a suite defect.
 */
class ForeignHandle extends Error {}

const tokenOf = (tokens: Tokens, name: string) => {
  const token = tokens[name];

  if (token === undefined)
    throw new Undeclared(`the source names ${name}, which it never declares`);

  return token;
};

const PLAIN: Schema.Top = Schema.Number;

const schemaOf = (d: Option.Option<Default>) =>
  Option.match(d, {
    onNone: () => PLAIN,
    onSome: Default.$match({
      Value: ({ value }) =>
        Schema.Number.pipe(Schema.withConstructorDefault(Effect.succeed(value))),
      Effect: ({ run }) => Schema.Number.pipe(Schema.withConstructorDefault(Effect.sync(run))),
    }),
  });

const fieldOf = (api: Compile, field: MemoryField) =>
  MemoryField.$match(field, {
    Initial: ({ value, schemaDefault }) => api.Flow.initial(schemaOf(schemaDefault), value),
    Computed: ({ compute }) => api.Flow.initial(Schema.String, compute),
    Input: () => api.Flow.input(Schema.String),
  });

const operationOf = (api: Compile, sourceId: string, op: Operation, E: Tokens) =>
  api
    .transaction({
      id: `${sourceId}/${op.name}`,
      input: Object.fromEntries(op.input.map((f) => [f, Schema.String])),
      key: op.key,
      concurrency: "reject",
      commit: () => {
        op.commit();

        return Effect.void;
      },
    })
    .outcomes({
      success: tokenOf(E, op.success),
      failure: Object.fromEntries(
        Object.entries(op.failure).map(([reason, event]) => [reason, tokenOf(E, event)]),
      ),
      unknown: tokenOf(E, op.unknown),
    });

// RETURN_TYPE: one of the two handler shapes; the branches infer two unrelated objects.
const handlerOf = (api: Compile, S: Tokens, handler: Handler): HandlerConfig => {
  const guard = Option.match(handler.guard, {
    onNone: () => [],
    onSome: (g) => [() => (g() ? (true as const) : api.deny("NotAllowed"))],
  });

  return Option.match(handler.target, {
    onNone: () => ({ guard }),
    onSome: (target) => ({ guard, target: tokenOf(S, target) }),
  });
};

const build = (api: Compile, source: Source) => {
  const d = api.definition({
    id: source.id,
    states: source.states,
    events: Object.fromEntries(source.events.map((e) => [e, {}])),
    internalEvents: Object.fromEntries(
      source.internalEvents.map((e) => [
        e,
        source.uncertain.includes(e) ? api.Flow.uncertain({}) : {},
      ]),
    ),
    memory: Object.fromEntries(Object.entries(source.memory).map(([k, f]) => [k, fieldOf(api, f)])),
    operations: ({ E }) =>
      Object.fromEntries(
        source.operations.map((op) => [op.name, operationOf(api, source.id, op, E)]),
      ),
  });

  return api.machine(d, ({ S }) => {
    source.onMachine();

    return {
      default: tokenOf(S, source.initial),
      on: Object.fromEntries(
        Object.entries(source.on).map(([event, h]) => [event, handlerOf(api, S, h)]),
      ),
    };
  }).compiled;
};

const SLOT_KEY = "\u0000";

const viewOf = (toData: ToData, c: ProtoCompiled) => {
  const { data, table } = toData(c);

  return {
    states: Object.keys(c.nodes).filter((n) => n !== c.root),
    events: [...c.events.external, ...c.events.internal],
    uncertain: [...c.events.uncertain],
    operations: Object.keys(c.ops),
    slots: [...table.keys()].map((key) => key.slice(key.indexOf(SLOT_KEY) + 1)),
    whole: data,
  };
};

// RETURN_TYPE: each branch is a deliberately malformed Compiled (Compile R17), passed on as one.
const tampered = (c: ProtoCompiled, tamper: Tamper): ProtoCompiled =>
  Tamper.$match(tamper, {
    Untouched: () => c,
    BareFunction: () =>
      // SAFETY: the malformation itself: a bare function where the memory's Slots sit.
      // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- the tamper breaks the type on purpose
      ({ ...c, memory: { ...c.memory, initial: () => ({}) } }) as ProtoCompiled,
    KeyOutsideInput: ({ operation, field }) =>
      // SAFETY: the malformation itself: an operation's key fields outside its input.
      // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- the tamper breaks the type on purpose
      ({
        ...c,
        ops: { ...c.ops, [operation]: { ...c.ops[operation], keyFields: [field] } },
      }) as ProtoCompiled,
    NoEvents: () => {
      const { events: _events, ...rest } = c;

      // SAFETY: the malformation itself: a Compiled with no events table.
      // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- the tamper breaks the type on purpose
      return rest as ProtoCompiled;
    },
  });

const CLI_SECONDS = 30;

/**
 * The suite's fixtures by catalog name, as the round-14 CLI names its targets; every other
 * operand is passed as given.
 */
const CLI_TARGETS = new Map([["pay", "typed-pay"]]);

const runCli = (runtimeDir: string, args: ReadonlyArray<string>) => {
  const operands = args.map((a) => CLI_TARGETS.get(a) ?? a);

  const ran = spawnSync("bun", [join(runtimeDir, "cli", "flow.ts"), ...operands], {
    cwd: runtimeDir,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    timeout: CLI_SECONDS * 1000,
  });

  return { code: ran.status ?? -1, stdout: ran.stdout, stderr: ran.stderr } satisfies CliRun;
};

/**
 * The static surface over a prototype tree: its compiler
 * (`<runtimeDir>/../conformance/compile/`), its Runtime creation check (`gate.ts`'s `seal`) and its
 * data view (`codec/codec.ts`'s `toData`).
 *
 * **Details**
 *
 * - The data view is `toData`'s, the prototype's only one; `states` leaves out its root node,
 *   which no definition declares, and `slots` are its table's closure paths (a key is the
 *   definition, NUL, then the path).
 * - Runtime creation is `seal` with no services given; no source here names one.
 * - A refusal's code is the prototype error message's leading `Code:`; the prototype throws at
 *   its first violation, so a refusal lists one code.
 * - A source's closures are passed to the compiler as they are, so the case counts every call.
 * - A source naming a state or event it never declares, and a handle another surface built, are
 *   suite defects: they throw, never a refusal.
 * - The CLI is `bun <runtimeDir>/cli/flow.ts`, run in `runtimeDir` with stdin closed; one that has
 *   not ended in 30 s is killed and reported with code -1. It has no config discovery (StaticCli
 *   R12): an operand names one of its own targets; the suite's `pay` is its `typed-pay`, and the
 *   other runtime fixtures are none of its targets.
 */
export const loadPrototypeSurface = Effect.fn("loadPrototypeSurface")(function* (
  runtimeDir: string,
) {
  const compilePath = join(runtimeDir, "..", "conformance", "compile", "index.ts");
  const gatePath = join(runtimeDir, "gate.ts");
  const codecPath = join(runtimeDir, "codec", "codec.ts");
  const compile = yield* load(compilePath);
  const gate = yield* load(gatePath);
  const codec = yield* load(codecPath);

  const api: Compile = {
    definition: yield* member<Compile["definition"]>(compile, "definition", compilePath),
    machine: yield* member<Compile["machine"]>(compile, "machine", compilePath),
    transaction: yield* member<Compile["transaction"]>(compile, "transaction", compilePath),
    Flow: yield* member<Compile["Flow"]>(compile, "Flow", compilePath),
    deny: yield* member<Compile["deny"]>(compile, "deny", compilePath),
  };

  const seal = yield* member<Seal>(gate, "seal", gatePath);
  const toData = yield* member<ToData>(codec, "toData", codecPath);
  const held = new WeakMap<CompiledHandle, ProtoCompiled>();

  const handleOf = (c: ProtoCompiled) => {
    // SAFETY: a fresh key for `held`; the case only hands it back to `admit`.
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- a branded handle has no constructor
    const handle = {} as CompiledHandle;
    held.set(handle, c);

    return handle;
  };

  const compiledOf = (handle: CompiledHandle) => {
    const c = held.get(handle);

    if (c === undefined) throw new ForeignHandle("a Compiled this surface did not build");

    return c;
  };

  return {
    construct: (source) =>
      Result.match(Result.try({ try: () => build(api, source), catch: codeOf }), {
        onSuccess: (c) => Built.Compiled({ compiled: handleOf(c), view: viewOf(toData, c) }),
        onFailure: (code) => Built.Refused({ codes: [code] }),
      }),
    admit: (handle, tamper) => {
      const malformed = tampered(compiledOf(handle), tamper);

      return Result.match(Result.try({ try: () => seal(malformed, new Set()), catch: codeOf }), {
        onSuccess: () => Admission.Admitted(),
        onFailure: (code) => Admission.Refused({ codes: [code] }),
      });
    },
    cli: (args) => runCli(runtimeDir, args),
  } satisfies Surface;
});
