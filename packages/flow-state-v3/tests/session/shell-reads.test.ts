import { Predicate } from "effect";
import { describe, expect, it } from "vite-plus/test";
import type { Cut } from "../../src/host/testing/index.ts";

// The workspace shell's placed profile and teams. Expected results: a refetch on a placed read asks
// its entry again (Operations, entry table: Ask Refetch); a commit's optimistic value shows at start
// and the operation's `writes` lands on success (Plan Operations O3, O5); a write with no valid key
// applies nothing and reports InvalidWrite while the commit succeeds (Plan Operations O3); signing
// out clears the profile (Operations, Clear). The shell uses members not yet built, so its fixture
// loads inside each test.

const load = async () => ({
  ...(await import("../../fixtures/session/pending/stories.ts")),
  ...(await import("../../fixtures/session/pending/profile.ts")),
});

describe("the shell's reads (Operations entry table; Plan Operations O3, O5)", () => {
  it("Operations, entry table (Ask Refetch): a refresh reads the profile again and shows the new name", async () => {
    const { shellUsual, shell, Workspace } = await load();
    const run = await shellUsual.run();

    expect(run.checkpoints.shown.read(shell)?.memory.name).toBe("Ada");
    expect(run.checkpoints.refreshed.read(Workspace.profile)).toHaveLength(2);
    expect(run.checkpoints.refreshed.read(shell)?.memory.name).toBe("Ada L.");
  });

  it.fails("Plan Operations O3, O5: a rename shows at once, and the server's answer is written into the teams read", async () => {
    const { renameShownAtOnce, shell, Workspace } = await load();
    const run = await renameShownAtOnce.run();
    const core = (cut: Cut) => cut.read(shell)?.memory.teams["core"];

    expect([run.checkpoints.renaming, run.checkpoints.renamed].map(core)).toEqual([
      "Platform",
      "Platform",
    ]);
    expect(run.checkpoints.renamed.read(Workspace.teams)).toHaveLength(1);
  });

  it("Plan Operations O3 (InvalidWrite): a write whose key the answer leaves out applies nothing, is reported, and the rename succeeds", async () => {
    const { invalidWrite, shell } = await load();
    const run = await invalidWrite.run();

    expect(run.evidence.filter((e) => Predicate.isTagged(e, "InvalidWrite"))).toHaveLength(1);
    expect(run.checkpoints.renamed.read(shell)?.memory.notice).toBe("");
  });

  it("Operations, entry table (Clear): signing out clears the profile, so signing in again within its stale time reads it again", async () => {
    const { signOutClears, shell, Workspace } = await load();
    const run = await signOutClears.run();

    expect(run.checkpoints["signed in again"].read(Workspace.profile)).toHaveLength(2);
    expect(run.checkpoints["signed in again"].read(shell)?.memory.name).toBe("Ada");
  });
});
