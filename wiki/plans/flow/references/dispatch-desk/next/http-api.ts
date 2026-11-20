// Illustrative HTTP adapter: every port over `fetch`, `XMLHttpRequest` (upload progress), a
// `WebSocket` and a streamed body. This is where the real APIs enter Flow's world (machine-design
// 2.7.2): a rejected `fetch` becomes `NoResponse`, a status becomes a tagged failure or `ServerError`,
// a close code becomes `SocketDropped` or `SignedOut`. Nothing here decides what is definite and
// what is unknown; the contracts' commits do. Browser requests use same-origin cookies; server
// requests supply the authenticated token. Tokens never enter actor memory, dehydrated payloads or
// a URL, so the sockets (opened in the browser only) rely on the cookie.
//
// 1, 4.4). Presence is not here: it is a collaboration SDK's
// client (next/collab.ts), not an HTTP port.
import { Effect, Layer, Schema, Stream } from "effect";
import { Socket } from "effect/socket";
import {
  AttachmentsApi,
  PendingFilesLive,
  RemoveRefused,
  StoredAttachment,
  TooLarge,
} from "../features/Attachments/attachments-api.js";
import {
  CommentGone,
  CommentRejected,
  CommentRow,
  CommentsApi,
  EditWindowClosed,
  Reactions,
  ThreadPage,
  type CommentKey,
} from "../features/Comments/comments-api.js";
import { AssistantApi, Refused, SuggestFrame } from "../features/Assistant/assistant-api.js";
import { closedWith, DeskSocket, decodeFrame } from "../features/Tickets/feed/desk-socket.js";
import { assignResolver, TicketApi } from "../features/Tickets/ticket-api.js";
import {
  ActivityPage,
  AlreadyAssigned,
  AssignResult,
  ClosePage,
  ArchiveRefused,
  TicketRejected,
  NoResponse,
  QueueUnavailable,
  ServerError,
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

  // A read's success body, or `NoResponse` for a 5xx (the read shows what it had and asks again), or a
  // defect for a status nobody planned for.
  const readBody = <S extends Schema.Constraint>(schema: S, response: Response) => {
    if (response.ok) return decoded(schema, response);

    if (response.status >= 500) return Effect.fail(new NoResponse());

    return unexpected(response);
  };

  const ticketPath = (key: TicketKey) =>
    `/api/workspaces/${encodeURIComponent(key.workspaceId)}/tickets/${encodeURIComponent(key.ticketId)}`;

  const missing = (key: TicketKey) => Effect.fail(new TicketNotFound({ ticketId: key.ticketId }));

  // Assignments, batched below the commit: one `POST …/tickets:assign` for every assignment of one moment, each
  // item answered on its own (ticket-api.ts `assignResolver`). The batch is sent on the resolver's own fiber, so
  // it takes no caller's signal.
  const assignBatched = assignResolver(
    (items) =>
      Effect.gen(function* () {
        const workspaceId = items[0]?.input.workspaceId ?? "";
        const response = yield* request(
          `/api/workspaces/${encodeURIComponent(workspaceId)}/tickets:assign`,
          {
            signal: new AbortController().signal,
            body: { items },
          },
        );

        return yield* body(Schema.Array(AssignResult), response);
      }),
    {
      gone: (ticketId) => new TicketNotFound({ ticketId }),
      held: (assignee) => new AlreadyAssigned({ assignee }),
    },
  );

  const tickets = TicketApi.of({
    // Reads fail `NoResponse` when `fetch` rejects or the server answers 5xx: either way nothing came back
    // that the client can show, and the read's handler decides (REVIEW gap 34: a lost read is not a defect).
    load: (key, { signal }) =>
      Effect.gen(function* () {
        const response = yield* request(ticketPath(key), { signal });

        if (response.status === 404) return yield* missing(key);

        return yield* readBody(TicketRow, response);
      }),
    list: (input, { signal }) =>
      Effect.gen(function* () {
        const query = new URLSearchParams();

        for (const [name, value] of Object.entries(input)) {
          // Optional filters may be explicitly undefined at runtime (queue listInput).
          // oxlint-disable-next-line typescript/no-unnecessary-condition -- Object.entries loses optional-value information.
          if (value !== undefined) query.set(name, String(value));
        }

        const response = yield* request(`/api/tickets?${query}`, { signal });

        // 503 is the server's own word that the queue is down, with a `Retry-After`; the queue degrades.
        if (response.status === 503)
          return yield* Effect.fail(
            new QueueUnavailable({ retryAfter: Number(response.headers.get("Retry-After") ?? 5) }),
          );

        return yield* readBody(TicketPage, response);
      }),
    openCount: ({ workspaceId }, { signal }) =>
      Effect.gen(function* () {
        const response = yield* request(
          `/api/workspaces/${encodeURIComponent(workspaceId)}/open-count`,
          { signal },
        );

        return yield* readBody(Schema.Number, response);
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
    // socket still open, so a 5xx and a dropped request look the same.
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
    unassigned: ({ workspaceId, page }, { signal }) =>
      Effect.gen(function* () {
        const response = yield* request(
          `/api/workspaces/${encodeURIComponent(workspaceId)}/tickets/unassigned?page=${String(page ?? 0)}`,
          { signal },
        );

        return yield* readBody(TicketPage, response);
      }),
    triage: ({ workspaceId, now }, { signal }) =>
      Effect.gen(function* () {
        const response = yield* request(
          `/api/workspaces/${encodeURIComponent(workspaceId)}/tickets/triage?now=${String(now)}`,
          { signal },
        );

        return yield* readBody(TicketPage, response);
      }),
    setAssignee: (input, { idempotencyKey }) => assignBatched(input, idempotencyKey),
    closeMany: ({ workspaceId, tickets }, { idempotencyKey, signal }) =>
      Effect.gen(function* () {
        const response = yield* request(
          `/api/workspaces/${encodeURIComponent(workspaceId)}/tickets:close`,
          {
            signal,
            idempotencyKey,
            body: { tickets },
          },
        );

        return yield* body(ClosePage, response);
      }),
    byCustomer: ({ workspaceId, customerId }, { signal }) =>
      Effect.gen(function* () {
        const response = yield* request(
          `/api/workspaces/${encodeURIComponent(workspaceId)}/customers/${encodeURIComponent(customerId)}/tickets`,
          { signal },
        );

        return yield* readBody(Schema.Array(TicketRow), response);
      }),
    // `draftId` never goes on the wire: the server mints the ticket's id (rule 33).
    create: ({ draftId: _draft, workspaceId, ...ticket }, { idempotencyKey, signal }) =>
      Effect.gen(function* () {
        const response = yield* request(
          `/api/workspaces/${encodeURIComponent(workspaceId)}/tickets`,
          {
            signal,
            idempotencyKey,
            body: ticket,
          },
        );

        if (response.status === 422)
          return yield* new TicketRejected(
            yield* decoded(Schema.Struct({ reason: Schema.String }), response),
          );

        return yield* body(TicketRow, response);
      }),
    archive: (key, { idempotencyKey, signal }) =>
      Effect.gen(function* () {
        const response = yield* request(`${ticketPath(key)}/archive`, {
          signal,
          idempotencyKey,
          body: {},
        });

        if (response.status === 204) return;

        if (response.status === 404) return yield* missing(key);

        if (response.status === 403)
          return yield* new ArchiveRefused(
            yield* decoded(Schema.Struct({ reason: Schema.String }), response),
          );

        if (response.status >= 500) return yield* new ServerError({ status: response.status });

        return yield* unexpected(response);
      }),
  });

  const commentPath = (key: CommentKey) =>
    `${ticketPath(key)}/comments/${encodeURIComponent(key.commentId)}`;

  const gone = (key: CommentKey) => Effect.fail(new CommentGone({ commentId: key.commentId }));

  // A comment write's answer: the row, 404 gone, 403 the edit window closed, 422 refused text, 5xx unknown.
  const commentAnswer = (key: CommentKey, response: Response) =>
    Effect.gen(function* () {
      if (response.status === 404) return yield* gone(key);

      if (response.status === 403)
        return yield* new EditWindowClosed(
          yield* decoded(Schema.Struct({ closedAt: Schema.Number }), response),
        );

      if (response.status === 422)
        return yield* new CommentRejected(
          yield* decoded(Schema.Struct({ reason: Schema.String }), response),
        );

      return yield* body(CommentRow, response);
    });

  const comments = CommentsApi.of({
    list: ({ before, pinned, ...key }, { signal }) =>
      Effect.gen(function* () {
        const query = new URLSearchParams();

        if (before !== undefined) query.set("before", before);

        if (pinned !== undefined) query.set("pinned", String(pinned));

        const response = yield* request(`${ticketPath(key)}/comments?${query}`, { signal });

        if (response.status === 404) return yield* missing(key);

        return yield* readBody(ThreadPage, response);
      }),
    mentions: ({ workspaceId, me }, { signal }) =>
      Effect.gen(function* () {
        const response = yield* request(
          `/api/workspaces/${encodeURIComponent(workspaceId)}/mentions?me=${encodeURIComponent(me)}`,
          { signal },
        );

        return yield* readBody(Schema.Array(CommentRow), response);
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
    edit: ({ text, ...key }, { idempotencyKey, signal }) =>
      request(`${commentPath(key)}/text`, { signal, idempotencyKey, body: { text } }).pipe(
        Effect.flatMap((response) => commentAnswer(key, response)),
      ),
    remove: (key, { idempotencyKey, signal }) =>
      request(`${commentPath(key)}/delete`, { signal, idempotencyKey, body: {} }).pipe(
        Effect.flatMap((response) =>
          response.status === 204
            ? Effect.void
            : commentAnswer(key, response).pipe(
                Effect.asVoid,
                Effect.catchTag("CommentRejected", Effect.die), // a delete has no text to refuse
              ),
        ),
      ),
    pin: ({ pinned, ...key }, { idempotencyKey, signal }) =>
      request(`${commentPath(key)}/pin`, { signal, idempotencyKey, body: { pinned } }).pipe(
        Effect.flatMap((response) => commentAnswer(key, response)),
        Effect.catchTags({ EditWindowClosed: Effect.die, CommentRejected: Effect.die }), // never sent for a pin
      ),
    markRead: ({ workspaceId, ...rest }, { idempotencyKey, signal }) =>
      Effect.gen(function* () {
        const response = yield* request(
          `/api/workspaces/${encodeURIComponent(workspaceId)}/comments:read`,
          { signal, idempotencyKey, body: rest },
        );

        if (response.status >= 500) return yield* new ServerError({ status: response.status });

        if (!response.ok) return yield* unexpected(response);
      }),
    reactions: (key, { signal }) =>
      Effect.gen(function* () {
        const response = yield* request(`${ticketPath(key)}/reactions`, { signal });

        return yield* readBody(Reactions, response);
      }),
    react: ({ emoji, on, ...key }, { idempotencyKey, signal }) =>
      Effect.gen(function* () {
        const response = yield* request(`${commentPath(key)}/reactions`, {
          signal,
          idempotencyKey,
          body: { emoji, on },
        });

        if (response.status === 404) return yield* gone(key);

        return yield* body(Reactions, response);
      }),
  });

  // `fetch` reports no upload progress, so uploads use XMLHttpRequest. The callback always
  // resumes: success, an HTTP answer, a network error, a timeout or an abort. `signal` is the one
  // Effect gives the callback; interrupting the fiber aborts the request.
  const attachments = AttachmentsApi.of({
    files: (key, { signal }) =>
      Effect.gen(function* () {
        const response = yield* request(`${ticketPath(key)}/files`, { signal });

        return yield* readBody(Schema.Array(StoredAttachment), response);
      }),
    remove: ({ ref, ...key }, { idempotencyKey, signal }) =>
      Effect.gen(function* () {
        const response = yield* request(
          `${ticketPath(key)}/files/${encodeURIComponent(ref)}/delete`,
          {
            signal,
            idempotencyKey,
            body: {},
          },
        );

        if (response.status === 204) return;

        if (response.status === 403)
          return yield* new RemoveRefused(
            yield* decoded(Schema.Struct({ uploadedBy: Schema.String }), response),
          );

        if (response.status >= 500) return yield* new ServerError({ status: response.status });

        return yield* unexpected(response);
      }),
    put: (ticket, ref, bytes, { idempotencyKey, onProgress }) =>
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
        xhr.open("PUT", new URL(`${ticketPath(ticket)}/files/${encodeURIComponent(ref)}`, origin));

        if (token !== undefined) xhr.setRequestHeader("Authorization", `Bearer ${token}`);

        xhr.setRequestHeader("Idempotency-Key", idempotencyKey);
        xhr.send(bytes);
      }),
  });

  // The socket as a Stream of text frames, over Effect's `Socket` (REVIEW S-H1). `highWaterMark` bounds what
  // the browser may buffer: a flood past it fails the socket with a `SocketReadError`, which the adapter
  // reads as a transient drop, so `stream reconnect and catch up instead of the page buffering
  // without bound. The Scope owns the WebSocket: ending or interrupting the
  // stream closes it. A close fails the stream with the adapter's classification of its code.
  const socketText = (path: string, params: Record<string, string>) => {
    const url = new URL(path, origin);
    url.protocol = url.protocol === "https:" ? "wss:" : "ws:";

    for (const [name, value] of Object.entries(params)) url.searchParams.set(name, value);

    return Stream.unwrap(
      Effect.gen(function* () {
        const socket = yield* Socket.makeWebSocket(url.toString(), { highWaterMark: 1_048_576 });
        const pull = yield* Socket.readerString(socket);

        return Stream.fromEffectRepeat(pull).pipe(Stream.flatMap(Stream.fromIterable));
      }),
    ).pipe(
      Stream.mapError((error) =>
        error.reason._tag === "SocketCloseError"
          ? closedWith(error.reason.code)
          : new SocketDropped({ why: error.reason._tag }),
      ),
      // An idle deadline on every frame; the server pings every 20 s.
      Stream.timeoutOrElse({
        duration: "45 seconds",
        orElse: () => Stream.fail(new SocketDropped({ why: "Silent" })),
      }),
      Stream.provide(Socket.layerWebSocketConstructorGlobal),
    );
  };

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
    Layer.succeed(AssistantApi, assistant),
    PendingFilesLive,
  );
};

// The name the Next.js setups import (next/server-setup.ts, next/browser-setup.ts).
export const HttpTicketApi = HttpDeskApi;
