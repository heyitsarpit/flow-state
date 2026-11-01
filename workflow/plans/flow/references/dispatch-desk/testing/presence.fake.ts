// The collaboration service for Stories: its own `Fake.server` (who is on which channel is not desk truth), and a
// client half that IS the SDK's shape (`CollabClient`, collab-sdk.ts), built over the server's stream endpoint. A
// Story replaces the SDK's transport and nothing else: the adapter in presence.contracts.ts runs as in production,
// reading statuses, members and typing messages through the SDK's own callbacks (Y2, M6 2.11).
//
// Controls are the SDK's real sequences: a member enters or leaves; the SDK's connection is suspended and comes back
// resumed or not; the SDK gives up on a channel; a burst of typing. The attach itself is the stream endpoint's open,
// so `Collab.channel.hold({ at: "open" })` holds it (Y3).
// Pending merge 6: written against merged/streams/proposal-v2.md revision 7.1, S1–S10.
import { Effect, FiberSet, Layer, Schema, Stream } from "effect";
import { Fake } from "flow-state/testing"; // pending merge 6
import {
  type ChannelStatus,
  CollabClient,
  type CollabChannel,
  Member,
  Members,
  type Typing,
} from "../features/Presence/collab-sdk.js";

// Frames on a channel connection, as JSON text: what the SDK's own wire would carry, decoded by the client half.
const Frame = Schema.Union([
  Schema.Struct({ t: Schema.Literal("status"), status: Schema.Unknown }),
  Schema.Struct({ t: Schema.Literal("members"), members: Members }),
  Schema.Struct({ t: Schema.Literal("typing"), message: Schema.Unknown }),
]);

type Frame = typeof Frame.Type;

const text = (frame: Frame) => JSON.stringify(frame);

const on = (channel: string) => ({ channel: { name: channel } });

export const Collab = Fake.server("Collab", {
  truth: { members: Schema.Record(Schema.String, Members) },
  initial: {
    members: { "ticket:north:T-42": { "dispatcher-2": { id: "dispatcher-2", name: "Dana" } } },
  },
  endpoints: {
    // One SDK attach to one channel: the greeting is "attached" and the current members (2.10.9's `open`).
    channel: Fake.stream({
      request: { name: Schema.String },
      open: (truth, req) => [
        truth,
        [
          text({ t: "status", status: { state: "attached", resumed: false } }),
          text({ t: "members", members: truth.members[req.name] ?? {} }),
        ],
        { accept: true },
      ],
    }),
    // A publish through the SDK: answered when the service acks it.
    publish: Fake.call({
      request: {
        name: Schema.String,
        memberId: Schema.String,
        at: Schema.Number,
        id: Schema.String,
      },
      handle: (truth) => [truth, { status: 202, body: null }],
    }),
  },
  // design gap: a control's effect on open connections is `{ to, send }` / `{ to, close }` (REVIEW gap 32).
  controls: {
    join: Fake.control({ channel: Schema.String, member: Member }, (truth, { channel, member }) => {
      const members = { ...(truth.members[channel] ?? {}), [member.id]: member };

      return [
        { members: { ...truth.members, [channel]: members } },
        { to: on(channel), send: [text({ t: "members", members })] },
      ];
    }),
    leave: Fake.control(
      { channel: Schema.String, memberId: Schema.String },
      (truth, { channel, memberId }) => {
        const { [memberId]: _gone, ...members } = truth.members[channel] ?? {};

        return [
          { members: { ...truth.members, [channel]: members } },
          { to: on(channel), send: [text({ t: "members", members })] },
        ];
      },
    ),
    // The SDK's connection drops and it starts reconnecting by itself.
    suspend: Fake.control({ channel: Schema.String }, (truth, { channel }) => [
      truth,
      {
        to: on(channel),
        send: [text({ t: "status", status: { state: "suspended", reason: "connection lost" } })],
      },
    ]),
    // The SDK is back. `resumed: true` is its word that the channel continued in place, nothing missed.
    resume: Fake.control(
      { channel: Schema.String, resumed: Schema.Boolean },
      (truth, { channel, resumed }) => [
        truth,
        {
          to: on(channel),
          send: [
            text({ t: "status", status: { state: "attached", resumed } }),
            text({ t: "members", members: truth.members[channel] ?? {} }),
          ],
        },
      ],
    ),
    // The SDK gave up on the channel (its retries spent, or the token revoked).
    fail: Fake.control(
      { channel: Schema.String, reason: Schema.String },
      (truth, { channel, reason }) => [
        truth,
        { to: on(channel), send: [text({ t: "status", status: { state: "failed", reason } })] },
      ],
    ),
    // A burst of typing messages: more than the session's bound, so `emit`'s back-pressure is what saves it.
    typingBurst: Fake.control(
      { channel: Schema.String, memberId: Schema.String, count: Schema.Int },
      (truth, p) => [
        truth,
        {
          to: on(p.channel),
          send: Array.from({ length: p.count }, (_, n) =>
            text({
              t: "typing",
              message: { memberId: p.memberId, at: n * 100, id: `${p.memberId}-${n}` },
            }),
          ),
        },
      ],
    ),
  },
});

// The SDK, over the run's server. One connection per channel name, shared by every listener and reference-counted,
// as the real client's channels are; each listener sees what the connection delivers after it subscribed.
// design gap: how a client half reads a stream endpoint is not spelled (REVIEW gap 33); assumed: `server.ep(input)`
// is a `Stream` of the frames, run here on a fiber the layer forks, as an SDK's own connection runs beside the app.
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
          Stream.mapEffect((frame) =>
            Schema.decodeUnknownEffect(Schema.fromJsonString(Frame))(frame).pipe(Effect.orDie),
          ),
          Stream.runForEach((frame) =>
            Effect.promise(async () => {
              if (frame.t === "status")
                for (const l of listeners.status) l(frame.status as ChannelStatus);
              if (frame.t === "members") for (const l of listeners.members) l(frame.members);
              // The SDK awaits each listener before the next message: the adapter's `emit` promise is the brake.
              if (frame.t === "typing")
                for (const l of listeners.typing) await l(frame.message as Typing);
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
