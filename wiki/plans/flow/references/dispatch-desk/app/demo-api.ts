// The in-memory server as Effect Layers, one per port: tickets, comments, attachments, the
// workspace socket, presence and the assistant. Every rule is a pure function of desk-server.ts,
// which is also the entity property test's oracle and the Story fake's engine, so the demo filters,
// orders, pages and deduplicates exactly as the real server does. The Layers add what the pure core
// leaves out: sharing one truth between ports, and pushing logged changes on the socket.
import { Context, Effect, Layer, PubSub, Schedule, Stream } from "effect";
import {
  AttachmentsApi,
  PendingFilesLive,
  type StoredAttachment,
  type TooLarge,
} from "../features/Attachments/attachments-api.js";
import { CommentsApi } from "../features/Comments/comments-api.js";
import { AssistantApi, Refused, type SuggestFrame } from "../features/Assistant/assistant-api.js";
import {
  CollabClient,
  type ChannelStatus,
  type CollabChannel,
  type Member,
  type Members,
  type Typing,
} from "../features/Presence/collab-sdk.js";
import { DeskSocket, type DeskFrame } from "../features/Tickets/feed/desk-socket.js";
import { TicketApi } from "../features/Tickets/ticket-api.js";
import type { Cursor, TicketNotFound, TicketKey, TicketRow } from "../features/Tickets/types.js";
import * as Desk from "./desk-server.js";

type Pushed<Frame> = { workspaceId: string; frame: Frame };

const reply = <A, E>(result: Desk.Result<A, E>): Effect.Effect<A, E> =>
  result.ok ? Effect.succeed(result.value) : Effect.fail(result.error);

// The change frame and the activity frame a logged item becomes. They share its cursor.
const framesOf = (item: Desk.LogItem): ReadonlyArray<DeskFrame> => [
  { t: "change", event: item.event },
  { t: "activity", entry: item.entry },
];

// The registration frame: a reset when `from` belongs to an older epoch, else a hello that echoes
// `from` only if the kept log still reaches it.
const greet = (
  epoch: number,
  from: Cursor | undefined,
  replayedFrom: Cursor | undefined,
): DeskFrame => {
  if (from !== undefined && from.epoch !== epoch) return { t: "reset", epoch };

  if (replayedFrom) return { t: "hello", replayedFrom };

  return { t: "hello" };
};

// The server itself, so fixtures can act the way another dispatcher would: through the same
// state the ports read, followed by the push the real server sends.
export class DemoServer extends Context.Service<
  DemoServer,
  {
    tickets: typeof TicketApi.Service;
    comments: typeof CommentsApi.Service;
    attachments: typeof AttachmentsApi.Service;
    socket: typeof DeskSocket.Service;
    collab: typeof CollabClient.Service;
    assistant: typeof AssistantApi.Service;
    // Controls: another dispatcher, the server's log, a lock someone else holds.
    externalSave: (
      key: TicketKey,
      change: Partial<Pick<TicketRow, "title" | "status" | "assignee">>,
    ) => Effect.Effect<TicketRow, TicketNotFound>;
    externalRemove: (key: TicketKey) => Effect.Effect<void, TicketNotFound>;
    lock: (key: TicketKey, by: string) => Effect.Effect<void>;
    unlock: (key: TicketKey) => Effect.Effect<void>;
    resetLog: Effect.Effect<void>;
    retain: (count: number) => Effect.Effect<void>;
    viewerJoins: (key: TicketKey, member: Member) => Effect.Effect<void>;
    viewerLeaves: (key: TicketKey, memberId: string) => Effect.Effect<void>;
  }
>()("DispatchDesk/DemoServer") {}

// Each Layer build gets fresh state, so Story runs and Runtimes never share tickets.
const DemoServerLive = Layer.effect(
  DemoServer,
  Effect.gen(function* () {
    const pushes = yield* PubSub.unbounded<Pushed<DeskFrame>>();
    let truth = Desk.seed();

    // Applies one pure step to the shared truth, then pushes whatever it appended to the log.
    const write = <A, E>(apply: (current: Desk.DeskTruth) => Desk.Step<A, E>) =>
      Effect.suspend(() => {
        const first = truth.nextSeq;
        const [next, result] = apply(truth);
        truth = next;

        const appended = next.log.filter((item) => item.event.cursor.seq >= first);

        return PubSub.publishAll(
          pushes,
          appended.flatMap((item) =>
            framesOf(item).map((frame) => ({ workspaceId: item.workspaceId, frame })),
          ),
        ).pipe(Effect.andThen(reply(result)));
      });

    const change = (apply: (current: Desk.DeskTruth) => Desk.DeskTruth) =>
      Effect.sync(() => {
        truth = apply(truth);
      });

    const tickets = TicketApi.of({
      load: (key) => Effect.suspend(() => reply(Desk.loadTicket(truth, key))),
      list: (input) => Effect.sync(() => Desk.listTickets(truth, input)),
      openCount: ({ workspaceId }) => Effect.sync(() => Desk.openCount(truth, workspaceId)),
      saveTitle: (input, { idempotencyKey }) =>
        write((current) => Desk.saveTitle(current, input, idempotencyKey)),
      assign: (input, { idempotencyKey }) =>
        write((current) => Desk.assign(current, input, idempotencyKey)),
      eventsSince: ({ workspaceId, after }) =>
        Effect.sync(() => Desk.eventsSince(truth, workspaceId, after)),
      unassigned: (input) => Effect.sync(() => Desk.listUnassigned(truth, input)),
      triage: (input) => Effect.sync(() => Desk.listTriage(truth, input)),
      byCustomer: (input) => Effect.sync(() => Desk.ticketsOfCustomer(truth, input)),
      setAssignee: (input, { idempotencyKey }) =>
        write((current) => Desk.setAssignee(current, input, idempotencyKey)),
      closeMany: (input, { idempotencyKey }) =>
        write((current) => Desk.closeMany(current, input, idempotencyKey)),
      create: (input, { idempotencyKey }) =>
        write((current) => Desk.createTicket(current, input, idempotencyKey)),
      archive: (input, { idempotencyKey }) =>
        write((current) => Desk.archiveTicket(current, input, idempotencyKey)),
    });

    const comments = CommentsApi.of({
      list: (input) => Effect.suspend(() => reply(Desk.listThread(truth, input))),
      mentions: (input) => Effect.sync(() => Desk.listMentions(truth, input)),
      post: (input, { idempotencyKey }) =>
        write((current) => Desk.postComment(current, input, idempotencyKey)),
      edit: (input, { idempotencyKey }) =>
        write((current) => Desk.editComment(current, input, idempotencyKey)),
      remove: (input, { idempotencyKey }) =>
        write((current) => Desk.removeComment(current, input, idempotencyKey)),
      pin: (input, { idempotencyKey }) =>
        write((current) => Desk.pinComment(current, input, idempotencyKey)),
      markRead: (input, { idempotencyKey }) =>
        write((current) => Desk.markRead(current, input, idempotencyKey)),
      reactions: (key) => Effect.sync(() => Desk.reactionsOf(truth, key)),
      react: (input, { idempotencyKey }) =>
        write((current) => Desk.react(current, input, idempotencyKey)),
    });

    // The demo reports progress in four steps, then answers: enough for a bar to move.
    const attachments = AttachmentsApi.of({
      files: (key) => Effect.sync(() => Desk.listFiles(truth, key)),
      remove: (input, { idempotencyKey }) =>
        write((current) => Desk.removeFile(current, input, idempotencyKey)),
      put: (ticket, ref, bytes, { idempotencyKey, onProgress }) =>
        Effect.gen(function* () {
          for (const share of [0.25, 0.5, 0.75, 1]) {
            onProgress({ sent: Math.round(bytes.size * share), total: bytes.size });
            yield* Effect.sleep("200 millis");
          }

          const name = bytes instanceof File ? bytes.name : ref;

          return yield* write((current): Desk.Step<StoredAttachment, TooLarge> =>
            Desk.putFile(current, { ...ticket, ref, name, size: bytes.size }, idempotencyKey),
          );
        }),
    });

    // The first frame is the registration: a reset when `from` belongs to an older epoch, else a
    // hello that echoes `from` only if the kept log still reaches it. Subscribing before reading
    // the truth means no push falls between the replay and the live frames.
    const socket = DeskSocket.of({
      frames: (workspaceId, from) =>
        Stream.unwrap(
          Effect.gen(function* () {
            const subscription = yield* PubSub.subscribe(pushes);
            const { replayedFrom, items } = Desk.replay(truth, workspaceId, from);

            const greeting = greet(truth.epoch, from, replayedFrom);

            const live = Stream.fromSubscription(subscription).pipe(
              Stream.filter((pushed) => pushed.workspaceId === workspaceId),
              Stream.map((pushed) => pushed.frame),
            );

            const pings = Stream.tick("20 seconds").pipe(
              Stream.map((): DeskFrame => ({ t: "ping" })),
            );

            return Stream.make(greeting).pipe(
              Stream.concat(Stream.fromIterable(items.flatMap(framesOf))),
              Stream.concat(Stream.merge(live, pings)),
            );
          }),
        ),
    });

    // The collaboration SDK, in memory: a channel per ticket, always attached, members from the server's viewers.
    // Typing is not simulated. The real client is next/collab.ts.
    const channels = new Map<string, Set<(members: Members) => void>>();
    const collab = CollabClient.of({
      acquire: (name): CollabChannel => {
        const listeners = channels.get(name) ?? new Set();
        channels.set(name, listeners);
        const [, workspaceId, ticketId] = name.split(":");

        return {
          onStatus: (listener: (status: ChannelStatus) => void) => {
            queueMicrotask(() => listener({ state: "attached", resumed: false }));

            return () => {};
          },
          presence: {
            subscribe: (listener) => {
              listeners.add(listener);
              queueMicrotask(() =>
                listener(Desk.viewersOf(truth, { workspaceId: workspaceId!, ticketId: ticketId! })),
              );

              return () => listeners.delete(listener);
            },
            enter: () => Promise.resolve(),
            leave: () => Promise.resolve(),
          },
          subscribe: (_event: "typing", _listener: (message: Typing) => Promise<void>) => () => {},
          publish: () => Promise.resolve(),
        };
      },
      release: () => {},
    });

    const announce = (key: TicketKey) =>
      Effect.sync(() => {
        for (const listener of channels.get(`ticket:${key.workspaceId}:${key.ticketId}`) ?? []) {
          listener(Desk.viewersOf(truth, key));
        }
      });

    // Tokens at 100 ms, then `done`. An unknown ticket is refused before any body.
    const assistant = AssistantApi.of({
      suggest: (input) => {
        const ticket = Desk.find(truth, input);

        if (!ticket) return Stream.fail(new Refused({ status: 404 }));

        const tokens = Desk.replyTokens(ticket);

        return Stream.fromIterable(tokens).pipe(
          Stream.schedule(Schedule.spaced("100 millis")),
          Stream.map((text): SuggestFrame => ({ t: "token", text })),
          Stream.concat(
            Stream.make<SuggestFrame[]>({ t: "done", usage: { tokens: tokens.length } }),
          ),
        );
      },
    });

    return DemoServer.of({
      tickets,
      comments,
      attachments,
      socket,
      collab,
      assistant,
      externalSave: (key, patch) =>
        write((current) => Desk.changeElsewhere(current, key, patch, "dispatcher-2")),
      externalRemove: (key) =>
        write((current) => Desk.removeElsewhere(current, key, "dispatcher-2")),
      lock: (key, by) => change((current) => Desk.lock(current, key, by)),
      unlock: (key) => change((current) => Desk.unlock(current, key)),
      resetLog: change(Desk.resetLog),
      retain: (count) => change((current) => Desk.retain(current, count)),
      viewerJoins: (key, member) =>
        Effect.suspend(() => {
          truth = Desk.join(truth, key, member)[0];

          return announce(key);
        }),
      viewerLeaves: (key, memberId) =>
        Effect.suspend(() => {
          truth = Desk.leave(truth, key, memberId)[0];

          return announce(key);
        }),
    });
  }),
);

// Every port the app uses, over the one server fixtures can reach. All come from one build.
export const DemoDeskApi = Layer.mergeAll(
  Layer.effect(
    TicketApi,
    DemoServer.useSync((server) => server.tickets),
  ),
  Layer.effect(
    CommentsApi,
    DemoServer.useSync((server) => server.comments),
  ),
  Layer.effect(
    AttachmentsApi,
    DemoServer.useSync((server) => server.attachments),
  ),
  Layer.effect(
    DeskSocket,
    DemoServer.useSync((server) => server.socket),
  ),
  Layer.effect(
    CollabClient,
    DemoServer.useSync((server) => server.collab),
  ),
  Layer.effect(
    AssistantApi,
    DemoServer.useSync((server) => server.assistant),
  ),
  PendingFilesLive,
).pipe(Layer.provideMerge(DemoServerLive));

// The name earlier files import (app/setup.ts, app/persistence.ts); it now provides every port.
export const DemoTicketApi = DemoDeskApi;
