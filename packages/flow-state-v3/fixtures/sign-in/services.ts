import { Context, type Effect } from "effect";

/**
 * The handle is taken by someone else.
 */
export type Taken = { readonly _tag: "Taken"; readonly handle: string };

/**
 * The profile service did not answer.
 */
export type Unanswered = { readonly _tag: "Unanswered" };

/**
 * The profile service: where a signed-in account's handle is saved and read.
 */
export class ProfileApi extends Context.Service<
  ProfileApi,
  {
    readonly setUsername: (
      input: { readonly email: string; readonly handle: string },
      options: { readonly idempotencyKey: string },
    ) => Effect.Effect<{ readonly handle: string }, Taken | Unanswered>;
    readonly me: (input: {
      readonly email: string;
    }) => Effect.Effect<{ readonly handle: string }, Unanswered>;
  }
>()("flow-state-v3/fixtures/sign-in/ProfileApi") {}
