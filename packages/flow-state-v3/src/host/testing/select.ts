import { Option } from "effect";
import type { Evidence, EvidenceOf } from "../../core/evidence.ts";
import type { ErasedEnding } from "../../contract.ts";
import type { AnyDefinition, ActorRef, LeavesOf, MemoryOf } from "../../definition.ts";
import { definitionOfToken } from "../../events.ts";
import { actorIdOf } from "../runtime.ts";
import { scriptFault } from "./steps.ts";

/**
 * What the selectors read: a run's evidence, in order.
 */
export type Recorded<Ds extends AnyDefinition = AnyDefinition> = {
  // A phantom method: the app's definitions, so a selector takes only their tokens and refs.
  "~app"?(app: Ds): void;
  readonly evidence: ReadonlyArray<Evidence>;
};

/**
 * An evidence record that names an event: a turn, a delivery, an event nothing handled, a denial
 * or a send whose target was absent.
 */
export type EventRecord = Extract<Evidence, { readonly event: string }>;

/**
 * A Published record of one definition's actor, its state and memory typed by the definition.
 */
export type PublishedOf<D extends AnyDefinition> = Omit<
  EvidenceOf<"Published">,
  "state" | "memory"
> & {
  readonly state: LeavesOf<D["states"]>;
  readonly memory: MemoryOf<D["memory"]>;
};

type TokenOf<D extends AnyDefinition> = D["E"][keyof D["E"]];

// Any definition's event token, whatever its payload: what a name string is not.
type AnyToken = ErasedEnding & { readonly tag: string };

/**
 * A selector of the evidence records one event of one definition names, by its token; with
 * `{ actor }`, of that actor only, whose definition the token must then be one of.
 */
export type Selector<R> = {
  <Ds extends AnyDefinition>(run: Recorded<Ds>, token: AppToken<Ds>): ReadonlyArray<R>;
  <Ds extends AnyDefinition, D extends Ds>(
    run: Recorded<Ds>,
    token: NoInfer<TokenOf<D>>,
    options: { readonly actor: ActorRef<D> },
  ): ReadonlyArray<R>;
};

// A token of one of a run's app's definitions; any token when the run's app is erased.
type AppToken<Ds extends AnyDefinition> = AnyDefinition extends Ds
  ? AnyToken
  : Ds extends AnyDefinition
    ? TokenOf<Ds>
    : never;

// RETURN_TYPE: a type guard narrows a record to the kinds that name an event.
const isEventRecord = (e: Evidence): e is EventRecord => NAMES_EVENT[e._tag];

// The kinds of record that name an event: exactly those with an `event` field.
const NAMES_EVENT = {
  Turn: true,
  Minted: false,
  Sent: false,
  Ended: false,
  Delivered: true,
  Parked: false,
  Unparked: false,
  Recorded: false,
  Unhandled: true,
  SendTargetAbsent: true,
  Denied: true,
  Lane: false,
  Issue: false,
  Incarnated: false,
  Finished: false,
  RuntimeDisposed: false,
  Published: false,
  Reported: false,
  HoldForgotten: false,
  SlowWork: false,
} as const satisfies {
  readonly [K in Evidence["_tag"]]: K extends EventRecord["_tag"] ? true : false;
};

// RETURN_TYPE: a type guard narrows a record to a turn.
const isTurn = (e: Evidence): e is EvidenceOf<"Turn"> => e._tag === "Turn";

// RETURN_TYPE: the Selector contract, overloaded by whether an actor is named.
const selector =
  <R extends EventRecord>(kept: (e: Evidence) => e is R): Selector<R> =>
  (
    run: Recorded,
    token: { readonly tag: string },
    // oxlint-disable-next-line lint-bomb/no-optional-domain-properties, lint-bomb/no-nullish-function-contracts -- the Plan's public word: an omitted actor matches every actor of the definition
    options?: { readonly actor?: ActorRef },
  ) => {
    const machine = Option.getOrElse(definitionOfToken(token), () =>
      scriptFault(`${String(token.tag)} is not an event token a definition made`),
    );

    const actor = Option.map(Option.fromUndefinedOr(options?.actor), actorIdOf);

    return run.evidence
      .filter(kept)
      .filter(
        (e) =>
          e.event === token.tag &&
          e.actor.machine === machine &&
          Option.match(actor, { onNone: () => true, onSome: (id) => id.name === e.actor.name }),
      );
  };

/**
 * Every evidence record that names one event of one definition, in order: its turns, deliveries,
 * unhandled arrivals, denials and dropped sends.
 *
 * **When to use**
 *
 * To assert on what happened to an event in a run, selected by its token so a renamed or
 * misspelt event fails to compile instead of selecting nothing. Narrow the result by `_tag`.
 * `{ actor }` keeps one actor's records; its token must then be one of that actor's definition.
 *
 * **Details**
 *
 * A record matches when its event is the token's and its actor is of the token's definition, so
 * a same-named event of another machine never matches.
 *
 * ```ts
 * const unheard = evidenceOf(run, Stepper.E.WheelDue).filter((e) => e._tag === "Unhandled")
 * ```
 */
export const evidenceOf = selector(isEventRecord);

/**
 * Every turn one event of one definition ran, in order.
 *
 * **When to use**
 *
 * To assert which turns an event ran, selected by its token so a renamed or misspelt event fails
 * to compile instead of selecting nothing. `{ actor }` keeps one actor's turns; its token must then
 * be one of that actor's definition.
 *
 * **Details**
 *
 * A turn matches when its event is the token's and its actor is of the token's definition, so a
 * same-named event of another machine never matches.
 *
 * ```ts
 * expect(turnsOf(run, Accounts.E.Unsure).map((t) => t.actor.name)).toEqual(["acct-1", "acct-2"])
 * ```
 */
export const turnsOf = selector(isTurn);

/**
 * Every snapshot one actor published in a run, in order, its state and memory typed by its
 * definition.
 *
 * **When to use**
 *
 * To assert on each memory an actor published between two steps, which a checkpoint, a single
 * cut, cannot show.
 */
export const publishedOf = <D extends Ds, Ds extends AnyDefinition = AnyDefinition>(
  run: Recorded<Ds>,
  ref: ActorRef<D>,
) => {
  const id = actorIdOf(ref);

  return run.evidence.filter(
    // SAFETY: a Published record of this actor holds a leaf of its definition and the memory it declares, each field its decoded value.
    // RETURN_TYPE: a type guard types the actor's records by its definition.
    (e): e is PublishedOf<D> =>
      e._tag === "Published" && e.actor.machine === id.machine && e.actor.name === id.name,
  );
};
