import { Option, Predicate } from "effect";
import {
  Action,
  Guard,
  type GuardInput,
  type PlaceholderInput,
  type PlaceInput,
  type Placement,
  type ReadWrite,
  type SelectInput,
  type Slot,
  type Values,
} from "./core/compiled.ts";
import type { ActionToken, GuardToken, Operations } from "./definition.ts";
import { isWriteRow } from "./core/rows.ts";
import { builder, entry } from "./entry.ts";
import { made, madeCallable } from "./made.ts";

/**
 * What a member's select or key callback reads: the memory, and its handler's event.
 */
export type SelectArg<M, P = unknown> = { readonly memory: M; readonly event: P };

/**
 * What a send's callbacks read: the turn's memory after its update, and its event.
 */
export type SendArg<M, P> = { readonly memory: M; readonly event: P };

/**
 * What a guard's callback reads: the leaf it runs in, of the definition's leaves `L`, the memory,
 * the event and the context `Cx`, the slots' values as the turn read them.
 */
export type GuardArg<M, P, L extends string = string, Cx = Values> = {
  readonly state: L;
  readonly memory: M;
  readonly event: P;
  readonly context: Cx;
};

/**
 * The one crossing of a typed callback into the erased core: the callback an author wrote, as the
 * Slot Compiled holds at its place `name`.
 *
 * **When to use**
 *
 * For every closure a body, a contract or a context slot hands the core: a select, a guard, a
 * memory update, a schedule's callback, a reaction's when, a commit or a lookup.
 *
 * **Gotchas**
 *
 * - `F` is the erased signature the core calls it with; what justifies it is that the public types
 *   wrote the callback for its place, and the core builds its input with Compiled's own codecs for
 *   that place.
 */
// FLOW_STATE_ALLOW_UNKNOWN: an author's callback, of any signature its place types.
// RETURN_TYPE: the Slot of the erased signature the core calls it with.
export const slot = <F extends (...args: ReadonlyArray<never>) => unknown>(
  name: string,
  // FLOW_STATE_ALLOW_UNKNOWN: an author's callback, of any signature its place types.
  run: (...args: ReadonlyArray<never>) => unknown,
): Slot<F> => ({
  slot: name,
  // SAFETY: a callback written for its place's input; the core passes exactly that input.
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- the definition's payload and memory types are erased in Compiled and restored by the core
  run: run as F,
});

/**
 * What an action token keeps for the core: how it compiles at its place in a body.
 */
export type ActionInternals = { readonly make: (at: string) => Action };

/**
 * What a guard token keeps for the core: how it compiles at its place in a body.
 */
export type GuardInternals = { readonly make: (at: string) => Guard };

/**
 * What an activity token keeps for the core: how it compiles at its place in a state.
 */
export type ActivityInternals = { readonly make: (at: string) => Placement };

// RETURN_TYPE: the ActionToken protocol every member returns.
const member = (owner: symbol, operation: string, make: (at: string) => Action): ActionToken =>
  made("action", owner, { operation }, { make } satisfies ActionInternals);

// RETURN_TYPE: the GuardToken protocol every guard returns.
const guard = (owner: symbol, operation: string, make: (at: string) => Guard): GuardToken =>
  made("guard", owner, { operation }, { make } satisfies GuardInternals);

const keyed =
  (kind: "Retry" | "Cancel", owner: symbol, operation: string) =>
  (key: Option.Option<(input: SelectArg<Values>) => Values>) =>
    member(owner, operation, (at) =>
      Action[kind]({
        operation,
        key: Option.map(key, (run) => slot<(input: SelectInput) => Values>(`${at}.key`, run)),
      }),
    );

// A keyless member that is also the builder of its keyed form: one action token, callable.
const keylessOrKeyed = (kind: "Retry" | "Cancel", owner: symbol, operation: string) => {
  const of = keyed(kind, owner, operation);

  return madeCallable(
    "action",
    owner,
    builder(
      `O.${operation}.${kind === "Retry" ? "retry" : "cancel"}`,
      (key: (input: SelectArg<Values>) => Values) => of(Option.some(key)),
    ),
    { operation },
    {
      make: () => Action[kind]({ operation, key: Option.none() }),
    } satisfies ActionInternals,
  );
};

export const writeHandle = (
  operation: string,
  keyText: (value: Values) => Option.Option<string>,
  owner: symbol,
) => ({
  commit: builder(
    `O.${operation}.commit`,
    (
      select: (input: SelectArg<Values>) => Values,
      options: {
        // oxlint-disable-next-line lint-bomb/no-optional-domain-properties -- the Plan's public word: `optimistic` is the commit's one option, and an omitted one applies nothing
        readonly optimistic?: (input: SelectArg<Values>) => ReadonlyArray<ReadWrite>;
      } = {},
    ) =>
      member(owner, operation, (at) =>
        Action.Commit({
          operation,
          select: slot<(input: SelectInput) => Values>(`${at}.select`, select),
          optimistic: Option.map(Option.fromUndefinedOr(options.optimistic), (optimistic) =>
            slot<(input: SelectInput) => ReadonlyArray<ReadWrite>>(`${at}.optimistic`, optimistic),
          ),
        }),
      ),
  ),
  retry: keylessOrKeyed("Retry", owner, operation),
  cancel: keylessOrKeyed("Cancel", owner, operation),
  idle: builder(
    `O.${operation}.idle`,
    // RETURN_TYPE: the GuardToken protocol every guard returns.
    (select: (input: GuardArg<Values, never>) => Values): GuardToken =>
      guard(owner, operation, (at) =>
        Guard.Idle({
          operation,
          key: slot<(input: GuardInput) => Values>(`${at}.key`, select),
        }),
      ),
  ),
  retryable: builder(
    `O.${operation}.retryable`,
    // RETURN_TYPE: the GuardToken protocol every guard returns.
    (
      first: ((input: GuardArg<Values, never>) => Values) | { readonly times: number },
      second: { readonly times: number } = { times: 0 },
    ): GuardToken =>
      guard(owner, operation, (at) =>
        Predicate.isFunction(first)
          ? Guard.Retryable({
              operation,
              key: Option.some(slot<(input: GuardInput) => Values>(`${at}.key`, first)),
              times: second.times,
            })
          : Guard.Retryable({ operation, key: Option.none(), times: first.times }),
      ),
  ),
  get: entry(`O.${operation}.get`, (operations: Operations, value: Values) =>
    Option.flatMap(Option.fromUndefinedOr(operations.get(operation)), (rows) =>
      Option.flatMap(keyText(value), (text) =>
        Option.filter(Option.fromUndefinedOr(rows.get(text)), isWriteRow),
      ),
    ),
  ),
});

// A member that names the entries of its read's contract by a partial key.
const partialKeyed = (kind: "Invalidate" | "Clear", owner: symbol, operation: string) =>
  builder(
    `O.${operation}.${kind === "Invalidate" ? "invalidate" : "clear"}`,
    (key: (input: SelectArg<Values>) => Values) =>
      member(owner, operation, (at) =>
        Action[kind]({ operation, key: slot<(input: SelectInput) => Values>(`${at}.key`, key) }),
      ),
  );

export const readHandle = (operation: string, owner: symbol) => ({
  lookup: builder(`O.${operation}.lookup`, (select: (input: SelectArg<Values>) => Values) =>
    member(owner, operation, (at) =>
      Action.Lookup({
        operation,
        select: slot<(input: SelectInput) => Values>(`${at}.select`, select),
      }),
    ),
  ),
  cancel: keyed("Cancel", owner, operation)(Option.none()),
  subscribe: builder(
    `O.${operation}.subscribe`,
    (
      select: (input: PlaceInput) => Values,
      options: {
        // oxlint-disable-next-line lint-bomb/no-optional-domain-properties -- the Plan's public word: a placement without a placeholder shows nothing while a new key has no data
        readonly placeholder?: (input: PlaceholderInput) => unknown;
      } = {},
    ) =>
      made("activity", owner, { operation }, {
        make: (at) => ({
          operation,
          select: slot<(input: PlaceInput) => Values>(`${at}.select`, select),
          placeholder: Option.map(Option.fromUndefinedOr(options.placeholder), (placeholder) =>
            slot<(input: PlaceholderInput) => unknown>(`${at}.placeholder`, placeholder),
          ),
        }),
      } satisfies ActivityInternals),
  ),
  refetch: member(owner, operation, () => Action.Refetch({ operation })),
  invalidate: partialKeyed("Invalidate", owner, operation),
  clear: partialKeyed("Clear", owner, operation),
});
