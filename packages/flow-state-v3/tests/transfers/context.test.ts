import { describe, expect, it } from "vite-plus/test";
import { switcher } from "../../fixtures/transfers/app.ts";
import {
  switcherEdges,
  switcherRecent,
  switcherReloaded,
} from "../../fixtures/transfers/stories/context.ts";
import { played } from "../rules/played.ts";

const LONG = "a".repeat(10_000);

describe("the switcher's `when` reads its memory (Turn R22)", () => {
  it.fails("Turn R22: a pass-through slot; `when(current, previous, { memory })` skips an account already listed", async () => {
    const run = await played(switcherRecent);

    expect(run.checkpoints.none.read(switcher)).toEqual(
      expect.objectContaining({ context: { account: "" }, memory: { recent: [] } }),
    );
    expect(run.checkpoints.chosen.read(switcher)).toEqual(
      expect.objectContaining({
        context: { account: "joint-1" },
        memory: { recent: ["joint-1", "acct-2", "acct-1"] },
      }),
    );
  });

  it.fails("Turn R22, E1, E3, E4: no account is never listed, a long id is, and the list keeps the newest five", async () => {
    const run = await played(switcherEdges);

    expect(run.checkpoints.blank.read(switcher)?.memory).toEqual({ recent: ["acct-x"] });
    expect(run.checkpoints.long.read(switcher)?.memory).toEqual({ recent: [LONG, "acct-x"] });
    expect(run.checkpoints.full.read(switcher)?.memory).toEqual({
      recent: ["acct-6", "acct-5", "acct-4", "acct-3", "acct-2"],
    });
  });

  it.fails("Turn R22, Restore R2: a restored switcher keeps its list and reads its account again with nothing listed twice; a new account is listed", async () => {
    const run = await played(switcherReloaded);

    expect(run.checkpoints.reloaded.read(switcher)).toEqual(
      expect.objectContaining({
        context: { account: "acct-2" },
        memory: { recent: ["acct-2", "acct-1"] },
      }),
    );
    expect(run.checkpoints.chosen.read(switcher)?.memory).toEqual({
      recent: ["acct-3", "acct-2", "acct-1"],
    });
  });
});
