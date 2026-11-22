import { Effect, Option, Predicate, Result, Schema } from "effect";
import { InternalsId } from "./core/compiled.ts";
import { defect } from "./core/defect.ts";
import { refuseWrite, writesOf } from "./core/frozen.ts";
import { type Finding, invalid } from "./error.ts";

/**
 * The brand of a value Flow made, on the one shared prototype every such value has: a registered
 * symbol, so a second loaded copy of Flow reads the first copy's values as made, and a spread or
 * a JSON round trip, which drop the prototype, reads as a copy.
 */
export const MadeTypeId: unique symbol = Symbol.for("flow-state/Made");

/**
 * A made value's kind, as its type states it: a phantom key no value holds at run time.
 */
export declare const KindOf: unique symbol;

/**
 * Every kind of value Flow makes.
 */
export type Kind =
  | "definition"
  | "machine"
  | "app"
  | "ref"
  | "contract"
  | "bound"
  | "state"
  | "history"
  | "event"
  | "mapping"
  | "action"
  | "guard"
  | "send"
  | "change"
  | "initial"
  | "input"
  | "private"
  | "uncertain"
  | "entry"
  | "context"
  | "memory"
  | "stateName";

/**
 * A type's kind of made value, as a phantom key: what tells one kind from another in the types.
 */
export type Branded<K extends Kind> = { readonly [KindOf]: K };

/**
 * What Flow keeps of a made value under the internals key: its kind, the owner whose tokens it
 * belongs to (a definition's, a contract's, or its own), and what the core calls.
 */
export type Card<I> = { readonly kind: Kind; readonly owner: symbol; readonly internals: I };

// A value a face holds.
// FLOW_STATE_ALLOW_UNKNOWN: whatever a face holds, sealed or read as it is.
type Held = unknown;

/**
 * An object or a function Flow makes or meets: a made value's identity, prototype and fields are
 * what this module reads, whatever its own type.
 */
// oxlint-disable-next-line lint-bomb/no-object-type -- a made value is any object or function; each value's own type names its fields
export type Container = object;

// A container whose own fields are read before they are trusted.
type Readable = Container & Readonly<Record<PropertyKey, Held>>;

const brand = { [MadeTypeId]: { value: MadeTypeId } };

// A container given a prototype, keeping its own type.
const withPrototype = <A extends Container>(value: A, proto: Container) => {
  Object.setPrototypeOf(value, proto);

  return value;
};

// The prototype every made object shares, and the one every made function shares, which is a
// function itself so a made function keeps its methods. Both carry the brand and are frozen.
// oxlint-disable-next-line lint-bomb/no-object-freeze -- the shared prototype is the brand a copy cannot carry; frozen so no value changes it
const madeObject = Object.freeze(Object.defineProperties({}, brand));

// oxlint-disable-next-line lint-bomb/no-object-freeze -- as above, for callable values
const madeFunction = Object.freeze(Object.defineProperties(() => undefined, brand));

// RETURN_TYPE: a type guard states the container it narrows to.
const isContainer = (value: Held): value is Readable =>
  Predicate.isObjectOrArray(value) || Predicate.isFunction(value);

// The prototype a frozen Map, Set or Date of a face takes: its own kind's, with every method that
// would change it throwing, so the value holds no function of its own and still refuses a write.
const sealedOf = (proto: Container, sample: Held) =>
  // oxlint-disable-next-line lint-bomb/no-object-freeze -- a sealed prototype refuses every write of the values that take it
  Object.freeze(
    withPrototype(
      Object.defineProperties(
        {},
        Object.fromEntries(writesOf(sample).map((name) => [name, { value: refuseWrite(name) }])),
      ),
      proto,
    ),
  );

const SEALED: ReadonlyArray<readonly [Container, Container]> = [
  [Map.prototype, sealedOf(Map.prototype, new Map())],
  [Set.prototype, sealedOf(Set.prototype, new Set())],
  // oxlint-disable-next-line flow-state/no-clock -- a sample Date names the methods a Date changes by; no time is read
  [Date.prototype, sealedOf(Date.prototype, new Date(0))],
];

// Freezes one container of a face: a Map, a Set or a Date first takes the sealed prototype of its
// kind.
const sealOne = (value: Container) => {
  const sealed = SEALED.find(([proto]) => Object.getPrototypeOf(value) === proto);

  if (sealed !== undefined && Object.isExtensible(value)) withPrototype(value, sealed[1]);

  // oxlint-disable-next-line lint-bomb/no-object-freeze -- a made value's face is immutable data by contract
  Object.freeze(value);
};

// What one container of a face holds, once it is frozen; nothing for Effect's own values and for
// a made value other than the root, which froze itself.
// RETURN_TYPE: every branch is a list of what the container holds.
const heldBy = (root: Container, at: Readable): ReadonlyArray<Held> => {
  if (Schema.isSchema(at) || Effect.isEffect(at) || (at !== root && MadeTypeId in at)) return [];

  const entries: Array<Held> = [];

  if (at instanceof Map) entries.push(...at.keys(), ...at.values());

  if (at instanceof Set) entries.push(...at);

  sealOne(at);

  return [
    ...entries,
    ...Reflect.ownKeys(at).flatMap((key) => (key === InternalsId ? [] : [at[key]])),
  ];
};

// Freezes a made value's face deeply: every object, array and function reachable through its own
// data properties and through what its Maps and Sets hold, the internals key excepted. Schemas and Effects are Effect's own values, and a
// made value it meets froze itself when it was made.
const seal = (root: Container) => {
  const stack: Array<Held> = [root];
  const done = new Set<Container>();

  for (let at = stack.pop(); at !== undefined || stack.length > 0; at = stack.pop())
    if (isContainer(at) && !done.has(at)) {
      done.add(at);
      // A value whose read throws is left as it is: the door that reads it refuses it.
      const held = Result.try(() => heldBy(root, at));

      if (Result.isSuccess(held)) stack.push(...held.success);
    }
};

const describe = <A extends Container, I>(value: A, kind: Kind, owner: symbol, internals: I) => {
  Object.defineProperty(value, InternalsId, {
    // oxlint-disable-next-line lint-bomb/no-object-freeze -- the card is read by every door and changed by none
    value: Object.freeze({ kind, owner, internals } satisfies Card<I>),
  });
  seal(value);

  return value;
};

/**
 * The one constructor of a value Flow hands out: its face, copied onto the shared prototype and
 * frozen deeply, with its kind, owner and internals under the internals key, off the face.
 *
 * **When to use**
 *
 * For every object Flow hands out: a definition, machine, app, ref, contract, bound contract or
 * token. A face holds data and doors only; what the core calls goes in `internals`.
 */
export const made = <A extends Container, I>(kind: Kind, owner: symbol, face: A, internals: I) =>
  describe(
    withPrototype(
      Object.defineProperties({ ...face }, Object.getOwnPropertyDescriptors(face)),
      madeObject,
    ),
    kind,
    owner,
    internals,
  );

/**
 * `made` for a callable value: the door `call`, given the shared function prototype, with the
 * face's fields beside it.
 */
// FLOW_STATE_ALLOW_UNKNOWN: a door of any signature.
export const madeCallable = <
  F extends (...args: ReadonlyArray<never>) => unknown,
  A extends WeakKey,
  I,
>(
  kind: Kind,
  owner: symbol,
  call: F,
  face: A,
  internals: I,
) => {
  Object.defineProperties(
    withPrototype(call, madeFunction),
    Object.getOwnPropertyDescriptors(face),
  );

  // SAFETY: the door now carries the face's fields, as F & A states.
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- a function given fields has no static type of both until it is named
  return describe(call, kind, owner, internals) as F & A;
};

// The card a branded value holds, read before it is trusted.
const cardOf = (value: Readable) =>
  Object.hasOwn(value, InternalsId) ? value[InternalsId] : undefined;

// RETURN_TYPE: a type guard states the card it narrows to.
const isCard = (card: Held): card is Card<Held> =>
  Predicate.hasProperty(card, "kind") &&
  Predicate.hasProperty(card, "owner") &&
  Predicate.hasProperty(card, "internals");

const defectAt = (path: ReadonlyArray<string | number>) =>
  ({
    code: "Defect",
    path,
    summary: `${path.join(".")} failed when it was read`,
    help: "Pass the value Flow made; this one throws when it is read.",
  }) satisfies Finding;

/**
 * How a door reads a value it was given: as a made value of one kind and, when the door names
 * one, of one owner; a copy, another kind or a value with no internals is `WrongKind`, another
 * owner's token `ForeignToken`, and a value whose read throws one `Defect` at its path.
 *
 * **When to use**
 *
 * At every door, on each argument that must be a value Flow made.
 */
export const madeOf =
  <I>(kind: Kind, owner: Option.Option<symbol> = Option.none()) =>
  // RETURN_TYPE: the value's card, or the one finding that refuses it.
  (value: Held, path: ReadonlyArray<string | number>): Result.Result<Card<I>, Finding> => {
    const read = Result.try(() =>
      isContainer(value) && MadeTypeId in value ? cardOf(value) : undefined,
    );

    if (Result.isFailure(read)) return Result.fail(defectAt(path));

    const card = read.success;

    if (!isCard(card) || card.kind !== kind)
      return Result.fail(
        invalid(path, "WrongKind", `${path.join(".")} is not a ${kind}`, helpOf(kind)),
      );

    if (Option.exists(owner, (own) => card.owner !== own))
      return Result.fail(
        invalid(
          path,
          "ForeignToken",
          `${path.join(".")} is not this definition's`,
          "Use the tokens the machine body receives: S, E and O of this definition.",
        ),
      );

    // SAFETY: a card of this kind was made with this kind's internals.
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- a card's internals type is fixed by its kind, which was checked
    return Result.succeed(card as Card<I>);
  };

/**
 * Whether a value is a made value of one kind, by the same read as `madeOf`; a value whose read
 * throws is not.
 */
export const isMade = (kind: Kind) => (value: Held) => Result.isSuccess(madeOf(kind)(value, []));

/**
 * The internals of a value a door already read as made: for code past the door.
 */
export const internalsOf = <I>(kind: Kind, value: Container) =>
  Result.getOrElse(madeOf<I>(kind)(value, []), (finding) => defect(finding.summary)).internals;

/**
 * The owner of a value a door already read as made.
 */
export const ownerOf = (kind: Kind, value: Container) =>
  Result.getOrElse(madeOf(kind)(value, []), (finding) => defect(finding.summary)).owner;

const HELP: Partial<Record<Kind, string>> = {
  definition: "Pass the value definition({ ... }) returned.",
  machine: "Pass the value machine(definition, body) returned.",
  app: "Pass the value app({ id, machines }) returned.",
  ref: "Pass the value actorRef(machine, value) returned.",
  state: "Use the S tokens the machine body receives.",
  event: "Use the E tokens the machine body receives.",
};

const helpOf = (kind: Kind) => HELP[kind] ?? "Pass the value Flow made, not a copy of it.";
