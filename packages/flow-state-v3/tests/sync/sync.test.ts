import { describe, expect, it } from "vite-plus/test";
import { client } from "../../fixtures/sync/machine.ts";
import { Git } from "../../fixtures/sync/server.ts";
import { long, usual } from "../../fixtures/sync/stories.ts";
import { checked } from "../rules/rules.ts";

describe("the usual and long sync Stories", () => {
  it("a broken head read keeps the old head, a rate limit cools down, and a second sync of a repository on the wire is turned away (WriteLanes R7, Turn R14, Reads R1)", async () => {
    const run = checked(await usual.run());
    const { peeked, cooling, cooled, end } = run.checkpoints;

    expect(peeked.read(client)?.memory["head"]).toBe("a1b2c3");
    expect(cooling.read(client)?.state).toBe("COOLING");
    expect(cooling.read(client)?.memory).toEqual(
      expect.objectContaining({ strikes: 1, waitMs: 9000 }),
    );
    expect(cooled.read(client)?.state).toBe("READY");
    expect(run.checkpoints["on the wire"].read(Git.sync).at(-1)?.status).toBe("held at request");
    expect(end.read(Git.sync).map((c) => c.input.repo)).toEqual([
      "docs",
      "docs",
      "site",
      "flow",
      "effect",
      "docs",
    ]);
    expect(end.read(client)?.memory).toEqual({ waitMs: 0, strikes: 0, head: "h5" });
  });

  it("runs about a hundred steps, every sync of one Attempt carrying one key (WriteLanes I6)", async () => {
    checked(await long.run());

    expect(long.steps.length).toBeGreaterThanOrEqual(90);
    expect(long.steps.length <= 120).toBe(true);
  });
});
