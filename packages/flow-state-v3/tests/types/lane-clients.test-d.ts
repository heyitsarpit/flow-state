import { Schema } from "effect";
import { describe, expectTypeOf, it } from "vite-plus/test";
import { cancelClient, latestClient, serializeClient } from "../../fixtures/lanes/app.ts";
import { Cancel, Latest, Serialize } from "../../fixtures/lanes/machines/clients.ts";
import { lanesStory } from "../../fixtures/lanes/stories/usual.ts";
import { definition } from "../../src/index.ts";

const repo = { repo: "flow" };

const Other = definition({
  id: "types/OtherClient",
  states: ["READY"],
  events: { Commit: { id: Schema.Number } },
  memory: {},
});

describe("Types R1: each sync client takes only the events its definition declares", () => {
  it("its own events are sent to it; another definition's event is refused, on each client", () => {
    expectTypeOf(
      lanesStory("types/own")
        .send(latestClient, Latest.E.Commit(repo))
        .send(serializeClient, Serialize.E.Commit(repo))
        .send(cancelClient, Cancel.E.Commit(repo)),
    ).toEqualTypeOf<ReturnType<typeof lanesStory>>();

    // @ts-expect-error Types R1: `Other`'s Commit carries an `id`, which the latest client's Commit lacks
    lanesStory("types/latest").send(latestClient, Other.E.Commit({ id: 1 }));

    // @ts-expect-error Types R1: `Other`'s Commit carries an `id`, which the serialize client's Commit lacks
    lanesStory("types/serialize").send(serializeClient, Other.E.Commit({ id: 1 }));

    // @ts-expect-error Types R1: `Other`'s Commit carries an `id`, which the cancel client's Commit lacks
    lanesStory("types/cancel").send(cancelClient, Other.E.Commit({ id: 1 }));
  });
});
