import { Schema } from "effect";
import { definition, deny, Flow, machine } from "../../../src/index.ts";
import { me } from "../operations/reads.ts";
import { setUsername } from "../operations/writes.ts";
import type { Taken } from "../services.ts";

/**
 * A signed-in account's session, named by its email and kept across reloads: its handle, first
 * computed from the email, its refresh token, kept out of outside snapshots, and whether the
 * redirect after sign-up is held while the handle is saved.
 */
export const AuthSession = definition({
  id: "Auth/Session",
  persist: true,
  states: [
    "SIGNED_OUT",
    "LOADING",
    "CHOOSING",
    "CONFIRMING",
    "SAVING",
    "HANDLE_FAILED",
    "SIGNED_IN",
  ],
  events: {
    SignedIn: {},
    Handle: { handle: Schema.String },
    SubmitHandle: {},
    ConfirmHandle: {},
    Retry: {},
  },
  internalEvents: {
    Saved: { handle: Schema.String },
    Refused: { handle: Schema.String },
    NotSaved: { why: Schema.String },
    SaveUnsure: Flow.uncertain({}),
    MeRead: { handle: Schema.String, refreshToken: Schema.String },
    MeFailed: {},
  },
  memory: {
    email: Flow.input(Schema.String),
    handle: Flow.initial(Schema.String, (fields) => String(fields["email"]).split("@")[0] ?? ""),
    refreshToken: Flow.private(Flow.initial(Schema.String, "")),
    edited: Flow.initial(Schema.Boolean, false),
    held: Flow.initial(Schema.Boolean, false),
    saved: Flow.initial(Schema.String, ""),
    notice: Flow.initial(Schema.String, ""),
  },
  operations: ({ E }) => ({
    save: setUsername.outcomes({
      success: E.Saved.from((v: { readonly handle: string }) => ({ handle: v.handle })),
      failure: { Taken: E.Refused.from((e: Taken) => ({ handle: e.handle })) },
      notSent: E.NotSaved.from((e: { readonly why: string }) => ({ why: e.why })),
      unknown: E.SaveUnsure,
    }),
    me: me.outcomes({
      success: E.MeRead.from((v: { readonly handle: string; readonly refreshToken: string }) => v),
      failure: { Unanswered: E.MeFailed, Defect: E.MeFailed, Interrupted: E.MeFailed },
    }),
  }),
});

type Memory = { readonly email: string; readonly handle: string; readonly edited: boolean };

const handleOf = ({ memory }: { readonly memory: Memory }) => ({
  email: memory.email,
  handle: memory.handle,
});

const account = ({ memory }: { readonly memory: Memory }) => ({ email: memory.email });

/**
 * The session: signing in reads the account; one with no saved handle is new and chooses one; a blank one is skipped and never saved; an unedited
 * prefill asks to be confirmed; a save holds the redirect until it lands, and a refused or unsure
 * one keeps the handle and the hold until a retry lands: an unsure save is sent once more by itself,
 * then again as the same Attempt on Retry; a refused one is saved anew.
 */
export const AuthSessionMachine = machine(AuthSession, ({ S, O }) => {
  const save = {
    target: S.SAVING,
    updateMemory: () => ({ held: true, notice: "" }),
    actions: [O.save.commit(handleOf)],
  };

  return {
    default: S.SIGNED_OUT,
    on: {
      Handle: { updateMemory: ({ event }) => ({ handle: event.handle, edited: true }) },
      MeRead: {},
      MeFailed: {},
      NotSaved: {},
    },
    states: {
      SIGNED_OUT: { on: { SignedIn: { target: S.LOADING, actions: [O.me.lookup(account)] } } },
      LOADING: {
        on: {
          MeRead: [
            {
              target: S.CHOOSING,
              guard: [({ event }) => event.handle === "" || deny("HasHandle")],
              updateMemory: ({ event }) => ({ refreshToken: event.refreshToken }),
            },
            {
              target: S.SIGNED_IN,
              updateMemory: ({ event }) => ({
                refreshToken: event.refreshToken,
                handle: event.handle,
                saved: event.handle,
              }),
            },
          ],
          MeFailed: {
            target: S.SIGNED_OUT,
            updateMemory: () => ({ notice: "we could not load your account" }),
          },
        },
      },
      CHOOSING: {
        on: {
          SubmitHandle: [
            {
              target: S.SIGNED_IN,
              guard: [({ memory }) => memory.handle === "" || deny("HasHandle")],
            },
            { target: S.CONFIRMING, guard: [({ memory }) => !memory.edited || deny("Edited")] },
            save,
          ],
        },
      },
      CONFIRMING: { on: { ConfirmHandle: save, SubmitHandle: save } },
      SAVING: {
        on: {
          SubmitHandle: { actions: [O.save.commit(handleOf)] },
          Saved: {
            target: S.SIGNED_IN,
            updateMemory: ({ event }) => ({ held: false, saved: event.handle }),
          },
          Refused: {
            target: S.HANDLE_FAILED,
            updateMemory: ({ event }) => ({ notice: `${event.handle} is taken` }),
          },
          SaveUnsure: [
            { guard: [O.save.retryable(account, { times: 1 })], actions: [O.save.retry(account)] },
            {
              target: S.HANDLE_FAILED,
              updateMemory: () => ({ notice: "we could not save your handle" }),
            },
          ],
          NotSaved: [
            { guard: [({ event }) => event.why === "Rejected" || deny("NotADoubleSubmit")] },
            {
              target: S.HANDLE_FAILED,
              updateMemory: ({ event }) => ({ notice: `not saved: ${event.why}` }),
            },
          ],
        },
      },
      HANDLE_FAILED: {
        on: {
          Retry: [
            {
              target: S.SAVING,
              guard: [O.save.retryable(account, { times: 3 })],
              updateMemory: () => ({ notice: "" }),
              actions: [O.save.retry(account)],
            },
            save,
          ],
          SubmitHandle: save,
        },
      },
      SIGNED_IN: {},
    },
  };
});
