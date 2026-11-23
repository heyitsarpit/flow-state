import { Context, type Effect, Schema } from "effect";

/**
 * No answer came back from the search service.
 */
export class NoResponse extends Schema.TaggedError<NoResponse>()("NoResponse", {}) {}

/**
 * A query as the search service takes it: trimmed text with at least one character.
 */
export const Query = Schema.String.check(Schema.isNonEmpty(), Schema.isTrimmed());

/**
 * The search service: suggestions for what is typed, a page of results, and the searches a
 * shopper saved, a save carrying its idempotency key.
 */
export class SearchApi extends Context.Service<
  SearchApi,
  {
    readonly suggest: (input: {
      readonly q: string;
    }) => Effect.Effect<{ readonly suggestions: ReadonlyArray<string> }, NoResponse>;
    readonly results: (input: {
      readonly q: string;
      readonly page: number;
    }) => Effect.Effect<
      { readonly rows: ReadonlyArray<string>; readonly total: number },
      NoResponse
    >;
    readonly saved: (input: {
      readonly shopper: string;
    }) => Effect.Effect<{ readonly searches: ReadonlyArray<string> }, NoResponse>;
    readonly save: (
      input: { readonly shopper: string; readonly q: string },
      options: { readonly idempotencyKey: string },
    ) => Effect.Effect<{ readonly searches: ReadonlyArray<string> }, NoResponse>;
  }
>()("flow-state-v3/fixtures/search/SearchApi") {}
