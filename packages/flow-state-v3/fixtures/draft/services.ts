import { Context, type Effect, Schema } from "effect";

/**
 * No answer came back from the documents service.
 */
export class NoResponse extends Schema.TaggedError<NoResponse>()("NoResponse", {}) {}

/**
 * Someone saved the document since the revision this save was based on.
 */
export class Conflict extends Schema.TaggedError<Conflict>()("Conflict", {
  revision: Schema.Number,
}) {}

/**
 * A document as the server sends it.
 */
export const Doc = Schema.Struct({
  title: Schema.String,
  body: Schema.String,
  revision: Schema.Number,
});

/**
 * A document's outline: its headings, in order.
 */
export const Outline = Schema.Struct({ headings: Schema.Array(Schema.String) });

/**
 * The documents service: a document by id, its outline, and a save of its body on a revision, each save
 * carrying its idempotency key.
 */
export class DocsApi extends Context.Service<
  DocsApi,
  {
    readonly document: (input: {
      readonly id: string;
    }) => Effect.Effect<typeof Doc.Type, NoResponse>;
    readonly outline: (input: {
      readonly id: string;
    }) => Effect.Effect<typeof Outline.Type, NoResponse>;
    readonly save: (
      input: { readonly id: string; readonly body: string; readonly revision: number },
      options: { readonly idempotencyKey: string },
    ) => Effect.Effect<{ readonly revision: number }, Conflict | NoResponse>;
  }
>()("flow-state-v3/fixtures/draft/DocsApi") {}
