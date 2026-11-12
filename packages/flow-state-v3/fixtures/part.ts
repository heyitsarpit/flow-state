import { Context, type Effect, type Schema } from "effect";
import type { Machine } from "../src/index.ts";

/**
 * What one user does at a leaf: send an event with one of its payloads, or end a use, dispose or
 * forget the actor. Each carries the feature codes it exercises, its weight in a draw and the time
 * the user thinks before it.
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
    }
  | {
      readonly kind: "release" | "dispose" | "forget" | "ensure";
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
 * A server failure as a part's contracts see it: its tag and fields.
 */
export type ServerFailure = { readonly _tag: string; readonly fields: Schema.JsonObject };

/**
 * The server every part's contracts call, by operation: the suite backs it with its fake network,
 * a real app with its API.
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
