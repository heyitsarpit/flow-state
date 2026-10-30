# Prior art 2: live server data in client libraries

Research facts only. No design. Each claim cites its source. "NOT CONFIRMED" means the official page I could fetch did not state it, or the fetch failed.

Points: (1) connection states, (2) reconnect and backoff, (3) resume cursor and continuity signal, (4) history that cannot be replayed, (5) bounds and back-pressure, (6) fresh vs stale, (7) presence and ephemeral state.

---

## 1. Firestore `onSnapshot`

Sources:
- Listen guide: https://firebase.google.com/docs/firestore/query-data/listen
- SnapshotMetadata reference: https://firebase.google.com/docs/reference/js/firestore_.snapshotmetadata (fetch returned navigation only; not read)

1. **Connection states.** The docs do not expose a connection state for a listener. What is readable is per-snapshot metadata.
   - `hasPendingWrites` is on `metadata`. The guide says it "indicates whether the document has local changes" that have not reached the backend yet.
   - `fromCache`: NOT CONFIRMED. It is not in the listen guide. The SnapshotMetadata page was not readable. Treat `fromCache` as unverified here.
   - Local writes fire listeners immediately (latency compensation): "your listeners will be notified with the new data _before_ the data is sent to the backend."
   - Initial snapshot: "take an initial snapshot from the local cache," and in cache-only mode they "fire only with respect to data in the local cache."
2. **Reconnect and backoff.** NOT CONFIRMED. The fetched guide has no reconnect or backoff language. Retry behaviour is internal to the SDK and not documented on these pages.
3. **Resume cursor.** NOT CONFIRMED. No resume token, cursor, or continuity flag appears in the listen guide. The fetched pages do not say whether a continuity signal exists.
4. **History cannot be replayed.** NOT CONFIRMED. No reset or refetch event is documented in the fetched pages. A listener that errors is terminal: "After an error, the listener will not receive any more events, and there is no need to detach your listener."
5. **Bounds and back-pressure.** NOT CONFIRMED. Not in the fetched pages.
6. **Fresh vs stale.** This is the metadata split.
   - `includeMetadataChanges`: "By default, listeners are not notified of changes that only affect metadata." Passing `{ includeMetadataChanges: true }` opts in to metadata-only events.
   - Cache-served first snapshot is possible, so a listener can start stale. The guide describes this but gives no `fromCache` flag on the page I read.
7. **Presence or ephemeral state.** Not in these pages. Firestore's presence is not covered by the fetched material.

---

## 2. Socket.IO

Sources:
- Connection state recovery: https://socket.io/docs/v4/connection-state-recovery
- Client options: https://socket.io/docs/v4/client-options
- Client socket instance: https://socket.io/docs/v4/client-socket-instance

1. **Connection states.**
   - `socket.connected`: "describes whether the socket is currently connected to the server."
   - `socket.active`: "indicates whether the socket will automatically try to reconnect after a small randomized delay."
   - Disconnect reasons (first argument to `disconnect`):
     - `io server disconnect`: server forced it; no auto reconnect.
     - `io client disconnect`: client called `socket.disconnect()`; no auto reconnect.
     - `ping timeout`: auto reconnect.
     - `transport close`: auto reconnect.
     - `transport error`: auto reconnect.
   - `reconnect_attempt` and `reconnect` are emitted on the Manager (`socket.io.on(...)`), not the Socket, since v3.
2. **Reconnect and backoff.** Client defaults, confirmed:
   - `reconnection`: `true`
   - `reconnectionAttempts`: `Infinity`
   - `reconnectionDelay`: `1000` ms
   - `reconnectionDelayMax`: `5000` ms
   - `randomizationFactor`: `0.5`
   - `timeout`: `20000` ms per attempt
   - Whether backoff resets after a successful connection: NOT CONFIRMED.
3. **Resume cursor and continuity signal.**
   - No public offset or serial is documented as a client-visible cursor. The server backs up sessions and packets.
   - Continuity signal: `socket.recovered`. "`true` if recovery succeeded, `false` for a new or unrecoverable session." It is checked on the server in `connection` and on the client in `connect`.
   - What is restored on success: `socket.id`, `socket.rooms`, `socket.data`, and "the client receives any events missed during the disconnection."
   - Server option: `connectionStateRecovery.maxDisconnectionDuration` (ms). Only unexpected disconnects are stored; manual `socket.disconnect()` is not.
   - Recovery "will not always be successful," so the app must sync state itself. The server "must send at least one event so the client has an offset to recover from."
   - Adapter support: built-in in-memory yes; Redis no; Redis Streams yes; MongoDB yes (since 0.3.0); Postgres and Cluster "work in progress."
4. **History cannot be replayed.** The page says the client "should handle synchronizing state itself." It does NOT say whether a new `id` is assigned on failure, nor how missed packets are handled. Whether the client gets an explicit reset event: NOT CONFIRMED (only `recovered: false` on the socket).
5. **Bounds and back-pressure.** Only `maxDisconnectionDuration` is documented as a bound. Buffer size or packet count limits: NOT CONFIRMED. `skipMiddlewares: true` skips `io.use()` middlewares on successful recovery; the docs warn users blocked during disconnect may reconnect without validation.
6. **Fresh vs stale.** NOT CONFIRMED. Socket.IO does not document a freshness flag. `socket.recovered` is the only continuity signal.
7. **Presence or ephemeral state.** Not in these pages. NOT CONFIRMED.

---

## 3. graphql-ws

Sources:
- Protocol: https://github.com/enisdenjo/graphql-ws/blob/master/PROTOCOL.md
- Client options (the-guild docs): https://the-guild.dev/graphql/ws/docs/interfaces/client.ClientOptions
- The GitHub-hosted `docs/interfaces/client.ClientOptions.md` returned 404 when fetched; the-guild mirror was used.

1. **Connection states.** Protocol-level messages: `connection_init`, `connection_ack`, `ping`, `pong`, `subscribe`, `next`, `error`, `complete`. Client hooks (`on`): `connecting`, `opened`, `connected`, `closed`, `error`, `message`, `ping`, `pong`. Per-hook payloads and timing are NOT CONFIRMED on the page I read.
2. **Reconnect and backoff.** Defaults, confirmed:
   - `retryAttempts`: `5`. "Max reconnects after abnormal closure before erroring out."
   - Listed fatal close codes (e.g. 4500, 4401, 4409) are never retried.
   - `retryWait`: default is "randomised exponential backoff." It receives `retries`, which "counts actual connection attempts and starts at 0 after the first retryable disconnect."
   - Backoff reset after a successful connection: NOT CONFIRMED.
   - `shouldRetry`: default retries only `CloseEvent`s. Return `false` to fail immediately, `true` to retry until `retryAttempts` is exceeded. Non-CloseEvent connection errors are fatal unless `shouldRetry` allows retry.
   - `lazy`: default `true`. "connects on first subscribe and closes on last unsubscribe." `false` connects immediately; `onNonLazyError` handles errors in that mode.
   - `keepAlive`: default `0` (disabled). Sends `PingMessage` at this interval. "No automatic action occurs if the server never pongs; you must implement that yourself."
   - `connectionAckWaitTimeout`: default `0`. If no `ConnectionAck` in time, socket closes with 4418.
3. **Resume cursor and continuity signal.** None. The protocol says nothing about reconnecting or resuming subscriptions. It defines only close codes and that the server "can close the socket (kick the client off) at any time." A reconnect re-subscribes from scratch as far as the protocol states.
4. **History cannot be replayed.** NOT APPLICABLE per protocol. Nothing is defined for replay, reset, or gap. Late messages for a completed ID "must be ignored, not treated as errors."
5. **Bounds and back-pressure.** Not documented in these pages. NOT CONFIRMED.
6. **Fresh vs stale.** Not documented. NOT CONFIRMED.
7. **Presence or ephemeral state.** Ping/pong is liveness only ("detecting failed connections, latency metrics, network probing"). No presence concept. NOT CONFIRMED beyond that.

Subscription acknowledgement: the protocol defines `connection_ack` for the socket. There is NO per-subscription ack. The server sends `next` for results, `error` (terminal), and `complete`. Subscribing before `connection_ack` closes the socket with 4401.

---

## 4. Convex reactive queries

Sources:
- React client guide: https://docs.convex.dev/client/react
- `ConvexClient` class reference: https://docs.convex.dev/api/classes/browser.ConvexClient
- Hook name `useConvexConnectionState` and its fields came from search snippets and third-party mirrors (not fetched from an official page). Marked below.

1. **Connection states.**
   - `connectionState()`: "Get the current ConnectionState between the client and the Convex backend."
   - `subscribeToConnectionState(cb)`: callback "each time it changes," fires "when any part of ConnectionState changes," returns an unsubscribe function.
   - ConnectionState fields: NOT CONFIRMED on the official page. Search snippets and type declarations (unofficial, version-dependent) list `hasInflightRequests` and `isWebSocketConnected`, and in newer versions `timeOfOldestInflightRequest` and retry counts. The ConnectionState type "may grow in future versions."
   - A React hook `useConvexConnectionState` appears in third-party mirrors. NOT CONFIRMED on official docs.
2. **Reconnect and backoff.** The React guide says: "If the internet connection drops, the client will handle reconnecting and re-establishing the Convex session automatically." Backoff details and reset: NOT CONFIRMED.
3. **Resume cursor and continuity signal.** NOT CONFIRMED. No cursor or continuity flag in either page.
4. **History cannot be replayed.** NOT CONFIRMED. No reset or gap event documented. `onError` fires "when the query result updates with an error." If `onError` is omitted, errors are thrown.
5. **Bounds and back-pressure.** NOT CONFIRMED.
6. **Fresh vs stale.**
   - The React guide: "Convex React ensures that your application always renders a consistent view of the query results based on a single state of the underlying database." Consistency is stated.
   - Freshness or staleness terms: NOT FOUND in either page.
   - `useQuery` returns `undefined` "while the data is first loading." The experimental `useQuery_experimental` reports `status: "pending"`.
   - `onUpdate` fires "whenever a new result for a query is received," and "soon after being registered if a result for the query is already in memory."
7. **Presence or ephemeral state.** NOT FOUND in these pages. Optimistic updates are described as "temporary, local changes to your query results," configured on a separate page not fetched.

---

## 5. Browser `EventSource` (brief)

Source: WHATWG HTML, server-sent events: https://html.spec.whatwg.org/multipage/server-sent-events.html

1. **Connection states.** `readyState`:
   - `CONNECTING` (0): on creation and "whenever the UA is reconnecting."
   - `OPEN` (1): when the response is 200 with `text/event-stream`.
   - `CLOSED` (2): "a fatal error or the `close()` method was invoked."
   - The `error` event fires on reconnecting network errors.
2. **Reconnect and backoff.** Network error: reconnects (state CONNECTING). Non-200 status or wrong Content-Type: fails, CLOSED, no retry. Aborted network error: CLOSED. Body ending normally: reconnects. Backoff: governed only by `retry:`.
   - `retry:` field: ASCII digits set the reconnection time in ms. Otherwise ignored.
   - Default: "implementation-defined, probably in the region of a few seconds." Backoff growth and reset: NOT in the spec.
3. **Resume cursor.** `Last-Event-ID` header, sent on reconnect only if the last event ID is non-empty. Set from the most recent `id:` field; an empty `id` resets it. Values containing U+0000 are ignored. The server must honour it; the spec defines no replay.
4. **History cannot be replayed.** The spec defines no replay and no client-side gap notification. Recovery depends on the server honouring `Last-Event-ID`.
5. **Bounds and back-pressure.** Not in the spec.
6. **Fresh vs stale.** Not in the spec.
7. **Presence or ephemeral state.** Not in the spec.

---

## Comparison across the 7 points

| Point | Firestore `onSnapshot` | Socket.IO | graphql-ws | Convex reactive queries | EventSource |
|---|---|---|---|---|---|
| 1. Connection states | No listener-level state documented. Per-doc `hasPendingWrites`. `fromCache` NOT CONFIRMED. | `socket.connected`, `socket.active`, disconnect reasons. | `connecting`/`opened`/`connected`/`closed`/`error` hooks. Payloads NOT CONFIRMED. | `connectionState()`, `subscribeToConnectionState()`. Field list NOT CONFIRMED on official page. | `readyState` CONNECTING/OPEN/CLOSED. |
| 2. Reconnect and backoff | NOT CONFIRMED. | Defaults confirmed (1s to 5s, factor 0.5, infinite). Reset NOT CONFIRMED. | `retryAttempts` 5, `retryWait` randomised exponential. Reset NOT CONFIRMED. | Automatic per React guide. Backoff NOT CONFIRMED. | Network error auto-reconnects. Delay from `retry:`, implementation-defined default. |
| 3. Resume cursor and continuity | NOT CONFIRMED. No resume token documented. | `socket.recovered` (true/false). Only if `connectionStateRecovery` on, and only for unexpected disconnects. No public offset. | None in protocol. | NOT CONFIRMED. | `Last-Event-ID` on reconnect. Server must honour it. |
| 4. History cannot be replayed | NOT CONFIRMED. Errors stop listener. | Client should resync itself. Explicit reset event NOT CONFIRMED. | Not defined by protocol. | NOT CONFIRMED. `onError` for errored results. | Not defined by spec. Gap not reported to client. |
| 5. Bounds and back-pressure | NOT CONFIRMED. | `maxDisconnectionDuration` only. Buffer size NOT CONFIRMED. | NOT CONFIRMED. | NOT CONFIRMED. | Not in spec. |
| 6. Fresh vs stale | `includeMetadataChanges`; `fromCache` NOT CONFIRMED; cache-first initial snapshot documented. | NOT CONFIRMED. | NOT CONFIRMED. | "Consistent view" stated. Freshness or staleness NOT FOUND. `undefined` while loading. | Not in spec. |
| 7. Presence or ephemeral state | NOT CONFIRMED. | NOT CONFIRMED. | Ping/pong for liveness only. | NOT CONFIRMED. Optimistic local updates documented. | Not in spec. |

---

## Not confirmed, consolidated

- Firestore: `fromCache` definition (SnapshotMetadata page unreadable), reconnect, resume token, bounds, presence.
- Socket.IO: backoff reset, `socket.recovered` on failure path (new id, packet handling), buffer bounds, freshness, presence.
- graphql-ws: hook payloads, backoff reset, bounds, freshness, presence. The GitHub-hosted ClientOptions page returned 404; the-guild mirror was used.
- Convex: ConnectionState field names on the official page, reconnect backoff, resume and continuity, gap or reset events, bounds, freshness terms, presence. The `useConvexConnectionState` hook name came from third-party mirrors only.
- EventSource: backoff growth and reset, bounds, freshness, presence (none in spec).
