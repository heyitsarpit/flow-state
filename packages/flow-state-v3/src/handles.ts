import { Option, Predicate, Result, Schema } from "effect";
import { Action, Guard, type GuardInput, type SelectInput, type Values } from "./core/compiled.ts";
import type { ActionToken, GuardToken, Operations } from "./definition.ts";

type SelectArg<M> = { readonly memory: M; readonly event: never };

type GuardArg<M, P> = { readonly state: string; readonly memory: M; readonly event: P };

export const erase = <I, R>(run: (input: never) => R) =>
  // SAFETY: a callback written for its handler's event and memory; the turn passes exactly those.
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- the definition's payload and memory types are erased in Compiled and restored by the turn
  run as (input: I) => R;

// RETURN_TYPE: the ActionToken protocol every member returns.
const member = (operation: string, make: (at: string) => Action): ActionToken => ({
  "~flow": "action",
  operation,
  make,
});

const keyed =
  (kind: "Retry" | "Cancel", operation: string) =>
  (key: Option.Option<(input: SelectArg<Values>) => Values>) =>
    member(operation, (at) =>
      Action[kind]({
        operation,
        key: Option.map(key, (run) => ({
          slot: `${at}.key`,
          run: erase<SelectInput, Values>(run),
        })),
      }),
    );

const keylessOrKeyed = (kind: "Retry" | "Cancel", operation: string) => {
  const of = keyed(kind, operation);

  return Object.assign(
    (key: (input: SelectArg<Values>) => Values) => of(Option.some(key)),
    of(Option.none()),
  );
};

export const writeHandle = (operation: string, key: Schema.Codec<Values, string>) => ({
  commit: (select: (input: SelectArg<Values>) => Values) =>
    member(operation, (at) =>
      Action.Commit({ operation, select: { slot: `${at}.select`, run: erase(select) } }),
    ),
  retry: keylessOrKeyed("Retry", operation),
  cancel: keylessOrKeyed("Cancel", operation),
  // RETURN_TYPE: the GuardToken protocol every guard returns.
  idle: (select: (input: GuardArg<Values, never>) => Values): GuardToken => ({
    "~flow": "guard",
    operation,
    make: (at) => Guard.Idle({ operation, key: { slot: `${at}.key`, run: erase(select) } }),
  }),
  // RETURN_TYPE: the GuardToken protocol every guard returns.
  retryable: (
    first: ((input: GuardArg<Values, never>) => Values) | { readonly times: number },
    second: { readonly times: number } = { times: 0 },
  ): GuardToken => ({
    "~flow": "guard",
    operation,
    make: (at) =>
      Predicate.isFunction(first)
        ? Guard.Retryable({
            operation,
            key: Option.some({ slot: `${at}.key`, run: erase<GuardInput, Values>(first) }),
            times: second.times,
          })
        : Guard.Retryable({ operation, key: Option.none(), times: first.times }),
  }),
  get: (operations: Operations, value: Values) =>
    Option.flatMap(Option.fromUndefinedOr(operations.get(operation)), (rows) =>
      Option.flatMap(Result.getSuccess(Schema.encodeResult(key)(value)), (text) =>
        Option.fromUndefinedOr(rows.get(text)),
      ),
    ),
});

export const readHandle = (operation: string) => ({
  lookup: (select: (input: SelectArg<Values>) => Values) =>
    member(operation, (at) =>
      Action.Lookup({ operation, select: { slot: `${at}.select`, run: erase(select) } }),
    ),
  cancel: keyed("Cancel", operation)(Option.none()),
});
