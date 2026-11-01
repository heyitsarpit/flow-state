// Flattened by hand from references/checkout/features/Pay/pay.{contracts,definition,machine}.ts, convergence-1 section 11.
// `at.path` is the path in the real machine, so an index counts the real alternatives (CHALLENGE included).
// Gaps beyond section 11's list: AbortPay exists only so that lane.cancel.InFlight is reachable (Pay has no such event
// on the wire); PayRequested's alternatives lost the summary trait's guards.
import { Effect } from "effect"
import type { Fixture } from "../harness.ts"
import type { ShopApi } from "../fake-world.ts"
import type { Alternative, Compiled, Member, Node, Op, Slot, TokenGuard } from "./compiled.ts"
import { deny, Outcome } from "./compiled.ts"

const D = "Checkout/Pay"
const slot = <F>(path: string, run: F): Slot<F> => ({ run, at: { definition: D, path } })

const unknownWhenLost = <A, E extends { readonly _tag: string }>(write: Effect.Effect<A, E>) =>
  write.pipe(
    Effect.catch((e) =>
      e._tag === "NoResponse" || e._tag === "ServerError" ? Outcome.unknown(e) : Effect.fail(e),
    ),
  )

const emptyAddress = { name: "", line1: "", postcode: "", email: "" }
const savedAddress = { name: "Ada Lovelace", line1: "12 Canal St", postcode: "N1 9GU", email: "ada@example.com" }
const MAX_BUSY_TRIES = 3

const capturableFn = ({ event }: { event: any }) =>
  event.status === "requires_capture" || event.status === "succeeded" || deny("NotAuthorized")

const intentKey = (path: string) => slot(path, ({ memory }: any) => ({ intentId: memory.intentId }))
const commit = (op: string, path: string, f: (a: any) => unknown): Member => ({ op, verb: "commit", input: slot(path, f) })
const lookup = (op: string, path: string, f: (a: any) => unknown): Member => ({ op, verb: "lookup", input: slot(path, f) })
const cartInput = ({ memory }: any) => ({ cartId: memory.cartId, intentId: memory.intentId })
const intentInput = ({ memory }: any) => ({ intentId: memory.intentId })

type AltSpec = {
  target?: string
  tokens?: readonly TokenGuard[]
  guards?: ReadonlyArray<(g: any) => any>
  patch?: (u: any) => object
  members?: (path: string) => readonly Member[]
}
const alts = (base: string, specs: readonly AltSpec[], firstIndex = 0): readonly Alternative[] =>
  specs.map((s, i) => {
    const path = `${base}[${i + firstIndex}]`
    return {
      target: s.target ?? "self",
      at: { definition: D, path },
      tokens: s.tokens ?? [],
      guards: (s.guards ?? []).map((g, j) => slot(`${path}.guard[${j}]`, g)),
      ...(s.patch ? { patch: slot(`${path}.updateMemory`, s.patch) } : {}),
      members: s.members ? s.members(path) : [],
    }
  })
const on = (base: string, table: Record<string, readonly AltSpec[] | { first: number; alts: readonly AltSpec[] }>) =>
  Object.fromEntries(
    Object.entries(table).map(([tag, v]) => [
      tag,
      "first" in v ? alts(`${base}.on.${tag}`, v.alts, v.first) : alts(`${base}.on.${tag}`, v),
    ]),
  )

const startPatch = ({ event }: any) => ({
  cartId: event.cartId,
  intentId: event.intentId,
  address: savedAddress,
  receipt: null,
  authorized: false,
  afterUnsure: false,
  busyTries: 0,
  notice: "",
})
const start = [{ target: "CARD", patch: startPatch }] // the signed-in alternative only (section 11)
const withCard = ({ memory, event }: any) => ({ intentId: memory.intentId, paymentMethodId: event.paymentMethodId })
const payCommit = (p: string) => [commit("pay", `${p}.actions[0]`, withCard)]
const voidHold = (p: string) => [commit("void", `${p}.actions[0]`, intentInput)]
const placeOrder = (p: string, i = 0) => [commit("place", `${p}.actions[${i}]`, cartInput)]

const rootOn = on("on", {
  PayRequested: [
    { tokens: [{ node: "PAYING" }], members: payCommit },
    { target: "PAYING", patch: ({ event }) => ({ paymentMethodId: event.paymentMethodId, notice: "" }), members: payCommit },
  ],
  AbortPay: [{ members: (p) => [{ op: "pay", verb: "cancel", key: intentKey(`${p}.actions[0]`) }] }], // fixture only
  CartLoaded: [{ patch: ({ event }) => ({ totalCents: event.totalCents }) }],
  CardChosen: [{ patch: ({ event }) => ({ paymentMethodId: event.paymentMethodId }) }],
  Leave: [
    {
      target: "LEFT",
      guards: [({ memory }) => (memory.authorized && memory.receipt === null) || deny("NothingHeld")],
      members: voidHold,
    },
    { target: "LEFT" },
  ],
  Confirmed: [
    { tokens: [{ node: "LEFT" }], guards: [capturableFn], patch: () => ({ authorized: true }), members: voidHold },
    { target: "PLACING", tokens: [{ node: "IDLE" }], guards: [capturableFn], patch: () => ({ authorized: true }), members: placeOrder },
    {},
  ],
  PayUnsure: [
    { tokens: [{ node: "LEFT" }], patch: () => ({ notice: "Your bank may still show a pending charge." }) },
    { target: "UNSURE" },
  ],
  Declined: [{}],
  Busy: [{}],
  PayRefused: [{}],
  PayNotSent: [{}],
  IntentRead: [{}],
  IntentReadFailed: [{}],
  OrderSeen: [{}],
  CheckTick: [{}],
  Placed: [
    {
      target: "PAID",
      patch: ({ memory, event }) => ({
        receipt: { orderId: event.orderId, afterUnsure: memory.afterUnsure, alreadyPlaced: event.alreadyPlaced },
        authorized: false,
      }),
    },
  ],
  PlaceRefused: [{ patch: () => ({ notice: "We couldn't place the order. Try again." }) }],
  PlaceUnsure: [
    { tokens: [{ op: "place", verb: "retryable", times: 3 }], members: () => [{ op: "place", verb: "retry" }] },
    { target: "STUCK" },
  ],
  Voided: [{ patch: () => ({ authorized: false, notice: "The hold on your card was released." }) }],
  VoidRefused: [{ patch: () => ({ notice: "Your payment was captured before you left. We'll be in touch." }) }],
  VoidUnsure: [
    { tokens: [{ op: "void", verb: "retryable", times: 3 }], members: () => [{ op: "void", verb: "retry" }] },
    {
      patch: () => ({ notice: "We couldn't confirm the hold was released. Your bank releases it within 7 days." }),
      members: () => [{ op: "void", verb: "cancel" }],
    },
  ],
})

const node = (id: string, table: Parameters<typeof on>[1] = {}, schedules: Node["schedules"] = []): Node => ({
  id,
  parent: "root",
  on: on(`states.${id}`, table),
  schedules,
})

const nodes: Record<string, Node> = {
  root: { id: "root", on: rootOn, schedules: [] },
  IDLE: node("IDLE", { Start: start }),
  CARD: node("CARD"),
  PAYING: node(
    "PAYING",
    {
      CheckTick: [{ patch: () => ({ notice: "Still confirming with your bank…" }) }],
      // [0] in the real machine is the requires_action alternative to CHALLENGE, absent here (section 11).
      Confirmed: {
        first: 1,
        alts: [
          {
            target: "PLACING",
            guards: [capturableFn],
            patch: ({ event }) => ({ authorized: true, afterUnsure: event.afterUnsure, notice: "" }),
            members: placeOrder,
          },
          { target: "CARD", patch: () => ({ notice: "Your bank didn't authorize the payment." }) },
        ],
      },
      Declined: [{ target: "CARD", patch: ({ event }) => ({ notice: `Your card was declined (${event.code}).` }) }],
      Busy: [
        {
          target: "WAITING",
          guards: [({ memory }) => memory.busyTries < MAX_BUSY_TRIES || deny("TooBusy")],
          patch: ({ memory, event }) => ({ busyTries: memory.busyTries + 1, retryInMs: event.retryAfterMs }),
        },
        { target: "CARD", patch: () => ({ notice: "Payments are busy. Try again in a minute." }) },
      ],
      PayRefused: [{ target: "CARD", patch: ({ event }) => ({ notice: event.reason }) }],
      PayNotSent: [
        { guards: [({ event }) => event.why === "Rejected" || deny("NotADoubleClick")] },
        { target: "CARD", patch: () => ({ notice: "Your payment wasn't sent. You haven't been charged." }) },
      ],
      PayUnsure: [{ target: "UNSURE", patch: () => ({ afterUnsure: true }) }],
    },
    [{ id: "slow", send: "CheckTick", schedule: { ms: 8000 }, armOn: ["entry"], disarmOn: [] }],
  ),
  WAITING: node(
    "WAITING",
    {
      RetryNow: [
        {
          target: "PAYING",
          tokens: [{ op: "pay", verb: "idle", key: intentKey("states.WAITING.on.RetryNow[0].guard[0]") }],
          members: (p) => [
            commit("pay", `${p}.actions[0]`, ({ memory }: any) => ({
              intentId: memory.intentId,
              paymentMethodId: memory.paymentMethodId ?? "",
            })),
          ],
        },
        {},
      ],
    },
    [
      {
        id: "retry",
        send: "RetryNow",
        schedule: slot("states.WAITING.schedules.retry", ({ memory }: any) => memory.retryInMs),
        armOn: ["entry"],
        disarmOn: [],
      },
    ],
  ),
  UNSURE: node(
    "UNSURE",
    {
      CheckTick: [
        {
          members: (p) => [
            lookup("intent", `${p}.actions[0]`, intentInput),
            lookup("order", `${p}.actions[1]`, ({ memory }: any) => ({ cartId: memory.cartId })),
          ],
        },
      ],
      IntentRead: [
        {
          target: "PLACING",
          guards: [capturableFn],
          patch: () => ({ authorized: true }),
          members: (p) => [{ op: "pay", verb: "cancel", key: intentKey(`${p}.actions[0]`) }, ...placeOrder(p, 1)],
        },
        {
          target: "PAYING",
          tokens: [{ op: "pay", verb: "retryable", times: 3, key: intentKey("states.UNSURE.on.IntentRead[1].guard[1]") }],
          guards: [({ event }) => event.status === "requires_payment_method" || deny("Moved")],
          members: (p) => [{ op: "pay", verb: "retry", key: intentKey(`${p}.actions[0]`) }],
        },
        {},
      ],
      OrderSeen: [
        {
          target: "PAID",
          guards: [({ event }) => event.orderId !== "" || deny("NoOrder")],
          patch: ({ event }) => ({ receipt: { orderId: event.orderId, afterUnsure: true, alreadyPlaced: true } }),
          members: (p) => [
            { op: "intent", verb: "cancel" },
            { op: "pay", verb: "cancel", key: intentKey(`${p}.actions[1]`) },
          ],
        },
        {},
      ],
      PayUnsure: [{}],
    },
    [{ id: "check", send: "CheckTick", schedule: { ms: 3000 }, armOn: ["entry", "CheckTick"], disarmOn: [] }],
  ),
  PLACING: node("PLACING"),
  PAID: node("PAID", { Start: start, Done: [{ target: "IDLE" }] }),
  STUCK: node("STUCK", { CheckAgain: [{ target: "UNSURE" }] }),
  LEFT: node("LEFT", { Start: start }),
}

const fromPath = (op: string, name: string) => `operations.${op}.${name}`
const mapped = (op: string, name: string, event: string, f?: (v: any) => object) => ({
  event,
  ...(f ? { from: slot(fromPath(op, name), f) } : {}),
})

const make = (api: ShopApi): Compiled => {
  const ops: Record<string, Op> = {
    pay: {
      id: "pay",
      contract: "Checkout/pay",
      kind: "write",
      key: (i) => ({ intentId: i.intentId }),
      concurrency: "reject",
      timeoutMs: 60_000, // D8, not in the converted code
      commit: (input, { attempt }) =>
        api.confirm(input, { idempotencyKey: attempt.id }).pipe(
          Effect.map((v: any) => ({ ...v, afterUnsure: attempt.mayHaveApplied })),
          Effect.catchTag("IntentBusy", (e: any) =>
            attempt.mayHaveApplied && (e.status === "requires_capture" || e.status === "succeeded")
              ? Outcome.success({ intentId: input.intentId, status: e.status, clientSecret: "", afterUnsure: true })
              : Outcome.failure(e),
          ),
          unknownWhenLost,
        ) as Effect.Effect<unknown, unknown>,
      outcomes: {
        success: mapped("pay", "success", "Confirmed", (v) => ({
          status: v.status,
          clientSecret: v.clientSecret,
          afterUnsure: v.afterUnsure,
        })),
        failure: {
          CardDeclined: mapped("pay", "failure.CardDeclined", "Declined", (e) => ({ code: e.code })),
          Busy: mapped("pay", "failure.Busy", "Busy", (e) => ({ retryAfterMs: e.retryAfterMs ?? 1000 })),
          IntentBusy: mapped("pay", "failure.IntentBusy", "PayRefused", () => ({
            reason: "This payment changed elsewhere. Refresh to continue.",
          })),
          NotSent: mapped("pay", "failure.NotSent", "PayNotSent", (e) => ({ why: e.why })),
        },
        unknown: { event: "PayUnsure" },
      },
    },
    place: {
      id: "place",
      contract: "Checkout/place-order",
      kind: "write",
      key: (i) => ({ cartId: i.cartId }),
      concurrency: "reject",
      commit: (input, { attempt }) =>
        api.placeOrder(input, { idempotencyKey: attempt.id }).pipe(
          Effect.map((order: any) => ({ order, alreadyPlaced: false })),
          Effect.catchTag("OrderExists", (e: any) => Outcome.success({ order: e.order, alreadyPlaced: true })),
          unknownWhenLost,
        ) as Effect.Effect<unknown, unknown>,
      outcomes: {
        success: mapped("place", "success", "Placed", (r) => ({ orderId: r.order.orderId, alreadyPlaced: r.alreadyPlaced })),
        failure: { NotSent: { event: "PlaceRefused" } },
        unknown: { event: "PlaceUnsure" },
      },
    },
    void: {
      id: "void",
      contract: "Checkout/void-authorization",
      kind: "write",
      key: (i) => ({ intentId: i.intentId }),
      concurrency: "reject",
      commit: (input, { attempt }) =>
        api.voidAuthorization(input, { idempotencyKey: attempt.id }).pipe(unknownWhenLost) as Effect.Effect<unknown, unknown>,
      outcomes: {
        success: { event: "Voided" },
        failure: {
          AlreadyCaptured: mapped("void", "failure.AlreadyCaptured", "VoidRefused", (e) => ({ chargeId: e.chargeId })),
          NotSent: { event: "Voided" },
        },
        unknown: { event: "VoidUnsure" },
      },
    },
    intent: {
      id: "intent",
      contract: "Checkout/intent-status",
      kind: "read",
      key: (i) => ({ intentId: i.intentId }),
      concurrency: "reject", // unused for a read: D23
      commit: (input) => api.intent(input) as Effect.Effect<unknown, unknown>,
      outcomes: {
        success: mapped("intent", "success", "IntentRead", (v) => ({ status: v.status })),
        failure: { NoResponse: { event: "IntentReadFailed" }, Defect: { event: "IntentReadFailed" }, Interrupted: { event: "IntentReadFailed" } },
      },
    },
    order: {
      id: "order",
      contract: "Checkout/order-for-cart",
      kind: "read",
      key: (i) => ({ cartId: i.cartId }),
      concurrency: "reject",
      commit: (input) => api.orderFor(input) as Effect.Effect<unknown, unknown>,
      outcomes: {
        success: mapped("order", "value", "OrderSeen", (o) => ({ orderId: o?.orderId ?? "" })),
        failure: { NoResponse: { event: "IntentReadFailed" }, Defect: { event: "IntentReadFailed" }, Interrupted: { event: "IntentReadFailed" } },
      },
    },
  }
  return {
    id: D,
    nodes,
    root: "root",
    default: "IDLE",
    memory: {
      initial: slot("memory.initial", () => ({
        cartId: "",
        intentId: "",
        totalCents: 0,
        address: emptyAddress,
        addressDraft: emptyAddress,
        paymentMethodId: null,
        clientSecret: null,
        busyTries: 0,
        retryInMs: 0,
        afterUnsure: false,
        authorized: false,
        receipt: null,
        notice: "",
      })),
    },
    ops,
    persisted: true,
    modules: [],
  }
}

export const payFixture: Fixture = { id: D, make }
