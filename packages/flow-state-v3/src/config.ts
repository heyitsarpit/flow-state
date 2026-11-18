import { Duration, Match, Predicate, Result, Schema, SchemaAST, type SchemaIssue } from "effect";
import type {
  EventFields,
  GuardToken as GuardTokenOf,
  HistoryToken as HistoryTokenOf,
  StateToken as StateTokenOf,
  StateTree,
} from "./definition.ts";
import type { Bound } from "./contract.ts";
import { type Finding, invalid } from "./error.ts";
import type { Uncertain } from "./flow.ts";

const Fn = Schema.declare(Predicate.isFunction);

const FieldSchema = Schema.declare(Schema.isSchema);

// A token of one kind; a retry or cancel member is a callable token, so a function may be one.
const isToken =
  <const K extends string>(kind: K) =>
  // FLOW_STATE_ALLOW_UNKNOWN: an authored value, told apart by its kind.
  // RETURN_TYPE: a type guard states the token kind it narrows to.
  (x: unknown): x is { readonly "~flow": K } =>
    Predicate.hasProperty(x, "~flow") && x["~flow"] === kind;

const marked = <const K extends string>(kind: K) => Schema.declare(isToken(kind));

const StateToken = marked("state");

const HistoryToken = marked("history");

const GuardToken = marked("guard");

const ActionToken = marked("action");

// RETURN_TYPE: a type guard states the type it narrows to.
const isEnding = (x: unknown): x is { readonly ending: { readonly event: string } } =>
  Predicate.hasProperty(x, "ending") &&
  Predicate.hasProperty(x.ending, "event") &&
  Predicate.isString(x.ending.event);

// An event token or a mapping of one: E.X or E.X.from(f).
const Ending = Schema.declare(isEnding);

const Payload = Schema.Record(Schema.String, FieldSchema);

const UncertainEvent = Schema.Struct({ "~flow": Schema.Literal("uncertain"), fields: Payload });

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

const InitialField = Schema.Struct({
  "~flow": Schema.Literal("initial"),
  schema: FieldSchema,
  start: Schema.Union([
    // FLOW_STATE_ALLOW_UNKNOWN: a constant start is checked by its field's Schema, not here.
    Schema.Struct({ _tag: Schema.Literal("Constant"), value: Schema.Unknown }),
    Schema.Struct({ _tag: Schema.Literal("Computed"), compute: Fn }),
  ]),
});

const MemoryField = Schema.Union([
  InitialField,
  Schema.Struct({ "~flow": Schema.Literal("input"), schema: FieldSchema }),
  Schema.Struct({
    "~flow": Schema.Literal("private"),
    field: Schema.Union([InitialField, FieldSchema]),
  }),
  FieldSchema,
]).annotate({
  help: "Start the field with Flow.input, Flow.initial, or an optional field Schema.",
});

const ContextSlot = Schema.Struct({
  "~flow": Schema.Literal("context"),
  provider: Schema.String,
  schema: FieldSchema,
  select: Fn,
}).annotate({ help: "Declare a context slot with Provider.select(schema, selector)." });

const DefinitionConfig = Schema.Struct({
  id: Schema.String.annotate({ help: "Give the definition a string id." }),
  persist: Schema.optionalKey(Schema.Boolean.annotate({ help: "Set persist to true or false." })),
  states: States,
  events: Events,
  internalEvents: Schema.optionalKey(Events),
  memory: Schema.optionalKey(Schema.Record(Schema.String, MemoryField)),
  context: Schema.optionalKey(Schema.Record(Schema.String, ContextSlot)),
  operations: Schema.optionalKey(Fn.annotate({ help: "Declare operations as ({ E }) => record." })),
}).annotate({
  help: "Declare id, states and events; a definition may also declare persist, internalEvents, memory, context and operations.",
});

const GuardElement = Schema.Union([StateToken, GuardToken, Fn]);

const Alternative = Schema.Struct({
  target: Schema.optionalKey(Schema.Union([StateToken, HistoryToken, Schema.Literal("self")])),
  guard: Schema.optionalKey(Schema.Union([GuardElement, Schema.Array(GuardElement)])),
  updateMemory: Schema.optionalKey(Fn),
  actions: Schema.optionalKey(Schema.Array(ActionToken)),
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
  DurationObject,
]).annotate({ help: 'Give a schedule a Duration input, such as "5 seconds" or { seconds: 5 }.' });

const ScheduleEntry = Schema.Struct({
  schedule: Delay,
  send: Ending,
  armOn: Schema.optionalKey(Schema.Array(Schema.Union([Schema.String, marked("entry")]))),
}).annotate({
  help: "Write a schedule as { schedule, send: E.X, armOn: [event names or Flow.entry] }.",
});

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
  onContext: Schema.optionalKey(
    Schema.Array(Schema.Struct({ select: Fn, when: Schema.optionalKey(Fn), event: Ending })),
  ),
  states: Schema.optionalKey(Schema.Record(Schema.String, Schema.UndefinedOr(StateBody))),
}).annotate({ help: "A machine body declares default, on, onContext and states." });

const helpOf = (ast: SchemaAST.AST, inherited: string) => {
  const help = SchemaAST.resolve(ast)?.["help"];

  return Predicate.isString(help) ? help : inherited;
};

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
      all.issues.some(isMarkIssue)
        ? wrongKind(path, helpOf(all.ast, help))
        : all.issues.flatMap((inner) => findingsOf(inner, path, helpOf(all.ast, help))),
    AnyOf: (any) => oneOf(any, path, helpOf(any.ast, help)),
    Encoding: (encoding) => findingsOf(encoding.issue, path, helpOf(encoding.ast, help)),
    MissingKey: () => [invalid(path, "MissingField", `${where(path)} is missing`, help)],
    UnexpectedKey: () => [
      invalid(path, "UnknownField", `${where(path)} is not a field here`, help),
    ],
    InvalidType: (wrong) => wrongKind(path, helpOf(wrong.ast, help)),
    Filter: () => wrongKind(path, help),
    InvalidValue: () => wrongKind(path, help),
    Forbidden: () => wrongKind(path, help),
    OneOf: () => wrongKind(path, help),
  });

// A marked value whose mark is missing or another kind's is a wrong kind as a whole, never a
// finding per key.
const isMarkIssue = (issue: SchemaIssue.Issue) =>
  issue._tag === "Pointer" && issue.path.length === 1 && issue.path[0] === "~flow";

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

// FLOW_STATE_ALLOW_UNKNOWN: what an operations callback returned, told apart by its kind.
// RETURN_TYPE: a type guard states the type it narrows to.
const isBound = (x: unknown): x is Bound =>
  Predicate.hasProperty(x, "kind") &&
  (x.kind === "write" || x.kind === "read") &&
  Predicate.hasProperty(x, "call") &&
  Predicate.isFunction(x.call) &&
  Predicate.hasProperty(x, "success") &&
  isEnding(x.success);

const Operations = Schema.Record(Schema.String, Schema.declare(isBound)).annotate({
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

/**
 * Findings in declaration order: by the place of their first path segment among `keys`, an absent
 * key first; rule order within one key.
 */
export const inDeclarationOrder = (keys: ReadonlyArray<string>, findings: ReadonlyArray<Finding>) =>
  findings.toSorted((a, b) => keys.indexOf(String(a.path[0])) - keys.indexOf(String(b.path[0])));

// RETURN_TYPE: a type guard over event fields.
export const isUncertain = (x: EventFields): x is Uncertain => Schema.is(UncertainEvent)(x);

const kindIs = <T extends { readonly "~flow": string }>(kind: T["~flow"]) => {
  const test = isToken(kind);

  // RETURN_TYPE: a type guard states the token kind it narrows to.
  const guard = <I>(x: I): x is I & T => test(x);

  return guard;
};

/**
 * A decoded body element's token kind: a state, history or guard token.
 */
export const is = {
  state: kindIs<StateTokenOf>("state"),
  history: kindIs<HistoryTokenOf>("history"),
  guard: kindIs<GuardTokenOf>("guard"),
};
