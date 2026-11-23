import { Predicate } from "effect";
import { describe, expect, it } from "vite-plus/test";
import type { Cut } from "../../src/host/testing/index.ts";
import { shell } from "../../fixtures/session/app.ts";
import { Workspace } from "../../fixtures/session/server/workspace.ts";
import {
  invalidWrite,
  renameShownAtOnce,
  shellUsual,
  signOutClears,
} from "../../fixtures/session/stories/shell.ts";

// The workspace shell's placed profile and teams. Expected results: a refetch on a placed read asks
// its entry again (Operations, entry table: Ask Refetch); a commit's optimistic value shows at start
// and the operation's `writes` lands on success (Plan Operations O3, O5); a write with no valid key
// applies nothing and reports InvalidUpdate while the commit succeeds (Plan Operations O3); signing
// out clears the profile (Operations, Clear).

describe("the shell's reads (Operations entry table; Plan Operations O3, O5)", () => {
  it("Operations, entry table (Ask Refetch): a refresh reads the profile again and shows the new name", async () => {
    const run = await shellUsual.run();

    expect(run.checkpoints.shown.read(shell)?.memory.name).toBe("Ada");
    expect(run.checkpoints.refreshed.read(Workspace.profile)).toHaveLength(2);
    expect(run.checkpoints.refreshed.read(shell)?.memory.name).toBe("Ada L.");
  });

  it("Plan Operations O2, O3, O5, O6: a rename shows at once on the teams row, predicted, while value fires only once the server's answer is written into the read", async () => {
    const run = await renameShownAtOnce.run();

    const shown = (cut: Cut) => {
      const [row] = cut.read(shell)?.operations.get("teams")?.values() ?? [];
      const names = Predicate.hasProperty(row, "data") ? row.data : undefined;

      return {
        row: Predicate.hasProperty(names, "names") ? names.names : undefined,
        predicted: Predicate.hasProperty(row, "predicted") ? row.predicted : undefined,
        memory: cut.read(shell)?.memory.teams["core"],
      };
    };

    expect([run.checkpoints.renaming, run.checkpoints.renamed].map(shown)).toEqual([
      { row: { core: "Platform" }, predicted: true, memory: "Core" },
      { row: { core: "Platform" }, predicted: false, memory: "Platform" },
    ]);
    expect(run.checkpoints.renamed.read(Workspace.teams)).toHaveLength(1);
  });

  it("Plan Operations O3 (InvalidUpdate): a write whose key the answer leaves out applies nothing, is reported, and the rename succeeds", async () => {
    const run = await invalidWrite.run();

    expect(run.evidence.filter((e) => Predicate.isTagged(e, "InvalidUpdate"))).toHaveLength(1);
    expect(run.checkpoints.renamed.read(shell)?.memory.notice).toBe("");
  });

  it("Operations, entry table (Clear): signing out clears the profile, so signing in again within its stale time reads it again", async () => {
    const run = await signOutClears.run();

    expect(run.checkpoints["signed in again"].read(Workspace.profile)).toHaveLength(2);
    expect(run.checkpoints["signed in again"].read(shell)?.memory.name).toBe("Ada");
  });
});
