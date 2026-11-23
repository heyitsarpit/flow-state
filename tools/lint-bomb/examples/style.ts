// Code reference for ../STYLE.md. Effect 4.0.5; examples are inert until called/run.
// booking.ts composes the core pieces. Later sections are optional recipes, not required layers.
//
// When to reach for each feature:
// - Plain records/functions: ordinary trusted data and deterministic calculations.
// - Data: trusted domain variants, value equality, and internal tagged errors; no input validation.
// - Schema: runtime validation, constrained construction, and encoding/decoding contracts.
//   Use schema-owned variants directly; do not duplicate them in a parallel Data enum.
// - Context.Service: injectable capabilities, contextual dependencies, or owned application state.
//   Keep IDs, commands, payloads, and per-operation options as arguments.
// - Layer: service construction, dependency wiring, and acquired-resource lifetime management.
//
// Read the demos using these terms from code-composition, code-correctness, and to-spec:
// - Concern: a conceptual responsibility; a Boundary implements it through a public contract.
// - Composition level: depth of decomposition; reference sections below are independent recipes.
// - Protocol: a data shape with agreed meaning; an Established fact needs construction or validation.
// - Requirement: observable behavior; an Invariant must hold at its named observation points.
// - Owner: authority preserving an invariant; Publication makes a complete state change visible.
// - Test obligation: a public-boundary check derived from Requirements and Invariants.
// Enforcement explains how code preserves a guarantee; passing Tests supply evidence, not exhaustive proof.
// Carry established facts downstream: consumers use admitted protocols without repeating admission.
// Recheck changing-state facts at use; revalidate values only when their validity is no longer established.
//
// In booking.ts: Schema admits BookingRequest -> BookingLedger reserves seats -> Data models BookingOutcome.
// A Schema.Class models a validated value; having methods alone does not make it a service.
import {
  Array as Arr,
  Cause,
  Clock,
  Config,
  ConfigProvider,
  Context,
  Data,
  Deferred,
  Duration,
  Effect,
  Exit,
  Fiber,
  Function,
  Layer,
  ManagedRuntime,
  Metric,
  Option,
  Predicate,
  PubSub,
  Queue,
  Record as Rec,
  Redacted,
  Ref,
  Result,
  Schedule,
  Schema,
  Stream,
  Struct,
  flow,
  pipe,
} from "effect";
import * as Arbitrary from "effect/Arbitrary";
import { HttpClient, HttpClientResponse } from "effect/http";
import { HttpApi, HttpApiEndpoint, HttpApiGroup } from "effect/http-api";
import { SqlClient } from "effect/sql";
import { TestClock } from "effect/testing";
import { readFile } from "node:fs/promises";

/*****************************************************************************/
/* Reference 1: Protocols, admission, and established facts */
/*****************************************************************************/

export const Quantity = Schema.Int.check(Schema.isGreaterThan(0));

export const Window = Schema.Struct({ start: Schema.Int, end: Schema.Int }).check(
  Schema.makeFilter(
    ({ start, end }) =>
      start <= end || {
        path: ["end"],
        issue: "Must be at or after start",
      },
  ),
);

export const Request = Schema.Struct({
  id: Schema.NonEmptyString,
  quantity: Quantity,
  labels: Schema.NonEmptyArray(Schema.NonEmptyString),
  note: Schema.OptionFromOptionalNullOr(Schema.String),
  window: Window,
});

export type Request = typeof Request.Type;

// JSON text and domain validation share one codec. Keep it private when callers only need parsers.
const RequestJson = Schema.fromJsonString(Request);

// Pure Result examples below use object admission; the demo uses the JSON transport functions.
export const decodeRequest = Schema.decodeUnknownResult(Request, {
  onExcessProperty: "error",
});

// decodeEffect accepts the codec's Encoded type (string here); use decodeUnknownEffect for unknown.
export const decodeRequestJson = Schema.decodeEffect(RequestJson, {
  onExcessProperty: "error",
});

export const encodeRequestJson = Schema.encodeEffect(RequestJson);

// Optional serialization recipe: derive a JSON representation for a non-JSON domain value.
// Encoding 123n produces JSON text '"123"'; decoding restores the bigint.
export const StoredCountFromJson = Schema.fromJsonString(Schema.toCodecJson(Schema.BigInt));

// Project related fields. mapFields drops parent checks; restore needed relationships.
export const RequestIdentity = Request.mapFields(Struct.pick(["id"]));

// A type-side schema accepts decoded Option values, not the raw optional/null field.
export const AdmittedRequest = Schema.toType(Request);

export const CompleteTable = Schema.Record(Schema.Literals(["small", "large"]), Quantity);

// A validated value with a method; it has no injected capability or owned application state.
export class Person extends Schema.Class<Person>("Person")({ name: Schema.String }) {
  greeting() {
    return `Hello ${this.name}`;
  }
}

// Missing-key default and constructor-only default are distinct contracts.
export const WireSettings = Schema.Struct({
  attempts: Schema.Int.pipe(Schema.withDecodingDefaultKey(Effect.succeed(3))),
});

export const ConstructedSettings = Schema.Struct({
  attempts: Schema.Int.pipe(Schema.withConstructorDefault(Effect.succeed(3))),
});

// Schema determines A; a default must conform, not widen inference. Validate its refinements too.
export const defineSetting = <S extends Schema.Constraint>(schema: S, value: NoInfer<S["Type"]>) =>
  Schema.decodeUnknownResult(Schema.toType(schema))(value).pipe(
    Result.map((defaultValue) => ({ schema, defaultValue })),
  );

// A setting declares a schema and a checked domain default; it does not change decoding defaults.
export const quantitySetting = defineSetting(Quantity, 1);

export const describeQuantityDefault = quantitySetting.pipe(
  Result.match({
    onFailure: (error) => error.message,
    onSuccess: ({ defaultValue }) => `Default quantity: ${defaultValue}`,
  }),
);

// defineSetting(Quantity, 0) returns Failure: the number violates Quantity's positive constraint.
// defineSetting(Quantity, "1") is a type error: the default must already be a domain number.

// Use derived equivalence only when field-based value equality is the intended law.
export const sameRequest = Schema.toEquivalence(AdmittedRequest);

// Effect 4.0.5 uses Arbitrary.schema, not the older Schema.toArbitrary API.
// Valid generated inputs supplement invalid, aliasing, identity, and lifecycle cases.
export const sampleQuantities = Arbitrary.sampleEffect(Arbitrary.schema(Quantity));

/*****************************************************************************/
/* Reference 2: Closed protocols, absence, and pure decisions */
/*****************************************************************************/

// Internal lifecycle facts: trusted constructors, no runtime admission or wire contract required.
export type JobState = Data.TaggedEnum<{
  Pending: { id: string };
  Running: { id: string };
  Completed: { id: string; total: number };
}>;

export const JobState = Data.taggedEnum<JobState>();

export const describeState = JobState.$match({
  Pending: ({ id }) => `${id}: pending`,
  Running: ({ id }) => `${id}: running`,
  Completed: ({ id, total }) => `${id}: completed (${total})`,
});

// Commands cross an admission boundary: Schema owns their payload validation and matching.
// Do not declare a second Data enum for the same commands.
export const Command = Schema.TaggedUnion({
  Submit: { request: Request },
  Inspect: { id: Schema.String },
});

export const describeCommand = Command.match({
  Submit: ({ request }) => `submit ${request.id}`,
  Inspect: ({ id }) => `inspect ${id}`,
});

// Derive matching/selection from an existing schema and its own discriminator.
export const Delivery = Schema.Union([
  Schema.Struct({ kind: Schema.Literal("local"), name: Schema.String }),
  Schema.Struct({ kind: Schema.Literal("remote"), url: Schema.String }),
]).pipe(Schema.toTaggedUnion("kind"));

export const localDeliveries = (values: (typeof Delivery.Type)[]) =>
  values.filter(Delivery.isAnyOf(["local"]));

export const noteText = (note: Option.Option<string>) =>
  note.pipe(
    Option.map((text) => text.trim()),
    Option.flatMap((text) => (text.length > 0 ? Option.some(text) : Option.none())),
    Option.match({ onNone: () => "No note", onSome: (text) => text }),
  );

export const summarizeAdmission = (input: typeof Request.Encoded) =>
  decodeRequest(input).pipe(
    Result.map((request) => ({ id: request.id, quantity: request.quantity })),
    Result.match({
      onFailure: () => "Invalid request",
      onSuccess: ({ id, quantity }) => `${id}: ${quantity}`,
    }),
  );

// flatMap combines admission with a pure decision that can itself fail.
export const admitThenDecide = <A, E>(
  input: typeof Request.Encoded,
  decide: (request: Request) => Result.Result<A, E>,
) => decodeRequest(input).pipe(Result.flatMap(decide));

// Native guards narrow known representations; they do not admit an unknown domain payload.
export const presentNotes = (values: Option.Option<string>[]) => Arr.getSomes(values);

export const missingNotes = (values: Option.Option<string>[]) => values.filter(Option.isNone);

export const looksLikeRequest = <Input>(value: Input) => Predicate.hasProperty(value, "id");

/*****************************************************************************/
/* Reference 3: Pure transformation boundaries */
/*****************************************************************************/

export const doubleQuantity = (value: number) => value * 2;

export const displayQuantity = flow(doubleQuantity, (value) => `${value} units`);

export const quotedQuantity = (value: number) => pipe(value, doubleQuantity, String);

export const positiveValues = (values: number[]) => Arr.filter(values, (value) => value > 0);

export const labelCounts = (counts: Record<string, number>) =>
  Rec.map(counts, (value) => String(value));

export const identityOf = (request: Request) => Struct.pick(request, ["id"]);

// dual is for an API deliberately supporting both call styles, not ordinary helper boilerplate.
export const add: {
  (amount: number): (value: number) => number;
  (value: number, amount: number): number;
} = Function.dual(2, (value: number, amount: number) => value + amount);

/*****************************************************************************/
/* Reference 4: Failure contracts and Effect composition */
/*****************************************************************************/

export class Unavailable extends Data.TaggedError("Unavailable")<{ operation: string }> {}

export class ApiFailure extends Schema.TaggedError<ApiFailure>()("ApiFailure", {
  message: Schema.String,
}) {}

// Error is a JS exception payload; Data.Error is untagged. Neither chooses E versus defect.
export const untaggedError = (message: string) => new Data.Error({ message });

// A boundary may inspect all failure reasons; do not squash Cause prematurely.
export const describeExit = <A, E>(exit: Exit.Exit<A, E>) =>
  Exit.match(exit, {
    onSuccess: () => "Succeeded",
    onFailure: (cause) => Cause.pretty(cause),
  });

// A pure Result enters Effect once, when execution begins.
export const requestEffect = (input: typeof Request.Encoded) =>
  Effect.fromResult(decodeRequest(input));

export const expectedFailure = Effect.fail(new Unavailable({ operation: "read" }));

export const invariantFailure = Effect.die(new Error("Required owner state was lost"));

// Exit retains the structured Cause. A JavaScript Error.cause field is not the execution Cause.
export const failureEvidence = Effect.exit(expectedFailure);

// Reserve Effect.try for a throwing foreign API without an existing Schema/Effect operation.
export const readForeignText = (read: () => string) =>
  Effect.try({
    try: read,
    catch: () => new Unavailable({ operation: "foreign text read" }),
  });

export class FileReadFailed extends Data.TaggedError("FileReadFailed")<{
  path: string;
  cause: Cause.UnknownError;
}> {}

// A real foreign adapter: node:fs exposes a Promise API and accepts an AbortSignal.
export const readTextFile = (path: string) => {
  // FLOW_STATE_ALLOW_EFFECT_TRY_PROMISE: node:fs/promises is an external Promise-only API.
  return Effect.tryPromise({
    try: (signal) => readFile(path, { encoding: "utf8", signal }),
    catch: (cause) => new FileReadFailed({ path, cause: new Cause.UnknownError(cause) }),
  });
};

// sync: synchronous work not expected to throw. suspend: defer a factory returning an Effect.
export const notifyHost = (notify: () => void) => Effect.sync(notify);

export const deferRead = <A, E, R>(read: () => Effect.Effect<A, E, R>) => Effect.suspend(read);

export const observedRead = <A, E, R>(read: Effect.Effect<A, E, R>) =>
  read.pipe(
    Effect.tap(() => Effect.logInfo("Read succeeded")),
    Effect.map((value) => ({ value })),
  );

// One handler recovers a known failure. catchTags handles several known failure cases.
export const recoverRead = (read: Effect.Effect<string, Unavailable>) =>
  read.pipe(Effect.catchTag("Unavailable", () => Effect.succeed("unavailable")));

export const translateReadError = <A>(read: Effect.Effect<A, Unavailable>) =>
  read.pipe(Effect.mapError((error) => new ApiFailure({ message: error.operation })));

export const catchKnownErrors = (read: Effect.Effect<string, Unavailable | ApiFailure>) =>
  read.pipe(
    Effect.catchTags({
      Unavailable: () => Effect.succeed("unavailable"),
      ApiFailure: ({ message }) => Effect.succeed(message),
    }),
  );

export const finishWithStatus = <A, E, R>(run: Effect.Effect<A, E, R>) =>
  run.pipe(Effect.as("done"));

export const discardSuccess = <A, E, R>(run: Effect.Effect<A, E, R>) => run.pipe(Effect.asVoid);

export const followedBy = <A, E, R>(read: Effect.Effect<A, E, R>) =>
  read.pipe(Effect.andThen(Effect.logDebug("Read finished")));

/*****************************************************************************/
/* Reference 5: Capability boundaries, ownership, and application assembly */
/*****************************************************************************/

// Composition: host wiring -> Counter operations -> private Ref; Settings is a construction dependency.
// Application configuration supplied through Context; each operation still takes its own inputs.
export class Settings extends Context.Service<Settings, { name: string }>()(
  "lint-bomb/examples/style/Settings",
) {
  static layer = Layer.effect(
    Settings,
    Effect.gen(function* () {
      // Config.schema applies the same Schema vocabulary to provider-supplied values.
      const name = yield* Config.schema(Schema.String, "NAME");

      return Settings.of({ name });
    }),
  );
}

// A shared state owner: callers use domain operations; the Layer allocates the private Ref.
export class Counter extends Context.Service<
  Counter,
  {
    read: Effect.Effect<{ name: string; total: number }>;
    add: (amount: number) => Effect.Effect<number>;
  }
>()("lint-bomb/examples/style/Counter") {
  static layer = Layer.effect(
    Counter,
    Effect.gen(function* () {
      const settings = yield* Settings;
      const total = yield* Ref.make(0);

      const add = (amount: number) =>
        Ref.modify(total, (value) => [value + amount, value + amount]);

      const read = Ref.get(total).pipe(
        Effect.map((value) => ({ name: settings.name, total: value })),
      );

      return Counter.of({ read, add });
    }),
  );
}

// Composition site: choose configuration and supply it once when building the Counter capability.
// App-local data; no process.env access or mutable global application instance.
export const SettingsLive = Settings.layer.pipe(
  Layer.provide(ConfigProvider.layer(ConfigProvider.fromUnknown({ NAME: "demo" }))),
);

export const CounterLive = Counter.layer.pipe(Layer.provide(SettingsLive));

// Retain dependencies only when consumers intentionally need both outputs.
export const CounterAndSettings = Counter.layer.pipe(Layer.provideMerge(SettingsLive));

// fresh changes sharing; its scope still owns lifetime.
export const FreshCounter = Layer.fresh(CounterLive);

export const increment = Effect.fn("Counter.increment")(function* (amount: number) {
  const counter = yield* Counter;

  return yield* counter.add(amount);
});

export const readTotal = Effect.fnUntraced(function* () {
  return yield* (yield* Counter).read;
});

// Only a host that repeatedly invokes Effects needs ManagedRuntime; dispose at host shutdown.
export const makeHost = () => ManagedRuntime.make(CounterLive);

// Secret values stay wrapped; value is for the authorized foreign adapter only.
export const secret = (raw: string) => Redacted.make(raw);

export const revealAtForeignAdapter = (token: Redacted.Redacted) => Redacted.value(token);

// Group tests with describe from @effect/vitest; use plain it for pure boundaries and it.effect for workflows.
// The test runner supplies Scope and TestClock; no runPromise wrapper is needed inside a test.
// See *.test.ts and README.md for requirements, invariants, integration checks, and open obligations.

// Calendar time: reporting.ts uses DateTime.now, named zones, and calendar-day arithmetic.
// Use Schema DateTime codecs at ingress; use Duration for elapsed time and Schedule for recurrence.

/*****************************************************************************/
/* Reference 6: Resource lifetime, time, and work coordination */
/*****************************************************************************/

export const scopedWorker = Effect.scoped(
  Effect.gen(function* () {
    const done = yield* Deferred.make<number>();
    const worker = yield* Effect.forkScoped(Deferred.succeed(done, 42));
    const value = yield* Deferred.await(done);
    yield* Fiber.join(worker);

    return value;
  }),
);

export const elapsed = Effect.gen(function* () {
  const started = yield* Clock.currentTimeMillis;
  yield* Effect.sleep(Duration.millis(1));

  return (yield* Clock.currentTimeMillis) - started;
});

// Use only for repeat-safe work. A stopping policy does not make remote mutations idempotent.
// See tracking.ts for composed backoff, delay caps, error classification, and an overall deadline.
// tracking.test.ts drives the real workflow with TestClock instead of waiting for wall-clock timers.
export const retryRead = <A, E, R>(read: Effect.Effect<A, E, R>) =>
  Effect.retry(read, Schedule.recurs(2));

export const mailbox = Effect.gen(function* () {
  const inbox = yield* Queue.bounded<number>(16);
  yield* Queue.offer(inbox, 7);

  return yield* Queue.take(inbox);
});

export const broadcast = Effect.scoped(
  Effect.gen(function* () {
    const events = yield* PubSub.bounded<string>(16);
    const subscriber = yield* PubSub.subscribe(events);
    yield* PubSub.publish(events, "changed");

    return yield* PubSub.take(subscriber);
  }),
);

export const streamLengths = Stream.fromIterable(["a", "bb"]).pipe(
  Stream.map((value) => value.length),
  Stream.runCollect,
);

// Run within an Effect test harness providing TestClock; wall-clock sleep is not a test handshake.
export const advanceTestTime = TestClock.adjust(Duration.seconds(1));

export const recordRequestMetric = Metric.update(Metric.counter("style_requests"), 1);

/*****************************************************************************/
/* Reference 7: External network and storage boundaries */
/*****************************************************************************/

export const requestApi = HttpApi.make("Jobs").add(
  HttpApiGroup.make("jobs").add(
    HttpApiEndpoint.post("submit", "/jobs", {
      payload: Request,
      success: RequestIdentity,
      error: ApiFailure,
    }),
  ),
);

export const fetchRequest = (url: string) =>
  HttpClient.get(url).pipe(
    Effect.flatMap(HttpClientResponse.filterStatusOk),
    Effect.flatMap(HttpClientResponse.schemaBodyJson(Request, { onExcessProperty: "error" })),
  );

// Supply the real SQL driver's Layer at composition. One transaction owns related writes.
export const insertRequest = (id: string) =>
  SqlClient.SqlClient.use((sql) =>
    sql.withTransaction(sql`INSERT INTO requests (id) VALUES (${id})`),
  );

// See booking.ts for NodeRuntime.runMain at the process edge.
