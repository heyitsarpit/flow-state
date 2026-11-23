import { Data, Option, Predicate, Result } from "effect";
import { admitted } from "./boundary.ts";
import { refName } from "./identity.ts";
import type { ActorId } from "./world.ts";
import {
  InternalsId,
  Action,
  type Alternative,
  type Compiled,
  Guard,
  type Values,
} from "./compiled.ts";
import type { Step } from "./schedule-plan.ts";
import type { readsOf } from "./reads.ts";
import { sameValue } from "./same.ts";
import { atOrBelow, type Move, moveOf } from "./tree.ts";
import type { TurnInput } from "./walk.ts";
import { compiledOption } from "../compiled-of.ts";

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
  Commit: { operation: string; input: Values; optimistic: Option.Option<Values> };
  Retry: { operation: string; key: Option.Option<Values> };
  Cancel: { operation: string; key: Option.Option<Values> };
  Lookup: { operation: string; input: Values };
  Refetch: { operation: string };
  Invalidate: { operation: string; key: Values };
  Clear: { operation: string; key: Values };
  Send: { actor: ActorId; tag: string; payload: Values };
}>;

/**
 * Constructors and matchers for {@link Resolved}.
 */
export const Resolved = Data.taggedEnum<Resolved>();

/**
 * A schedule a turn arms at its end: its name and its first step, read from the memory after the
 * turn (none when its Effect Schedule is complete before a first step), or the slot whose delay
 * refused it.
 */
export type Arming = {
  readonly name: string;
  readonly first: Result.Result<Option.Option<Step>, string>;
};

type Failed = { readonly slot: string };

/**
 * One guard's outcome: it passes, it declines with a code, or its callback is defective.
 */
export type Verdict = Data.TaggedEnum<{
  Pass: {};
  Declined: { code: string };
  Defect: { slot: string };
}>;

/**
 * Constructors and matchers for {@link Verdict}.
 */
export const Verdict = Data.taggedEnum<Verdict>();

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

// A commit with no optimistic option resolves none.
const NO_OPTIMISTIC = Result.succeed(Option.none<Values>());

const noOptimistic = () => NO_OPTIMISTIC;

/**
 * A select or key callback's record; anything else is a defect of that callback (the types forbid
 * it, so only untyped code reaches this).
 */
export const recordFrom = <I>(
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

type GuardRead = ReturnType<typeof readsOf<"Guard">>;

export const moveFor = (alternative: Alternative, handler: string, input: TurnInput) =>
  Option.map(alternative.target, (target) =>
    moveOf(input.compiled, input.state, handler, target, input.history),
  );

// A late turn may not exit a state whose activation owns work in flight.
const strands = (move: Move, input: TurnInput) => {
  const kept = input.activations.length - move.exits.length;

  return input.activations.slice(Math.max(kept, 0)).some(input.owns);
};

// RETURN_TYPE: the Verdict every guard returns; the first that is not a pass decides.
export const firstDecline = (
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

// A send's ref as the turn reads it: the Compiled of its machine, which Flow made, and its value.
const sentRefOf = (
  // FLOW_STATE_ALLOW_UNKNOWN: a send's ref, as its callback returned it.
  ref: unknown,
) =>
  Predicate.hasProperty(ref, "machine") && Predicate.hasProperty(ref, "value")
    ? // oxlint-disable-next-line lint-bomb/no-allocation-in-loop -- one ref per send, read once
      Option.map(compiledOption(ref.machine), (compiled) => ({ compiled, value: ref.value }))
    : Option.none();

// The actor a send's ref names and the public event it sends, checked by the target's own Schemas
// as a handle's send checks it; a ref with no name or an event the target refuses fails its slot.
const sendOf = (
  // FLOW_STATE_ALLOW_UNKNOWN: the ref and event a send's callbacks returned.
  ref: unknown,
  // FLOW_STATE_ALLOW_UNKNOWN: the ref and event a send's callbacks returned.
  envelope: unknown,
  slots: { readonly to: string; readonly event: string },
) => {
  const sent = sentRefOf(ref);

  if (Option.isNone(sent)) return Result.fail<Failed>({ slot: slots.to });

  const { compiled, value } = sent.value;
  const name = refName(compiled, value);

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

export const resolve = (
  action: Action,
  read: { readonly memory: Values; readonly event: Values },
) =>
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
    Commit: ({ operation, select, optimistic }) =>
      Result.flatMap(recordFrom(select, read), (input) =>
        Result.map(
          // oxlint-disable-next-line lint-bomb/no-allocation-in-loop -- one resolved member per action: the turn's result
          Option.match(optimistic, {
            onNone: noOptimistic,
            // oxlint-disable-next-line lint-bomb/no-allocation-in-loop -- one resolved member per action: the turn's result
            onSome: (slot) => Result.map(recordFrom(slot, read), Option.some),
          }),
          // oxlint-disable-next-line lint-bomb/no-allocation-in-loop -- one resolved member per action: the turn's result
          (values) => Resolved.Commit({ operation, input, optimistic: values }),
        ),
      ),
    Lookup: ({ operation, select }) =>
      Result.map(
        recordFrom(select, read),
        // oxlint-disable-next-line lint-bomb/no-allocation-in-loop -- one resolved member per action: the turn's result
        (input) => Resolved.Lookup({ operation, input }),
      ),
    Refetch: ({ operation }) => Result.succeed(Resolved.Refetch({ operation })),
    Invalidate: ({ operation, key }) =>
      Result.map(
        recordFrom(key, read),
        // oxlint-disable-next-line lint-bomb/no-allocation-in-loop -- one resolved member per action: the turn's result
        (k) => Resolved.Invalidate({ operation, key: k }),
      ),
    Clear: ({ operation, key }) =>
      Result.map(
        recordFrom(key, read),
        // oxlint-disable-next-line lint-bomb/no-allocation-in-loop -- one resolved member per action: the turn's result
        (k) => Resolved.Clear({ operation, key: k }),
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

// Whether a patch changes no field: each field it names is already there with an equal value,
// the same object at once, else compared without the call stack.
export const unchanged = (patch: Values, memory: Values) =>
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
export const writable = (compiled: Compiled, patch: Values) => {
  for (const name of Object.keys(patch)) if (!writableField(compiled, name)) return false;

  return true;
};

// The walk's one accumulator: the parts so far, the changer's site and the memory after every
// patch, until a part refuses the turn; the first refusal stands.
