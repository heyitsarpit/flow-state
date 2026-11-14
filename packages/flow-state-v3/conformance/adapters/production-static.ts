import { Effect, Option, Result, Schema } from "effect";
import {
  app,
  definition,
  deny,
  Flow,
  FlowError,
  machine,
  type Machine,
  transaction,
} from "../../src/index.ts";
import type { Ending } from "../../src/contract.ts";
import {
  Admission,
  Built,
  type CompiledHandle,
  Default,
  Made,
  MemoryField,
  type Operation,
  type Source,
  type Surface,
  Tamper,
} from "../surface.ts";

/**
 * A source production's public construction cannot express: a suite limit, reported as a crash
 * so no case passes on it.
 */
class Unexpressible extends Error {}

const machines = new WeakMap<CompiledHandle, Machine>();

const handleOf = (built: Machine) => {
  // SAFETY: a fresh object stands for the Compiled; the surface maps it back to its Machine.
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- a branded handle has no constructor
  const handle = {} as CompiledHandle;
  machines.set(handle, built);

  return handle;
};

const machineOf = (handle: CompiledHandle) => {
  const found = machines.get(handle);

  if (found === undefined) throw new Unexpressible("a Compiled this surface never built");

  return found;
};

const schemaOf = (d: Option.Option<Default>) =>
  Option.match(d, {
    onNone: () => Schema.Number,
    onSome: Default.$match({
      Value: ({ value }) =>
        Schema.Number.pipe(Schema.withConstructorDefault(Effect.succeed(value))),
      Effect: ({ run }) => Schema.Number.pipe(Schema.withConstructorDefault(Effect.sync(run))),
    }),
  });

const fieldOf = (name: string, field: MemoryField) =>
  MemoryField.$match(field, {
    Initial: ({ value, schemaDefault }) => Flow.initial(schemaOf(schemaDefault), value),
    Computed: () => {
      throw new Unexpressible(`${name}: production has no computed initial`);
    },
    Input: () => {
      throw new Unexpressible(`${name}: production has no Flow.input`);
    },
    NumberInput: () => {
      throw new Unexpressible(`${name}: production has no Flow.input`);
    },
  });

const eventOf = <T>(events: Readonly<Record<string, T>>, name: string) => {
  const found = events[name];

  if (found === undefined) throw new Unexpressible(`the source names ${name}, never declared`);

  return found;
};

const operationOf = (sourceId: string, op: Operation, E: Readonly<Record<string, Ending>>) =>
  transaction({
    id: `${sourceId}/${op.name}`,
    input: Object.fromEntries(op.input.map((f) => [f, Schema.String])),
    key: op.key,
    concurrency: "reject",
    services: [],
    commit: () => {
      op.commit();

      return Effect.void;
    },
  }).outcomes({
    success: eventOf(E, op.success),
    failure: Object.fromEntries(
      Object.entries(op.failure).map(([reason, event]) => [reason, eventOf(E, event)]),
    ),
    unknown: eventOf(E, op.unknown),
  });

const build = (source: Source) => {
  const config = {
    id: source.id,
    states: source.states,
    events: Object.fromEntries(source.events.map((e) => [e, {}])),
    internalEvents: Object.fromEntries(
      source.internalEvents.map((e) => [e, source.uncertain.includes(e) ? Flow.uncertain({}) : {}]),
    ),
    memory: Object.fromEntries(
      Object.entries(source.memory).map(([name, f]) => [name, fieldOf(name, f)]),
    ),
    operations: ({ E }: { readonly E: Readonly<Record<string, Ending>> }) =>
      Object.fromEntries(source.operations.map((op) => [op.name, operationOf(source.id, op, E)])),
  };

  // SAFETY: the config is built from the source's names; production validates it at `machine`.
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion, lint-bomb/no-chained-type-assertions, lint-bomb/no-unknown -- definition's const generics need literal names a source holds as strings
  const declared = definition(config as unknown as Parameters<typeof definition>[0]);

  // FLOW_STATE_ALLOW_UNKNOWN: S's tokens are erased here; production checks the targets.
  const body = ({ S }: { readonly S: Readonly<Record<string, unknown>> }) => {
    source.onMachine();

    return {
      default: eventOf(S, source.initial),
      on: Object.fromEntries(
        Object.entries(source.on).map(([event, h]) => [
          event,
          {
            guard: Option.match(h.guard, {
              onNone: () => [],
              onSome: (g) => [() => g() || deny("NotAllowed")],
            }),
            ...Option.match(h.target, {
              onNone: () => ({}),
              onSome: (t) => ({ target: eventOf(S, t) }),
            }),
          },
        ]),
      ),
    };
  };

  // SAFETY: as above; the body's tokens come from production's own S.
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion, lint-bomb/no-chained-type-assertions, lint-bomb/no-unknown -- machine's body type is generic over the definition's literal names
  return machine(declared, body as unknown as Parameters<typeof machine>[1]);
};

// FLOW_STATE_ALLOW_UNKNOWN: production throws whatever it throws; its code is read here, once.
const failedOf = (thrown: unknown) => {
  if (thrown instanceof FlowError) return { _tag: "Refused" as const, codes: [thrown.code] };

  const message = thrown instanceof Error ? thrown.message : String(thrown);

  return { _tag: "Crashed" as const, thrown: message.slice(0, 200) };
};

const NOT_BUILT = "not built in production's Compiled (owed to @task.V3.T17)";

const admitted = (run: () => void) =>
  Result.match(Result.try({ try: run, catch: failedOf }), {
    onSuccess: () => Admission.Admitted(),
    onFailure: (failed) =>
      failed._tag === "Refused"
        ? Admission.Refused({ codes: failed.codes })
        : Admission.Crashed({ thrown: failed.thrown }),
  });

/**
 * Production's static surface (Conformance R14, Q17): construction through `definition` and
 * `machine`, and Runtime creation's machine check through `app`.
 *
 * **Details**
 *
 * - The data view carries what production's `Compiled` holds: its states, public events and
 *   operations. It has no internal or uncertain events, no Slots and no data form (Compile R16).
 * - A source production cannot express (`Flow.input`, a computed initial) is a crash, never a
 *   refusal, so no case passes on it.
 *
 * **Gotchas**
 *
 * - Tampered Compiled (R17), creation and restore over a `Compiled` (R6, R8), places (R16) and the
 *   CLI are not built in production; each is a crash or empty, owed to @task.V3.T17 (the CLI to
 *   @task.V3.T22).
 */
export const productionSurface: Surface = {
  construct: (source) =>
    Result.match(Result.try({ try: () => build(source), catch: failedOf }), {
      onSuccess: (built) =>
        Built.Compiled({
          compiled: handleOf(built),
          view: {
            states: [...built.compiled.states.keys()],
            events: [...built.compiled.external.keys()],
            uncertain: [],
            operations: [...built.compiled.operations.keys()],
            slots: [],
            whole: {},
          },
        }),
      onFailure: (failed) =>
        failed._tag === "Refused"
          ? Built.Refused({ codes: failed.codes })
          : Built.Crashed({ thrown: failed.thrown }),
    }),
  admit: (compiled, tamper) =>
    Tamper.$is("Untouched")(tamper)
      ? admitted(() => app({ id: "Static/App", machines: { only: machineOf(compiled) } }))
      : Admission.Crashed({ thrown: `tampered Compiled: ${NOT_BUILT}` }),
  admitApp: (compiled) =>
    admitted(() =>
      app({
        id: "Static/App",
        machines: Object.fromEntries(compiled.map((c, i) => [`m${i}`, machineOf(c)])),
      }),
    ),
  create: () => Made.Crashed({ thrown: `creation over an input: ${NOT_BUILT}` }),
  restore: () => Made.Crashed({ thrown: `restore over a record: ${NOT_BUILT}` }),
  cli: () => ({ code: 127, stdout: "", stderr: "production has no flow CLI (@task.V3.T22)" }),
  places: () => [],
};

/**
 * Production's owed static cases: each fails on production by a Compile feature its `Compiled`
 * does not build yet, owed to @task.V3.T17 (the orchestrator's ruling, 2026-11-12). Each is
 * checked to still fail, so a fix shows.
 *
 * **Details**
 *
 * - Every case fails first on the shared source S1, whose `Flow.input` and computed initial
 *   production cannot declare (Compile R5).
 * - `missing` is the expectation each fails by once S1 leaves those fields out: the check
 *   production lacks besides them, or `none` when they are its only reason. The places check:
 *   no places (R16).
 */
export const staticOwed = {
  owner: "@task.V3.T17",
  cases: [
    { case: "CMP-01", missing: "none" },
    { case: "CMP-02", missing: "Compile I4: its events, public and internal" },
    { case: "CMP-03", missing: "Compile I5: Flow.initial beside a Schema default is TwoDefaults" },
    {
      case: "CMP-04",
      missing: "Compile I6: a default that is an Effect to run is refused as ImpureDefault",
    },
    {
      case: "CMP-05",
      missing: "Compile I11: unknown: onto an event not Flow.uncertain is UnknownNotUncertain",
    },
    { case: "CMP-06", missing: "Compile I15: a bare function in a Slot's place is refused" },
    {
      case: "CMP-07",
      missing: "Compile R16: a closure is named by its place under operations.save",
    },
    {
      case: "CMP-08",
      missing: "Compile I7: an input given in its encoded form is refused, never decoded",
    },
    {
      case: "CMP-09",
      missing: "Compile I8: restore keeps the record's fields and runs no creation",
    },
    { case: "CMP-10", missing: "Compile I13: a state named self is refused as ReservedStateName" },
    { case: "CMP-11", missing: "none" },
  ],
  places: true,
} as const;
