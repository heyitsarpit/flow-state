// @effect-diagnostics unstableApiUsage:off -- the production adapter's port is Effect's HttpClient, as the app's real Layer would be
import { Effect, Layer } from "effect";
import { FetchHttpClient, HttpClient, HttpClientRequest, HttpIncomingMessage } from "effect/http";
import { NoAnswer, Renamed, Teams, WorkspaceApi, WorkspaceProfile } from "../services.ts";

/**
 * The workspace over HTTP: the production Layer of `WorkspaceApi`. A lost or broken answer is
 * `NoAnswer`.
 */
export const WorkspaceHttp = (origin: string) =>
  Layer.effect(
    WorkspaceApi,
    Effect.map(HttpClient.HttpClient, (http) => {
      const client = HttpClient.mapRequest(http, HttpClientRequest.prependUrl(origin));
      const lost = () => Effect.fail(new NoAnswer());

      return WorkspaceApi.of({
        profile: ({ user }) =>
          HttpClientRequest.get(`/users/${encodeURIComponent(user)}`).pipe(
            client.execute,
            Effect.flatMap((r) => HttpIncomingMessage.schemaBodyJson(WorkspaceProfile)(r)),
            Effect.catchTags({ HttpClientError: lost, SchemaError: lost }),
          ),
        teams: ({ org }) =>
          HttpClientRequest.get(`/orgs/${encodeURIComponent(org)}/teams`).pipe(
            client.execute,
            Effect.flatMap((r) => HttpIncomingMessage.schemaBodyJson(Teams)(r)),
            Effect.catchTags({ HttpClientError: lost, SchemaError: lost }),
          ),
        rename: ({ org, team, name }, { idempotencyKey }) =>
          HttpClientRequest.put(
            `/orgs/${encodeURIComponent(org)}/teams/${encodeURIComponent(team)}`,
          ).pipe(
            HttpClientRequest.setHeader("Idempotency-Key", idempotencyKey),
            HttpClientRequest.bodyJsonUnsafe({ name }),
            client.execute,
            Effect.flatMap((r) => HttpIncomingMessage.schemaBodyJson(Renamed)(r)),
            Effect.catchTags({ HttpClientError: lost, SchemaError: lost }),
          ),
      });
    }),
  );

/**
 * `WorkspaceHttp` over the browser's fetch: what the app's setup provides.
 */
export const WorkspaceLive = (origin: string) =>
  WorkspaceHttp(origin).pipe(Layer.provide(FetchHttpClient.layer));
