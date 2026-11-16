import { Schema } from "effect";
import { definition, Flow, machine } from "../../../src/index.ts";
import { SyncMachine } from "../machine.ts";

const Sync = SyncMachine.definition;

/**
 * An open repository, named by its name: the access token it was opened with, kept out of outside
 * snapshots, and what it has seen of its sync client: the last remote head and whether the client
 * is backing off a rate limit.
 */
export const Repo = definition({
  id: "Git/Repo",
  persist: false,
  states: ["OPEN"],
  events: { SetToken: { token: Schema.String } },
  internalEvents: { HeadSeen: { head: Schema.String }, LimitSeen: { limited: Schema.Boolean } },
  memory: {
    repo: Flow.input(Schema.String),
    token: Flow.private(Flow.initial(Schema.String, "")),
    lastHead: Flow.initial(Schema.String, ""),
    heads: Flow.initial(Schema.Number, 0),
    limited: Flow.initial(Schema.Boolean, false),
  },
  context: {
    head: Sync.Provider.select((s) => s.memory.head),
    cooling: Sync.Provider.select((s) => s.state === "COOLING"),
  },
});

/**
 * The repository: each new head its client reads is counted, and its backoff shown.
 */
export const RepoMachine = machine(Repo, ({ S, E }) => ({
  default: S.OPEN,
  onContext: [
    {
      select: ({ context }) => context.head,
      event: E.HeadSeen.from((head: string) => ({ head })),
    },
    {
      select: ({ context }) => context.cooling,
      event: E.LimitSeen.from((limited: boolean) => ({ limited })),
    },
  ],
  on: {
    SetToken: { updateMemory: ({ event }) => ({ token: event.token }) },
    HeadSeen: {
      updateMemory: ({ memory, event }) => ({ lastHead: event.head, heads: memory.heads + 1 }),
    },
    LimitSeen: { updateMemory: ({ event }) => ({ limited: event.limited }) },
  },
}));
