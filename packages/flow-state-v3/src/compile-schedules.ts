import { Duration, Option, Predicate, Schema } from "effect";
import { codecOf, endingOf, selectionCodec } from "./events.ts";
import { TIMER_LIMIT_MS } from "./core/defaults.ts";
import {
  Delay,
  type FiringMetadata,
  isSeries,
  Planned,
  plannedOf,
  type Schedule,
  type ScheduleCodecs,
} from "./core/compiled.ts";
import { is } from "./config.ts";
import { type Finding, invalid } from "./error.ts";
import { atOrBelow } from "./core/tree.ts";
import { byCodeUnits } from "./core/world.ts";
import type { ErasedPlacement, ScheduleDecl, ScheduleDecls } from "./tokens.ts";
import { type Compile, foreign, type Path, slotOf } from "./compile-names.ts";

/**
 * Compiling a state's schedules.
 */
// Whether a delay holds a NaN or infinite number: Duration reads a NaN part as 0, so each part
// is checked as written.
const partsOf = (delay: Duration.Input) => {
  if (Array.isArray(delay)) return delay;

  return Predicate.isObject(delay) && !Duration.isDuration(delay) ? Object.values(delay) : [];
};

const hasNonFinitePart = (delay: Duration.Input) =>
  partsOf(delay).some((part) => Predicate.isNumber(part) && !Number.isFinite(part));

// A fixed delay in ms, NaN when it has none: a number is read as written, since Duration clamps a
// negative one and keeps Infinity.
const msOf = (delay: Duration.Input) => {
  if (Predicate.isNumber(delay)) return delay;

  if (hasNonFinitePart(delay)) return Number.NaN;

  return Option.getOrElse(
    Option.map(Duration.fromInput(delay), Duration.toMillis),
    () => Number.NaN,
  );
};

const fixedDelay = (compile: Compile, delay: Duration.Input, at: Path) => {
  const ms = msOf(delay);

  if (!Number.isFinite(ms) || ms < 0 || ms > TIMER_LIMIT_MS)
    compile.findings.push(
      invalid(
        [...at, "schedule"],
        "DelayOutOfRange",
        "a schedule's delay is not between 0 and 2^31 - 1 ms",
        "Give the schedule a finite delay of at most 2^31 - 1 ms (about 24.8 days).",
      ),
    );

  return ms;
};

// The events that arm and disarm a schedule, with the findings of their lists: an event in both,
// `armOn` on a keyed schedule, and an event in `armOn` beside `restartOn`.
const armingOf = (
  compile: Compile,
  name: string,
  config: ErasedPlacement,
  keyed: boolean,
  at: Path,
) => {
  const armOn = config.armOn ?? [];
  const arming = eventsOf(compile, armOn, [...at, "armOn"]);
  const disarming = eventsOf(compile, config.disarmOn ?? [], [...at, "disarmOn"]);

  for (const [n, event] of disarming.entries())
    if (arming.includes(event))
      compile.findings.push(
        invalid(
          [...at, "disarmOn", n],
          "ArmedAndDisarmed",
          `${event} both arms and disarms the schedule ${name}`,
          "List an event in armOn or in disarmOn, not both.",
        ),
      );

  if (keyed && armOn.length > 0)
    compile.findings.push(
      invalid(
        [...at, "armOn"],
        "ArmOnKeyed",
        `the keyed schedule ${name} lists armOn`,
        "A keyed schedule arms each key as it appears: drop armOn.",
      ),
    );
  else if (config.restartOn !== undefined)
    for (const n of armOn.flatMap((element, i) => (is.entry(element) ? [] : [i])))
      compile.findings.push(
        invalid(
          [...at, "armOn", n],
          "ArmOnBesideRestart",
          `the schedule ${name} lists an event in armOn beside restartOn`,
          "Beside restartOn, armOn may hold only Flow.entry.",
        ),
      );

  return { arming, disarming };
};

// A schedule's delay: computed when it is a function, else an Effect Schedule to step or a fixed
// Duration, checked at construction.
const delayOf = (compile: Compile, delay: ErasedPlacement["schedule"], slot: string, at: Path) => {
  if (Predicate.isFunction(delay))
    return Delay.Computed({
      plan: {
        slot,
        // FLOW_STATE_ALLOW_UNKNOWN: a computed delay's value, checked by plannedOf.
        run: (input) => plannedOf(delay(input)),
      },
    });

  return Delay.Fixed({
    planned: isSeries(delay)
      ? Planned.Stepped({ series: delay })
      : Planned.Ms({ ms: fixedDelay(compile, delay, at) }),
  });
};

// A second placement of one schedule in a state and its ancestor: both are active at once, and a
// schedule's timers are one per name.
const nestedPlacement = (compile: Compile, name: string, state: string, at: Path) => {
  const placed = compile.placements.get(name) ?? [];

  compile.placements.set(name, [...placed, state]);

  return placed.some((other) => atOrBelow(state, other) || atOrBelow(other, state))
    ? [
        invalid(
          at,
          "DuplicateName",
          `the schedule ${name} is placed in ${state} and in a state above or below it`,
          "Place a schedule in states that are never active together.",
        ),
      ]
    : [];
};

// RETURN_TYPE: the Compiled shape this part builds.
export const scheduleOf = (
  compile: Compile,
  name: string,
  config: ErasedPlacement,
  state: string,
  at: Path,
): Schedule => {
  const declared = compile.definition.schedules[name] ?? {};
  const keyed = declared.key !== undefined;

  compile.findings.push(...nestedPlacement(compile, name, state, at));

  const send = endingOf(config.send);

  if (!Option.exists(send, (ending) => compile.sends.has(ending.token)))
    compile.findings.push(foreign([...at, "send"], "the send event"));

  const armOn = config.armOn ?? [];
  const { arming, disarming } = armingOf(compile, name, config, keyed, at);

  const slot = slotOf([...at, "schedule"]);
  const from = Option.flatMap(send, (ending) => ending.from);
  const paused = config.paused ?? {};

  return {
    name,
    slot,
    send: Option.getOrElse(
      Option.map(send, (ending) => ending.event),
      () => "",
    ),
    from: Option.map(from, (map) => ({
      slot: slotOf([...at, "send"]),
      run: (metadata: FiringMetadata) => map(metadata, undefined),
    })),
    delay: delayOf(compile, config.schedule, slot, at),
    armOn: arming,
    disarmOn: disarming,
    onEntry:
      !keyed && ((armOn.length === 0 && config.restartOn === undefined) || armOn.some(is.entry)),
    restartOn: Option.map(Option.fromUndefinedOr(config.restartOn), (run) => ({
      slot: slotOf([...at, "restartOn"]),
      // FLOW_STATE_ALLOW_UNKNOWN: a restart selection of any type, compared by Equal.equals.
      run,
    })),
    keys: Option.map(Option.fromUndefinedOr(config.keys), (run) => ({
      slot: slotOf([...at, "keys"]),
      run,
    })),
    paused: (declared.pausedBy ?? []).flatMap((reason) =>
      Object.hasOwn(paused, reason)
        ? [
            {
              reason,
              check: {
                slot: slotOf([...at, "paused", reason]),
                run: paused[reason] ?? (() => false),
              },
            },
          ]
        : [],
    ),
  };
};

// One placement checked against its declaration, each refusal the types make with its own row: an
// undeclared schedule, a reason the declaration does not name or a declared one with no callback,
// keys on an unkeyed schedule or none on a keyed one, and a restartOn the declaration lacks or one
// it declares and the placement lacks.
// FLOW_STATE_ALLOW_UNKNOWN: a placement as written, judged before it is decoded.
const placementRows = (
  declared: Option.Option<ScheduleDecl>,
  entry: unknown,
  name: string,
  at: Path,
) => {
  if (Option.isNone(declared))
    return [
      invalid(
        at,
        "ScheduleUndeclared",
        `the schedule ${name} is not declared on the definition`,
        `Declare it on the definition: schedules: { ${name}: {} }.`,
      ),
    ];

  if (!Predicate.isObject(entry)) return [];

  const decl = declared.value;
  // FLOW_STATE_ALLOW_UNKNOWN: a placement's field as written.
  const field = (key: string) => (Object.hasOwn(entry, key) ? entry[key] : undefined);
  const has = (key: string) => field(key) !== undefined;
  const paused = field("paused") ?? {};
  const reasons = decl.pausedBy ?? [];
  const written = Predicate.isObject(paused) ? Object.keys(paused) : [];

  const checks: ReadonlyArray<readonly [boolean, Finding]> = [
    [
      decl.key !== undefined && !has("keys"),
      invalid(
        at,
        "KeysMissing",
        `the keyed schedule ${name} is placed without keys`,
        "Give a keyed schedule keys: ({ memory }) => [key records].",
      ),
    ],
    [
      decl.key === undefined && has("keys"),
      invalid(
        [...at, "keys"],
        "KeysUnexpected",
        `the schedule ${name} is declared without a key`,
        `Declare its key on the definition: schedules: { ${name}: { key: { ... } } }, or drop keys.`,
      ),
    ],
    [
      decl.restartOn === undefined && has("restartOn"),
      invalid(
        [...at, "restartOn"],
        "RestartOnUndeclared",
        `the schedule ${name} declares no restartOn`,
        `Declare its selection's Schema on the definition: schedules: { ${name}: { restartOn: Schema } }, or drop restartOn.`,
      ),
    ],
    [
      decl.restartOn !== undefined && !has("restartOn"),
      invalid(
        at,
        "RestartOnMissing",
        `the schedule ${name} declares restartOn and is placed without one`,
        "Give the placement its restartOn: (input) => selection.",
      ),
    ],
    ...written
      .filter((r) => !reasons.includes(r))
      .map(
        (reason) =>
          [
            true,
            invalid(
              [...at, "paused", reason],
              "ReasonUndeclared",
              `the schedule ${name} declares no pause reason ${reason}`,
              "Name the reason in its declaration's pausedBy, or drop it.",
            ),
          ] as const,
      ),
    ...reasons
      .filter((r) => Predicate.isObject(paused) && !Object.hasOwn(paused, r))
      .map(
        (reason) =>
          [
            true,
            invalid(
              at,
              "ReasonMissing",
              `the schedule ${name} has no callback for its reason ${reason}`,
              "Give every declared reason its callback in paused.",
            ),
          ] as const,
      ),
  ];

  return checks.flatMap(([refused, finding]) => (refused ? [finding] : []));
};

/**
 * Every placement of a machine body checked against its definition's declaration, state by state:
 * the construction twin of each refusal the types make for a schedule.
 */
// FLOW_STATE_ALLOW_UNKNOWN: a machine body as written, judged before it is decoded.
export const placementFindings = (declared: ScheduleDecls, body: unknown) => {
  const found: Array<Finding> = [];

  // FLOW_STATE_ALLOW_UNKNOWN: a state body as written.
  const walk = (state: unknown, at: Path) => {
    const schedules: unknown = Predicate.hasProperty(state, "schedules")
      ? state.schedules
      : undefined;

    const states: unknown = Predicate.hasProperty(state, "states") ? state.states : undefined;

    if (Predicate.isObject(schedules))
      for (const [name, entry] of Object.entries(schedules))
        found.push(
          ...placementRows(
            Option.filter(Option.fromUndefinedOr(declared[name]), () =>
              Object.hasOwn(declared, name),
            ),
            entry,
            name,
            [...at, "schedules", name],
          ),
        );

    if (Predicate.isObject(states))
      for (const [name, child] of Object.entries(states)) walk(child, [...at, "states", name]);
  };

  walk(body, []);

  return found;
};

// The event names an `armOn` or `disarmOn` list holds: each of this definition's event tokens;
// Flow.entry is no event, and another definition's token is refused at its element.
const eventsOf = (
  compile: Compile,
  // FLOW_STATE_ALLOW_UNKNOWN: a decoded list's elements, checked against the definition's tokens.
  list: ReadonlyArray<unknown>,
  at: Path,
) =>
  list.flatMap((element, n) => {
    if (is.entry(element)) return [];

    if (
      !compile.sends.has(element) ||
      !Predicate.hasProperty(element, "tag") ||
      !Predicate.isString(element.tag)
    ) {
      compile.findings.push(foreign([...at, n], "an armOn or disarmOn event"));

      return [];
    }

    return [element.tag];
  });

// A key's codec to its canonical text: the declared fields in name order, as a contract's key text,
// decoding exactly, so a saved key holding a field the declaration lost does not decode.
const keyCodecOf = (fields: Schema.Struct.Fields) => {
  const names = Object.keys(fields);
  const other = Schema.String.check(Schema.makeFilter((key: string) => !names.includes(key)));

  return codecOf<string>(
    Schema.fromJsonString(
      Schema.toCodecJson(
        Schema.StructWithRest(
          Schema.Struct(
            Object.fromEntries(Object.entries(fields).toSorted(([a], [b]) => byCodeUnits(a, b))),
          ),
          [Schema.Record(other, Schema.Never)],
        ),
      ),
    ),
  );
};

// A selection's codec to its JSON text.
const selectionCodecOf = (schema: Schema.Top) =>
  selectionCodec(Schema.fromJsonString(Schema.toCodecJson(schema)));

/**
 * Each declared schedule's codecs and reasons, by name, as `Compiled.schedules` holds them: its
 * key's codec when it is keyed, its selection's when it declares `restartOn`.
 */
// RETURN_TYPE: Compiled's schedules table, each entry's codecs typed as Compiled reads them.
export const scheduleCodecsOf = (declared: ScheduleDecls): ReadonlyMap<string, ScheduleCodecs> =>
  new Map(
    Object.entries(declared).map(([name, decl]) => [
      name,
      {
        key: Option.map(Option.fromUndefinedOr(decl.key), keyCodecOf),
        selection: Option.map(Option.fromUndefinedOr(decl.restartOn), selectionCodecOf),
        reasons: decl.pausedBy ?? [],
      },
    ]),
  );
