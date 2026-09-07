import { Cause, Context, Data, Effect, Layer, Match, Option, Queue, Schema, Stream } from "effect";

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

export class TransportFailure extends Data.TaggedError("TransportFailure")<{
  readonly message: string;
  readonly cause: unknown;
}> {}

export class HttpFailure extends Data.TaggedError("HttpFailure")<{
  readonly message: string;
  readonly status: number;
  readonly error: ApiError;
}> {}

export class DecodeFailure extends Data.TaggedError("DecodeFailure")<{
  readonly message: string;
  readonly cause: unknown;
}> {}

export type IncidentApiFailure = TransportFailure | HttpFailure | DecodeFailure;

export const failureMessage = Match.type<IncidentApiFailure>().pipe(
  Match.tagsExhaustive({
    TransportFailure: ({ message }) => message,
    HttpFailure: ({ message }) => message,
    DecodeFailure: ({ message }) => message,
  }),
);

export const conflictFrom = Match.type<IncidentApiFailure>().pipe(
  Match.tag("HttpFailure", ({ status, error }) =>
    status === 409 ? Option.fromNullishOr(error.current) : Option.none(),
  ),
  Match.orElse(() => Option.none()),
);

export const isNotFound = Match.type<IncidentApiFailure>().pipe(
  Match.tag("HttpFailure", ({ status }) => status === 404),
  Match.orElse(() => false),
);

export const isNotFoundFailure = (value: unknown): boolean =>
  value instanceof HttpFailure && value.status === 404;

export const isRetryable = (failure: IncidentApiFailure): boolean => {
  switch (failure._tag) {
    case "HttpFailure":
      return failure.status === 503;
    case "TransportFailure":
      return true;
    case "DecodeFailure":
      return false;
  }
};

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
  new TransportFailure({
    message: cause instanceof Error ? cause.message : String(cause),
    cause,
  });

const decodeFailure = (message: string, cause: unknown) => new DecodeFailure({ message, cause });

const decodeResponse = <SchemaValue extends Schema.ConstraintDecoder<unknown>>(
  schema: SchemaValue,
  body: unknown,
  label: string,
) =>
  Schema.decodeUnknownEffect(schema)(body).pipe(
    Effect.mapError((cause) => decodeFailure(`Invalid ${label} response`, cause)),
  );

export const makeIncidentApi = ({
  baseUrl,
}: Readonly<{ readonly baseUrl: URL }>): IncidentApiShape => {
  const origin = baseUrl.toString().replace(/\/$/, "");
  return IncidentApi.of({
    list: Effect.fn("IncidentApi.list")((filters: IncidentFilters) => {
      const search = new URLSearchParams();
      for (const [name, value] of Object.entries(filters)) {
        if (value !== undefined) search.set(name, value);
      }
      const suffix = search.size === 0 ? "" : `?${search.toString()}`;
      return request(`${origin}/api/incidents${suffix}`, {}, IncidentPageSchema, "incident page");
    }),
    detail: Effect.fn("IncidentApi.detail")((incidentId: string) =>
      request(
        `${origin}/api/incidents/${encodeURIComponent(incidentId)}`,
        {},
        IncidentSchema,
        "incident detail",
      ),
    ),
    patch: Effect.fn("IncidentApi.patch")((incidentId: string, patch: IncidentPatch) =>
      request(
        `${origin}/api/incidents/${encodeURIComponent(incidentId)}`,
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
        `${origin}/api/incidents/${encodeURIComponent(incidentId)}/runbooks`,
        { method: "POST" },
        RunbookAcceptedSchema,
        "runbook start",
      ),
    ),
    getRunbook: Effect.fn("IncidentApi.getRunbook")((runId: string) =>
      request(`${origin}/api/runbooks/${encodeURIComponent(runId)}`, {}, RunbookSchema, "runbook"),
    ),
    cancelRunbook: Effect.fn("IncidentApi.cancelRunbook")((runId: string) =>
      request(
        `${origin}/api/runbooks/${encodeURIComponent(runId)}`,
        { method: "DELETE" },
        RunbookSchema,
        "runbook cancellation",
      ),
    ),
    timeline: (incidentId, afterId) => {
      const url = new URL(`${origin}/api/incidents/${encodeURIComponent(incidentId)}/events`);
      if (afterId !== undefined) url.searchParams.set("after", afterId);
      return timeline(url.toString());
    },
  });
};

export const createIncidentApiLayer = (baseUrl: URL) =>
  Layer.succeed(IncidentApi, makeIncidentApi({ baseUrl }));

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
      return yield* new HttpFailure({
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

