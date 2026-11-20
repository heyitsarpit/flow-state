import { Schema } from "effect";
import {
  actorRef,
  definition,
  deny,
  Flow,
  type Machine,
  machine,
  send,
} from "../../../src/index.ts";

/**
 * A commit's full name: forty lowercase hex digits.
 */
export const Sha = Schema.String.check(Schema.isPattern(/^[0-9a-f]{40}$/));

/**
 * A push mirror, named by its remote: the remote it forwards each push to, how many hops a push may
 * travel before it stops (a time to live), how many pushes it has taken, and the last commit.
 */
export const Mirror = definition({
  id: "Git/Mirror",
  states: ["UNLINKED", "LINKED"],
  events: {
    Link: { upstream: Schema.String, maxHops: Schema.Number },
    Push: { sha: Sha, hops: Schema.Number },
    Import: { ref: Schema.String },
  },
  memory: {
    remote: Flow.input(Schema.String),
    upstream: Flow.initial(Schema.String, ""),
    maxHops: Flow.initial(Schema.Number, 0),
    seen: Flow.initial(Schema.Number, 0),
    lastSha: Flow.initial(Schema.String, ""),
  },
});

const upstreamOf = ({ memory }: { readonly memory: { readonly upstream: string } }) =>
  actorRef(MirrorMachine, { remote: memory.upstream });

const taken = ({
  memory,
  event,
}: {
  readonly memory: { readonly seen: number };
  readonly event: { readonly sha: string };
}) => ({ seen: memory.seen + 1, lastSha: event.sha });

/**
 * The mirror: unlinked, it keeps each push it takes; linked, it forwards each push to its upstream
 * with one more hop, until the push has travelled its time to live, and an import pushes the named
 * ref as it is.
 */
export const MirrorMachine: Machine<typeof Mirror> = machine(Mirror, ({ S }) => ({
  default: S.UNLINKED,
  on: {
    Link: {
      target: S.LINKED,
      updateMemory: ({ event }) => ({ upstream: event.upstream, maxHops: event.maxHops }),
    },
    Push: { updateMemory: taken },
  },
  states: {
    LINKED: {
      on: {
        Push: [
          {
            guard: [({ memory, event }) => event.hops < memory.maxHops || deny("Arrived")],
            updateMemory: taken,
            actions: [
              send(
                upstreamOf,
                Mirror.E.Push.from(({ event }) => ({ sha: event.sha, hops: event.hops + 1 })),
              ),
            ],
          },
          { updateMemory: taken },
        ],
        Import: {
          // oxlint-disable-next-line flow-state/no-raw-event -- shows send's callback form, kept on purpose
          actions: [send(upstreamOf, ({ event }) => ({ _tag: "Push", sha: event.ref, hops: 0 }))],
        },
      },
    },
  },
}));

/**
 * A mirror's status line, named by its mirror: how many pushes the mirror it reads has taken.
 */
export const MirrorStatus = definition({
  id: "Git/MirrorStatus",
  states: ["SHOWING"],
  events: {},
  internalEvents: { Counted: { seen: Schema.Number } },
  memory: { seen: Flow.initial(Schema.Number, 0), updates: Flow.initial(Schema.Number, 0) },
  context: { seen: Flow.context(Mirror.M.seen) },
});

/**
 * The status line: each change in its mirror's count is shown.
 */
export const MirrorStatusMachine = machine(MirrorStatus, ({ S, E, C }) => ({
  default: S.SHOWING,
  onContext: [C.seen.change({ event: E.Counted.from((seen) => ({ seen })) })],
  on: {
    Counted: {
      updateMemory: ({ memory, event }) => ({ seen: event.seen, updates: memory.updates + 1 }),
    },
  },
}));

/**
 * A replica that follows a mirror, named by its own remote: the upstream it pushes each new commit
 * of the followed mirror to, how many pushes it may make, and how many it has made.
 */
export const Replica = definition({
  id: "Git/Replica",
  states: ["IDLE", "FOLLOWING"],
  events: { Follow: { upstream: Schema.String, maxPushes: Schema.Number } },
  internalEvents: { Taken: { sha: Schema.String } },
  memory: {
    upstream: Flow.initial(Schema.String, ""),
    maxPushes: Flow.initial(Schema.Number, 0),
    pushed: Flow.initial(Schema.Number, 0),
  },
  context: {
    taken: Flow.context(Schema.Struct({ seen: Schema.Number, sha: Schema.String }), {
      reads: { seen: Mirror.M.seen, sha: Mirror.M.lastSha },
      select: ({ seen, sha }) => ({ seen, sha }),
    }),
  },
});

/**
 * The replica: following, each push its mirror takes is pushed on to its upstream as a new push,
 * up to its limit.
 */
export const ReplicaMachine = machine(Replica, ({ S, E, C }) => ({
  default: S.IDLE,
  onContext: [C.taken.change({ event: E.Taken.from((taken) => ({ sha: taken.sha })) })],
  on: {
    Follow: {
      target: S.FOLLOWING,
      updateMemory: ({ event }) => ({ upstream: event.upstream, maxPushes: event.maxPushes }),
    },
    Taken: {},
  },
  states: {
    FOLLOWING: {
      on: {
        Taken: [
          {
            guard: [({ memory }) => memory.pushed < memory.maxPushes || deny("LimitReached")],
            updateMemory: ({ memory }) => ({ pushed: memory.pushed + 1 }),
            actions: [
              send(
                upstreamOf,
                Mirror.E.Push.from(({ event }) => ({ sha: event.sha, hops: 0 })),
              ),
            ],
          },
          {},
        ],
      },
    },
  },
}));
