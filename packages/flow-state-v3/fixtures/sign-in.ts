import { Schema } from "effect";
import { definition, deny, Flow, machine, transaction } from "../src/index.ts";
import { part, Server, type ServerModel, served } from "./part.ts";

const MAX_TRIES = 5;

const beginServer = {
  answers: [
    { weight: 5, answer: { _tag: "ok", value: {} } },
    { weight: 1, answer: { _tag: "fail", tag: "Throttled", fields: {} } },
  ],
  classify: () => false,
} as const satisfies ServerModel;

const verifyServer = {
  answers: [
    { weight: 3, answer: { _tag: "ok", value: {} } },
    { weight: 3, answer: { _tag: "fail", tag: "WrongCode", fields: {} } },
  ],
  classify: () => false,
} as const satisfies ServerModel;

const begin = transaction({
  id: "Auth/begin",
  input: { email: Schema.String },
  key: [],
  concurrency: "reject",
  services: [Server],
  commit: served("begin", beginServer),
});

const verify = transaction({
  id: "Auth/verify",
  input: { email: Schema.String, code: Schema.String },
  key: [],
  concurrency: "reject",
  services: [Server],
  commit: served("verify", verifyServer),
});

const SignIn = definition({
  id: "Auth/SignIn",
  persist: false,
  states: ["EMAIL", "CODE", "COOLDOWN", "LOCKED", "DONE"],
  events: { Email: { email: Schema.String }, Code: { code: Schema.String }, Resend: {} },
  internalEvents: {
    Sent: {},
    Throttled: {},
    Refused: { why: Schema.String },
    Verified: {},
    Wrong: {},
    Unsure: Flow.uncertain({}),
    Cooled: {},
    Unlock: {},
  },
  memory: {
    email: Flow.initial(Schema.String, ""),
    tries: Flow.initial(Schema.Number, 0),
    notice: Flow.initial(Schema.String, ""),
  },
  operations: ({ E }) => ({
    begin: begin.outcomes({
      success: E.Sent,
      failure: {
        Throttled: E.Throttled,
        NotSent: E.Refused.from((e: { readonly why: string }) => ({ why: e.why })),
      },
      unknown: E.Unsure,
    }),
    verify: verify.outcomes({
      success: E.Verified,
      failure: {
        WrongCode: E.Wrong,
        NotSent: E.Refused.from((e: { readonly why: string }) => ({ why: e.why })),
      },
      unknown: E.Unsure,
    }),
  }),
});

type Email = { readonly email: string };

const typed = ({ event }: { readonly event: Email }) => ({ email: event.email });

const saved = ({ memory }: { readonly memory: Email }) => ({ email: memory.email });

const withCode = ({
  memory,
  event,
}: {
  readonly memory: Email;
  readonly event: { readonly code: string };
}) => ({ email: memory.email, code: event.code });

const SignInMachine = machine(SignIn, ({ S, E, O }) => {
  const code = [
    {
      guard: [
        ({ memory }: { readonly memory: { readonly tries: number } }) =>
          memory.tries < MAX_TRIES || deny("Locked"),
      ],
      actions: [O.verify.commit(withCode)],
    },
    { target: S.LOCKED },
  ];

  return {
    default: S.EMAIL,
    on: {
      Sent: { updateMemory: () => ({ notice: "We sent you a code." }) },
      Throttled: { updateMemory: () => ({ notice: "Too many codes. Wait a minute." }) },
      Refused: { updateMemory: ({ event }) => ({ notice: event.why }) },
      Verified: { target: S.DONE },
      Wrong: { updateMemory: ({ memory }) => ({ tries: memory.tries + 1, notice: "Wrong code." }) },
      Unsure: { target: S.EMAIL, updateMemory: () => ({ notice: "Try signing in again." }) },
    },
    states: {
      EMAIL: {
        on: {
          Email: {
            target: S.CODE,
            updateMemory: ({ event }) => ({ email: event.email, tries: 0 }),
            actions: [O.begin.commit(typed)],
          },
        },
      },
      CODE: {
        on: {
          Code: code,
          Resend: {
            target: S.COOLDOWN,
            actions: [O.begin.commit(saved)],
          },
        },
      },
      COOLDOWN: {
        schedules: { cooldown: { schedule: "30 seconds", send: E.Cooled } },
        on: {
          Code: code,
          Resend: { guard: [() => deny("CoolingDown")] },
          Cooled: { target: S.CODE },
        },
      },
      LOCKED: {
        schedules: {
          unlock: { schedule: ({ memory }) => 60_000 * memory.tries, send: E.Unlock },
        },
        on: { Unlock: { target: S.CODE, updateMemory: () => ({ tries: 0 }) } },
      },
      DONE: { on: { Email: { target: S.CODE, actions: [O.begin.commit(typed)] } } },
    },
  };
});

const codeEntry = {
  kind: "send",
  name: "code",
  codes: ["rj", "gd"],
  weight: 5,
  thinkMs: 4000,
  event: "Code",
  payloads: [{ code: "123456" }, { code: "000000" }],
  burst: 1,
} as const;

const leave = { kind: "release", name: "leave", codes: ["gr"], weight: 1, thinkMs: 5000 } as const;

/**
 * S21 sign-in with a one-time code (fixture catalogue), flattened for production: email, then a
 * code, a resend cooldown and a lockout after five wrong codes; a local actor, never persisted.
 */
export const signIn = part({
  name: "sign-in",
  sketch: "S21",
  composite: "H",
  machine: SignInMachine,
  actors: ["screen"],
  user: {
    EMAIL: [
      {
        kind: "send",
        name: "email",
        codes: ["rj"],
        weight: 5,
        thinkMs: 3000,
        event: "Email",
        payloads: [{ email: "ada@example.com" }],
        burst: 1,
      },
      leave,
    ],
    CODE: [
      codeEntry,
      {
        kind: "send",
        name: "resend",
        codes: ["rj", "du"],
        weight: 2,
        thinkMs: 6000,
        event: "Resend",
        payloads: [{}],
        burst: 1,
      },
      leave,
    ],
    COOLDOWN: [
      codeEntry,
      {
        kind: "send",
        name: "resend-early",
        codes: ["gd"],
        weight: 1,
        thinkMs: 2000,
        event: "Resend",
        payloads: [{}],
        burst: 1,
      },
    ],
    LOCKED: [
      {
        kind: "send",
        name: "code-locked",
        codes: ["du"],
        weight: 1,
        thinkMs: 30_000,
        event: "Code",
        payloads: [{ code: "123456" }],
        burst: 1,
      },
      leave,
    ],
    DONE: [
      { kind: "dispose", name: "close", codes: ["dp"], weight: 2, thinkMs: 1000 },
      {
        kind: "send",
        name: "again",
        codes: ["rj"],
        weight: 1,
        thinkMs: 3000,
        event: "Email",
        payloads: [{ email: "ada@example.com" }],
        burst: 1,
      },
    ],
  },
  server: { begin: beginServer, verify: verifyServer },
});
