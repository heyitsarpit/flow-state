// lifecycle M1 (save, then leave the screen), rewritten with calls-next. m1.save.operations.ts is unchanged except
// `attempt.idempotencyKey` (rule 7).
// ───────────────────────────────────────────────── m1.save.definition.ts
import { Duration, Schema } from "effect"
import { definition, deny, Flow, machine } from "flow-state"
import { Docs, DocInput } from "./m1.save.operations"

const Toast = Schema.Struct({ text: Schema.String, kind: Schema.Literals(["ok", "error", "warn"]), link: Schema.NullOr(Schema.String), ms: Schema.Int })

export const Shell = definition({
  id: "App/Shell",
  states: [{ DOC: ["EDITING"] }, "LIST", "SETTINGS"],      // no SAVING state: "saving" is `calls.save.at(key).pending`
  events: { Edit: { title: Schema.String, body: Schema.String }, Save: {}, OpenList: {}, OpenSettings: {}, OpenDoc: {}, CheckSave: {}, DismissToast: {} },
  internalEvents: { ToastExpired: {} },
  calls: { save: Docs.save },                              // ← NEW
  memory: {
    doc: Flow.initial(DocInput, { docId: "d1", title: "", body: "" }),
    savedBody: Flow.initial(Schema.String, ""),
    dirty: Flow.initial(Schema.Boolean, false),
    toast: Flow.initial(Schema.NullOr(Toast), null),
  },
  operations: { Docs },
})

// ───────────────────────────────────────────────── m1.save.machine.ts
export const ShellMachine = machine(Shell, ({ S, E, O, C }) => {
  const toast = (kind: "ok" | "error" | "warn", text: string, link: string | null = null) => ({ toast: { kind, text, link, ms: link ? 10_000 : 4_000 } })
  const key = ({ memory }) => ({ docId: memory.doc.docId })
  // navigation is blocked only while unsaved; a save in flight counts as saved (it is the app's, and it is never lost)
  const clean = ({ memory, calls }) => !memory.dirty || calls.save.at(key({ memory })).pending || deny("Unsaved")

  return {
    default: S.DOC,
    schedules: {
      toastExpiry: { schedule: ({ memory }) => Duration.millis(memory.toast?.ms ?? 4000), send: E.ToastExpired, armOn: [E["save.success"], E["save.Conflict"], E["save.Invalid"], E["save.unknown"]], disarmOn: [E.DismissToast] },
    },
    // The save is the app's: started with target "self" in EDITING, its endings fall through to these handlers
    // whether the user is still there (current) or has left (late, rule 2). Written once; none moves the user.
    on: {
      "save.success": {
        target: "self",
        updateMemory: ({ memory, event }) => ({ dirty: memory.doc.body !== event.input.body, savedBody: event.input.body, ...toast("ok", "Saved") }),
        actions: [O.Docs.list.invalidate(() => ({}))],
      },
      "save.Conflict": { target: "self", updateMemory: ({ event }) => ({ dirty: true, ...toast("error", `Could not save: someone else saved first (rev ${event.error.serverRev})`, event.input.docId) }) },
      "save.Invalid": { target: "self", updateMemory: ({ event }) => ({ dirty: true, ...toast("error", `Could not save: ${event.error.reason}`, event.input.docId) }) },
      "save.unknown": { target: "self", updateMemory: ({ event }) => toast("warn", "Could not confirm the save. It may have gone through.", event.input.docId) },
      CheckSave: { target: "self", actions: [C.save.resend(key)] },   // same Attempt; NothingToResend and InFlight are implicit (rule 4)
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
              Save: { target: "self", guard: ({ memory }) => memory.dirty || deny("Clean"), actions: [C.save.start(({ memory }) => memory.doc)] },   // a second Save while one is in flight: Denied InFlight
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
