# Prior art 1: live server data in Ably, ElectricSQL, Replicache/Zero, Phoenix

Research notes, facts only, from official docs and (where marked) library source on GitHub. Nothing here is a design. Items marked **[unconfirmed]** were not found in the docs I could fetch. Each section gives the seven points in order.

Fetch date: 2026-10-30. Several doc URLs answered with 301 redirects; the redirect targets are cited.

---

## 1. Ably Realtime

Sources:
- Connection states: https://ably.com/docs/connect/states
- Channel states and `resumed`: https://ably.com/docs/channels/states
- Rewind: https://ably.com/docs/channels/options/rewind
- History and `untilAttach`: https://ably.com/docs/storage-history/history

**(1) Connection states.** Seven states, per the connect/states page: `initialized`, `connecting`, `connected`, `disconnected` (temporary; SDK retries, publishes queued, error 80003), `suspended` (about two minutes without connection; publishes error 80002), `closing`, `closed` (no state preserved by service or SDK), `failed` (unrecoverable; error 80000). The app reads these as connection state events. `connect()` restarts from `suspended` or `failed`.

Channel states: `initialized`, `attaching`, `attached`, `detaching`, `detached`, `suspended`, `failed` (channels page). Listeners receive a `ChannelStateChange` with `current`, `previous`, `resumed`, and `reason`. An `UPDATE` event fires when the channel stays `attached` but conditions change; `resumed` is `false` on it, which signals that messages may have been missed. The page does not mention `hasBacklog`.

**(2) Reconnect and backoff.** Fixed intervals, not exponential, per the connect/states page:
- `disconnected`: retry "every 15 seconds for up to two minutes".
- `suspended`: retry "every 30 seconds".
- Up to 5 fallback endpoints for failed connections.
- Whether the retry timing resets after a stable connection: **[unconfirmed]**. The page does not say.

**(3) Resume after a drop.** Two mechanisms:
- *Resume* (same SDK instance): transparent. Missed messages are delivered once the connection is re-established within about two minutes.
- *Recover* (new SDK instance, e.g. page refresh): the client passes a `recoveryKey` in the `recover` client option. The key holds the private `Connection#key` and "the last message serial received on that connection". The page does not call this field `msgSerial`.
- The client must re-subscribe to each channel within 15 seconds, or the stream cannot continue from before. Presence members must re-enter explicitly.
- Incompatible credentials (auth mode, key, `capability`, `clientId`) cause an unrecoverable connection error.
- Continuity flag: channel-level `resumed` on the `attached` event. `true` = no messages lost; `false` = continuity lost. The first attach on a fresh connection is always `false`. Connection-level flag: **[unconfirmed]**; the page describes none.
- The cursor is the connection key plus the last message serial (inside the recovery key). No per-channel offset is described.

**(4) History that cannot be replayed.** When continuity is lost, the channel reattaches and emits `attached` with `resumed: false`. The docs' remedy is history with `untilAttach: true`. The page says nothing about a server "reset" event or a "must refetch" signal. A gap is signalled only by `resumed: false`.

**(5) Bounds and back-pressure.**
- Rewind returns at most **1000 messages**; if more fall in the window, the latest 1000 are sent with a non-fatal error (rewind page).
- Rewind window: **2 minutes** without persisted history; **24 hours** (free) or **72 hours** (paid) with persisted history. Persist-last can keep the last message up to a year (rewind page).
- Rewind takes `N` (count), a time (`10s`, `5m`), or a message serial. `rewindLimit` can cap the count.
- Rewind applies only to the initial attach. Reattach on the same connection continues from the drop point; `recover` re-applies the rewind.
- Publishing while `disconnected` is queued locally; the page's stated queue limits: **[unconfirmed]**.
- Rate limits and back-pressure on subscribers: **[unconfirmed]**.

**(6) Fresh versus stale.** Not researched beyond the above. Channel `attached` plus `resumed: true` is the only freshness signal the pages describe. **[unconfirmed]** for any staleness API.

**(7) Presence and ephemeral state.** On recovery, presence members must re-enter (states page). Presence docs were not fetched. **[unconfirmed]** for presence storage, leave/timeout behaviour.

`untilAttach` (history page): valid only with `direction` backwards (the default). Ably records the serial of the last published message at attach. A history request with `untilAttach` returns messages published before that serial, so it serves as the historical half of a continuous stream. Subscribe first, then request history. The page says there is no duplication or loss across the ephemeral/persisted boundary, but "messages will not be in canonical global order when using continuous history". Continuity during disconnects is held for "up to 2 minutes".

---

## 2. ElectricSQL shape streams

Sources:
- HTTP API: https://electric.ax/docs/api/http (redirected from https://electric-sql.com/docs/api/http)
- Shapes guide (409, must-refetch): https://electric.ax/docs/guides/shapes
- Sync HTTP API (linked from shapes guide): https://electric.ax/docs/sync/api/http

**(1) Connection states.** The docs describe requests and responses, not connection states. Live mode is a long-poll or SSE request. **[unconfirmed]** for any client-side connection state object. The TypeScript client handles 409 and re-sync automatically (shapes guide).

**(2) Reconnect and backoff.** Live mode returns `200` with only an `up-to-date` message on timeout, and the client reconnects. `live_sse=true` uses Server-Sent Events, with keep-alive comments every 21 seconds. Backoff schedule on errors: **[unconfirmed]**.

**(3) Resume after a drop.** Cursor is the **offset** (format `0_0`, `123_4`). Special values:
- `offset=-1`: the whole log from the start (initial sync).
- `offset=now`: skip history; immediate up-to-date response with the latest offset.

The response header `electric-offset` carries the next offset when a log is too large for one response. The client sends it as `offset` for the next request.

The shape is identified by a **handle** (query parameter, e.g. `3833821-1721812114261`). Live requests pass `offset` and `handle` together. The HTTP API page does not document an `electric-handle` response header; the shapes guide says nothing about its exact name either. Continuity signal: the handle. When it is deleted, the client gets a **409 Conflict** or a `must-refetch` control message, and must re-sync from scratch (shapes guide).

**(4) History that cannot be replayed.** Documented causes (shapes guide):
- Replication slot invalidated (WAL exceeds `max_slot_wal_keep_size`), recreated, or timeline change (e.g. PITR): all shapes purged.
- Column add, remove or rename: detected from relation messages and a reconciliation check every 60 seconds.
- LRU eviction when `ELECTRIC_MAX_SHAPES` is set.
- Explicit `DELETE /v1/shape`.

Client response: "discards its local copy", starts a new subscription, re-syncs. The reset is signalled by a **409** or a **`must-refetch`** control message. The HTTP API page says `must-refetch` means "throw away their local shape data and re-sync from scratch". Whether the 409 carries a new handle: **[unconfirmed]**.

**(5) Bounds and back-pressure.** Responses are paged by `electric-offset`. Live long-poll holds the request until data or timeout. `changes_only` mode delivers only changes after the shape is established; existing rows need a subset snapshot (`snapshot-end` control message carries `xmin`, `xmax`, `xip_list`). Server-side limits beyond `ELECTRIC_MAX_SHAPES`: **[unconfirmed]**.

**(6) Fresh versus stale.** Control message `up-to-date`: "the client has all the data that the server was aware of when fulfilling the request". Caching: responses carry `cache-control` with `max-age` and `stale-age`, plus `etag`; CDNs can collapse concurrent live requests. The docs make no explicit statement on stale data or gaps. The `electric-cursor` header is not documented.

**(7) Presence and ephemeral state.** Not in the docs fetched. **[unconfirmed]**.

---

## 3. Replicache / Rocicorp Zero

Sources:
- Replicache how it works: https://doc.replicache.dev/concepts/how-it-works
- Replicache row-version strategy: https://doc.replicache.dev/strategies/row-version
- Replicache connection-loss: https://doc.replicache.dev/concepts/connection-loss (**returned 404**; not confirmed)
- Zero intro: https://zero.rocicorp.dev/docs/introduction
- Zero connection status: https://zero.rocicorp.dev/docs/connection
- Zero LLM index: https://zero.rocicorp.dev/llms.txt (returned partial content)

### Replicache

**(1) Connection states.** Not confirmed; the connection-loss page returned 404. **[unconfirmed]**.

**(2) Reconnect and backoff.** **[unconfirmed]**.

**(3) Resume after a drop: cookie and lastMutationID.**
- Pull request: `replicache-pull` with a `cookie` and a `clientGroupID`. Response: a new `cookie`, a `patch`, and `lastMutationIDChanges` (how-it-works).
- The cookie is "a value opaque to the client identifying the canonical server state that the client has" (how-it-works). The server uses it to compute the patch.
- Under the row-version strategy the cookie carries a **CVR ID** and an order number. Pull step 1: "the server uses the cookie to lookup the CVR associated with the previous pull response". The new cookie has a new random CVR ID and an order number at least one higher than both the incoming cookie's order and the client group's `cvrVersion` (row-version page).
- `lastMutationID` is the server's high-water mark per client. On pull, the client re-runs pending mutations with IDs greater than that value (how-it-works). `lastMutationIDChanges` lets the client discard confirmed pending mutations.
- Push: pending mutations are sent in batches to `replicache-push`, run in mutation-id order.
- Rebase: the client rewinds to the last server version, applies the patch, replays pending mutations, then shows the result (how-it-works).

**(4) History that cannot be replayed (unknown cookie or reset).** Row-version page: "if the CVR is lost, the server can just send a reset patch." If no CVR is found, the server uses an empty base CVR, so the client receives a full clear: an `op:clear` patch, followed by `put` and `del` operations. A stale-but-existing cookie is just diffed against the stored CVR. Client-side detection of an unappliable patch: **[unconfirmed]**. The "ClientStateNotFound" name in the brief was not seen on the pages fetched; **[unconfirmed]**.

**(5) Bounds and back-pressure.** Push and pull batch sizes, rate limits: **[unconfirmed]**.

**(6) Fresh versus stale.** The client always rebases on the last server version, so a pull response is the freshness point. Explicit staleness API: **[unconfirmed]**.

**(7) Presence.** **[unconfirmed]**.

### Zero

**(1) Connection states.** Confirmed (connection status page). Seven names: `initializing`, `connecting`, `connected`, `disconnected`, `error`, `needs-auth`, `closed`. Read via `zero.connection.state.subscribe(...)` (switch on `state.name`; `reason` on some states), `useConnectionState()` from `@rocicorp/zero/react`, or the SolidJS equivalent. `initializing` is entered while local data loads, and Zero does not return to it.

**(2) Reconnect and backoff.** Confirmed (connection status page):
- `connecting`: retries repeatedly. After one minute of failed attempts, moves to `disconnected`. Tunable with the `disconnectTimeoutMs` constructor option. Time in `initializing` does not count.
- `disconnected`: retries **every 5 seconds**.
- Hidden tab: after `hiddenTabDisconnectDelay` (default 5 minutes), disconnects until visible.
- `error`: not retried automatically; call `zero.connection.connect()`. A 5xx from `zero-cache` is retried up to four times.
- `needs-auth` on 401/403; refresh cookie or token, then `connect()`.
- Whether backoff resets after a stable connection: **[unconfirmed]**.

**(3) Resume after a drop.** Poke/pull, cookie, and `lastMutationID` are **not described** on the pages fetched. The intro says the client reads and writes local storage first and syncs "continuously with your server in the background", and that the cache is reused when possible. **[unconfirmed]** for any resume cursor or continuity flag.

**(4) History that cannot be replayed.** No resync or "must refetch" state is documented on the connection page. The closest feature is `onStorageFailure` (kinds `full`, `cannot-open`, `io-error`), which covers local storage, not server gaps. **[unconfirmed]** for server-side reset semantics.

**(5) Bounds and back-pressure.** Not confirmed.

**(6) Fresh versus stale.** Not confirmed beyond "local store first, then sync".

**(7) Presence.** Not confirmed.

---

## 4. Phoenix Channels and LiveView

Sources:
- Phoenix JS client: https://phoenix.hexdocs.pm/js/ (redirected from https://hexdocs.pm/phoenix/js/)
- Phoenix JS socket source: https://raw.githubusercontent.com/phoenixframework/phoenix/main/assets/js/phoenix/socket.js
- Phoenix JS channel source: https://raw.githubusercontent.com/phoenixframework/phoenix/main/assets/js/phoenix/channel.js
- Presence: https://phoenix.hexdocs.pm/Phoenix.Presence.html (redirected from https://hexdocs.pm/phoenix/Phoenix.Presence.html)
- LiveView JS interop: https://phoenix-live-view.hexdocs.pm/js-interop.html (redirected from https://hexdocs.pm/phoenix_live_view/js-interop.html)
- LiveView source: https://raw.githubusercontent.com/phoenixframework/phoenix_live_view/main/assets/js/phoenix_live_view/view.js and `live_socket.js` (**both returned 404**; not confirmed)

**(1) Connection states.** Socket: `connectionState()` returns `"connecting"`, `"open"`, `"closing"`, or `"closed"` (socket.js source). Hooks: `onOpen`, `onClose`, `onError`, `onMessage`, plus `isConnected()`. Channel states, from `channel.js` source references: `closed`, `joining`, `joined`, `leaving`, `errored`. The constants file was not fetched, so the exact string values are **[unconfirmed]**. The JS docs page does not enumerate these.

LiveView: hooks `disconnected` and `reconnected` run when the parent LiveView disconnects or reconnects. `phx-connected` / `phx-disconnected` bindings take effect only inside a LiveView container (interop page). The classes applied are **[unconfirmed]**.

**(2) Reconnect and backoff.** Confirmed from socket.js source:
- `reconnectAfterMs` default: `[10, 50, 100, 150, 200, 250, 500, 1000, 2000][tries - 1] || 5000`.
- `rejoinAfterMs` default: `[1000, 2000, 5000][tries - 1] || 10000`.
- The docs page says `onError` triggers rejoin "in an exponential backoff manner", but the array shape is stepped, not exponential.
- Reset: `onConnOpen()` calls `this.reconnectTimer.reset()`. The source comment: the tries count "only reset once a connection opens". The channel rejoin timer resets when the join push returns `ok`, and when the socket opens or the channel closes (channel.js).
- LiveView defaults: **[unconfirmed]**; LiveView source fetch returned 404.

**(3) Resume after a drop: join and rejoin.**
- A channel rejoins by sending a new join with `channel.params` (the modified params are sent on rejoin, per the JS docs).
- Refs: `joinRef()` returns the join push's ref. Replies route by `chan_reply_${ref}`. `isMember` drops messages whose `joinRef` no longer matches the current one (channel.js source).
- Continuity: no cursor, offset or serial is documented; a rejoin is a fresh join. **No server-side "continuity kept" flag was found.** Joining an already-subscribed topic makes the server close the old channel (`onClose` fires for it).
- LiveView rejoin: whether it re-mounts with a new session or resumes: **[unconfirmed]**. The interop page only mentions CSRF token in `params`, passed as `connect_params` to `mount`.

**(4) History that cannot be replayed.** Phoenix channels carry no history. Presence re-sync uses `presence_state` on join (see section 7). Gap signalling: **[unconfirmed]** for any explicit reset event.

**(5) Bounds and back-pressure.** Push default timeout: **10000 ms** (JS docs). `longpollerTimeout` default **20 s**. `heartbeatIntervalMs` option exists. Queue limits and back-pressure: **[unconfirmed]**.

**(6) Fresh versus stale.** Not described by Phoenix channels. Push replies (`ok`, `error`, `timeout`) are the only confirmation. **[unconfirmed]** for a staleness API.

**(7) Presence.** Confirmed from the Presence docs:
- `track(socket, key, meta)`, `update/3` (map or function), `untrack(socket, key)`.
- After join, the server pushes `"presence_state"` (from `Presence.list(socket)`).
- Live changes arrive as `"presence_diff"` with a payload `%{joins: ..., leaves: ...}`, keyed by presence key.
- `list/1` returns `%{key => %{metas: [...]}}`, each meta with `:phx_ref` (and `:phx_ref_prev` after update).
- Docs advise metadata "should be minimized and used to store small, ephemeral state".
- The docs say presence is implemented on `Phoenix.Tracker` from `phoenix_pubsub`. Storage model and behaviour on node disconnect or reconnect are **not** described on the page; **[unconfirmed]**.

---

## Comparison table

| Point | Ably | ElectricSQL | Replicache | Zero | Phoenix Channels / LiveView |
|---|---|---|---|---|---|
| (1) Connection states | `initialized`, `connecting`, `connected`, `disconnected`, `suspended`, `closing`, `closed`, `failed`; channel: `initialized`, `attaching`, `attached`, `detaching`, `detached`, `suspended`, `failed` | Not a state machine in the docs; live long-poll or SSE | **[unconfirmed]** (connection-loss page 404) | `initializing`, `connecting`, `connected`, `disconnected`, `error`, `needs-auth`, `closed` | Socket: `connecting`, `open`, `closing`, `closed`; channel: `closed`, `joining`, `joined`, `leaving`, `errored`; LiveView classes **[unconfirmed]** |
| (2) Reconnect / backoff | Fixed: 15 s retries up to 2 min (disconnected), 30 s (suspended). Reset on stable connection **[unconfirmed]** | Live timeout reconnect; error backoff **[unconfirmed]** | **[unconfirmed]** | Repeated `connecting` for 1 min, then `disconnected`; then every 5 s. Reset **[unconfirmed]** | Socket: `[10,50,100,150,200,250,500,1000,2000]` then 5000 ms; reset on `onConnOpen`. Rejoin: `[1000,2000,5000]` then 10000 ms; reset on join `ok` |
| (3) Resume cursor and continuity flag | Connection key + last message serial (`recoveryKey`). Channel `resumed` flag on `attached`; first attach always `false` | Offset (`0_0`, `-1`, `now`) with `electric-offset`, plus shape `handle`. No continuity flag beyond handle | `cookie` (opaque, CVR ID + order) and `lastMutationID` / `lastMutationIDChanges` | **[unconfirmed]** | No cursor; rejoin is a fresh join with `joinRef`. No continuity flag found |
| (4) Cannot replay | `resumed: false`; remedy is `untilAttach` history. No reset event | **409** or `must-refetch` control message; client discards and re-syncs | Unknown or lost CVR gives an `op:clear` reset patch | **[unconfirmed]**; `onStorageFailure` covers local storage only | None documented; presence re-sent via `presence_state` |
| (5) Bounds / back-pressure | Rewind max 1000 messages; window 2 min unpersisted, 24 h or 72 h persisted; queued publishes while disconnected | Paged by `electric-offset`; long-poll timeout; `ELECTRIC_MAX_SHAPES` LRU eviction | **[unconfirmed]** | **[unconfirmed]** | Push timeout 10 s; `longpollerTimeout` 20 s |
| (6) Fresh vs stale | `resumed` flag and `UPDATE` event; no staleness API found | `up-to-date` control message; `cache-control` `max-age` / `stale-age`, `etag` | Last server version via rebase; no staleness API found **[unconfirmed]** | Local-first store; no staleness API found **[unconfirmed]** | Push reply `ok` / `error` / `timeout` only |
| (7) Presence / ephemeral | Must re-enter after recovery; presence docs not fetched **[unconfirmed]** | **[unconfirmed]** | **[unconfirmed]** | **[unconfirmed]** | `track` / `update` / `untrack`; `presence_state` on join; `presence_diff` with `joins` / `leaves`; storage model **[unconfirmed]** |

---

## Not confirmed (summary)

- Ably: backoff reset after a stable connection; connection-level `resumed`; `hasBacklog`; presence storage; publish queue limits.
- Electric: 409 response body and whether it carries a new handle; `electric-handle` and `electric-cursor` response headers; client error backoff; server limits beyond `ELECTRIC_MAX_SHAPES`.
- Replicache: connection states, backoff, `ClientStateNotFound` name, client-side handling of an unappliable patch (connection-loss page returned 404).
- Zero: poke/pull, cookie, `lastMutationID`; backoff reset; server resync semantics (the Zero docs pages fetched do not cover them).
- Phoenix: channel state string values (`constants.js` not fetched); LiveView backoff and rejoin behaviour (LiveView source returned 404); presence node failure behaviour.
