import { Effect, Schema } from "effect";
import { definition, Flow, machine, Outcome, transaction } from "../../../src/index.ts";
import { GitApi } from "../../services/git/services.ts";

const page = { repo: Schema.String, page: Schema.Number };

/**
 * Syncs one page of a repository's history, keyed by the repository and the page number, one
 * after another: a lost answer is unknown.
 */
export const syncPage = transaction({
  id: "Lanes/sync-page",
  input: page,
  key: ["repo", "page"],
  concurrency: "serialize",
  services: [GitApi],
  commit: (input, { attempt }) =>
    Effect.flatMap(Effect.service(GitApi), (api) =>
      api.sync({ repo: `${input.repo}#${String(input.page)}` }, { idempotencyKey: attempt.id }),
    ).pipe(Effect.catchTag("NoResponse", (e) => Outcome.unknown(e))),
});

export const Paged = definition({
  id: "Lanes/paged",
  persist: true,
  states: ["READY"],
  events: { CommitPage: page },
  internalEvents: {
    Synced: {},
    Limited: {},
    NotSent: { why: Schema.String },
    Unsure: Flow.uncertain({}),
  },
  memory: {},
  operations: ({ E }) => ({
    sync: syncPage.outcomes({
      success: E.Synced,
      failure: { RateLimited: E.Limited },
      notSent: E.NotSent.from((e: { readonly why: string }) => ({ why: e.why })),
      unknown: E.Unsure,
    }),
  }),
});

const byPage = ({
  event,
}: {
  readonly event: { readonly repo: string; readonly page: number };
}) => ({ repo: event.repo, page: event.page });

/**
 * A history client that syncs pages by number, so its lane key holds a number.
 */
export const PagedMachine = machine(Paged, ({ S, O }) => ({
  default: S.READY,
  on: {
    CommitPage: { actions: [O.sync.commit(byPage)] },
    Synced: {},
    Limited: {},
    NotSent: {},
    Unsure: {},
  },
}));
