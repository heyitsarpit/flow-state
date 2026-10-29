// editing list (B1 likes, B2 create with a temporary id), rewritten with calls-next in the in-machine-calls syntax. list.operations.ts is unchanged
// except `concurrency: "latest"` on setLike; commits put `attempt.id` on the wire (rule 7).
// ───────────────────────────────────────────────── list.definition.ts
import { definition, deny, Flow, machine } from "flow-state"
import { Schema } from "effect"
import { Issues } from "./list.operations"

export const MAX_LIKE_RESENDS = 3

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
  internalEvents: {
    LikeSynced: { id: Schema.String, liked: Schema.Boolean, count: Schema.Int },
    LikeGone: { id: Schema.String },
    LikeRefused: { id: Schema.String, superseded: Schema.Boolean },
    LikeSkipped: {},                                               // NotSent: superseded before it left (latest)
    LikeUnsure: Flow.uncertain({ id: Schema.String, superseded: Schema.Boolean }),
    Created: { tempId: Schema.String, id: Schema.String, number: Schema.Int, title: Schema.String },
    CreateFailed: { tempId: Schema.String, message: Schema.String },
    CreateUnsure: Flow.uncertain({ tempId: Schema.String }),
    Renamed: {}, ItemGone: { id: Schema.String }, RenameNotConfirmed: Flow.uncertain({}),
    Removed: { id: Schema.String }, RemoveNotConfirmed: Flow.uncertain({ id: Schema.String }),
    ReconcileLike: { id: Schema.String }, ToastExpired: {},
  },
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

export const ListMachine = machine(List, ({ S, E, O }) => {
  // B1: `latest` coalesces; the select reads the memory this turn flipped (rule 10).
  const like = O.Issues.setLike.commit(({ memory, event }) => ({ id: event.id, liked: byId(memory, event.id)?.like.desired ?? false }), {
    outcomes: {
      success: E.LikeSynced.from((v, { input }) => ({ id: input.id, liked: input.liked, count: v.count })),
      failure: {
        Gone: E.LikeGone.from((_r, { input }) => ({ id: input.id })),
        Refused: E.LikeRefused.from((_r, { input, superseded }) => ({ id: input.id, superseded })),
        NotSent: E.LikeSkipped,                                   // required: latest supersedes (rule 8)
      },
      unknown: E.LikeUnsure.from((_r, { input, superseded }) => ({ id: input.id, superseded })),
    },
  })
  // B2: the temp id is the create's key; the server stores it, so a re-sent POST returns the original issue.
  const create = O.Issues.createIssue.commit(({ event }) => ({ title: event.title, clientId: event.tempId }), {
    outcomes: {
      success: E.Created.from((v, { input }) => ({ tempId: input.clientId, id: v.id, number: v.number, title: input.title })),
      failure: {
        Invalid: E.CreateFailed.from((r, { input }) => ({ tempId: input.clientId, message: r.message })),
        Refused: E.CreateFailed.from((r, { input }) => ({ tempId: input.clientId, message: `Refused (${r.status})` })),
        NotSent: E.CreateFailed.from((r, { input }) => ({ tempId: input.clientId, message: `Not sent (${r.why})` })),   // reject (rule 8)
      },
      unknown: E.CreateUnsure.from((_r, { input }) => ({ tempId: input.clientId })),
    },
  })
  const renameOutcomes = { success: E.Renamed, failure: { Gone: E.ItemGone.from((_r, { input }) => ({ id: input.id })), Refused: E.RenameNotConfirmed, NotSent: E.RenameNotConfirmed }, unknown: E.RenameNotConfirmed }
  // Edit, and Created: the row's title after this turn's patch (rule 10) is the latest edit, queued or not
  const rename = O.Issues.renameIssue.commit(({ memory, event }) => ({ id: event.id, title: byId(memory, event.id)?.title ?? event.title }), { outcomes: renameOutcomes })
  const removeOutcomes = { success: E.Removed.from((_v, { input }) => ({ id: input.id })), failure: { Refused: E.RemoveNotConfirmed.from((_r, { input }) => ({ id: input.id })), NotSent: E.RemoveNotConfirmed.from((_r, { input }) => ({ id: input.id })) }, unknown: E.RemoveNotConfirmed.from((_r, { input }) => ({ id: input.id })) }
  const remove = O.Issues.removeIssue.commit(({ event }) => ({ id: event.id }), { outcomes: removeOutcomes })   // Delete, and Created (the real id)

  const rowSynced = ({ memory, event }) => { const i = byId(memory, event.id); return (i?.sync === "synced" && !i.deleted) || deny("NotCreatedYet") }
  const rowExists = ({ memory, event }) => byId(memory, event.id) !== undefined || deny("NoSuchRow")
  const tempRow = (pred: (i: Item) => boolean, code: string) => ({ memory, event }) => { const i = byTemp(memory, event.tempId); return (i !== undefined && pred(i)) || deny(code) }
  const adopt = (m: Memory, e: { tempId: string; id: string; number: number }) => ({
    items: editTemp(m, e.tempId, (i) => ({ ...i, id: e.id, number: e.number, sync: "synced", failure: null, pendingTitle: null })),
    selectedId: m.selectedId === e.tempId ? e.id : m.selectedId,
  })
  const notConfirmed = (toast: string) => ({ target: "self", updateMemory: ({ memory, event }) => ({ items: editId(memory, event.id, (i) => ({ ...i, deleted: false })), toast }) })

  return {
    default: S.READY,
    states: {
      READY: {
        schedules: {
          // ← NEW keyed schedule: one 3 s timer per row whose like is unknown
          reconcile: { keys: ({ memory }) => memory.likeUnsure, schedule: "3 seconds", send: E.ReconcileLike.from(({ key }) => ({ id: key })) },
          toastOff: { schedule: "4 seconds", send: E.ToastExpired, armOn: [E.LikeRefused, E.LikeUnsure, E.RenameNotConfirmed, E.RemoveNotConfirmed] },
        },
        on: {
          // ───────────── B1: likes
          Toggle: {
            guard: [rowSynced],
            target: "self",
            updateMemory: ({ memory, event }) => ({ items: editId(memory, event.id, (i) => withLike(i, { desired: !i.like.desired })) }),
            actions: [like],
          },
          LikeSynced: { target: "self", updateMemory: ({ memory, event }) => ({ items: editId(memory, event.id, (i) => withLike(i, { confirmed: event.liked, count: event.count })) }) },
          LikeGone: { target: "self", updateMemory: ({ memory, event }) => dropId(memory, event.id) },
          LikeRefused: [
            { target: "self", guard: ({ event }) => event.superseded || deny("Latest") },   // a newer click is on its way: never undo it
            { target: "self", updateMemory: ({ memory, event }) => ({ items: editId(memory, event.id, (i) => withLike(i, { desired: i.like.confirmed })), toast: "Could not update" }) },
          ],
          LikeSkipped: { target: "self" },
          LikeUnsure: [
            { target: "self", guard: ({ event }) => event.superseded || deny("Latest") },
            { target: "self", guard: (g) => like.retryCount(g, { id: g.event.id }) < MAX_LIKE_RESENDS || deny("GaveUp"), updateMemory: ({ memory, event }) => ({ likeUnsure: [...without(memory.likeUnsure, event.id), event.id] }) },
            { target: "self", updateMemory: ({ memory, event }) => ({ likeUnsure: without(memory.likeUnsure, event.id), toast: "Couldn't confirm your like" }) },
          ],
          ReconcileLike: [
            { target: "self", updateMemory: ({ memory, event }) => ({ likeUnsure: without(memory.likeUnsure, event.id) }), actions: [like.retry(({ event }) => ({ id: event.id }))] },
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
            actions: [create],
          },
          Created: [
            { guard: tempRow((i) => i.deleted, "NotDeleted"), target: "self", updateMemory: ({ memory, event }) => adopt(memory, event), actions: [remove] },
            { guard: tempRow((i) => i.pendingTitle !== null, "NoQueuedEdit"), target: "self", updateMemory: ({ memory, event }) => adopt(memory, event), actions: [rename] },
            { target: "self", updateMemory: ({ memory, event }) => adopt(memory, event) },
          ],
          CreateFailed: [
            { guard: tempRow((i) => i.deleted, "NotDeleted"), target: "self", updateMemory: ({ memory, event }) => dropId(memory, event.tempId) },
            { target: "self", updateMemory: ({ memory, event }) => ({ items: editTemp(memory, event.tempId, (i) => ({ ...i, sync: "failed", failure: event.message })) }) },
          ],
          CreateUnsure: [
            // a hidden row (deleted while sending) has no Retry button: ask again ourselves, same Attempt, at most 4 sends
            { guard: [tempRow((i) => i.deleted, "NotDeleted"), (g) => create.retryCount(g, { clientId: g.event.tempId }) < 3 || deny("GaveUp")], target: "self", actions: [create.retry(({ event }) => ({ clientId: event.tempId }))] },
            { target: "self", updateMemory: ({ memory, event }) => ({ items: editTemp(memory, event.tempId, (i) => ({ ...i, sync: "unsure" })) }) },
          ],
          Retry: {
            guard: [({ memory, event }) => ["failed", "unsure"].includes(byId(memory, event.id)?.sync ?? "") || deny("NothingToRetry"), create.idle(({ event }) => ({ clientId: event.id }))],
            target: "self",
            updateMemory: ({ memory, event }) => ({ items: editId(memory, event.id, (i) => ({ ...i, sync: "sending", failure: null })) }),
            actions: [create.retry(({ event }) => ({ clientId: event.id }))],          // same Attempt; NothingToResend would end NotSent (rule 4)
          },

          Edit: [
            { guard: [rowSynced], target: "self", updateMemory: ({ memory, event }) => ({ items: editId(memory, event.id, (i) => ({ ...i, title: event.title })) }), actions: [rename] },
            {
              guard: [({ memory, event }) => { const i = byId(memory, event.id); return (i !== undefined && !i.deleted && i.sync !== "synced") || deny("CannotEdit") }],
              target: "self",
              updateMemory: ({ memory, event }) => ({ items: editId(memory, event.id, (i) => ({ ...i, title: event.title, pendingTitle: event.title })) }),
            },
          ],
          Delete: [
            { guard: [rowSynced, remove.idle(({ event }) => ({ id: event.id }))], target: "self", updateMemory: ({ memory, event }) => ({ items: editId(memory, event.id, (i) => ({ ...i, deleted: true })) }), actions: [remove] },
            { guard: [({ memory, event }) => byId(memory, event.id)?.sync === "failed" || deny("NotFailed")], target: "self", updateMemory: ({ memory, event }) => dropId(memory, event.id) },
            { guard: [rowExists], target: "self", updateMemory: ({ memory, event }) => ({ items: editId(memory, event.id, (i) => ({ ...i, deleted: true })) }) },   // Created deletes it
          ],

          Renamed: { target: "self" },
          ItemGone: { target: "self", updateMemory: ({ memory, event }) => dropId(memory, event.id) },
          RenameNotConfirmed: { target: "self", updateMemory: () => ({ toast: "Couldn't save the title" }) },
          Removed: { target: "self", updateMemory: ({ memory, event }) => dropId(memory, event.id) },
          RemoveNotConfirmed: notConfirmed("Couldn't delete"),

          Open: { guard: [rowExists], target: "self", updateMemory: ({ event }) => ({ selectedId: event.id }) },
        },
      },
    },
  }
})
