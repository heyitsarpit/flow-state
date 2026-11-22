import {
  Duration,
  Layer,
  Match,
  Option,
  Predicate,
  Result,
  Schedule,
  Schema,
  SchemaAST,
  SchemaIssue,
} from "effect";
import type {
  EventFields,
  GuardToken as GuardTokenOf,
  HistoryToken as HistoryTokenOf,
  StateToken as StateTokenOf,
  StateTree,
} from "./definition.ts";
import { type Finding, invalid } from "./error.ts";
import type { Entry, Uncertain } from "./flow.ts";
import { type Container, isMade, type Kind } from "./made.ts";
import type { SendToken as SendTokenOf } from "./send.ts";
import type { ErasedEntry, ErasedSchedule } from "./tokens.ts";

const Fn = Schema.declare(Predicate.isFunction);

const FieldSchema = Schema.declare(Schema.isSchema);

// A value Flow made, of one kind: a copy, another kind or a forged value is a wrong kind as a whole.
const madeKind = (kind: Kind, help: string) =>
  Schema.declare(
    // FLOW_STATE_ALLOW_UNKNOWN: an authored value, recognised as made before it is trusted.
    // RETURN_TYPE: a type guard states the made value it narrows to.
    (x: unknown): x is Container => isMade(kind)(x),
  ).annotate({ ...WHOLE, help });

// A value whose parts are judged as one: when it fails, it is one wrong kind at its own path.
const WHOLE = { whole: true };

const StateToken = madeKind("state", "Use the S tokens the machine body receives.");

const HistoryToken = madeKind("history", "Use S.X.history of the machine body's tokens.");

const GuardToken = madeKind("guard", "Use the O tokens the machine body receives.");

const ActionToken = madeKind("action", "Use the O tokens the machine body receives.");

const SendToken = madeKind("send", "Write a send with send(to, event).");

const EntryToken = madeKind("entry", "Arm on the state's entry with Flow.entry.");

const EventToken = madeKind("event", "Use the E tokens the machine body receives.");

// An event token or a mapping of one: E.X or E.X.from(f).
const Ending = Schema.Union([
  EventToken,
  madeKind("mapping", "Map with E.X.from(f) of the machine body's tokens."),
]).annotate({ ...WHOLE, help: "Map to this definition's event: E.X, or E.X.from(f)." });

const Payload = Schema.Record(Schema.String, FieldSchema);

const UncertainEvent = madeKind(
  "uncertain",
  "Mark an internal event an unknown ending maps to with Flow.uncertain(fields).",
);

const Events = Schema.Record(Schema.String, Schema.Union([UncertainEvent, Payload])).annotate({
  help: "Write events as a record of payloads: field Schemas, or Flow.uncertain(fields); {} means none.",
});

const States: Schema.Codec<StateTree> = Schema.Array(
  Schema.Union([
    Schema.String,
    Schema.Record(
      Schema.String,
      Schema.suspend(() => States),
    ).check(Schema.makeFilter((compound) => Object.keys(compound).length === 1)),
  ]),
).annotate({
  help: "Write states as a list of leaf names and single-key compounds { NAME: [children] }.",
});

const InitialField = madeKind("initial", "Start the field at a constant with Flow.initial.");

// FLOW_STATE_ALLOW_UNKNOWN: a private marker's field, judged with it.
// RETURN_TYPE: a type guard states the marker it narrows to.
const isPrivateOf = (x: unknown): x is Container =>
  isMade("private")(x) &&
  Predicate.hasProperty(x, "field") &&
  (isMade("initial")(x.field) || Schema.isSchema(x.field));

const MemoryField = Schema.Union([
  InitialField,
  madeKind("input", "Take the field from the creator with Flow.input."),
  Schema.declare(isPrivateOf),
  FieldSchema,
]).annotate({
  help: "Start the field with Flow.input, Flow.initial, or an optional field Schema.",
});

// A slot's reads and select are judged by their tokens when the definition reads them.
const ContextSlot = madeKind(
  "context",
  "Declare a context slot with Flow.context(X.M.field) or Flow.context(Schema, { reads, select }).",
);

const DefinitionConfig = Schema.Struct({
  id: Schema.String.annotate({ help: "Give the definition a string id." }),
  persist: Schema.optionalKey(Schema.Boolean.annotate({ help: "Set persist to true or false." })),
  states: States,
  events: Events,
  internalEvents: Schema.optionalKey(Events),
  memory: Schema.optionalKey(Schema.Record(Schema.String, MemoryField)),
  context: Schema.optionalKey(Schema.Record(Schema.String, ContextSlot)),
  operations: Schema.optionalKey(Fn.annotate({ help: "Declare operations as ({ E }) => record." })),
  // FLOW_STATE_ALLOW_UNKNOWN: a schedule declaration, accepted and not yet read.
  schedules: Schema.optionalKey(Schema.Record(Schema.String, Schema.Unknown)),
}).annotate({
  help: "Declare id, states and events; a definition may also declare persist, internalEvents, memory, context and operations.",
});

const GuardElement = Schema.Union([StateToken, GuardToken, Fn]);

const Alternative = Schema.Struct({
  target: Schema.optionalKey(Schema.Union([StateToken, HistoryToken, Schema.Literal("self")])),
  guard: Schema.optionalKey(Schema.Union([GuardElement, Schema.Array(GuardElement)])),
  updateMemory: Schema.optionalKey(Fn),
  actions: Schema.optionalKey(Schema.Array(Schema.Union([ActionToken, SendToken]))),
});

const Handler = Schema.Union([StateToken, HistoryToken, Alternative]);

const On = Schema.Record(
  Schema.String,
  Schema.UndefinedOr(Schema.Union([Handler, Schema.Array(Handler)])),
).annotate({
  help: "Write a handler as a state token, an alternative { target, guard, updateMemory, actions }, or a list of them.",
});

const DurationObject = Schema.Struct(
  Object.fromEntries(
    [
      "weeks",
      "days",
      "hours",
      "minutes",
      "seconds",
      "milliseconds",
      "microseconds",
      "nanoseconds",
    ].map((unit) => [unit, Schema.optionalKey(Schema.UndefinedOr(Schema.Number))]),
  ),
);

// A fixed delay is any Duration input, or a function of memory; its range is a rule, checked by
// the compile.
const Delay = Schema.Union([
  Fn,
  Schema.Number,
  Schema.BigInt,
  Schema.String,
  Schema.Tuple([Schema.Number, Schema.Number]),
  Schema.declare(Duration.isDuration),
  Schema.declare(Schedule.isSchedule),
  DurationObject,
]).annotate({ help: 'Give a schedule a Duration input, such as "5 seconds" or { seconds: 5 }.' });

const scheduleFields = {
  schedule: Delay,
  send: Ending,
  armOn: Schema.optionalKey(Schema.Array(Schema.Union([EventToken, EntryToken]))),
  disarmOn: Schema.optionalKey(Schema.Array(EventToken)),
  restartOn: Schema.optionalKey(Fn),
  paused: Schema.optionalKey(Schema.Record(Schema.String, Fn)),
};

// A schedule, or a keyed one as Flow.keyed makes it: its config, with keys.
const ScheduleEntry = Schema.Union([
  Schema.Struct(scheduleFields).annotate({
    help: "Write a schedule as { schedule, send: E.X, armOn: [E.X tokens or Flow.entry] }, and one with a timer per key as Flow.keyed({ keys, schedule, send: E.X }).",
  }),
  Schema.Struct({
    "~flow": Schema.Literal("keyed"),
    config: Schema.Struct({ ...scheduleFields, keys: Fn }).annotate({
      help: "Write a keyed schedule as Flow.keyed({ keys, schedule, send: E.X }).",
    }),
  }),
]);

// A slot's change reaction, as `C.slot.change` makes it: when a change counts, and its event.
const Change = madeKind("change", "Write a reaction as C.slot.change({ when, event }).");

// RETURN_TYPE: recursive: a state body holds its children's bodies; only its decoding is read.
// FLOW_STATE_ALLOW_UNKNOWN: an authored body, decoded here before it is trusted.
const StateBody: Schema.Decoder<unknown> = Schema.Struct({
  default: Schema.optionalKey(StateToken),
  on: Schema.optionalKey(On),
  schedules: Schema.optionalKey(Schema.Record(Schema.String, ScheduleEntry)),
  states: Schema.optionalKey(
    Schema.Record(Schema.String, Schema.UndefinedOr(Schema.suspend(() => StateBody))),
  ),
}).annotate({ help: "A state body declares on and schedules, and a compound default and states." });

const MachineBody = Schema.Struct({
  default: Schema.optionalKey(StateToken),
  on: Schema.optionalKey(On),
  onContext: Schema.optionalKey(Schema.Array(Change)),
  states: Schema.optionalKey(Schema.Record(Schema.String, Schema.UndefinedOr(StateBody))),
}).annotate({ help: "A machine body declares default, on, onContext and states." });

// FLOW_STATE_ALLOW_UNKNOWN: an annotation's value is whatever its Schema was annotated with.
const helpIn = (
  annotations: Option.Option<{ readonly [key: string]: unknown }>,
  inherited: string,
) => {
  const help = Option.getOrUndefined(Option.map(annotations, (a) => a["help"]));

  return Predicate.isString(help) ? help : inherited;
};

const helpOf = (ast: SchemaAST.AST, inherited: string) =>
  helpIn(Option.fromUndefinedOr(SchemaAST.resolve(ast)), inherited);

const where = (path: ReadonlyArray<string | number>) =>
  path.length === 0 ? "the configuration" : path.join(".");

const wrongKind = (path: ReadonlyArray<string | number>, help: string) => [
  invalid(path, "WrongKind", `${where(path)} is not of the kind it must be`, help),
];

const segment = (key: PropertyKey) => (Predicate.isNumber(key) ? key : String(key));

// RETURN_TYPE: recursive: the findings of one issue tree, in the decoder's walk order.
const findingsOf = (
  issue: SchemaIssue.Issue,
  path: ReadonlyArray<string | number>,
  help: string,
): ReadonlyArray<Finding> =>
  Match.valueTags(issue, {
    Pointer: (pointer) => findingsOf(pointer.issue, [...path, ...pointer.path.map(segment)], help),
    Composite: (all) =>
      isWhole(all.ast)
        ? wrongKind(path, helpOf(all.ast, help))
        : all.issues.flatMap((inner) => findingsOf(inner, path, helpOf(all.ast, help))),
    AnyOf: (any) =>
      isWhole(any.ast)
        ? wrongKind(path, helpOf(any.ast, help))
        : oneOf(any, path, helpOf(any.ast, help)),
    Encoding: (encoding) => findingsOf(encoding.issue, path, helpOf(encoding.ast, help)),
    MissingKey: () => [invalid(path, "MissingField", `${where(path)} is missing`, help)],
    UnexpectedKey: () => [
      invalid(path, "UnknownField", `${where(path)} is not a field here`, help),
    ],
    InvalidType: (wrong) => wrongKind(path, helpOf(wrong.ast, help)),
    Filter: (filter) =>
      findingsOf(
        filter.issue,
        path,
        helpIn(Option.fromUndefinedOr(filter.filter.annotations), help),
      ),
    InvalidValue: () => wrongKind(path, help),
    Forbidden: () => wrongKind(path, help),
    OneOf: () => wrongKind(path, help),
  });

// A value whose Schema is judged whole is a wrong kind as a whole, never a finding per key.
const isWhole = (ast: SchemaAST.AST) => SchemaAST.resolve(ast)?.["whole"] === true;

// A union no member matched is a wrong kind; when only one member was of the right kind, its
// issue is reported where it is.
// RETURN_TYPE: recursive through findingsOf.
const oneOf = (
  issue: SchemaIssue.AnyOf,
  path: ReadonlyArray<string | number>,
  help: string,
): ReadonlyArray<Finding> => {
  const [only, ...more] = issue.issues.filter((inner) => inner._tag !== "InvalidType");

  return only === undefined || more.length > 0
    ? wrongKind(path, help)
    : findingsOf(only, path, help);
};

const findingsAgainst =
  <S extends Schema.Decoder<unknown>>(schema: S, at: ReadonlyArray<string | number> = []) =>
  // FLOW_STATE_ALLOW_UNKNOWN: an authored value, decoded here before it is trusted.
  (input: unknown) =>
    Result.match(
      Schema.decodeUnknownResult(schema)(input, { onExcessProperty: "error", errors: "all" }),
      {
        onSuccess: () => [],
        onFailure: (error) => findingsOf(error.issue, at, "Fix the configuration."),
      },
    );

const Bound = madeKind("bound", "Bind a contract with contract.outcomes({ ... }).");

const Operations = Schema.Record(Schema.String, Bound).annotate({
  help: "Return a record of contract.outcomes({ ... }) from operations.",
});

/**
 * The findings of a definition's kinds: a missing, unknown or wrong-kind field, at its path.
 */
export const configFindings = findingsAgainst(DefinitionConfig);

/**
 * The findings of what an operations callback returned: a record of bound contracts.
 */
export const operationsFindings = findingsAgainst(Operations, ["operations"]);

/**
 * The findings of a machine body's kinds: a missing, unknown or wrong-kind field, at its path.
 */
export const bodyFindings = findingsAgainst(MachineBody);

const SetupConfig = Schema.Struct({
  app: Schema.Struct({
    id: Schema.String,
    // FLOW_STATE_ALLOW_UNKNOWN: each machine entry is checked by app's own findings, next.
    machines: Schema.Record(Schema.String, Schema.Unknown),
  }).annotate({ help: "Pass the app app({ id, machines }) returned." }),
  services: Schema.optionalKey(
    Schema.declare(Layer.isLayer).annotate({
      help: "Give services a Layer of the app's services.",
    }),
  ),
  scope: Schema.optionalKey(Schema.String.annotate({ help: "Give the scope a string." })),
  persistence: Schema.optionalKey(
    Schema.Struct({
      captureMs: Schema.optionalKey(
        Schema.Number.check(Schema.isFinite().abort(), Schema.isGreaterThanOrEqualTo(0)).annotate({
          help: "Give captureMs a finite number of milliseconds, 0 or more.",
        }),
      ),
    }),
  ),
}).check(
  Schema.makeFilter(
    (setup) => {
      if ((setup.scope === undefined) === (setup.persistence === undefined)) return undefined;

      const missing = setup.scope === undefined ? "scope" : "persistence";

      return { path: [missing], issue: new SchemaIssue.MissingKey(undefined) };
    },
    { help: "Give scope and persistence together, or neither." },
  ),
);

/**
 * The findings of a Runtime setup's kinds: a missing, unknown or wrong-kind field, at its path.
 */
export const setupFindings = findingsAgainst(SetupConfig);

/**
 * Findings in declaration order: by the place of their first path segment among `keys`, an absent
 * key first; rule order within one key.
 */
export const inDeclarationOrder = (keys: ReadonlyArray<string>, findings: ReadonlyArray<Finding>) =>
  findings.toSorted((a, b) => keys.indexOf(String(a.path[0])) - keys.indexOf(String(b.path[0])));

// RETURN_TYPE: a type guard over event fields.
export const isUncertain = (x: EventFields): x is Uncertain => isMade("uncertain")(x);

const kindIs = <T>(kind: Kind) => {
  const test = isMade(kind);

  // RETURN_TYPE: a type guard states the token kind it narrows to.
  const guard = <I>(x: I): x is I & T => test(x);

  return guard;
};

/**
 * A decoded body element's token kind: a state, history, guard, action, send or entry token.
 */
export const is = {
  state: kindIs<StateTokenOf>("state"),
  history: kindIs<HistoryTokenOf>("history"),
  guard: kindIs<GuardTokenOf<never>>("guard"),
  send: kindIs<SendTokenOf>("send"),
  entry: kindIs<Entry>("entry"),
  // FLOW_STATE_ALLOW_UNKNOWN: a decoded schedule entry, told apart by its shape.
  // RETURN_TYPE: a type guard states the entry it narrows to.
  keyed: (x: unknown): x is Extract<ErasedEntry, { readonly config: ErasedSchedule }> =>
    Predicate.hasProperty(x, "config") && !Predicate.hasProperty(x, "schedule"),
};
