// editing list (B1 likes, B2 create with a temporary id), rewritten with calls-next. list.operations.ts is unchanged
// except `concurrency: "latest"` on setLike and `attempt.idempotencyKey` (rule 7).
// ───────────────────────────────────────────────── list.definition.ts
import { definition, deny, Flow, machine } from "flow-state"
import { Schema } from "effect"
import { Issues } from "./list.operations"

export const MAX_LIKE_SENDS = 4

export const Item = Schema.Struct({
  id: Schema.String,                        // the temp id until the server answers, then the real one
  tempId: Schema.String,                    // never changes: the create's key
  title: Schema.String,
  number: Schema.NullOr(Schema.Int),
  sync: Schema.Literals(["sending", "failed", "unsure", "synced"]),
  failure: Schema.NullOr(Schema.String),
  pendingTitle: Schema.NullOr(Schema.String), // an edit made before the real id exists, sent after the create
  deleted: Schema.Boolean,
  like: Schema.Struct({ desired: Schema.Boolean, confirmed: Schema.Boolean, count: Schema.Int }),
})
export type Item = typeof Item.Type

export const List = definition({
  id: "Issues/List",
  states: ["READY"],
  events: {
    Toggle: { id: Schema.String },
    Create: { tempId: Schema.String, title: Schema.String },
    Edit: { id: Schema.String, title: Schema.String },
    Delete: { id: Schema.String },
    Retry: { id: Schema.String },
    Open: { id: Schema.String },
  },
  internalEvents: { ReconcileLike: { id: Schema.String }, ToastExpired: {} },
  calls: { like: Issues.setLike, create: Issues.createIssue, rename: Issues.renameIssue, remove: Issues.removeIssue },  // ← NEW
  memory: {
    items: Flow.input(Schema.Array(Item)),
    likeUnsure: Flow.initial(Schema.Array(Schema.String), []),     // rows whose like is being reconciled: the keyed schedule's keys
    selectedId: Flow.initial(Schema.NullOr(Schema.String), null),
    toast: Flow.initial(Schema.NullOr(Schema.String), null),
  },
  operations: { Issues },
})

// ───────────────────────────────────────────────── list.machine.ts
type Memory = typeof List.Memory.Type
const byId = (m: Memory, id: string) => m.items.find((i) => i.id === id)
const byTemp = (m: Memory, tempId: string) => m.items.find((i) => i.tempId === tempId)
const editId = (m: Memory, id: string, f: (i: Item) => Item) => m.items.map((i) => (i.id === id ? f(i) : i))
const editTemp = (m: Memory, tempId: string, f: (i: Item) => Item) => m.items.map((i) => (i.tempId === tempId ? f(i) : i))
const withLike = (i: Item, p: Partial<Item["like"]>): Item => ({ ...i, like: { ...i.like, ...p } })
const dropId = (m: Memory, id: string) => ({ items: m.items.filter((i) => i.id !== id), selectedId: m.selectedId === id ? null : m.selectedId })
const without = (ids: ReadonlyArray<string>, id: string) => ids.filter((x) => x !== id)

export const likeView = (i: Item, s: { calls }) => ({   // the heart shows the last click; uncertain while the server may differ
  liked: i.like.desired,
  count: i.like.count + (i.like.desired ? 1 : 0) - (i.like.confirmed ? 1 : 0),
  uncertain: s.calls.like.at({ id: i.id }).last?.channel === "unknown",
})

export const ListMachine = machine(List, ({ S, E, C }) => {
  const rowSynced = ({ memory, event }) => { const i = byId(memory, event.id); return (i?.sync === "synced" && !i.deleted) || deny("NotCreatedYet") }
  const rowExists = ({ memory, event }) => byId(memory, event.id) !== undefined || deny("NoSuchRow")
  const tempRow = (pred: (i: Item) => boolean, code: string) => ({ memory, event }) => { const i = byTemp(memory, event.input.clientId); return (i !== undefined && pred(i)) || deny(code) }
  const adopt = (m: Memory, tempId: string, v: { id: string; number: number }) => ({
    items: editTemp(m, tempId, (i) => ({ ...i, id: v.id, number: v.number, sync: "synced", failure: null, pendingTitle: null })),
    selectedId: m.selectedId === tempId ? v.id : m.selectedId,
  })
  const createFailed = (message: (e) => string) => [
    { guard: tempRow((i) => i.deleted, "NotDeleted"), target: "self", updateMemory: ({ memory, event }) => dropId(memory, event.input.clientId) },
    { target: "self", updateMemory: ({ memory, event }) => ({ items: editTemp(memory, event.input.clientId, (i) => ({ ...i, sync: "failed", failure: message(event.error) })) }) },
  ]
  const remove = C.remove.start(({ event }) => ({ id: event.id }))

  return {
    default: S.READY,
    states: {
      READY: {
        schedules: {
          // ← NEW keyed schedule: one 3 s timer per row whose like is unknown
          reconcile: { keys: ({ memory }) => memory.likeUnsure, schedule: "3 seconds", send: E.ReconcileLike.from(({ key }) => ({ id: key })) },
          toastOff: { schedule: "4 seconds", send: E.ToastExpired, armOn: [E["like.Refused"], E["like.unknown"], E["rename.Refused"], E["rename.unknown"], E["remove.Refused"], E["remove.unknown"]] },
        },
        on: {
          // ───────────── B1: likes. `latest` coalesces; the input reads the memory this turn wrote (rule 10).
          Toggle: {
            guard: [rowSynced],
            target: "self",
            updateMemory: ({ memory, event }) => ({ items: editId(memory, event.id, (i) => withLike(i, { desired: !i.like.desired })) }),
            actions: [C.like.start(({ memory, event }) => ({ id: event.id, liked: byId(memory, event.id)?.like.desired ?? false }))],
          },
          "like.success": { target: "self", updateMemory: ({ memory, event }) => ({ items: editId(memory, event.input.id, (i) => withLike(i, { confirmed: event.input.liked, count: event.value.count })) }) },
          "like.Gone": { target: "self", updateMemory: ({ memory, event }) => dropId(memory, event.input.id) },
          "like.Refused": [
            { target: "self", guard: ({ event }) => event.superseded || deny("Latest") },   // a newer click is on its way: never undo it
            { target: "self", updateMemory: ({ memory, event }) => ({ items: editId(memory, event.input.id, (i) => withLike(i, { desired: i.like.confirmed })), toast: "Could not update" }) },
          ],
          "like.NotSent": { target: "self" },                                               // superseded before it left
          "like.unknown": [
            { target: "self", guard: ({ event }) => event.superseded || deny("Latest") },
            { target: "self", guard: ({ event }) => event.attempt.sends < MAX_LIKE_SENDS || deny("GaveUp"), updateMemory: ({ memory, event }) => ({ likeUnsure: [...without(memory.likeUnsure, event.input.id), event.input.id] }) },
            { target: "self", updateMemory: ({ memory, event }) => ({ likeUnsure: without(memory.likeUnsure, event.input.id), toast: "Couldn't confirm your like" }) },
          ],
          ReconcileLike: [
            { target: "self", updateMemory: ({ memory, event }) => ({ likeUnsure: without(memory.likeUnsure, event.id) }), actions: [C.like.resend(({ event }) => ({ id: event.id }))] },
            { target: "self", updateMemory: ({ memory, event }) => ({ likeUnsure: without(memory.likeUnsure, event.id) }) },   // a newer click is in flight
          ],
          ToastExpired: { target: "self", updateMemory: () => ({ toast: null }) },

          // ───────────── B2: create with a temporary id
          Create: {
            guard: [({ event }) => event.title.trim() !== "" || deny("EmptyTitle"), ({ memory, event }) => byTemp(memory, event.tempId) === undefined || deny("DuplicateTempId")],
            target: "self",
            updateMemory: ({ memory, event }) => ({
              items: [...memory.items, { id: event.tempId, tempId: event.tempId, title: event.title, number: null, sync: "sending", failure: null, pendingTitle: null, deleted: false, like: { desired: false, confirmed: false, count: 0 } }],
            }),
            actions: [C.create.start(({ event }) => ({ title: event.title, clientId: event.tempId }))],
          },
          "create.success": [
            { guard: tempRow((i) => i.deleted, "NotDeleted"), target: "self", updateMemory: ({ memory, event }) => adopt(memory, event.input.clientId, event.value), actions: [C.remove.start(({ event }) => ({ id: event.value.id }))] },
            { guard: tempRow((i) => i.pendingTitle !== null, "NoQueuedEdit"), target: "self", updateMemory: ({ memory, event }) => adopt(memory, event.input.clientId, event.value),
              actions: [C.rename.start(({ event, memory }) => ({ id: event.value.id, title: byId(memory, event.value.id)?.title ?? event.input.title }))] },   // reads this turn's adopted row (rule 10)
            { target: "self", updateMemory: ({ memory, event }) => adopt(memory, event.input.clientId, event.value) },
          ],
          "create.Invalid": createFailed((e) => e.message),
          "create.Refused": createFailed((e) => `Refused (${e.status})`),
          "create.unknown": [
            // a hidden row (deleted while sending) has no Retry button: ask again ourselves, same Attempt, at most 4 sends
            { guard: [tempRow((i) => i.deleted, "NotDeleted"), ({ event }) => event.attempt.sends < 4 || deny("GaveUp")], target: "self", actions: [C.create.resend(({ event }) => event.attempt.key)] },
            { target: "self", updateMemory: ({ memory, event }) => ({ items: editTemp(memory, event.input.clientId, (i) => ({ ...i, sync: "unsure" })) }) },
          ],
          Retry: {
            guard: [({ memory, event }) => ["failed", "unsure"].includes(byId(memory, event.id)?.sync ?? "") || deny("NothingToRetry")],
            target: "self",
            updateMemory: ({ memory, event }) => ({ items: editId(memory, event.id, (i) => ({ ...i, sync: "sending", failure: null })) }),
            actions: [C.create.resend(({ event }) => ({ clientId: event.id }))],          // same Attempt; NothingToResend is implicit (rule 4)
          },

          Edit: [
            { guard: [rowSynced], target: "self", updateMemory: ({ memory, event }) => ({ items: editId(memory, event.id, (i) => ({ ...i, title: event.title })) }), actions: [C.rename.start(({ event }) => ({ id: event.id, title: event.title }))] },
            {
              guard: [({ memory, event }) => { const i = byId(memory, event.id); return (i !== undefined && !i.deleted && i.sync !== "synced") || deny("CannotEdit") }],
              target: "self",
              updateMemory: ({ memory, event }) => ({ items: editId(memory, event.id, (i) => ({ ...i, title: event.title, pendingTitle: event.title })) }),
            },
          ],
          Delete: [
            { guard: [rowSynced], target: "self", updateMemory: ({ memory, event }) => ({ items: editId(memory, event.id, (i) => ({ ...i, deleted: true })) }), actions: [remove] },
            { guard: [({ memory, event }) => byId(memory, event.id)?.sync === "failed" || deny("NotFailed")], target: "self", updateMemory: ({ memory, event }) => dropId(memory, event.id) },
            { guard: [rowExists], target: "self", updateMemory: ({ memory, event }) => ({ items: editId(memory, event.id, (i) => ({ ...i, deleted: true })) }) },   // create.success deletes it
          ],

          "rename.success": { target: "self" },
          "rename.Gone": { target: "self", updateMemory: ({ memory, event }) => dropId(memory, event.input.id) },
          "rename.Refused": { target: "self", updateMemory: () => ({ toast: "Couldn't save the title" }) },
          "rename.unknown": { target: "self", updateMemory: () => ({ toast: "Couldn't save the title" }) },
          "remove.success": { target: "self", updateMemory: ({ memory, event }) => dropId(memory, event.input.id) },
          "remove.Refused": { target: "self", updateMemory: ({ memory, event }) => ({ items: editId(memory, event.input.id, (i) => ({ ...i, deleted: false })), toast: "Couldn't delete" }) },
          "remove.unknown": { target: "self", updateMemory: ({ memory, event }) => ({ items: editId(memory, event.input.id, (i) => ({ ...i, deleted: false })), toast: "Couldn't delete" }) },

          Open: { guard: [rowExists], target: "self", updateMemory: ({ event }) => ({ selectedId: event.id }) },
        },
      },
    },
  }
})
