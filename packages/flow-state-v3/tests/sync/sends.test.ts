import { describe, expect, it } from "vite-plus/test";
import { docsRepo, mirrorA, mirrorB, replicaA, statusA } from "../../fixtures/sync/app.ts";
import {
  mirrorChainWithStatus,
  mirrorImportsRef,
  mirrorLoop,
  mirrorStory,
  replicaLoop,
  repoCommits,
} from "../../fixtures/sync/stories/sends.ts";
import type { Cut } from "../../src/host/testing/index.ts";
import { RuntimeDefaults } from "../../src/index.ts";
import { refusedTurns, turnsOf, readerOf } from "../actors/sends.ts";
import { checked } from "../rules/rules.ts";
import { played } from "../rules/played.ts";

const syncCalls = (cut: Cut) => cut.calls.filter((c) => c.endpoint === "sync").length;

const HALF = RuntimeDefaults.loopGuard / 2;

const { is } = readerOf(mirrorStory("ids"));

describe("a repository tells its client to sync (Actors R16; Runtime O4's send table)", () => {
  it("Actors R16 live: a commit makes the client sync the repository, and a reported push syncs it again", async () => {
    const run = await played(repoCommits);

    expect(syncCalls(run.checkpoints.committed)).toBe(1);
    expect(syncCalls(run.checkpoints.pushed)).toBe(2);
    expect(turnsOf(run, is(docsRepo))).toEqual(expect.arrayContaining(["Commit", "PushSeen"]));
  });

  it("send check: an event the target's Schema refuses (a branch name for a commit) refuses the sender's turn with a FlowError and reaches no one", async () => {
    const run = await played(mirrorImportsRef);
    const imported = run.checkpoints.imported;

    expect(refusedTurns(imported, mirrorA)).toHaveLength(1);
    expect(turnsOf(run, is(mirrorB))).toEqual([]);
    expect(imported.read(mirrorB)?.memory["lastSha"]).toBe("");
  });
});

describe("the loop guard (Actors R13, I20)", () => {
  it("Actors R13, I20: two mirrors forwarding to each other stop at the loop guard: the turn that would send one more is refused InvalidTurn, undone, naming the chain", async () => {
    const run = checked(await mirrorLoop.run());
    const stopped = run.checkpoints.stopped;
    const refused = refusedTurns(stopped, mirrorA);

    expect(refused).toHaveLength(1);
    expect(refused[0]?.summary).toContain("Push");
    expect(refused[0]?.summary).toContain(String(RuntimeDefaults.loopGuard));
    expect(refusedTurns(stopped, mirrorB)).toEqual([]);
    expect(stopped.read(mirrorA)?.memory["seen"]).toBe(HALF);
    expect(stopped.read(mirrorB)?.memory["seen"]).toBe(HALF);
  });

  it("Actors R13: a chain of exactly the loop guard's sends, each with a context update the status line hears, is never refused: context updates and their onContext events do not count", async () => {
    const run = checked(await mirrorChainWithStatus.run());
    const arrived = run.checkpoints.arrived;

    expect(refusedTurns(arrived, mirrorA)).toEqual([]);
    expect(refusedTurns(arrived, mirrorB)).toEqual([]);
    expect(arrived.read(mirrorA)?.memory["seen"]).toBe(HALF + 1);
    expect(arrived.read(mirrorB)?.memory["seen"]).toBe(HALF);
    expect(arrived.read(statusA)?.memory["seen"]).toBe(HALF + 1);
  });

  it("Actors R13, I20: sends made by onContext turns count: a replica pushing each commit its mirror takes, through a context update, to a mirror forwarding back is stopped at the loop guard, the replica's turn refused", async () => {
    const run = checked(await replicaLoop.run());
    const stopped = run.checkpoints.stopped;

    expect(refusedTurns(stopped, replicaA)).toHaveLength(1);
    expect(refusedTurns(stopped, mirrorB)).toEqual([]);
    expect(stopped.read(replicaA)?.memory["pushed"]).toBe(HALF);
    expect(stopped.read(mirrorB)?.memory["seen"]).toBe(HALF);
    expect(stopped.read(mirrorA)?.memory["seen"]).toBe(HALF + 1);
  });
});
