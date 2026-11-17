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
import { atOrBelow, chainOf, type Move, moveOf } from "./tree.ts";
import type { RefusedCode } from "./vocabulary.ts";

/**
 * The largest delay a timer can hold: 2^31 - 1 ms.
 */
export const MAX_DELAY_MS = 2_147_483_647;

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
/**
 * A schedule a turn arms: its name, the event it sends and its delay.
 */
export type Arming = { readonly name: string; readonly send: string; readonly ms: number };

/**
 * What a turn decided.
 *
 * **Details**
 *
 * - `Accepted`: one alternative ran at `handler` (`""` for the root); `move` is its change of
 *   state (a re-entry included), `None` for "self"; `arm` lists the schedules armed.
 * - `Denied`: handlers existed and all declined, with each decline's code.
 * - `Unhandled`: no handler.
 * - `Refused`: the turn is invalid or a callback failed before commit; nothing of it applies.
 */
export type TurnResult = Data.TaggedEnum<{
  Accepted: {
    part: Part;
    handler: string;
    move: Option.Option<Move>;
    memory: Values;
    actions: ReadonlyArray<Resolved>;
    arm: ReadonlyArray<Arming>;
  };
  Denied: { reasons: ReadonlyArray<string> };
  Unhandled: {};
  Refused: { code: RefusedCode; slot: string };
}>;

/**
 * Constructors and matchers for {@link TurnResult}.
 */
export const TurnResult = Data.taggedEnum<TurnResult>();

/**
 * Everything a turn reads: the pre-turn state and memory, the event, the route, the
 * turn's time and the lanes with its own ending admitted.
 *
 * **Details**
 *
 * - `state`: the active leaf's path; `activations` numbers each state on its chain, outermost
 *   first; `history` holds each compound's last active child.
 * - `late`: the event is a late ending, routed from `from`, the depth of the owner's nearest
 *   surviving ancestor (0 for the root); a current event is routed from the leaf.
 * - `lane(operation, key)`: a lane's view; a `None` key names the ending's own lane.
 * - `owns(activation)`: that activation owns an InFlight head, so a late turn may not exit it.
 */
export type TurnInput = {
  readonly compiled: Compiled;
  readonly state: string;
  readonly activations: ReadonlyArray<number>;
  readonly history: ReadonlyMap<string, string>;
  readonly memory: Values;
  readonly tag: string;
  readonly payload: Values;
  readonly late: boolean;
  readonly from: number;
  readonly now: number;
  readonly lane: (operation: string, key: Option.Option<Values>) => LaneView;
  readonly owns: (activation: number) => boolean;
};

type Failed = { readonly slot: string };

/**
 * One guard's outcome: it passes, it declines with a code, or its callback is defective.
 */
type Verdict = Data.TaggedEnum<{
  Pass: {};
  Declined: { code: string };
  Defect: { slot: string };
}>;

const Verdict = Data.taggedEnum<Verdict>();

const PASSED = Verdict.Pass();

const NOT_IN_STATE = Verdict.Declined({ code: "NotInState" });

const LATE_MAY_NOT_LEAVE = Verdict.Declined({ code: "LateMayNotLeave" });

const IN_FLIGHT = Verdict.Declined({ code: "InFlight" });

const UNCERTAIN = Verdict.Declined({ code: "Uncertain" });

const NOTHING_TO_RESEND = Verdict.Declined({ code: "NothingToResend" });

const RETRY_LIMIT = Verdict.Declined({ code: "RetryLimit" });

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
    onSome: (k) => Result.map(recordFrom(k, read), Option.some),
  });

const idleVerdict = (view: LaneView) =>
  LaneView.$match(view, { Idle: () => PASSED, InFlight: () => IN_FLIGHT, Held: () => UNCERTAIN });

const retryableVerdict = (view: LaneView, times: number) =>
  LaneView.$match(view, {
    Idle: () => NOTHING_TO_RESEND,
    InFlight: () => IN_FLIGHT,
    Held: ({ retryCount }) => (retryCount < times ? PASSED : RETRY_LIMIT),
  });

const verdictOf = (checked: Result.Result<Verdict, Failed>) =>
  Result.getOrElse(checked, (failed) => Verdict.Defect({ slot: failed.slot }));

const guardCheck = (guard: Guard, input: TurnInput, read: GuardRead) =>
  Guard.$match(guard, {
    InState: ({ state }) => (atOrBelow(input.state, state) ? PASSED : NOT_IN_STATE),
    Check: ({ check }) =>
      verdictOf(
        call(check.slot, () => {
          const verdict = check.run(read);

          return verdict === true ? PASSED : Verdict.Declined({ code: verdict.code });
        }),
      ),
    Idle: ({ operation, key }) =>
      verdictOf(
        Result.map(recordFrom(key, read), (k) =>
          idleVerdict(input.lane(operation, Option.some(k))),
        ),
      ),
    Retryable: ({ operation, key, times }) =>
      verdictOf(
        Result.map(keyOf(key, read), (k) => retryableVerdict(input.lane(operation, k), times)),
      ),
  });

type GuardRead = { readonly state: string; readonly memory: Values; readonly event: Values };

const moveFor = (alternative: Alternative, handler: string, input: TurnInput) =>
  Option.map(alternative.target, (target) =>
    moveOf(input.compiled, input.state, handler, target, input.history),
  );

// A late turn may not exit a state whose activation owns work in flight.
const strands = (move: Move, input: TurnInput) => {
  const kept = input.activations.length - move.exits.length;

  return input.activations.slice(Math.max(kept, 0)).some(input.owns);
};

// RETURN_TYPE: the Verdict every guard returns; the first that is not a pass decides.
const firstDecline = (
  alternative: Alternative,
  handler: string,
  input: TurnInput,
  read: GuardRead,
): Verdict => {
  for (const guard of alternative.guards) {
    const checked = guardCheck(guard, input, read);

    if (!Verdict.$is("Pass")(checked)) return checked;
  }

  if (input.late && Option.exists(moveFor(alternative, handler, input), (m) => strands(m, input)))
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
          Number.isFinite(value) && value >= 0 && value <= MAX_DELAY_MS
            ? Result.succeed(value)
            : // oxlint-disable-next-line lint-bomb/no-allocation-in-loop -- an invalid delay refuses the turn; the loop ends here
              Result.fail({ slot: ms.slot }),
      ),
  });

/**
 * The largest delay a timer can hold: 2^31 - 1 ms.
 */

const NO_SCHEDULES: ReadonlyArray<Schedule> = [];

/**
 * The schedules a turn arms on the states active after it, outermost first: on each entered
 * state those armed on entry, and on every active state each one that lists the event, with its
 * delay from the after memory; an invalid delay is its slot's defect.
 */
export const armingsOf = (
  compiled: Compiled,
  leaf: string,
  entered: ReadonlySet<string>,
  tag: string,
  memory: Values,
) => {
  const armed: Array<Arming> = [];
  const refused: Array<string> = [];

  const arms = (path: string, schedule: Schedule) =>
    (entered.has(path) && schedule.onEntry) || schedule.armOn.includes(tag);

  for (const path of chainOf(leaf))
    for (const schedule of compiled.states.get(path)?.schedules ?? NO_SCHEDULES)
      if (arms(path, schedule)) {
        const ms = delayOf(schedule, memory);

        if (Result.isFailure(ms)) refused.push(ms.failure.slot);
        // oxlint-disable-next-line lint-bomb/no-allocation-in-loop -- one arming per schedule armed: the turn's result
        else armed.push({ name: schedule.name, send: schedule.send, ms: ms.success });
      }

  return { armed, refused };
};

// RETURN_TYPE: each branch builds one TurnResult variant; the union is the contract.
const accept = (alternative: Alternative, handler: string, input: TurnInput): TurnResult => {
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

  if (Result.isFailure(patched)) return TurnResult.Refused({ code: "Defect", ...patched.failure });
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

  const move = moveFor(alternative, handler, input);
  const leaf = Option.match(move, { onNone: () => input.state, onSome: (m) => m.leaf });
  const entered = new Set(Option.match(move, { onNone: () => [], onSome: (m) => m.enters }));
  const arm = armingsOf(input.compiled, leaf, entered, input.tag, memory);
  const [refused] = arm.refused;

  if (refused !== undefined) return TurnResult.Refused({ code: "InvalidTurn", slot: refused });

  return TurnResult.Accepted({
    part: {
      at: alternative.at,
      node: handler === "" ? "root" : handler,
      target: Option.match(move, { onNone: () => "self", onSome: (m) => m.target }),
    },
    handler,
    move,
    memory,
    actions,
    arm: arm.armed,
  });
};

const lists = (input: TurnInput, path: string) => {
  for (const schedule of input.compiled.states.get(path)?.schedules ?? NO_SCHEDULES)
    if (schedule.armOn.includes(input.tag)) return true;

  return false;
};

// The implicit "self" of the deepest state on the route whose schedule lists the event in armOn.
const implicit = (input: TurnInput) => {
  let node = "";

  for (const path of chainOf(input.state).slice(0, input.from)) if (lists(input, path)) node = path;

  if (node === "") return Option.none();

  const alternative: Alternative = {
    at: `trigger:${node}:${input.tag}`,
    target: Option.none(),
    guards: [],
    update: Option.none(),
    actions: [],
  };

  return Option.some({ node, alternatives: [alternative] });
};

const EMPTY: ReadonlyArray<Alternative> = [];

// Each level from the routed state up to the root, with its written alternatives for the event.
const levelsOf = (input: TurnInput) => {
  const chain = chainOf(input.state).slice(0, input.from);

  const levels: Array<{
    readonly node: string;
    readonly alternatives: ReadonlyArray<Alternative>;
  }> = [];

  let written = false;

  for (let i = chain.length; i >= 0; i -= 1) {
    const node = i === 0 ? "" : (chain[i - 1] ?? "");
    const level = i === 0 ? input.compiled.root : input.compiled.states.get(node)?.on;
    const alternatives = level?.get(input.tag) ?? EMPTY;

    written ||= alternatives.length > 0;
    // oxlint-disable-next-line lint-bomb/no-allocation-in-loop -- one entry per level of the chain: the turn's route
    levels.push({ node, alternatives });
  }

  return written ? levels : Option.toArray(implicit(input));
};

/**
 * Runs one admitted event against a machine's handlers.
 *
 * **Details**
 *
 * The active leaf's level is tried first, then each ancestor's, then the root's; a late ending
 * starts at the owner's nearest surviving ancestor. At each level the first alternative whose
 * guards all pass wins. When no level handles the event and an active state's schedule lists it
 * in `armOn`, that state handles it with an unguarded "self". A guard, update, select or schedule
 * callback that throws, or an invalid delay, refuses the whole turn.
 */
// RETURN_TYPE: each branch builds one TurnResult variant; the union is the contract.
export const runTurn = (input: TurnInput): TurnResult => {
  const levels = levelsOf(input);

  const reasons: Array<string> = [];
  const read = { state: input.state, memory: input.memory, event: input.payload };

  for (const level of levels)
    for (const alternative of level.alternatives) {
      const checked = firstDecline(alternative, level.node, input, read);

      if (Verdict.$is("Defect")(checked))
        // oxlint-disable-next-line lint-bomb/no-allocation-in-loop -- the refusal is the turn's one result; the loop ends here
        return TurnResult.Refused({ code: "GuardDefect", slot: checked.slot });

      if (Verdict.$is("Pass")(checked)) return accept(alternative, level.node, input);
      reasons.push(checked.code);
    }

  return reasons.length > 0 ? TurnResult.Denied({ reasons }) : TurnResult.Unhandled();
};
