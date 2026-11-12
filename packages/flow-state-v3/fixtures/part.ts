import { Context, Effect, Schema } from "effect";
import { type Attempt, type Machine, Outcome } from "../src/index.ts";

/**
 * What one user does at a leaf: send an event with one of its payloads (`burst` times back to
 * back), or end a use, dispose or forget the actor. Each carries the feature codes it exercises,
 * its weight in a draw and the time the user thinks before it.
 */
export type UserAction =
  | {
      readonly kind: "send";
      readonly name: string;
      readonly codes: ReadonlyArray<string>;
      readonly weight: number;
      readonly thinkMs: number;
      readonly event: string;
      readonly payloads: ReadonlyArray<Schema.Json>;
      readonly burst: number;
    }
  | {
      readonly kind: "release" | "dispose" | "forget";
      readonly name: string;
      readonly codes: ReadonlyArray<string>;
      readonly weight: number;
      readonly thinkMs: number;
    };

/**
 * A healthy server answer: a value, or a tagged failure with its fields.
 */
export type ServerAnswer =
  | { readonly _tag: "ok"; readonly value: Schema.Json }
  | { readonly _tag: "fail"; readonly tag: string; readonly fields: Schema.JsonObject };

/**
 * What the server answers one operation, by weight, and which failures its commit turns into a
 * success (`classify`), which `Compiled` does not carry.
 */
export type ServerModel = {
  readonly answers: ReadonlyArray<{ readonly weight: number; readonly answer: ServerAnswer }>;
  readonly classify: (tag: string, fields: Schema.JsonObject, mayHaveApplied: boolean) => boolean;
};

/**
 * One composite part as data: a machine in the public API, the users who drive it and the server
 * that answers it (Conformance R15).
 *
 * **Details**
 *
 * - `user` gives each leaf state's weighted next actions; `server` each operation's answers.
 * - A part names no faults: lost answers, reloads and refusals are the suite's profiles.
 * - Its reference (events, states, handlers, rows) is derived from `machine.compiled`, never
 *   written here.
 */
export type Part = {
  readonly name: string;
  readonly sketch: string;
  readonly composite: string;
  readonly machine: Machine;
  readonly actors: ReadonlyArray<string>;
  readonly user: Readonly<Record<string, ReadonlyArray<UserAction>>>;
  readonly server: Readonly<Record<string, ServerModel>>;
};

/**
 * Declares a part, checked against {@link Part}: a field a part does not name, such as a
 * hand-written row, fails to type-check.
 */
// RETURN_TYPE: the part as written, not the intersection that checks its fields.
export const part = <const S extends Part>(
  declared: S & Readonly<Record<Exclude<keyof S, keyof Part>, never>>,
): S => declared;

/**
 * A server failure as a part's contracts see it: its tag and fields, as a fetch client's tagged
 * error carries them.
 */
export type ServerFailure = { readonly _tag: string } & Schema.JsonObject;

/**
 * The server every part's contracts call, by operation: the suite backs it with its fake network,
 * a real app with its API. A write sends its Attempt's id as the idempotency key; a read sends
 * none.
 */
export class Server extends Context.Service<
  Server,
  {
    readonly call: (
      operation: string,
      body: Schema.JsonObject,
      idempotencyKey: string,
    ) => Effect.Effect<Schema.Json, ServerFailure>;
  }
>()("flow-state-v3/fixtures/Server") {}

const LOST: ReadonlySet<string> = new Set(["NoResponse", "ServerError"]);

const bodyOf = Schema.decodeUnknownEffect(Schema.Record(Schema.String, Schema.Json));

const fieldsOf = ({ _tag, ...fields }: ServerFailure) => fields;

/**
 * The tags a server model fails with.
 */
export type FailTag<M extends ServerModel> = Extract<
  M["answers"][number]["answer"],
  { readonly _tag: "fail" }
>["tag"];

/**
 * A write's commit over {@link Server}: a lost answer is unknown, a failure the server model's
 * `classify` accepts is a success with the failure's fields, any other failure is a failure typed
 * by the model's tags, and a tag the model never answers is a defect.
 *
 * **When to use**
 *
 * Every part's transaction commits with it, so its server model's `classify` is the one its commit
 * runs and the suite's reference reads.
 */
export const served = <const M extends ServerModel>(operation: string, model: M) => {
  const tags: ReadonlySet<string> = new Set(
    model.answers.flatMap(({ answer }) => (answer._tag === "fail" ? [answer.tag] : [])),
  );

  // RETURN_TYPE: a type guard, so a server failure's tag narrows to the model's.
  const answered = (tag: string): tag is FailTag<M> => tags.has(tag);

  type Failed = Effect.Error<
    ReturnType<typeof Outcome.failure<{ readonly _tag: FailTag<M> } & Schema.JsonObject>>
  >;

  type Unknown = Effect.Error<ReturnType<typeof Outcome.unknown<ServerFailure>>>;

  // RETURN_TYPE: every branch's ending in one Effect type, which `catch` would infer from the first.
  const ended = (
    failure: ServerFailure,
    attempt: Attempt,
  ): Effect.Effect<Schema.Json, Failed | Unknown> => {
    const tag = failure._tag;

    if (LOST.has(tag)) return Outcome.unknown(failure);

    if (model.classify(tag, fieldsOf(failure), attempt.mayHaveApplied))
      return Outcome.success<Schema.Json>(fieldsOf(failure));

    if (answered(tag)) return Outcome.failure({ ...fieldsOf(failure), _tag: tag });

    return Effect.die(`${operation}: the server failed with ${tag}, which its model never answers`);
  };

  return (input: object, { attempt }: { readonly attempt: Attempt }) =>
    Effect.flatMap(Effect.orDie(bodyOf(input)), (body) =>
      Effect.flatMap(Effect.service(Server), (server) => server.call(operation, body, attempt.id)),
    ).pipe(Effect.catch((failure) => ended(failure, attempt)));
};

/**
 * A read's lookup over {@link Server}, with no idempotency key.
 */
export const lookedUp = (operation: string) => (input: object) =>
  Effect.flatMap(Effect.orDie(bodyOf(input)), (body) =>
    Effect.flatMap(Effect.service(Server), (server) => server.call(operation, body, "")),
  );

/**
 * A string field of a server value or failure, empty when it holds none.
 */
export const textOf = (value: Schema.Json, name: string) => {
  const field = Schema.is(Schema.Record(Schema.String, Schema.Json))(value) ? value[name] : null;

  return Schema.is(Schema.String)(field) ? field : "";
};

/**
 * A number field of a server value or failure, `fallback` when it holds none.
 */
export const numberOf = (value: Schema.Json, name: string, fallback: number) => {
  const field = Schema.is(Schema.Record(Schema.String, Schema.Json))(value) ? value[name] : null;

  return Schema.is(Schema.Number)(field) ? field : fallback;
};
