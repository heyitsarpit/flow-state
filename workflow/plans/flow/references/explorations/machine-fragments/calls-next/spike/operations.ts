// operations.ts: the app's operations, outside the machine. Each service is the adapter boundary: production
// wraps fetch (status, Retry-After header, JSON body); Stories replace the whole service with a fixture.
// Errors carry what the server said, never what to do about it.
import { Context, Effect, Schema } from "effect"
import { Outcome, transaction } from "./flow.ts"

// ── shared adapter errors
export class NoResponse extends Schema.TaggedError<NoResponse>()("NoResponse", {}) {}     // fetch rejected: TypeError, reset
export class BadResponse extends Schema.TaggedError<BadResponse>()("BadResponse", {})  {} // a 2xx body that did not decode
export class ServerError extends Schema.TaggedError<ServerError>()("ServerError", { status: Schema.Number }) {}

// ── Payments (checkout E1-E3) ────────────────────────────────────────────────────────────────────────────────
export class Declined extends Schema.TaggedError<Declined>()("Declined", { code: Schema.String }) {}
export class Busy extends Schema.TaggedError<Busy>()("Busy", { retryAfterMs: Schema.optional(Schema.Number) }) {}
/** What the adapter decoded from the Response: `status`, the Retry-After header in ms, the body's charge id. */
export type ChargeResponse = { readonly status: number; readonly retryAfterMs?: number; readonly chargeId?: string }
export class PaymentsApi extends Context.Service<PaymentsApi, {
  readonly charge: (body: { readonly cents: number }, o: { readonly idempotencyKey: string }) => Effect.Effect<ChargeResponse, NoResponse>
}>()("PaymentsApi") {}

export const charge = transaction({
  id: "Payments.charge",
  input: Schema.Struct({ cents: Schema.Number }),
  key: () => ({}),
  concurrency: "reject",
  commit: (input, { attempt }) => Effect.gen(function* () {
    const api = yield* PaymentsApi
    const res = yield* api.charge(input, { idempotencyKey: attempt.idempotencyKey }).pipe(
      Effect.catchTag("NoResponse", (e) => Outcome.unknown(e)))                         // dropped: maybe charged
    if (res.status === 402) return yield* Outcome.failure(new Declined({ code: "card_declined" }))
    // 429 lock_timeout: "another request with this key is running". The builder's classification (a failure)
    // is kept on purpose: rule 6 makes it safe even so.
    if (res.status === 429 || res.status === 503) return yield* Outcome.failure(new Busy({ retryAfterMs: res.retryAfterMs }))
    if (res.status >= 500) return yield* Outcome.unknown(new ServerError({ status: res.status }))
    if (res.chargeId === undefined) return yield* Outcome.unknown(new BadResponse())
    return yield* Outcome.success({ chargeId: res.chargeId })
  }),
})

// ── Auth (sign-in, v4 3.1) ──────────────────────────────────────────────────────────────────────────────────
export class WrongCode extends Schema.TaggedError<WrongCode>()("WrongCode", {}) {}
export class Expired extends Schema.TaggedError<Expired>()("Expired", {}) {}
export class AuthApi extends Context.Service<AuthApi, {
  readonly verify: (body: { readonly challengeId: string; readonly code: string }) => Effect.Effect<{ readonly status: number }, NoResponse>
}>()("AuthApi") {}

export const verifyCode = transaction({
  id: "Auth.verifyCode",
  input: Schema.Struct({ challengeId: Schema.String, code: Schema.String }),
  key: (i) => ({ challengeId: i.challengeId }),
  concurrency: "reject",
  commit: (input) => Effect.gen(function* () {
    const api = yield* AuthApi
    const res = yield* api.verify(input).pipe(Effect.catchTag("NoResponse", (e) => Outcome.unknown(e)))
    if (res.status === 200) return yield* Outcome.success({})
    if (res.status === 401) return yield* Outcome.failure(new WrongCode())
    if (res.status === 410) return yield* Outcome.failure(new Expired())
    return yield* Outcome.unknown(new ServerError({ status: res.status }))
  }),
})

// ── Docs (lifecycle M1) ─────────────────────────────────────────────────────────────────────────────────────
export class Conflict extends Schema.TaggedError<Conflict>()("Conflict", { serverRev: Schema.Number }) {}
export class DocsApi extends Context.Service<DocsApi, {
  readonly put: (doc: { readonly docId: string; readonly body: string }, o: { readonly idempotencyKey: string }) => Effect.Effect<{ readonly status: number; readonly rev: number }, NoResponse>
}>()("DocsApi") {}

export const save = transaction({
  id: "Docs.save",
  input: Schema.Struct({ docId: Schema.String, body: Schema.String }),
  key: (d) => ({ docId: d.docId }),
  concurrency: "reject",
  commit: (doc, { attempt }) => Effect.gen(function* () {
    const api = yield* DocsApi
    const res = yield* api.put(doc, { idempotencyKey: attempt.idempotencyKey }).pipe(Effect.catchTag("NoResponse", (e) => Outcome.unknown(e)))
    if (res.status === 409) return yield* Outcome.failure(new Conflict({ serverRev: res.rev }))
    if (res.status >= 500) return yield* Outcome.unknown(new ServerError({ status: res.status }))
    return yield* Outcome.success({ rev: res.rev })
  }),
})

// ── Uploads (lifecycle D1): the body goes even if the client stops waiting ───────────────────────────────────
export class UploadsApi extends Context.Service<UploadsApi, {
  readonly put: (ref: string, o: { readonly idempotencyKey: string }) => Effect.Effect<{ readonly fileId: string }, NoResponse>
  /** DELETE /uploads?key=…: the server deletes the file stored under that key, and refuses one that arrives later. */
  readonly discard: (o: { readonly ref: string; readonly uploadKey: string }) => Effect.Effect<{ readonly status: number }, NoResponse>
}>()("UploadsApi") {}

export const upload = transaction({
  id: "Uploads.put",
  input: Schema.Struct({ ref: Schema.String }),
  key: (i) => ({ ref: i.ref }),
  concurrency: "reject",
  commit: (input, { attempt }) => Effect.gen(function* () {
    const api = yield* UploadsApi
    return yield* api.put(input.ref, { idempotencyKey: attempt.idempotencyKey }).pipe(Effect.catchTag("NoResponse", (e) => Outcome.unknown(e)))
  }),
})
export const discard = transaction({
  id: "Uploads.discard",
  input: Schema.Struct({ ref: Schema.String, uploadKey: Schema.String }),
  key: (i) => ({ ref: i.ref }),
  concurrency: "reject",
  commit: (input) => Effect.gen(function* () {
    const api = yield* UploadsApi
    const res = yield* api.discard(input).pipe(Effect.catchTag("NoResponse", (e) => Outcome.unknown(e)))
    if (res.status >= 500) return yield* Outcome.unknown(new ServerError({ status: res.status }))
    return yield* Outcome.success({})
  }),
})

// ── Likes (editing B1): PUT /likes/:id is idempotent, so latest-wins is safe ─────────────────────────────────
export class LikesApi extends Context.Service<LikesApi, {
  readonly set: (id: string, liked: boolean, o: { readonly idempotencyKey: string }) => Effect.Effect<{ readonly count: number }, NoResponse>
}>()("LikesApi") {}
export const setLike = transaction({
  id: "Issues.setLike",
  input: Schema.Struct({ id: Schema.String, liked: Schema.Boolean }),
  key: (i) => ({ id: i.id }),
  concurrency: "latest",
  commit: (input, { attempt }) => Effect.gen(function* () {
    const api = yield* LikesApi
    return yield* api.set(input.id, input.liked, { idempotencyKey: attempt.idempotencyKey }).pipe(Effect.catchTag("NoResponse", (e) => Outcome.unknown(e)))
  }),
})

// ── Refunds (booking F1's compensation): a separate commit with its own Attempt ──────────────────────────────
export class RefundsApi extends Context.Service<RefundsApi, {
  readonly refund: (chargeId: string, o: { readonly idempotencyKey: string }) => Effect.Effect<{ readonly refundId: string }, NoResponse>
}>()("RefundsApi") {}
export const refund = transaction({
  id: "Payments.refund",
  input: Schema.Struct({ chargeId: Schema.String }),
  key: (i) => ({ chargeId: i.chargeId }),
  concurrency: "reject",
  commit: (input, { attempt }) => Effect.gen(function* () {
    const api = yield* RefundsApi
    return yield* api.refund(input.chargeId, { idempotencyKey: attempt.idempotencyKey }).pipe(Effect.catchTag("NoResponse", (e) => Outcome.unknown(e)))
  }),
})
