// Illustrative HTTP adapter: every port over `fetch`, `XMLHttpRequest` (upload progress), a
// `WebSocket` and a streamed body. This is where the real APIs enter Flow's world (machine-design
// 2.7.2): a rejected `fetch` becomes `NoResponse`, a status becomes a tagged failure or `ServerError`,
// a close code becomes `SocketDropped` or `SignedOut`. Nothing here decides what is definite and
// what is unknown; the contracts' commits do. Browser requests use same-origin cookies; server
// requests supply the authenticated token. Tokens never enter actor memory, dehydrated payloads or
// a URL, so the sockets (opened in the browser only) rely on the cookie.
//
// Pending merge 6: the socket, presence and assistant ports (M6 4.1, 4.2, 4.4).
import { Cause, Effect, Layer, Queue, Schema, Stream } from "effect";
import {
  AttachmentsApi,
  PendingFilesLive,
  StoredAttachment,
  TooLarge,
} from "../features/Attachments/attachments-api.js";
import {
  CommentRejected,
  CommentRow,
  CommentsApi,
  CommentThread,
} from "../features/Comments/comments-api.js";
import { AssistantApi, Refused, SuggestFrame } from "../features/Assistant/assistant-api.js";
import { PresenceApi, PresenceFrame } from "../features/Presence/presence-api.js";
import { closedWith, DeskSocket, decodeFrame } from "../features/Tickets/feed/desk-socket.js";
import { TicketApi } from "../features/Tickets/ticket-api.js";
import {
  ActivityPage,
  AlreadyAssigned,
  NoResponse,
  QueueUnavailable,
  ServerError,
  SignedOut,
  SocketDropped,
  TicketLocked,
  TicketNotFound,
  TicketPage,
  TicketRow,
  TitleRejected,
  type Cursor,
  type TicketKey,
} from "../features/Tickets/types.js";

export const HttpDeskApi = (token?: string, origin = "http://localhost:3000") => {
  // `fetch`, with the lifetime signal of this call joined to the caller's. A rejection (offline,
  // reset, aborted) is `NoResponse`: no browser API says whether the request reached the server.
  const request = (
    path: string,
    options: {
      signal: AbortSignal;
      body?: object;
      idempotencyKey?: string;
    },
  ) =>
    Effect.tryPromise({
      try: (lifetime) => {
        const headers = new Headers();

        if (token !== undefined) headers.set("Authorization", `Bearer ${token}`);

        if (options.body !== undefined) headers.set("Content-Type", "application/json");

        if (options.idempotencyKey !== undefined)
          headers.set("Idempotency-Key", options.idempotencyKey);

        const init: RequestInit = {
          method: options.body === undefined ? "GET" : "POST",
          headers,
          credentials: "same-origin",
          cache: "no-store",
          signal: AbortSignal.any([options.signal, lifetime]),
        };

        // `exactOptionalPropertyTypes`: set `body` only when there is one, never to `undefined`.
        if (options.body !== undefined) init.body = JSON.stringify(options.body);

        return fetch(new URL(path, origin), init);
      },
      catch: () => new NoResponse(),
    });

  const json = (response: Response) =>
    Effect.tryPromise({
      try: () => response.json() as Promise<unknown>,
      catch: (cause) => new Error("Invalid desk JSON", { cause }),
    }).pipe(Effect.orDie);

  const decoded = <S extends Schema.Constraint>(schema: S, response: Response) =>
    json(response).pipe(Effect.flatMap(Schema.decodeUnknownEffect(schema)), Effect.orDie);

  // A status nobody planned for is a defect, not a failure.
  const unexpected = (response: Response) =>
    Effect.die(new Error(`Unexpected desk HTTP status ${String(response.status)}`));

  // Success body, or 5xx as `ServerError`, or a defect.
  const body = <S extends Schema.Constraint>(schema: S, response: Response) => {
    if (response.ok) return decoded(schema, response);

    if (response.status >= 500) return Effect.fail(new ServerError({ status: response.status }));

    return unexpected(response);
  };

  const ticketPath = (key: TicketKey) =>
    `/api/workspaces/${encodeURIComponent(key.workspaceId)}/tickets/${encodeURIComponent(key.ticketId)}`;

  const missing = (key: TicketKey) => Effect.fail(new TicketNotFound({ ticketId: key.ticketId }));

  const tickets = TicketApi.of({
    load: (key, { signal }) =>
      Effect.gen(function* () {
        const response = yield* request(ticketPath(key), { signal }).pipe(Effect.orDie);

        if (response.status === 404) return yield* missing(key);

        return yield* decoded(TicketRow, response);
      }),
    list: (input, { signal }) =>
      Effect.gen(function* () {
        const query = new URLSearchParams();

        for (const [name, value] of Object.entries(input)) {
          // Optional filters may be explicitly undefined at runtime (queue listInput).
          // oxlint-disable-next-line typescript/no-unnecessary-condition -- Object.entries loses optional-value information.
          if (value !== undefined) query.set(name, String(value));
        }

        const response = yield* request(`/api/tickets?${query}`, { signal }).pipe(
          Effect.mapError(() => new QueueUnavailable({ retryAfter: 5 })),
        );

        if (response.status === 503)
          return yield* Effect.fail(new QueueUnavailable({ retryAfter: 5 }));

        if (!response.ok) return yield* unexpected(response);

        return yield* decoded(TicketPage, response);
      }),
    openCount: ({ workspaceId }, { signal }) =>
      Effect.gen(function* () {
        const response = yield* request(
          `/api/workspaces/${encodeURIComponent(workspaceId)}/open-count`,
          { signal },
        ).pipe(Effect.orDie);

        if (!response.ok) return yield* unexpected(response);

        return yield* decoded(Schema.Number, response);
      }),
    saveTitle: ({ title, ...key }, { idempotencyKey, signal }) =>
      Effect.gen(function* () {
        const response = yield* request(`${ticketPath(key)}/title`, {
          signal,
          idempotencyKey,
          body: { title },
        });

        if (response.status === 404) return yield* missing(key);

        if (response.status === 409)
          return yield* Effect.fail(
            new TicketLocked(yield* decoded(Schema.Struct({ lockedBy: Schema.String }), response)),
          );

        if (response.status === 422)
          return yield* Effect.fail(
            new TitleRejected(yield* decoded(Schema.Struct({ reason: Schema.String }), response)),
          );

        return yield* body(TicketRow, response);
      }),
    assign: ({ assignee, ...key }, { idempotencyKey, signal }) =>
      Effect.gen(function* () {
        const response = yield* request(`${ticketPath(key)}/assignee`, {
          signal,
          idempotencyKey,
          body: { assignee },
        });

        if (response.status === 404) return yield* missing(key);

        if (response.status === 409)
          return yield* Effect.fail(
            new AlreadyAssigned(
              yield* decoded(Schema.Struct({ assignee: Schema.String }), response),
            ),
          );

        return yield* body(TicketRow, response);
      }),
    // A catch-up page. Any answer but a page is "no response" here: the feed retries it with the
    // socket still open (M6 4.1), so a 5xx and a dropped request look the same.
    eventsSince: ({ workspaceId, after }, { signal }) =>
      Effect.gen(function* () {
        const query = new URLSearchParams({
          epoch: String(after.epoch),
          seq: String(after.seq),
        });

        const response = yield* request(
          `/api/workspaces/${encodeURIComponent(workspaceId)}/activity?${query}`,
          { signal },
        );

        if (!response.ok) return yield* Effect.fail(new NoResponse());

        return yield* decoded(ActivityPage, response);
      }),
  });

  const comments = CommentsApi.of({
    list: (key, { signal }) =>
      Effect.gen(function* () {
        const response = yield* request(`${ticketPath(key)}/comments`, { signal }).pipe(
          Effect.orDie,
        );

        if (response.status === 404) return yield* missing(key);

        return yield* decoded(CommentThread, response);
      }),
    post: ({ clientId, text, ...key }, { idempotencyKey, signal }) =>
      Effect.gen(function* () {
        const response = yield* request(`${ticketPath(key)}/comments`, {
          signal,
          idempotencyKey,
          body: { clientId, text },
        });

        if (response.status === 404) return yield* missing(key);

        if (response.status === 422)
          return yield* Effect.fail(
            new CommentRejected(yield* decoded(Schema.Struct({ reason: Schema.String }), response)),
          );

        return yield* body(CommentRow, response);
      }),
  });

  // `fetch` reports no upload progress, so uploads use XMLHttpRequest (M6 4.5). The callback always
  // resumes: success, an HTTP answer, a network error, a timeout or an abort. `signal` is the one
  // Effect gives the callback; interrupting the fiber aborts the request.
  const attachments = AttachmentsApi.of({
    put: (ref, bytes, { idempotencyKey, onProgress }) =>
      Effect.callback<StoredAttachment, TooLarge | NoResponse | ServerError>((resume, signal) => {
        const xhr = new XMLHttpRequest();
        xhr.upload.onprogress = (event) => {
          if (event.lengthComputable) onProgress({ sent: event.loaded, total: event.total });
        };
        xhr.onload = () => {
          if (xhr.status === 201)
            return resume(
              Schema.decodeUnknownEffect(StoredAttachment)(JSON.parse(xhr.responseText)).pipe(
                Effect.orDie,
              ),
            );

          if (xhr.status === 413)
            return resume(
              Effect.fail(new TooLarge({ limit: Number(xhr.getResponseHeader("X-Max-Bytes")) })),
            );

          if (xhr.status >= 500)
            return resume(Effect.fail(new ServerError({ status: xhr.status })));

          return resume(Effect.die(new Error(`Unexpected upload status ${String(xhr.status)}`)));
        };
        xhr.onerror = xhr.ontimeout = xhr.onabort = () => resume(Effect.fail(new NoResponse()));
        signal.addEventListener("abort", () => xhr.abort(), { once: true });
        xhr.open("PUT", new URL(`/api/uploads/${encodeURIComponent(ref)}`, origin));

        if (token !== undefined) xhr.setRequestHeader("Authorization", `Bearer ${token}`);

        xhr.setRequestHeader("Idempotency-Key", idempotencyKey);
        xhr.send(bytes);
      }),
  });

  // The socket as a Stream of text frames. The Scope owns the WebSocket: ending or interrupting the
  // stream closes it. A close fails the stream with the adapter's classification; the browser's
  // `error` event carries nothing and is always followed by a close.
  const socketText = (path: string, params: Record<string, string>) =>
    Stream.callback<string, SocketDropped | SignedOut>((queue) =>
      Effect.acquireRelease(
        Effect.sync(() => {
          const url = new URL(path, origin);
          url.protocol = url.protocol === "https:" ? "wss:" : "ws:";

          for (const [name, value] of Object.entries(params)) url.searchParams.set(name, value);

          const socket = new WebSocket(url);
          // This protocol is text frames only.
          socket.onmessage = (event) => {
            Queue.offerUnsafe(queue, String(event.data));
          };
          socket.onclose = (event) => {
            Queue.failCauseUnsafe(queue, Cause.fail(closedWith(event.code)));
          };

          return socket;
        }),
        (socket) => Effect.sync(() => socket.close()),
      ),
    ).pipe(
      // An idle deadline on every frame; the server pings every 20 s (M6 4.1).
      Stream.timeoutOrElse({
        duration: "45 seconds",
        orElse: () => Stream.fail(new SocketDropped({ why: "Silent" })),
      }),
    );

  const socket = DeskSocket.of({
    frames: (workspaceId, from: Cursor | undefined) =>
      socketText(
        `/api/workspaces/${encodeURIComponent(workspaceId)}/socket`,
        from === undefined ? {} : { epoch: String(from.epoch), seq: String(from.seq) },
      ).pipe(
        Stream.mapEffect(decodeFrame),
        // Registration comes first: a server that only pings must not hold the row in "Connecting".
        Stream.zipWithIndex,
        Stream.mapEffect(([frame, index]) =>
          index === 0 && frame.t !== "hello" && frame.t !== "reset"
            ? Effect.fail(new SocketDropped({ why: "NoHello" }))
            : Effect.succeed(frame),
        ),
      ),
  });

  const presence = PresenceApi.of({
    frames: (key) =>
      socketText(`${ticketPath(key)}/presence`, {}).pipe(
        Stream.mapEffect((text) =>
          Schema.decodeUnknownEffect(Schema.fromJsonString(PresenceFrame))(text).pipe(
            Effect.mapError(() => new SocketDropped({ why: "BadFrame" })),
          ),
        ),
      ),
  });

  // The body is NDJSON, one frame per line. Back-pressure comes from pulling the ReadableStream.
  // An unreadable line is a broken body, the same as a dropped connection.
  const assistant = AssistantApi.of({
    suggest: (input, { idempotencyKey, signal }) =>
      Stream.unwrap(
        Effect.gen(function* () {
          const response = yield* request("/api/assistant/suggest", {
            signal,
            idempotencyKey,
            body: input,
          });

          if (response.status >= 500)
            return yield* Effect.fail(new ServerError({ status: response.status }));

          if (!response.ok) return yield* Effect.fail(new Refused({ status: response.status }));

          const stream = response.body;

          if (stream === null) return yield* Effect.fail(new NoResponse());

          return Stream.fromReadableStream({
            evaluate: () => stream,
            onError: () => new NoResponse(),
          }).pipe(
            Stream.decodeText(),
            Stream.splitLines,
            Stream.filter((line) => line !== ""),
            Stream.mapEffect((line) =>
              Schema.decodeUnknownEffect(Schema.fromJsonString(SuggestFrame))(line).pipe(
                Effect.mapError(() => new NoResponse()),
              ),
            ),
          );
        }),
      ),
  });

  return Layer.mergeAll(
    Layer.succeed(TicketApi, tickets),
    Layer.succeed(CommentsApi, comments),
    Layer.succeed(AttachmentsApi, attachments),
    Layer.succeed(DeskSocket, socket),
    Layer.succeed(PresenceApi, presence),
    Layer.succeed(AssistantApi, assistant),
    PendingFilesLive,
  );
};

// The name the Next.js setups import (next/server-setup.ts, next/browser-setup.ts).
export const HttpTicketApi = HttpDeskApi;
