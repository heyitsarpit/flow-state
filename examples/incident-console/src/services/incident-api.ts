import { Cause, Context, Data, Effect, Layer, Queue, Schema, Stream } from "effect";

import {
  ApiErrorSchema,
  IncidentEventSchema,
  IncidentPageSchema,
  IncidentSchema,
  RunbookAcceptedSchema,
  RunbookSchema,
  type ApiError,
  type Incident,
  type IncidentEvent,
  type IncidentFilters,
  type IncidentPage,
  type IncidentPatch,
  type Runbook,
  type RunbookAccepted,
} from "../domain/incidents";

export class IncidentApiFailure extends Data.TaggedError("IncidentApiFailure")<{
  readonly kind: "transport" | "http" | "decode";
  readonly message: string;
  readonly status?: number;
  readonly error?: ApiError;
  readonly cause?: unknown;
}> {}

export type TimelineSignal =
  | Readonly<{ readonly type: "connected" }>
  | Readonly<{ readonly type: "reconnecting" }>
  | Readonly<{ readonly type: "event"; readonly event: IncidentEvent }>;

export interface IncidentApiShape {
  readonly list: (filters: IncidentFilters) => Effect.Effect<IncidentPage, IncidentApiFailure>;
  readonly detail: (incidentId: string) => Effect.Effect<Incident, IncidentApiFailure>;
  readonly patch: (
    incidentId: string,
    patch: IncidentPatch,
  ) => Effect.Effect<Incident, IncidentApiFailure>;
  readonly startRunbook: (incidentId: string) => Effect.Effect<RunbookAccepted, IncidentApiFailure>;
  readonly getRunbook: (runId: string) => Effect.Effect<Runbook, IncidentApiFailure>;
  readonly cancelRunbook: (runId: string) => Effect.Effect<Runbook, IncidentApiFailure>;
  readonly timeline: (
    incidentId: string,
    afterId?: string,
  ) => Stream.Stream<TimelineSignal, IncidentApiFailure>;
}

export class IncidentApi extends Context.Service<IncidentApi, IncidentApiShape>()(
  "incident-console/IncidentApi",
) {}

const transportFailure = (cause: unknown) =>
  new IncidentApiFailure({
    kind: "transport",
    message: cause instanceof Error ? cause.message : String(cause),
    cause,
  });

const decodeFailure = (message: string, cause: unknown) =>
  new IncidentApiFailure({ kind: "decode", message, cause });

const decodeResponse = <SchemaValue extends Schema.ConstraintDecoder<unknown>>(
  schema: SchemaValue,
  body: unknown,
  label: string,
) =>
  Schema.decodeUnknownEffect(schema)(body).pipe(
    Effect.mapError((cause) => decodeFailure(`Invalid ${label} response`, cause)),
  );

export const createIncidentApiLayer = (
  baseUrl = process.env.NEXT_PUBLIC_INCIDENT_API_URL ?? "http://127.0.0.1:5190",
) =>
  Layer.succeed(
    IncidentApi,
    IncidentApi.of({
      list: Effect.fn("IncidentApi.list")((filters: IncidentFilters) => {
        const search = new URLSearchParams();
        for (const [name, value] of Object.entries(filters)) {
          if (value !== undefined) search.set(name, value);
        }
        const suffix = search.size === 0 ? "" : `?${search.toString()}`;
        return request(
          `${baseUrl}/api/incidents${suffix}`,
          {},
          IncidentPageSchema,
          "incident page",
        );
      }),
      detail: Effect.fn("IncidentApi.detail")((incidentId: string) =>
        request(
          `${baseUrl}/api/incidents/${encodeURIComponent(incidentId)}`,
          {},
          IncidentSchema,
          "incident detail",
        ),
      ),
      patch: Effect.fn("IncidentApi.patch")((incidentId: string, patch: IncidentPatch) =>
        request(
          `${baseUrl}/api/incidents/${encodeURIComponent(incidentId)}`,
          {
            method: "PATCH",
            headers: { "content-type": "application/json" },
            body: JSON.stringify(patch),
          },
          IncidentSchema,
          "incident mutation",
        ),
      ),
      startRunbook: Effect.fn("IncidentApi.startRunbook")((incidentId: string) =>
        request(
          `${baseUrl}/api/incidents/${encodeURIComponent(incidentId)}/runbooks`,
          { method: "POST" },
          RunbookAcceptedSchema,
          "runbook start",
        ),
      ),
      getRunbook: Effect.fn("IncidentApi.getRunbook")((runId: string) =>
        request(
          `${baseUrl}/api/runbooks/${encodeURIComponent(runId)}`,
          {},
          RunbookSchema,
          "runbook",
        ),
      ),
      cancelRunbook: Effect.fn("IncidentApi.cancelRunbook")((runId: string) =>
        request(
          `${baseUrl}/api/runbooks/${encodeURIComponent(runId)}`,
          { method: "DELETE" },
          RunbookSchema,
          "runbook cancellation",
        ),
      ),
      timeline: (incidentId, afterId) => {
        const url = new URL(`${baseUrl}/api/incidents/${encodeURIComponent(incidentId)}/events`);
        if (afterId !== undefined) url.searchParams.set("after", afterId);
        return timeline(url.toString());
      },
    }),
  );

const request = <SchemaValue extends Schema.ConstraintDecoder<unknown>>(
  url: string,
  init: RequestInit,
  schema: SchemaValue,
  label: string,
): Effect.Effect<SchemaValue["Type"], IncidentApiFailure> =>
  Effect.gen(function* () {
    const response = yield* Effect.tryPromise({
      try: (signal) => fetch(url, { ...init, signal }),
      catch: transportFailure,
    });
    const body = yield* Effect.tryPromise({
      try: () => response.json() as Promise<unknown>,
      catch: (cause) => decodeFailure(`Invalid JSON from ${label}`, cause),
    });
    if (!response.ok) {
      const error = yield* decodeResponse(ApiErrorSchema, body, "API error");
      return yield* new IncidentApiFailure({
        kind: "http",
        status: response.status,
        message: error.message,
        error,
      });
    }
    return yield* decodeResponse(schema, body, label);
  });

const timeline = (url: string): Stream.Stream<TimelineSignal, IncidentApiFailure> =>
  Stream.callback<TimelineSignal, IncidentApiFailure>((queue) =>
    Effect.gen(function* () {
      const source = new EventSource(url);
      source.onopen = () => {
        Queue.offerUnsafe(queue, { type: "connected" });
      };
      source.onerror = () => {
        Queue.offerUnsafe(queue, { type: "reconnecting" });
      };
      source.addEventListener("incident", (message) => {
        try {
          const event = Schema.decodeUnknownSync(IncidentEventSchema)(JSON.parse(message.data));
          Queue.offerUnsafe(queue, { type: "event", event });
        } catch (cause) {
          Queue.failCauseUnsafe(queue, Cause.fail(decodeFailure("Invalid timeline event", cause)));
        }
      });
      yield* Effect.addFinalizer(() => Effect.sync(() => source.close()));
    }),
  );
