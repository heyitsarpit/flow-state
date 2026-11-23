import { Effect, Layer } from "effect";
import { DocsApi } from "../services.ts";
import { Docs } from "./docs.ts";

/**
 * The documents port over the documents server, each save carrying its idempotency key; a lost
 * answer is the port's NoResponse.
 */
export const DocsFake = Layer.effect(
  DocsApi,
  Effect.map(Docs, (docs) =>
    DocsApi.of({
      document: docs.document,
      outline: docs.outline,
      save: (input, { idempotencyKey }) => docs.save({ ...input, key: idempotencyKey }),
    }),
  ),
);
