import { describe, expect, it } from "vite-plus/test";
import { clientOf, docsRepo, emptyRepo, repoOf } from "../../fixtures/sync/app.ts";
import { client } from "../../fixtures/sync/machine.ts";
import { retryEdges } from "../../fixtures/sync/stories/edges.ts";
import { manyRepos } from "../../fixtures/sync/stories/load.ts";
import {
  reloadedInBackoff,
  repoFirst,
  repoOpenedInBackoff,
  syncFirst,
} from "../../fixtures/sync/stories/structure.ts";
import { emptyName, openRepo } from "../../fixtures/sync/stories/usual.ts";
import { played } from "../rules/played.ts";

describe("a repository around the sync client", () => {
  it("Actors R5, R18; Turn R22, R23: a repo named by its name reads its client's head and backoff, and a Story sees its private token (Machines O8)", async () => {
    const run = await played(openRepo);
    const at = (name: keyof typeof run.checkpoints) => run.checkpoints[name].read(docsRepo);

    expect(at("opened")?.memory).toEqual({
      repo: "docs",
      token: "tok-docs",
      lastHead: "",
      heads: 0,
      limited: false,
    });
    expect(at("synced")?.memory).toEqual(expect.objectContaining({ lastHead: "a1b2c3", heads: 1 }));
    expect(at("cooling")?.memory).toEqual(expect.objectContaining({ limited: true }));
    expect(at("cooled")?.memory).toEqual(expect.objectContaining({ limited: false }));
    expect(at("cooled")?.memory).toEqual(expect.objectContaining({ token: "tok-docs" }));
  });

  it("E1: a repository with an empty name opens and reads its client like any other", async () => {
    const run = await played(emptyName);

    expect(run.checkpoints.opened.read(emptyRepo)?.memory).toEqual(
      expect.objectContaining({ repo: "", lastHead: "a1b2c3" }),
    );
  });
});

describe("many repositories (fixtures.md L1, S3)", () => {
  it("L1 x 64 under L3: 64 repositories, each on its own client, rate limited in turn, each reads only its own client", async () => {
    const run = await played(manyRepos);
    const end = run.checkpoints.end;

    expect(end.read(repoOf(0))?.memory).toEqual(expect.objectContaining({ limited: true }));
    expect(end.read(repoOf(1))?.memory).toEqual(expect.objectContaining({ limited: false }));
    expect(end.read(clientOf(1))?.state).toBe("READY");
    expect(end.read(clientOf(0))?.state).toBe("COOLING");
  });
});

describe("a repository's end during a backoff (fixtures.md S6)", () => {
  it("S6 repo first, Turn R23: the repository is disposed while its client cools, its last snapshot says so, and the client cools on alone", async () => {
    const run = await played(repoFirst);

    expect(run.checkpoints.disposed.read(docsRepo)?.lifecycle).toBe("disposed");
    expect(run.checkpoints.disposed.read(client)?.state).toBe("COOLING");
    expect(run.checkpoints.cooled.read(client)?.state).toBe("READY");
  });

  it("S6 reloaded: nothing is persisted, so after a reload in a backoff the repository and client start fresh", async () => {
    const run = await played(reloadedInBackoff);

    expect(run.checkpoints.reloaded.read(client)?.state).toBe("READY");
    expect(run.checkpoints.reloaded.read(docsRepo)?.memory).toEqual(
      expect.objectContaining({ limited: false, heads: 0 }),
    );
  });

  it("Actors R20, Stories R3: disposing the client while a repository is bound to it is refused BlockedByDependents, naming the repository", async () => {
    await expect(syncFirst().run()).rejects.toThrow(/BlockedByDependents: .*Git\/Repo/u);
  });
});

describe("the client's retry-after at its edges (fixtures.md E5; Turn R14)", () => {
  it("Turn R14: a retry after 0 ms cools for no time; 2^31 - 1 ms arms; 2^31 ms refuses the turn that would arm it", async () => {
    const run = await played(retryEdges);
    const at = (name: keyof typeof run.checkpoints) => run.checkpoints[name].read(client);

    expect(at("zero")?.state).toBe("READY");
    expect(at("longest")?.state).toBe("COOLING");
    expect(at("longest")?.schedules.map((s) => s.dueAt - run.checkpoints.longest.now)).toEqual([
      2 ** 31 - 1,
    ]);
    expect(at("past")?.state).toBe("READY");
    expect(at("past")?.issues).toHaveLength(1);
  });
});

describe("a repository opened during its client's backoff (fixtures.md S6)", () => {
  it.fails("Turn R12: a repository opened while its client cools shows the backoff, read as context where its mirror's baseline is silent (Turn R22)", async () => {
    const run = await played(repoOpenedInBackoff);

    expect(run.checkpoints.opened.read(docsRepo)?.memory).toEqual(
      expect.objectContaining({ limited: true }),
    );
  });
});
