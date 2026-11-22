import { Data, Option, Predicate, Result } from "effect";
import { admitted } from "./boundary.ts";
import { refName } from "./identity.ts";
import type { ActivationId, ActorId } from "./world.ts";
import {
  InternalsId,
  Action,
  type Alternative,
  type Compiled,
  Guard,
  type Schedule,
  type Series,
  type Values,
} from "./compiled.ts";
import { firstStep, type Step } from "./schedule-plan.ts";
import type { Part } from "./evidence.ts";
import { sameValue } from "./same.ts";
import { atOrBelow, chainOf, type Move, moveOf } from "./tree.ts";
import type { RefusedCode } from "./vocabulary.ts";

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
 * One action with its selects run on the after memory: what the step applies to lanes and reads,
 * or a send with its target named and its event checked by the target's Schemas.
 */
export type Resolved = Data.TaggedEnum<{
  Commit: { operation: string; input: Values };
  Retry: { operation: string; key: Option.Option<Values> };
  Cancel: { operation: string; key: Option.Option<Values> };
  Lookup: { operation: string; input: Values };
  Send: { actor: ActorId; tag: string; payload: Values };
}>;

/**
 * Constructors and matchers for {@link Resolved}.
 */
export const Resolved = Data.taggedEnum<Resolved>();

/**
 * A schedule a turn arms at its end: its name and its first step, read from the memory after the
 * turn (none when its Effect Schedule is complete before a first step).
 */
export type Arming = { readonly name: string; readonly first: Option.Option<Step> };

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
    disarm: ReadonlyArray<string>;
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
 *   first; `history` holds each compound's last active child; `context` its slots' values.
 * - `late`: the event is a late ending, routed from `from`, the depth of the owner's nearest
 *   surviving ancestor (0 for the root); a current event is routed from the leaf.
 * - `lane(operation, key)`: a lane's view; a `None` key names the ending's own lane.
 * - `owns(activation)`: that activation owns an InFlight head, so a late turn may not exit it.
 */
export type TurnInput = {
  readonly compiled: Compiled;
  readonly state: string;
  readonly activations: ReadonlyArray<ActivationId>;
  readonly history: ReadonlyMap<string, string>;
  readonly memory: Values;
  readonly context: Values;
  readonly tag: string;
  readonly payload: Values;
  readonly late: boolean;
  readonly from: number;
  readonly now: number;
  readonly lane: (operation: string, key: Option.Option<Values>) => LaneView;
  readonly owns: (activation: ActivationId) => boolean;
  readonly step: (
    name: string,
    series: Series,
    attempt: number,
  ) => Option.Option<{
    readonly ms: number;
    // FLOW_STATE_ALLOW_UNKNOWN: an Effect Schedule step's output, whatever its type.
    readonly output: unknown;
  }>;
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

type GuardRead = {
  readonly state: string;
  readonly memory: Values;
  readonly context: Values;
  readonly event: Values;
};

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

// A ref as a send's callback returns it: its machine's Compiled and the value that names the actor.
type SentRef = {
  readonly machine: { readonly compiled: Compiled };
  // FLOW_STATE_ALLOW_UNKNOWN: a ref's value is the caller's, named by refName.
  readonly value: unknown;
};

// RETURN_TYPE: a type guard states the ref shape it narrows to.
const isRef = (
  // FLOW_STATE_ALLOW_UNKNOWN: a send's ref, as its callback returned it.
  ref: unknown,
): ref is SentRef =>
  Predicate.hasProperty(ref, "machine") &&
  Predicate.hasProperty(ref.machine, "compiled") &&
  Predicate.hasProperty(ref.machine.compiled, "events") &&
  ref.machine.compiled.events instanceof Map &&
  Predicate.hasProperty(ref, "value");

// The actor a send's ref names and the public event it sends, checked by the target's own Schemas
// as a handle's send checks it; a ref with no name or an event the target refuses fails its slot.
const sendOf = (
  // FLOW_STATE_ALLOW_UNKNOWN: the ref and event a send's callbacks returned.
  ref: unknown,
  // FLOW_STATE_ALLOW_UNKNOWN: the ref and event a send's callbacks returned.
  envelope: unknown,
  slots: { readonly to: string; readonly event: string },
) => {
  if (!isRef(ref)) return Result.fail<Failed>({ slot: slots.to });

  const compiled = ref.machine.compiled;
  const name = refName(compiled, ref.value);

  if (Result.isFailure(name)) return Result.fail({ slot: slots.to });

  const tag = Predicate.hasProperty(envelope, "_tag") ? envelope._tag : undefined;
  const entry = Predicate.isString(tag) ? compiled.events.get(tag) : undefined;

  if (entry === undefined || !entry.public || !Predicate.isString(tag))
    return Result.fail({ slot: slots.event });

  return Option.match(admitted(entry.walk, entry.names, envelope), {
    onNone: () => Result.fail({ slot: slots.event }),
    onSome: (payload) =>
      Result.succeed(
        Resolved.Send({ actor: { machine: compiled.id, name: name.success }, tag, payload }),
      ),
  });
};

const resolve = (action: Action, read: { readonly memory: Values; readonly event: Values }) =>
  Action.$match(action, {
    Send: ({ to, event }) =>
      Result.flatMap(
        call(to.slot, () => to.run(read)),
        // oxlint-disable-next-line lint-bomb/no-allocation-in-loop -- one resolved send per action: the turn's result
        (ref) =>
          Result.flatMap(
            // oxlint-disable-next-line lint-bomb/no-allocation-in-loop -- one resolved send per action: the turn's result
            call(event.slot, () => event.run(read)),
            // oxlint-disable-next-line lint-bomb/no-allocation-in-loop -- one resolved send per action: the turn's result
            (envelope) => sendOf(ref, envelope, { to: to.slot, event: event.slot }),
          ),
      ),
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

const NO_SCHEDULES: ReadonlyArray<Schedule> = [];

// FLOW_STATE_ALLOW_UNKNOWN: a turn's delay reads no rows; the map is typed as the callbacks see it.
const NO_OPERATIONS: ReadonlyMap<string, ReadonlyMap<string, unknown>> = new Map();

/**
 * The schedules a turn arms on the states active after it, outermost first: on each entered
 * state those armed on entry, and on every active state each one that lists the event, with its
 * first step from the after memory, the context and the turn's now; a delay out of range or a
 * throwing callback is its slot's failure. Keyed schedules arm by their keys, after the turn.
 */
export const armingsOf = (
  compiled: Compiled,
  leaf: string,
  entered: ReadonlySet<string>,
  tag: string,
  read: { readonly memory: Values; readonly context: Values; readonly now: number },
  step: TurnInput["step"],
) => {
  const armed: Array<Arming> = [];
  const refused: Array<string> = [];

  // A schedule the event disarms is not armed, on entry either, so its delay is never computed and
  // cannot refuse the turn; the decision stops it.
  const arms = (path: string, schedule: Schedule) =>
    Option.isNone(schedule.keys) &&
    !schedule.disarmOn.includes(tag) &&
    ((entered.has(path) && schedule.onEntry) || schedule.armOn.includes(tag));

  const input = { key: undefined, operations: NO_OPERATIONS, ...read };

  for (const path of chainOf(leaf))
    for (const schedule of compiled.states.get(path)?.schedules ?? NO_SCHEDULES)
      if (arms(path, schedule)) {
        // oxlint-disable-next-line lint-bomb/no-allocation-in-loop -- one step callback per schedule armed: the turn's result
        const first = firstStep(schedule, input, (series, attempt) =>
          step(schedule.name, series, attempt),
        );

        if (Result.isFailure(first)) refused.push(first.failure);
        // oxlint-disable-next-line lint-bomb/no-allocation-in-loop -- one arming per schedule armed: the turn's result
        else armed.push({ name: schedule.name, first: first.success });
      }

  return { armed, refused };
};

// The schedules of the states active after a turn that list its event in `disarmOn`.
const disarmedBy = (compiled: Compiled, leaf: string, tag: string) => {
  const names: Array<string> = [];

  for (const path of chainOf(leaf))
    for (const schedule of compiled.states.get(path)?.schedules ?? NO_SCHEDULES)
      if (schedule.disarmOn.includes(tag)) names.push(schedule.name);

  return names;
};

// Whether a patch changes no field: each field it names is already there with an equal value,
// the same object at once, else compared without the call stack.
const unchanged = (patch: Values, memory: Values) =>
  Object.keys(patch).every(
    (k) => Object.hasOwn(memory, k) && (patch[k] === memory[k] || sameValue(patch[k], memory[k])),
  );

// Whether the machine may write a field: declared, and not an input field.
const writableField = (compiled: Compiled, name: string) => {
  for (const field of compiled[InternalsId].fields)
    if (field.name === name) return field.source._tag !== "Input";

  return false;
};

// Whether a patch names only fields the machine may write.
const writable = (compiled: Compiled, patch: Values) => {
  for (const name of Object.keys(patch)) if (!writableField(compiled, name)) return false;

  return true;
};

// RETURN_TYPE: each branch builds one TurnResult variant; the union is the contract.
const accept = (alternative: Alternative, handler: string, input: TurnInput): TurnResult => {
  const read = {
    memory: input.memory,
    context: input.context,
    event: input.payload,
    now: input.now,
  };

  // A patch that throws or is no record is a defect; one naming a field the machine may not write
  // refuses the turn.
  const patched = Option.match(alternative.update, {
    onNone: () => Result.succeed(input.memory),
    onSome: (update) => {
      const written = recordFrom(update, read);

      if (Result.isFailure(written))
        return Result.fail(TurnResult.Refused({ code: "Defect", ...written.failure }));

      if (!writable(input.compiled, written.success))
        return Result.fail(TurnResult.Refused({ code: "InvalidTurn", slot: update.slot }));

      // oxlint-disable-next-line lint-bomb/no-allocation-in-loop -- the turn's after memory: one patch, merged once
      const after = { ...input.memory, ...written.success };

      return Result.succeed(unchanged(written.success, input.memory) ? input.memory : after);
    },
  });

  if (Result.isFailure(patched)) return patched.failure;
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

  const arm = armingsOf(
    input.compiled,
    leaf,
    entered,
    input.tag,
    { memory, context: input.context, now: input.now },
    input.step,
  );

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
    disarm: disarmedBy(input.compiled, leaf, input.tag),
  });
};

const lists = (input: TurnInput, path: string) => {
  for (const schedule of input.compiled.states.get(path)?.schedules ?? NO_SCHEDULES)
    if (schedule.armOn.includes(input.tag) || schedule.disarmOn.includes(input.tag)) return true;

  return false;
};

// The implicit "self" of the deepest state on the route whose schedule lists the event in armOn
// or disarmOn.
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

const resultOf = (
  verdict: Verdict,
  alternative: Alternative,
  handler: string,
  input: TurnInput,
  reasons: Array<string>,
) =>
  Verdict.$match(verdict, {
    Pass: () => Option.some(accept(alternative, handler, input)),
    Defect: ({ slot }) => Option.some(TurnResult.Refused({ code: "GuardDefect", slot })),
    Declined: ({ code }) => {
      reasons.push(code);

      return Option.none<TurnResult>();
    },
  });

/**
 * Runs one admitted event against a machine's handlers.
 *
 * **Details**
 *
 * The active leaf's level is tried first, then each ancestor's, then the root's; a late ending
 * starts at the owner's nearest surviving ancestor. At each level the first alternative whose
 * guards all pass wins. When no level handles the event and an active state's schedule lists it
 * in `armOn` or `disarmOn`, that state handles it with an unguarded "self". A guard, update, select or schedule
 * callback that throws, or an invalid delay, refuses the whole turn.
 */
// RETURN_TYPE: each branch builds one TurnResult variant; the union is the contract.
export const runTurn = (input: TurnInput): TurnResult => {
  const levels = levelsOf(input);

  const reasons: Array<string> = [];

  const read = {
    state: input.state,
    memory: input.memory,
    context: input.context,
    event: input.payload,
  };

  for (const level of levels)
    for (const alternative of level.alternatives) {
      const verdict = firstDecline(alternative, level.node, input, read);
      const ended = resultOf(verdict, alternative, level.node, input, reasons);

      if (Option.isSome(ended)) return ended.value;
    }

  return reasons.length > 0 ? TurnResult.Denied({ reasons }) : TurnResult.Unhandled();
};
