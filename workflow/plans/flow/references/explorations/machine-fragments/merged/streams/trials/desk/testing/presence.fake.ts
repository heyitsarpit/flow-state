// TRIAL (fakes-v2.md): the collaboration service for Stories. Its own `Fake.server`, and a client half that IS the SDK's shape
// (`CollabClient`), built over the server's stream endpoint. A Story replaces the SDK's transport and nothing else.
import { Effect, FiberSet, Layer, Schema, Stream } from "effect";
import { Fake } from "flow-state/testing";
import {
  type ChannelStatus,
  CollabClient,
  type CollabChannel,
  Member,
  Members,
  type Typing,
} from "@desk/features/Presence/collab-sdk.js";
import { Typing as TypingSchema } from "@desk/features/Presence/collab-sdk.js";

// The frames on a channel connection. NEW: a real Schema, so neither the endpoint nor the client half casts (`Schema.Unknown`, `as`).
const Status = Schema.Union([
  Schema.Struct({ state: Schema.Literal("attached"), resumed: Schema.Boolean }),
  Schema.Struct({ state: Schema.Literal("suspended"), reason: Schema.String }),
  Schema.Struct({ state: Schema.Literal("failed"), reason: Schema.String }),
]);

const Frame = Schema.fromJsonString(
  Schema.Union([
    Schema.Struct({ t: Schema.Literal("status"), status: Status }),
    Schema.Struct({ t: Schema.Literal("members"), members: Members }),
    Schema.Struct({ t: Schema.Literal("typing"), message: TypingSchema }),
  ]),
);

type Truth = { readonly members: Readonly<Record<string, Members>> };

// One SDK attach to one channel: the greeting is "attached" and the current members.
const attach = Fake.stream({
  request: { name: Schema.String },
  frame: Frame, // NEW: frame
  open: (truth: Truth, req) => {
    // Annotated: inline literal frames widen (`t: string`) under the stand-in's inference. RESULTS records it.
    const frames: ReadonlyArray<typeof Frame.Type> = [
      { t: "status", status: { state: "attached", resumed: false } },
      { t: "members", members: truth.members[req.name] ?? {} },
    ];

    return { frames };
  },
});

const on = (name: string) => (connection: { readonly name: string }) => connection.name === name; // NEW: a `where`, replacing `{ to: { channel: { name } } }`

export const Collab = Fake.server("Collab", {
  truth: { members: Schema.Record(Schema.String, Members) },
  initial: {
    members: { "ticket:north:T-42": { "dispatcher-2": { id: "dispatcher-2", name: "Dana" } } },
  },
  endpoints: {
    channel: attach,
    // A publish through the SDK: answered when the service acks it.
    publish: Fake.call({
      request: {
        name: Schema.String,
        memberId: Schema.String,
        at: Schema.Number,
        id: Schema.String,
      },
      handle: () => ({ response: { status: 202 } }), // NEW: an object; no body
    }),
  },
  controls: {
    join: Fake.control(
      { channel: Schema.String, member: Member },
      (truth: Truth, { channel, member }) => {
        const members = { ...(truth.members[channel] ?? {}), [member.id]: member };

        return {
          truth: { members: { ...truth.members, [channel]: members } },
          send: [attach.frames(on(channel), [{ t: "members", members }])],
        };
      },
    ),
    leave: Fake.control(
      { channel: Schema.String, memberId: Schema.String },
      (truth: Truth, { channel, memberId }) => {
        const { [memberId]: _gone, ...members } = truth.members[channel] ?? {};

        return {
          truth: { members: { ...truth.members, [channel]: members } },
          send: [attach.frames(on(channel), [{ t: "members", members }])],
        };
      },
    ),
    // The SDK's connection drops and it starts reconnecting by itself.
    suspend: Fake.control({ channel: Schema.String }, (_truth: Truth, { channel }) => ({
      send: [
        attach.frames(on(channel), [
          { t: "status", status: { state: "suspended", reason: "connection lost" } },
        ]),
      ],
    })),
    // The SDK is back. `resumed: true` is its word that the channel continued in place, nothing missed.
    resume: Fake.control(
      { channel: Schema.String, resumed: Schema.Boolean },
      (truth: Truth, { channel, resumed }) => ({
        send: [
          attach.frames(on(channel), [
            { t: "status", status: { state: "attached", resumed } },
            { t: "members", members: truth.members[channel] ?? {} },
          ]),
        ],
      }),
    ),
    // The SDK gave up on the channel (its retries spent, or the token revoked).
    fail: Fake.control(
      { channel: Schema.String, reason: Schema.String },
      (_truth: Truth, { channel, reason }) => ({
        send: [attach.frames(on(channel), [{ t: "status", status: { state: "failed", reason } }])],
      }),
    ),
    // A burst of typing messages: more than the session's bound (1,024), so `emit`'s back-pressure is what saves it.
    typingBurst: Fake.control(
      { channel: Schema.String, memberId: Schema.String, count: Schema.Int },
      (_truth: Truth, p) => ({
        send: [
          attach.frames(
            on(p.channel),
            Array.from({ length: p.count }, (_, n) => ({
              t: "typing" as const,
              message: { memberId: p.memberId, at: n * 100, id: `${p.memberId}-${n}` },
            })),
          ),
        ],
      }),
    ),
  },
});

// The SDK, over the run's server. One connection per channel name, shared by every listener and reference-counted, as the real
// client's channels are; each listener sees what the connection delivers after it subscribed.
export const CollabFake = Layer.effect(
  CollabClient,
  Effect.gen(function* () {
    const server = yield* Collab;
    const fibers = yield* FiberSet.make();
    const run = yield* FiberSet.runtime(fibers)();
    const runPromise = yield* FiberSet.runtimePromise(fibers)(); // for the SDK's promise-returning calls

    type Listeners = {
      status: Set<(s: ChannelStatus) => void>;
      members: Set<(m: Members) => void>;
      typing: Set<(m: Typing) => Promise<void>>;
    };

    const open = new Map<string, { refs: number; listeners: Listeners; stop: () => void }>();

    const connect = (name: string): Listeners => {
      const listeners: Listeners = { status: new Set(), members: new Set(), typing: new Set() };
      const fiber = run(
        server.channel({ name }).pipe(
          // The client half still decodes: a stream read is wire text (fakes-v2 section 2), with the same codec.
          Stream.mapEffect((text) => Schema.decodeUnknownEffect(Frame)(text).pipe(Effect.orDie)),
          Stream.runForEach((frame) =>
            Effect.promise(async () => {
              if (frame.t === "status") for (const l of listeners.status) l(frame.status);
              if (frame.t === "members") for (const l of listeners.members) l(frame.members);
              // The SDK awaits each listener before the next message: the adapter's `emit` promise is the brake.
              if (frame.t === "typing") for (const l of listeners.typing) await l(frame.message);
            }),
          ),
        ),
      );

      open.set(name, { refs: 0, listeners, stop: () => fiber.interruptUnsafe() });

      return listeners;
    };

    const channel = (name: string, listeners: Listeners): CollabChannel => ({
      onStatus: (l) => (listeners.status.add(l), () => listeners.status.delete(l)),
      presence: {
        subscribe: (l) => (listeners.members.add(l), () => listeners.members.delete(l)),
        enter: () => Promise.resolve(),
        leave: () => Promise.resolve(),
      },
      subscribe: (_event, l) => (listeners.typing.add(l), () => listeners.typing.delete(l)),
      publish: (_event, message) =>
        runPromise(server.publish({ name, ...message }).pipe(Effect.asVoid)),
    });

    return CollabClient.of({
      acquire: (name) => {
        if (!open.has(name)) connect(name);

        const entry = open.get(name)!;
        entry.refs += 1;

        return channel(name, entry.listeners);
      },
      release: (name) => {
        const entry = open.get(name);

        if (entry === undefined) return;

        entry.refs -= 1;

        if (entry.refs === 0) {
          entry.stop();
          open.delete(name);
        }
      },
    });
  }),
);
