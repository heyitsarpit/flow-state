import { Effect, Option, Predicate, Result } from "effect";
import { FlowError, flowErrorOf, raise } from "./error.ts";

/**
 * What a value Flow hands out is to a caller: an `entry` that refuses only with a FlowError (an
 * `effect` entry fails with one), an inert `builder`, or `inert` data no caller runs.
 */
export type Kind = "entry" | "effect" | "builder" | "inert";

/**
 * A registered public function: its kind, the name its refusals carry, and how many arguments it
 * declares.
 */
export type Registered = {
  readonly kind: Kind;
  readonly name: string;
  readonly arity: number;
};

const registry = new WeakMap<WeakKey, Registered>();

// FLOW_STATE_ALLOW_UNKNOWN: whatever a public function's body threw.
const refusalOf = (name: string, cause: unknown) =>
  cause instanceof FlowError
    ? cause
    : flowErrorOf(
        [
          {
            code: "Defect",
            path: [name],
            summary: `${name} failed on a value no check refused`,
            help: "Pass the values this call's type names; the cause on this error is what failed.",
          },
        ],
        cause,
      );

// FLOW_STATE_ALLOW_UNKNOWN: a public function of any signature.
type Callable = (...args: ReadonlyArray<never>) => unknown;

const registered = <F extends Callable>(wrapped: Callable, kind: Kind, name: string, run: F) => {
  registry.set(wrapped, { kind, name, arity: run.length });

  // SAFETY: the wrapper takes the same arguments and returns what run returns, or refuses.
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- a wrapper keeps its function's own signature, generics and overloads included
  return wrapped as F;
};

/**
 * A public function that refuses only with a FlowError: a FlowError its body throws passes
 * through, and anything else it throws is a `Defect` at `name`, with what it threw as the cause.
 *
 * **When to use**
 *
 * Around every synchronous public function Flow exports or hands out that reads its arguments.
 */
// RETURN_TYPE: the wrapped function keeps its own signature.
export const entry = <F extends Callable>(name: string, run: F): F =>
  registered(
    // FLOW_STATE_ALLOW_UNKNOWN: a call's arguments, passed on as given.
    (...args: ReadonlyArray<never>) =>
      Result.getOrElse(
        Result.try({ try: () => run(...args), catch: (cause) => refusalOf(name, cause) }),
        raise,
      ),
    "entry",
    name,
    run,
  );

/**
 * A public function that returns an Effect: whatever its body throws becomes the Effect's failure,
 * a FlowError as `entry` makes it.
 *
 * **When to use**
 *
 * Around every public function whose refusal is an Effect failure, such as `ready` and `dispose`.
 */
// RETURN_TYPE: the wrapped function keeps its own signature.
export const entryEffect = <
  F extends (...args: ReadonlyArray<never>) => Effect.Effect<unknown, FlowError>,
>(
  name: string,
  run: F,
): F =>
  registered(
    // FLOW_STATE_ALLOW_UNKNOWN: a call's arguments, passed on as given.
    (...args: ReadonlyArray<never>) =>
      Result.match(
        Result.try({ try: () => run(...args), catch: (cause) => refusalOf(name, cause) }),
        { onSuccess: (effect) => effect, onFailure: (error) => Effect.fail(error) },
      ),
    "effect",
    name,
    run,
  );

/**
 * Marks Flow's own value as inert data: no caller runs anything it holds.
 */
// RETURN_TYPE: the value as given, so a builder returns it in place.
export const inert = <A extends WeakKey>(value: A): A => {
  registry.set(value, { kind: "inert", name: "", arity: 0 });

  return value;
};

/**
 * A public function that stores its arguments and reads none, so it never throws; what it makes
 * is inert data.
 *
 * **When to use**
 *
 * Around a function that only captures what it is given, such as `deny`, `E.X.from` or
 * `Flow.initial`; a value it captured is read by the construction that receives it.
 */
// RETURN_TYPE: the wrapped function keeps its own signature.
export const builder = <F extends Callable>(name: string, run: F): F =>
  registered(
    // FLOW_STATE_ALLOW_UNKNOWN: a call's arguments, passed on as given.
    (...args: ReadonlyArray<never>) => {
      const made = run(...args);

      return Predicate.isObjectOrArray(made) || Predicate.isFunction(made) ? inert(made) : made;
    },
    "builder",
    name,
    run,
  );

/**
 * How Flow registered a value it hands out, if it did.
 */
// FLOW_STATE_ALLOW_UNKNOWN: any value a walk of Flow's surface meets.
export const registrationOf = (value: unknown) =>
  Predicate.isObjectOrArray(value) || Predicate.isFunction(value)
    ? Option.fromUndefinedOr(registry.get(value))
    : Option.none<Registered>();
