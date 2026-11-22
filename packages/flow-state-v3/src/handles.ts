import { Option, Predicate } from "effect";
import { Action, Guard, type GuardInput, type SelectInput, type Values } from "./core/compiled.ts";
import type { ActionToken, GuardToken, Operations } from "./definition.ts";
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

export const erase = <I, R>(run: (input: never) => R) =>
  // SAFETY: a callback written for its handler's event and memory; the turn passes exactly those.
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- the definition's payload and memory types are erased in Compiled and restored by the turn
  run as (input: I) => R;

/**
 * What an action token keeps for the core: how it compiles at its place in a body.
 */
export type ActionInternals = { readonly make: (at: string) => Action };

/**
 * What a guard token keeps for the core: how it compiles at its place in a body.
 */
export type GuardInternals = { readonly make: (at: string) => Guard };

// RETURN_TYPE: the ActionToken protocol every member returns.
const member = (owner: symbol, operation: string, make: (at: string) => Action): ActionToken =>
  // SAFETY: an action token's face is its operation; its kind brand is a phantom key.
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- the kind brand is a phantom key no value holds
  made("action", owner, { operation }, { make } satisfies ActionInternals) as ActionToken;

// RETURN_TYPE: the GuardToken protocol every guard returns.
const guard = (owner: symbol, operation: string, make: (at: string) => Guard): GuardToken =>
  // SAFETY: a guard token's face is its operation; its kind brand is a phantom key.
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- the kind brand is a phantom key no value holds
  made("guard", owner, { operation }, { make } satisfies GuardInternals) as GuardToken;

const keyed =
  (kind: "Retry" | "Cancel", owner: symbol, operation: string) =>
  (key: Option.Option<(input: SelectArg<Values>) => Values>) =>
    member(owner, operation, (at) =>
      Action[kind]({
        operation,
        key: Option.map(key, (run) => ({
          slot: `${at}.key`,
          run: erase<SelectInput, Values>(run),
        })),
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
  commit: builder(`O.${operation}.commit`, (select: (input: SelectArg<Values>) => Values) =>
    member(owner, operation, (at) =>
      Action.Commit({
        operation,
        select: { slot: `${at}.select`, run: erase<SelectInput, Values>(select) },
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
          key: { slot: `${at}.key`, run: erase<SelectInput, Values>(select) },
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
              key: Option.some({ slot: `${at}.key`, run: erase<GuardInput, Values>(first) }),
              times: second.times,
            })
          : Guard.Retryable({ operation, key: Option.none(), times: first.times }),
      ),
  ),
  get: entry(`O.${operation}.get`, (operations: Operations, value: Values) =>
    Option.flatMap(Option.fromUndefinedOr(operations.get(operation)), (rows) =>
      Option.flatMap(keyText(value), (text) => Option.fromUndefinedOr(rows.get(text))),
    ),
  ),
});

export const readHandle = (operation: string, owner: symbol) => ({
  lookup: builder(`O.${operation}.lookup`, (select: (input: SelectArg<Values>) => Values) =>
    member(owner, operation, (at) =>
      Action.Lookup({
        operation,
        select: { slot: `${at}.select`, run: erase<SelectInput, Values>(select) },
      }),
    ),
  ),
  cancel: keyed("Cancel", owner, operation)(Option.none()),
});
