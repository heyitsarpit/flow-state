import { Duration, Option, Predicate, Schedule as EffectSchedule } from "effect";
import { TIMER_LIMIT_MS } from "./core/defaults.ts";
import {
  Delay,
  type FiringMetadata,
  Planned,
  type Schedule,
  type ScheduleInput,
  type Series,
  type Values,
} from "./core/compiled.ts";
import { is } from "./config.ts";
import { checkName } from "./construction.ts";
import { invalid } from "./error.ts";
import { erase } from "./handles.ts";
import type { ErasedSchedule } from "./tokens.ts";
import { type Compile, foreign, type Path, slotOf } from "./compile-names.ts";
import { endingOf } from "./events.ts";

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
const armingOf = (compile: Compile, name: string, config: ErasedSchedule, at: Path) => {
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

  if (config.keys !== undefined && armOn.length > 0)
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
const delayOf = (compile: Compile, delay: ErasedSchedule["schedule"], slot: string, at: Path) => {
  if (Predicate.isFunction(delay))
    return Delay.Computed({
      plan: {
        slot,
        // FLOW_STATE_ALLOW_UNKNOWN: a computed delay's value, checked by plannedOf.
        run: (input) => plannedOf(erase<ScheduleInput, unknown>(delay)(input)),
      },
    });

  return Delay.Fixed({
    planned: isSeries(delay)
      ? Planned.Stepped({ series: delay })
      : Planned.Ms({ ms: fixedDelay(compile, delay, at) }),
  });
};

// RETURN_TYPE: the Compiled shape this part builds.
export const scheduleOf = (
  compile: Compile,
  name: string,
  config: ErasedSchedule,
  at: Path,
): Schedule => {
  compile.findings.push(...checkName(name, at));

  if (compile.scheduleNames.has(name))
    compile.findings.push(
      invalid(
        at,
        "DuplicateName",
        `two schedules are named ${name}`,
        "Give every schedule of a machine its own name.",
      ),
    );
  else compile.scheduleNames.set(name, slotOf(at));

  const send = endingOf(config.send);

  if (!Option.exists(send, (ending) => compile.sends.has(ending.token)))
    compile.findings.push(foreign([...at, "send"], "the send event"));

  const armOn = config.armOn ?? [];
  const { arming, disarming } = armingOf(compile, name, config, at);

  const slot = slotOf([...at, "schedule"]);
  const from = Option.flatMap(send, (ending) => ending.from);

  return {
    name,
    slot,
    send: Option.getOrElse(
      Option.map(send, (ending) => ending.event),
      () => "",
    ),
    from: Option.map(from, (map) => ({
      slot: slotOf([...at, "send"]),
      run: erase<FiringMetadata, Values>((metadata: never) => map(metadata, undefined)),
    })),
    delay: delayOf(compile, config.schedule, slot, at),
    armOn: arming,
    disarmOn: disarming,
    onEntry:
      config.keys === undefined &&
      ((armOn.length === 0 && config.restartOn === undefined) || armOn.some(is.entry)),
    restartOn: Option.map(Option.fromUndefinedOr(config.restartOn), (run) => ({
      slot: slotOf([...at, "restartOn"]),
      // FLOW_STATE_ALLOW_UNKNOWN: a restart selection of any type, compared by Equal.equals.
      run: erase<ScheduleInput, unknown>(run),
    })),
    keys: Option.map(Option.fromUndefinedOr(config.keys), (run) => ({
      slot: slotOf([...at, "keys"]),
      run: erase<ScheduleInput, ReadonlyArray<Values>>(run),
    })),
    paused: Object.entries(config.paused ?? {}).map(([reason, check]) => ({
      reason,
      check: {
        slot: slotOf([...at, "paused", reason]),
        run: erase<ScheduleInput, boolean>(check),
      },
    })),
  };
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

// A computed delay as the core plans it: an Effect Schedule to step, or a Duration input in
// milliseconds (a number as written; NaN when it is neither, which refuses its turn).
const plannedOf = (
  // FLOW_STATE_ALLOW_UNKNOWN: whatever a computed schedule returned, checked here.
  value: unknown,
) => {
  if (isSeries(value)) return Planned.Stepped({ series: value });

  if (Predicate.isNumber(value)) return Planned.Ms({ ms: value });

  return Planned.Ms({
    ms: Option.getOrElse(
      Option.map(Duration.fromInput(durationOf(value)), Duration.toMillis),
      () => Number.NaN,
    ),
  });
};

// An Effect Schedule, as the core steps it: the types admit only Schedules with no error and no
// services, and the host passes no input.
// RETURN_TYPE: a type guard states the Schedule type it narrows to.
const isSeries = (
  // FLOW_STATE_ALLOW_UNKNOWN: a delay of any form, told apart here.
  value: unknown,
): value is Series => EffectSchedule.isSchedule(value);

// A computed delay that is no Schedule and no number, as the Duration input its types promise; one
// that is not decodes to no Duration and refuses its turn.
const durationOf = (
  // FLOW_STATE_ALLOW_UNKNOWN: whatever a computed schedule returned.
  value: unknown,
) =>
  // SAFETY: Duration.fromInput returns none for any value that is no Duration input.
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- fromInput checks the value itself
  value as Duration.Input;
