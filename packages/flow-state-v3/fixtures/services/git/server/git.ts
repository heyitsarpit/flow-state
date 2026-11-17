import { Exit, Schema } from "effect";
import { Fake } from "../../../../src/host/testing/index.ts";

const GitTruth = Schema.Struct({
  synced: Schema.Record(Schema.String, Schema.String),
  heads: Schema.Record(Schema.String, Schema.String),
  limits: Schema.Array(Schema.Number),
  outages: Schema.Number,
});

type Truth = typeof GitTruth.Type;

const Limited = Schema.TaggedStruct("RateLimited", { retryAfterMs: Schema.Number });

const ServerError = Schema.TaggedStruct("ServerError", {});

/**
 * The Git host's truth: one sync per idempotency key, replayed for a key it has seen, each moving
 * the repository's head; a head nobody synced is `a1b2c3`. `rateLimit` queues a delay that turns
 * the next new sync away; `outage` breaks the next head read.
 */
export const Git = Fake.server("Git", {
  truth: GitTruth,
  initial: { synced: {}, heads: {}, limits: [], outages: 0 },
  endpoints: {
    sync: Fake.call({
      request: { repo: Schema.String, key: Schema.String },
      success: Schema.Struct({}),
      failure: Limited,
      handle: (truth: Truth, { repo, key }) => {
        const [retryAfterMs, ...later] = truth.limits;

        if (truth.synced[key] !== undefined) return { truth, exit: Exit.succeed({}) };

        if (retryAfterMs !== undefined)
          return {
            truth: { ...truth, limits: later },
            exit: Exit.fail({ _tag: "RateLimited" as const, retryAfterMs }),
          };
        const head = `h${Object.keys(truth.synced).length + 1}`;

        return {
          truth: {
            ...truth,
            synced: { ...truth.synced, [key]: repo },
            heads: { ...truth.heads, [repo]: head },
          },
          exit: Exit.succeed({}),
        };
      },
    }),
    remoteHead: Fake.call({
      request: { repo: Schema.String },
      success: Schema.Struct({ head: Schema.String }),
      failure: ServerError,
      handle: (truth: Truth, { repo }) =>
        truth.outages > 0
          ? {
              truth: { ...truth, outages: truth.outages - 1 },
              exit: Exit.fail({ _tag: "ServerError" as const }),
            }
          : { truth, exit: Exit.succeed({ head: truth.heads[repo] ?? "a1b2c3" }) },
    }),
  },
  controls: {
    rateLimit: Fake.control({ retryAfterMs: Schema.Number }, (truth: Truth, { retryAfterMs }) => ({
      ...truth,
      limits: [...truth.limits, retryAfterMs],
    })),
    outage: Fake.control({}, (truth: Truth) => ({ ...truth, outages: truth.outages + 1 })),
  },
});
