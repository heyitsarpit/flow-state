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
              send(upstreamOf, ({ event }) => ({
                _tag: "Push",
                sha: event.sha,
                hops: event.hops + 1,
              })),
            ],
          },
          { updateMemory: taken },
        ],
        Import: {
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
  context: { seen: Mirror.Provider.select(Schema.Number, (m) => m.memory.seen) },
});

/**
 * The status line: each change in its mirror's count is shown.
 */
export const MirrorStatusMachine = machine(MirrorStatus, ({ S, E }) => ({
  default: S.SHOWING,
  onContext: [
    {
      select: ({ context }) => context.seen,
      event: E.Counted.from((seen: number) => ({ seen })),
    },
  ],
  on: {
    Counted: {
      updateMemory: ({ memory, event }) => ({ seen: event.seen, updates: memory.updates + 1 }),
    },
  },
}));
