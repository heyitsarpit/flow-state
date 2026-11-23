// The command palette's port: one search over tickets, customers and parts. Effect-only. On Effect's `HttpClient`,
// so Stories run this adapter over `Fake.fetch` (testing/desk.fake.ts's `find` endpoint).
//
// Where the data comes from: `GET /api/workspaces/:ws/find?q=` answers the best twenty hits. The server is slow on
// short, common queries; nothing here waits for a stale one: the palette's lookup releases the older one (2.7.9).
import { Context, Effect, Layer, Schema } from "effect";
import { HttpClient, HttpClientRequest, HttpClientResponse } from "effect/http";
import { NoResponse } from "../Tickets/types.js";

export const Hit = Schema.Struct({
  kind: Schema.Literals(["ticket", "customer", "part"]),
  id: Schema.String,
  label: Schema.String,
});

export type Hit = typeof Hit.Type;

export const Hits = Schema.Array(Hit);

export class FindApi extends Context.Service<
  FindApi,
  {
    search: (
      input: { workspaceId: string; q: string },
      options: { signal: AbortSignal },
    ) => Effect.Effect<ReadonlyArray<Hit>, NoResponse>;
  }
>()("DispatchDesk/FindApi") {}

export const FindHttp = (origin: string) =>
  Layer.effect(
    FindApi,
    Effect.map(HttpClient.HttpClient, (client) =>
      FindApi.of({
        search: ({ workspaceId, q }) =>
          client
            .execute(
              HttpClientRequest.get(
                new URL(
                  `/api/workspaces/${encodeURIComponent(workspaceId)}/find?q=${encodeURIComponent(q)}`,
                  origin,
                ).toString(),
              ),
            )
            .pipe(
              Effect.mapError(() => new NoResponse()),
              Effect.flatMap((response) =>
                Effect.gen(function* () {
                  if (response.status !== 200) return yield* new NoResponse();

                  return yield* HttpClientResponse.schemaBodyJson(Hits)(response).pipe(
                    Effect.orDie,
                  );
                }),
              ),
            ),
      }),
    ),
  );
