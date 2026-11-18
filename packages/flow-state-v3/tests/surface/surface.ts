import {
  Cause,
  Clock,
  Context,
  Duration,
  Effect,
  Exit,
  Layer,
  Option,
  Predicate,
  Result,
  Schema,
} from "effect";
import { manifests } from "../../fixtures/index.ts";
import { type Registered, registrationOf } from "../../src/entry.ts";
import * as Flow from "../../src/index.ts";

// FLOW_STATE_ALLOW_UNKNOWN: any value a walk of Flow's surface meets.
type Met = unknown;

/**
 * A public function the walk reached: where, and how Flow registered it.
 */
export type Reached = {
  readonly path: string;
  // FLOW_STATE_ALLOW_UNKNOWN: a public function of any signature, called with hostile values.
  readonly call: (...args: ReadonlyArray<unknown>) => unknown;
  readonly registered: Registered;
};

// Effect's own values (Schemas, Effects, Layers, service keys, durations) and error classes: their
// functions are Effect's API, not Flow's.
const isForeign = (value: Met) =>
  Schema.isSchema(value) ||
  Effect.isEffect(value) ||
  Layer.isLayer(value) ||
  Context.isKey(value) ||
  Context.isContext(value) ||
  Duration.isDuration(value) ||
  value instanceof Error ||
  (Predicate.isFunction(value) &&
    Predicate.hasProperty(value, "prototype") &&
    value.prototype instanceof Error);

const asCall = (value: Met) =>
  // SAFETY: the walk reached a function; the hostile table calls it with any arguments on purpose.
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- a public function's signature is erased so every argument position can take any value
  value as Reached["call"];

/**
 * Walks every own enumerable property reachable from `roots` and returns every registered entry
 * and builder it reached, and the path of every function Flow handed out that is neither. Flow's
 * inert data and Effect's own values are not entered, and a builder is a leaf, since what it holds
 * is captured unread.
 */
export const surfaceOf = (roots: ReadonlyArray<readonly [string, Met]>) => {
  const seen = new Set<Met>();
  const entries: Array<Reached> = [];
  const builders: Array<Reached> = [];
  const stray: Array<string> = [];

  // Whether the walk goes on into a function's own properties: only an entry's.
  const reach = (value: Met, path: string, registered: Option.Option<Registered>) =>
    Option.match(registered, {
      onNone: () => {
        stray.push(path);

        return false;
      },
      onSome: (known) => {
        (known.kind === "builder" ? builders : entries).push({
          path,
          call: asCall(value),
          registered: known,
        });

        return known.kind !== "builder";
      },
    });

  const visit = (value: Met, path: string) => {
    if (!(Predicate.isObjectOrArray(value) || Predicate.isFunction(value))) return;

    if (isForeign(value) || seen.has(value)) return;

    seen.add(value);

    const registered = registrationOf(value);

    if (Option.exists(registered, (r) => r.kind === "inert")) return;

    if (Predicate.isFunction(value) && !reach(value, path, registered)) return;

    for (const key of Object.keys(value))
      visit(Predicate.hasProperty(value, key) ? value[key] : undefined, `${path}.${key}`);
  };

  for (const [path, root] of roots) visit(root, path);

  return { entries, builders, stray };
};

const ping = Flow.transaction({
  id: "Surface/ping",
  input: { id: Schema.String },
  key: ["id"],
  concurrency: "reject",
  services: [],
  commit: () => Effect.succeed({}),
});

const look = Flow.resource({
  id: "Surface/look",
  input: { id: Schema.String },
  key: ["id"],
  services: [],
  staleTime: Duration.seconds(1),
  gcTime: Duration.seconds(1),
  lookup: () => Effect.succeed({}),
});

// The probe app's definition and machine, with one of each kind of token, and what Flow passed
// their operations callback and machine body: the walk visits both, since a function only a
// callback receives is still handed out.
const probeOf = () => {
  const passed: Array<readonly [string, Met]> = [];

  const Probe = Flow.definition({
    id: "Surface/Probe",
    states: ["ON", { OFF: ["IDLE", "BUSY"] }],
    events: { Go: { id: Schema.String } },
    internalEvents: { Pinged: {}, Unsure: Flow.Flow.uncertain({}), Seen: {} },
    memory: {
      id: Flow.Flow.initial(Schema.String, ""),
      count: Flow.Flow.private(Flow.Flow.initial(Schema.Number, 0)),
    },
    operations: (tokens) => {
      passed.push(["operations(tokens)", tokens]);

      return {
        ping: ping.outcomes({ success: tokens.E.Pinged, failure: {}, unknown: tokens.E.Unsure }),
        look: look.outcomes({ success: tokens.E.Seen, failure: {} }),
      };
    },
  });

  const ProbeMachine = Flow.machine(Probe, (tokens) => {
    passed.push(["machine(tokens)", tokens]);

    return {
      default: tokens.S.ON,
      on: {
        Go: {
          target: tokens.S.OFF,
          actions: [tokens.O.ping.commit(({ memory }) => ({ id: memory.id }))],
        },
      },
      states: { OFF: { default: tokens.S.OFF.IDLE } },
    };
  });

  return { Probe, ProbeMachine, passed };
};

const { Probe, ProbeMachine, passed } = probeOf();

/**
 * A ref of the probe machine.
 */
export const probeRef = Flow.actorRef(ProbeMachine, "probe");

const probeApp = Flow.app({ id: "Surface", machines: { probe: ProbeMachine } });

/**
 * Every app the surface test walks: each fixture's, and the probe's.
 */
export const apps = [
  ...manifests.map((m) => ({ name: m.name, app: m.app, setup: m.setup, ref: m.bench.probe(0) })),
  {
    name: "probe",
    app: probeApp,
    setup: Flow.runtimeSetup({ app: probeApp }),
    ref: probeRef,
  },
];

/**
 * One app's Runtime, booted with no services, and one actor of it: the roots a walk of its handed
 * out values starts from.
 */
export const booted = (entry: (typeof apps)[number]) =>
  Effect.gen(function* () {
    // No service is given: a call that needs one dies, an ending the machine maps.
    const runtime = Flow.runtimeSetup<Flow.App<Record<never, never>>>({
      app: entry.app,
    }).construct();

    yield* runtime.ready();
    const actor = runtime.ensureActor(entry.ref);

    return { runtime, actor };
  });

/**
 * Every root the walk starts from for one app: its setup, app, machines with their definitions, a
 * booted Runtime and one actor.
 */
export const rootsOf = (
  entry: (typeof apps)[number],
  live: { readonly runtime: Flow.Runtime; readonly actor: Flow.Actor },
) => {
  const roots: ReadonlyArray<readonly [string, Met]> = [
    [`${entry.name}.setup`, entry.setup],
    [`${entry.name}.app`, entry.app],
    [`${entry.name}.runtime`, live.runtime],
    [`${entry.name}.actor`, live.actor],
  ];

  return roots;
};

/**
 * The roots every walk shares: the root route's exports, the probe contracts and what Flow passed
 * the probe's callbacks.
 */
export const sharedRoots: ReadonlyArray<readonly [string, Met]> = [
  ["index", Flow],
  ["ping", ping],
  ["look", look],
  ...passed,
];

// A value each of whose traps throws: every read, write, key listing and call of it.
const trapped = () => {
  const fail = () => {
    // oxlint-disable-next-line lint-bomb/no-throw-in-core -- the hostile value: every trap of it throws
    throw new Error("trapped");
  };

  return new Proxy(
    {},
    {
      get: fail,
      set: fail,
      has: fail,
      ownKeys: fail,
      getOwnPropertyDescriptor: fail,
      defineProperty: fail,
      deleteProperty: fail,
      getPrototypeOf: fail,
      setPrototypeOf: fail,
      isExtensible: fail,
      preventExtensions: fail,
      apply: fail,
      construct: fail,
    },
  );
};

// A record whose usual keys each throw when read.
const throwingGetters = () =>
  Object.defineProperties(
    {},
    Object.fromEntries(
      [
        "_tag",
        "id",
        "machine",
        "value",
        "context",
        "input",
        "forget",
        "states",
        "events",
        "success",
      ].map((key) => [
        key,
        {
          enumerable: true,
          get: () => {
            // oxlint-disable-next-line lint-bomb/no-throw-in-core -- the hostile value: reading this key throws
            throw new Error(`getter ${key}`);
          },
        },
      ]),
    ),
  );

// A record that holds itself, under the keys a call reads first.
const cycle = () => {
  const self = { id: "x", self: {}, machine: {}, list: [{}] };
  self.self = self;
  self.machine = self;
  self.list = [self];

  return self;
};

/**
 * The hostile values every argument position of every entry takes, by name.
 */
export const hostile: ReadonlyArray<readonly [string, () => Met]> = [
  ["null", () => null],
  ["undefined", () => undefined],
  ["NaN", () => Number.NaN],
  ["+Infinity", () => Number.POSITIVE_INFINITY],
  ["-Infinity", () => Number.NEGATIVE_INFINITY],
  // oxlint-disable-next-line flow-state/no-clock -- a hostile value the table passes, never a clock read
  ["a Date", () => new Date(0)],
  ["a Map", () => new Map([["id", "x"]])],
  ["a function", () => () => undefined],
  ["a cycle", cycle],
  ["throwing getters", throwingGetters],
  ["a trapped Proxy", trapped],
  ["a copied definition", () => ({ ...Probe })],
  ["a copied machine", () => ({ ...ProbeMachine })],
  ["a copied ref", () => ({ ...probeRef })],
  ["a copied event token", () => Object.assign(() => undefined, Probe.E.Go)],
  ["a copied state token", () => ({ ...Probe.S.ON })],
];

/**
 * The usual values the other argument positions take while one position is hostile.
 */
export const usual: ReadonlyArray<readonly [string, () => Met]> = [
  ["undefined", () => undefined],
  ["{}", () => ({})],
  ["the probe machine", () => ProbeMachine],
  ["the probe ref", () => probeRef],
];

// Where a throw breaks its kind's contract: an entry may throw only a FlowError, a builder and an
// Effect entry nothing.
const thrownMisuse = (registered: Registered, thrown: Met) => {
  if (registered.kind === "builder") return Option.some("a builder threw");

  if (registered.kind === "effect") return Option.some("an Effect entry threw");

  return thrown instanceof Flow.FlowError ? Option.none() : Option.some("a raw throw");
};

// FLOW_STATE_ALLOW_UNKNOWN: an Effect entry's Effect, whatever it yields.
const serviceFree = (effect: Effect.Effect<unknown, unknown, unknown>) =>
  // SAFETY: Flow's Effect entries (ready, dispose) need no service; the Runtime provides its own.
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- isEffect cannot know an Effect's services
  effect as Effect.Effect<unknown, unknown>;

// An Effect entry's Effect succeeds or fails with a FlowError, and never dies.
const returnedMisuse = (registered: Registered, returned: Met) =>
  registered.kind === "effect" && Effect.isEffect(returned)
    ? Effect.map(Effect.exit(serviceFree(returned)), (exit) =>
        Exit.isSuccess(exit) ||
        (Option.exists(Cause.findErrorOption(exit.cause), (e) => e instanceof Flow.FlowError) &&
          !Cause.hasDies(exit.cause))
          ? Option.none()
          : Option.some("an Effect that did not fail with a FlowError"),
      )
    : Effect.succeed(Option.none<string>());

/**
 * How one call of a public function broke its kind's contract, if it did: a raw throw from an
 * entry, a throw from a builder, an Effect that died or failed with something else, or a call
 * slower than a second.
 */
export const misuseOf = (reached: Reached, args: ReadonlyArray<Met>) =>
  Effect.gen(function* () {
    const started = yield* Clock.currentTimeMillis;
    const ran = Result.try({ try: () => reached.call(...args), catch: (thrown) => thrown });

    const ended = Result.isFailure(ran)
      ? thrownMisuse(reached.registered, ran.failure)
      : yield* returnedMisuse(reached.registered, ran.success);

    const took = (yield* Clock.currentTimeMillis) - started;

    return took > 1000 ? Option.some(`a call of ${took} ms`) : ended;
  });
