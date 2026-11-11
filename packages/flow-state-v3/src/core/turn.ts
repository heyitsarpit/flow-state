import { Data, Option, Predicate, Result } from "effect";
import {
  Action,
  type Alternative,
  type Compiled,
  Delay,
  Guard,
  type Schedule,
  type Values,
} from "./compiled.ts";
import type { Part } from "./evidence.ts";

/**
 * What a guard or member sees of one lane: Idle, InFlight, or Held with its re-sends.
 */
export type LaneView = Data.TaggedEnum<{
  Idle: {};
  InFlight: {};
  Held: { retryCount: number };
}>;

/**
 * Constructors and matchers for {@link LaneView}.
 */
export const LaneView = Data.taggedEnum<LaneView>();

/**
 * One action with its selects run on the after memory: what the step applies to lanes and reads.
 */
export type Resolved = Data.TaggedEnum<{
  Commit: { operation: string; input: Values };
  Retry: { operation: string; key: Option.Option<Values> };
  Cancel: { operation: string; key: Option.Option<Values> };
  Lookup: { operation: string; input: Values };
}>;

/**
 * Constructors and matchers for {@link Resolved}.
 */
export const Resolved = Data.taggedEnum<Resolved>();

/**
 * A schedule to arm at the end of the turn, with its delay from the after memory.
 */
export type Arming = { readonly name: string; readonly send: string; readonly ms: number };

/**
 * What a turn decided (Turn R2, R5, R8, R9).
 *
 * **Details**
 *
 * - `Accepted`: one alternative ran; `target` is the state it enters (a re-entry included), `None`
 *   for "self"; `arm` lists the schedules armed, `exits` whether the leaf's activation ended.
 * - `Denied`: handlers existed and all declined, with each decline's code.
 * - `Unhandled`: no handler.
 * - `Refused`: the turn is invalid or a callback failed before commit; nothing of it applies.
 */
export type TurnResult = Data.TaggedEnum<{
  Accepted: {
    part: Part;
    target: Option.Option<string>;
    memory: Values;
    actions: ReadonlyArray<Resolved>;
    arm: ReadonlyArray<Arming>;
  };
  Denied: { reasons: ReadonlyArray<string> };
  Unhandled: {};
  Refused: { code: string; slot: string };
}>;

/**
 * Constructors and matchers for {@link TurnResult}.
 */
export const TurnResult = Data.taggedEnum<TurnResult>();

/**
 * Everything a turn reads (Turn R7): the pre-turn state and memory, the event, the route, the
 * turn's time and the lanes with its own ending admitted.
 *
 * **Details**
 *
 * - `late`: the event is a late ending, routed from the root (Turn R20).
 * - `lane(operation, key)`: a lane's view; a `None` key names the ending's own lane.
 * - `leavingStrandsWork`: leaving the leaf would exit an activation that owns an InFlight head
 *   (Turn R21).
 * - `armed`: the names of the leaf's armed schedules.
 */
export type TurnInput = {
  readonly compiled: Compiled;
  readonly state: string;
  readonly memory: Values;
  readonly tag: string;
  readonly payload: Values;
  readonly late: boolean;
  readonly now: number;
  readonly lane: (operation: string, key: Option.Option<Values>) => LaneView;
  readonly leavingStrandsWork: boolean;
};

type Failed = { readonly slot: string };

type Check = Result.Result<Option.Option<string>, Failed>;

// RETURN_TYPE: Check is the guard protocol every verdict shares.
const decline = (code: string): Check => Result.succeed(Option.some(code));

const PASSED: Check = Result.succeed(Option.none());

const NOT_IN_STATE = decline("NotInState");

const LATE_MAY_NOT_LEAVE = decline("LateMayNotLeave");

const OPEN = Option.none<string>();

const IN_FLIGHT = Option.some("InFlight");

const UNCERTAIN = Option.some("Uncertain");

const NOTHING_TO_RESEND = Option.some("NothingToResend");

const RETRY_LIMIT = Option.some("RetryLimit");

const NO_KEY = Result.succeed(Option.none<Values>());

// FLOW_STATE_ALLOW_UNKNOWN: whatever a user callback throws is a defect of that callback, reported by its slot.
// RETURN_TYPE: a callback's value, or the slot whose callback failed.
const call = <A>(slot: string, run: () => A): Result.Result<A, Failed> =>
  Result.try({ try: run, catch: () => ({ slot }) });

/**
 * A select or key callback's record; anything else is a defect of that callback (the types forbid
 * it, so only untyped code reaches this).
 */
const recordFrom = <I>(
  slot: { readonly slot: string; readonly run: (input: I) => Values },
  read: I,
) =>
  Result.flatMap(
    call(slot.slot, () => slot.run(read)),
    (value) =>
      Predicate.isReadonlyObject(value)
        ? Result.succeed<Values>(value)
        : // oxlint-disable-next-line lint-bomb/no-allocation-in-loop -- a defective callback refuses the turn; the loop ends here
          Result.fail({ slot: slot.slot }),
  );

const keyOf = <I>(
  key: Option.Option<{ readonly slot: string; readonly run: (input: I) => Values }>,
  read: I,
) =>
  Option.match(key, {
    onNone: () => NO_KEY,
    onSome: (k) =>
      Result.map(
        call(k.slot, () => k.run(read)),
        Option.some,
      ),
  });

const idleVerdict = (view: LaneView) =>
  LaneView.$match(view, { Idle: () => OPEN, InFlight: () => IN_FLIGHT, Held: () => UNCERTAIN });

const retryableVerdict = (view: LaneView, times: number) =>
  LaneView.$match(view, {
    Idle: () => NOTHING_TO_RESEND,
    InFlight: () => IN_FLIGHT,
    Held: ({ retryCount }) => (retryCount < times ? OPEN : RETRY_LIMIT),
  });

// RETURN_TYPE: Check is the guard protocol every branch returns.
const guardCheck = (guard: Guard, input: TurnInput, read: GuardRead): Check =>
  Guard.$match(guard, {
    InState: ({ states }) => (states.includes(input.state) ? PASSED : NOT_IN_STATE),
    Check: ({ check }) =>
      call(check.slot, () => {
        const verdict = check.run(read);

        return verdict === true ? OPEN : Option.some(verdict.code);
      }),
    Idle: ({ operation, key }) =>
      Result.map(recordFrom(key, read), (k) => idleVerdict(input.lane(operation, Option.some(k)))),
    Retryable: ({ operation, key, times }) =>
      Result.map(keyOf(key, read), (k) => retryableVerdict(input.lane(operation, k), times)),
  });

type GuardRead = { readonly state: string; readonly memory: Values; readonly event: Values };

// RETURN_TYPE: Check is the guard protocol every branch returns.
const firstDecline = (alternative: Alternative, input: TurnInput, read: GuardRead): Check => {
  for (const guard of alternative.guards) {
    const checked = guardCheck(guard, input, read);

    if (Result.isFailure(checked) || Option.isSome(checked.success)) return checked;
  }

  if (input.late && Option.isSome(alternative.target) && input.leavingStrandsWork)
    return LATE_MAY_NOT_LEAVE;

  return PASSED;
};

const resolve = (action: Action, read: { readonly memory: Values; readonly event: Values }) =>
  Action.$match(action, {
    Commit: ({ operation, select }) =>
      Result.map(
        recordFrom(select, read),
        // oxlint-disable-next-line lint-bomb/no-allocation-in-loop -- one resolved member per action: the turn's result
        (input) => Resolved.Commit({ operation, input }),
      ),
    Lookup: ({ operation, select }) =>
      Result.map(
        recordFrom(select, read),
        // oxlint-disable-next-line lint-bomb/no-allocation-in-loop -- one resolved member per action: the turn's result
        (input) => Resolved.Lookup({ operation, input }),
      ),
    Retry: ({ operation, key }) =>
      Result.map(
        keyOf(key, read),
        // oxlint-disable-next-line lint-bomb/no-allocation-in-loop -- one resolved member per action: the turn's result
        (k) => Resolved.Retry({ operation, key: k }),
      ),
    Cancel: ({ operation, key }) =>
      Result.map(
        keyOf(key, read),
        // oxlint-disable-next-line lint-bomb/no-allocation-in-loop -- one resolved member per action: the turn's result
        (k) => Resolved.Cancel({ operation, key: k }),
      ),
  });

const delayOf = (schedule: Schedule, memory: Values) =>
  Delay.$match(schedule.delay, {
    Fixed: ({ ms }) => Result.succeed(ms),
    Computed: ({ ms }) =>
      Result.flatMap(
        call(ms.slot, () => ms.run({ memory })),
        (value) =>
          Number.isFinite(value) && value >= 0
            ? Result.succeed(value)
            : // oxlint-disable-next-line lint-bomb/no-allocation-in-loop -- an invalid delay refuses the turn; the loop ends here
              Result.fail({ slot: ms.slot }),
      ),
  });

const armingsOf = (
  schedules: ReadonlyArray<Schedule>,
  entered: boolean,
  tag: string,
  memory: Values,
) => {
  const armed: Array<Arming> = [];

  for (const schedule of schedules)
    if ((entered && schedule.onEntry) || schedule.armOn.includes(tag)) {
      const ms = delayOf(schedule, memory);

      if (Result.isFailure(ms)) return Result.fail(ms.failure);
      // oxlint-disable-next-line lint-bomb/no-allocation-in-loop -- one arming per schedule armed: the turn's result
      armed.push({ name: schedule.name, send: schedule.send, ms: ms.success });
    }

  return Result.succeed(armed);
};

// RETURN_TYPE: each branch builds one TurnResult variant; the union is the contract.
const accept = (alternative: Alternative, node: string, input: TurnInput): TurnResult => {
  const read = { memory: input.memory, event: input.payload, now: input.now };

  const patched = Option.match(alternative.update, {
    onNone: () => Result.succeed(input.memory),
    onSome: (update) =>
      Result.map(
        call(update.slot, () => update.run(read)),
        (patch) => {
          // oxlint-disable-next-line lint-bomb/no-allocation-in-loop -- the turn's after memory: one patch, merged once
          const after = { ...input.memory, ...patch };

          return input.compiled.sameMemory(after, input.memory) ? input.memory : after;
        },
      ),
  });

  if (Result.isFailure(patched))
    return TurnResult.Refused({ code: "CallbackDefect", ...patched.failure });
  const memory = patched.success;
  const select = { memory, event: input.payload };
  const actions: Array<Resolved> = [];

  for (const action of alternative.actions) {
    const resolved = resolve(action, select);

    if (Result.isFailure(resolved))
      // oxlint-disable-next-line lint-bomb/no-allocation-in-loop -- the refusal is the turn's one result; the loop ends here
      return TurnResult.Refused({ code: "InvalidTurn", slot: resolved.failure.slot });
    actions.push(resolved.success);
  }

  const leaf = Option.getOrElse(alternative.target, () => input.state);
  const schedules = input.compiled.states.get(leaf)?.schedules ?? [];
  const arm = armingsOf(schedules, Option.isSome(alternative.target), input.tag, memory);

  if (Result.isFailure(arm))
    return TurnResult.Refused({ code: "InvalidTurn", slot: arm.failure.slot });

  return TurnResult.Accepted({
    part: { at: alternative.at, node, target: Option.getOrElse(alternative.target, () => "self") },
    target: alternative.target,
    memory,
    actions,
    arm: arm.success,
  });
};

// RETURN_TYPE: an Option of the implicit alternative, absent when no schedule lists the event.
const implicit = (input: TurnInput): Option.Option<Alternative> => {
  const listed = (input.compiled.states.get(input.state)?.schedules ?? []).some((s) =>
    s.armOn.includes(input.tag),
  );

  return listed
    ? Option.some({
        at: `trigger:${input.state}:${input.tag}`,
        target: Option.none(),
        guards: [],
        update: Option.none(),
        actions: [],
      })
    : Option.none();
};

/**
 * Runs one admitted event against a machine's handlers (Turn R2, R5, R7 to R9, R12, R14, R21).
 *
 * **Details**
 *
 * The active leaf's level is tried first, then the root's; a late ending tries the root's alone.
 * At each level the first alternative whose guards all pass wins. A guard, update, select or
 * schedule callback that throws, or an invalid delay, refuses the whole turn.
 */
// RETURN_TYPE: each branch builds one TurnResult variant; the union is the contract.
export const runTurn = (input: TurnInput): TurnResult => {
  const leafLevel = input.compiled.states.get(input.state)?.on;

  const leafAlternatives = Option.match(Option.fromUndefinedOr(leafLevel?.get(input.tag)), {
    onSome: (list) => list,
    onNone: () => Option.toArray(implicit(input)),
  });

  const levels = input.late
    ? [{ node: "root", alternatives: input.compiled.root.get(input.tag) ?? [] }]
    : [
        { node: input.state, alternatives: leafAlternatives },
        { node: "root", alternatives: input.compiled.root.get(input.tag) ?? [] },
      ];

  const reasons: Array<string> = [];
  const read = { state: input.state, memory: input.memory, event: input.payload };
  let handled = false;

  for (const level of levels)
    for (const alternative of level.alternatives) {
      handled = true;
      const checked = firstDecline(alternative, input, read);

      if (Result.isFailure(checked))
        // oxlint-disable-next-line lint-bomb/no-allocation-in-loop -- the refusal is the turn's one result; the loop ends here
        return TurnResult.Refused({ code: "GuardDefect", slot: checked.failure.slot });

      if (Option.isNone(checked.success)) return accept(alternative, level.node, input);
      reasons.push(checked.success.value);
    }

  return handled ? TurnResult.Denied({ reasons }) : TurnResult.Unhandled();
};
