// lifecycle M1 (save, then leave the screen), rewritten with calls-next in the in-machine-calls syntax.
// m1.save.operations.ts is unchanged; the commit puts `attempt.id` on the wire (rule 7).
// ───────────────────────────────────────────────── m1.save.definition.ts
import { Duration, Schema } from "effect"
import { definition, deny, Flow, machine } from "flow-state"
import { Docs, DocInput } from "./m1.save.operations"

const Toast = Schema.Struct({ text: Schema.String, kind: Schema.Literals(["ok", "error", "warn"]), link: Schema.NullOr(Schema.String), ms: Schema.Int })

export const Shell = definition({
  id: "App/Shell",
  states: [{ DOC: ["EDITING"] }, "LIST", "SETTINGS"],      // no SAVING state: "saving" is `save.pending(s, key)`
  events: { Edit: { title: Schema.String, body: Schema.String }, Save: {}, OpenList: {}, OpenSettings: {}, OpenDoc: {}, CheckSave: {}, DismissToast: {} },
  internalEvents: {
    Saved: { docId: Schema.String, body: Schema.String },
    SaveRejected: { docId: Schema.NullOr(Schema.String), reason: Schema.String },   // Conflict, Invalid and NotSent: several endings, one event
    SaveUnsure: Flow.uncertain({ docId: Schema.String }),
    ToastExpired: {},
  },
  memory: {
    doc: Flow.initial(DocInput, { docId: "d1", title: "", body: "" }),
    savedBody: Flow.initial(Schema.String, ""),
    dirty: Flow.initial(Schema.Boolean, false),
    toast: Flow.initial(Schema.NullOr(Toast), null),
  },
  operations: { Docs },
})

// ───────────────────────────────────────────────── m1.save.machine.ts
export const ShellMachine = machine(Shell, ({ S, E, O }) => {
  const toast = (kind: "ok" | "error" | "warn", text: string, link: string | null = null) => ({ toast: { kind, text, link, ms: link ? 10_000 : 4_000 } })
  const key = ({ memory }) => ({ docId: memory.doc.docId })
  const save = O.Docs.save.commit(({ memory }) => memory.doc, {
    outcomes: {
      success: E.Saved.from((_v, { input }) => ({ docId: input.docId, body: input.body })),
      failure: {
        Conflict: E.SaveRejected.from((r, { input }) => ({ docId: input.docId, reason: `someone else saved first (rev ${r.serverRev})` })),
        Invalid: E.SaveRejected.from((r, { input }) => ({ docId: input.docId, reason: r.reason })),
        NotSent: E.SaveRejected.from((r, { input }) => ({ docId: input?.docId ?? null, reason: `not sent (${r.why})` })),   // reject (rule 8); CheckSave's NothingToResend has no input (D17)
      },
      unknown: E.SaveUnsure.from((_r, { input }) => ({ docId: input.docId })),
    },
  })
  // navigation is blocked only while unsaved; a save in flight counts as saved (it is the app's, and it is never lost)
  const clean = (g) => !g.memory.dirty || save.pending(g, key(g)) || deny("Unsaved")

  return {
    default: S.DOC,
    schedules: {
      toastExpiry: { schedule: ({ memory }) => Duration.millis(memory.toast?.ms ?? 4000), send: E.ToastExpired, armOn: [E.Saved, E.SaveRejected, E.SaveUnsure], disarmOn: [E.DismissToast] },
    },
    // The save is the app's: started with target "self" in EDITING, its events fall through to these handlers
    // whether the user is still there (current) or has left (late, rule 2). Written once; none moves the user.
    on: {
      Saved: {
        target: "self",
        updateMemory: ({ memory, event }) => ({ dirty: memory.doc.body !== event.body, savedBody: event.body, ...toast("ok", "Saved") }),
        actions: [O.Docs.list.invalidate(() => ({}))],
      },
      SaveRejected: { target: "self", updateMemory: ({ event }) => ({ dirty: true, ...toast("error", `Could not save: ${event.reason}`, event.docId) }) },
      SaveUnsure: { target: "self", updateMemory: ({ event }) => toast("warn", "Could not confirm the save. It may have gone through.", event.docId) },
      CheckSave: { target: "self", guard: [save.idle(key)], actions: [save.retry(key)] },   // same Attempt; with nothing to re-send it ends NotSent (rule 4)
      ToastExpired: { target: "self", updateMemory: () => ({ toast: null }) },
      DismissToast: { target: "self", updateMemory: () => ({ toast: null }) },
    },
    states: {
      DOC: {
        default: S.DOC.EDITING,
        states: {
          EDITING: {
            on: {
              Edit: { target: "self", updateMemory: ({ memory, event }) => ({ doc: { ...memory.doc, title: event.title, body: event.body }, dirty: true }) },
              Save: { target: "self", guard: [({ memory }) => memory.dirty || deny("Clean"), save.idle(key)], actions: [save] },   // a second Save while one is in flight: Denied InFlight
              OpenList: { target: S.LIST, guard: clean },
              OpenSettings: { target: S.SETTINGS, guard: clean },
            },
          },
        },
      },
      LIST: { on: { OpenDoc: S.DOC, OpenSettings: S.SETTINGS } },
      SETTINGS: { on: { OpenDoc: S.DOC, OpenList: S.LIST } },
    },
  }
})
