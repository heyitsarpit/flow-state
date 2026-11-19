import { describe, expect, it } from "vite-plus/test";
import {
  docsRepo,
  mirrorA,
  mirrorB,
  mirrorOf,
  replicaA,
  replicaB,
  statusA,
} from "../../fixtures/sync/app.ts";
import {
  mirrorChainWithStatus,
  mirrorImportsRef,
  mirrorLoop,
  mirrorStory,
  replicaLoop,
  replicaPairs,
  replicasLoop,
  repoCommits,
} from "../../fixtures/sync/stories/sends.ts";
import type { Cut } from "../../src/host/testing/index.ts";
import { type ActorRef, RuntimeDefaults } from "../../src/index.ts";
import { refusedTurns, turnsOf, readerOf } from "../actors/sends.ts";
import { checked } from "../rules/rules.ts";
import { played } from "../rules/played.ts";

const syncCalls = (cut: Cut) => cut.calls.filter((c) => c.endpoint === "sync").length;

const HALF = RuntimeDefaults.loopGuard / 2;

const { is, idOf } = readerOf(mirrorStory("ids"));

// How a refusal names the chain's root: the host's push to mirror `a`, the event admitted.
const ROOT = `from Push to ${idOf(mirrorA).name}`;

// Every event the turns of the run sent: each replica push and each mirror forward, one per take.
const sentBy = (cut: Cut, replicas: ReadonlyArray<ActorRef>, forwarders: ReadonlyArray<ActorRef>) =>
  [
    ...replicas.map((r) => cut.read(r)?.memory.pushed),
    ...forwarders.map((m) => cut.read(m)?.memory.seen),
  ]
    .map(Number)
    .reduce((a, b) => a + b, 0);

describe("a repository tells its client to sync (Actors R16; Runtime O4's send table)", () => {
  it("Actors R16 live: a commit makes the client sync the repository, and a reported push syncs it again", async () => {
    const run = await played(repoCommits);

    expect(syncCalls(run.checkpoints.committed)).toBe(1);
    expect(syncCalls(run.checkpoints.pushed)).toBe(2);
    expect(turnsOf(run, is(docsRepo))).toEqual(expect.arrayContaining(["Commit", "PushSeen"]));
  });

  it("send check: an event the target's Schema refuses (a branch name for a commit) refuses the sender's turn InvalidTurn and reaches no one", async () => {
    const run = await played(mirrorImportsRef);
    const imported = run.checkpoints.imported;

    expect(refusedTurns(imported, mirrorA)).toHaveLength(1);
    expect(turnsOf(run, is(mirrorB))).toEqual([]);
    expect(imported.read(mirrorB)?.memory.lastSha).toBe("");
  });
});

describe("the loop guard (Actors R13, I20)", () => {
  it("Actors R13, I20: two mirrors forwarding to each other stop at the loop guard: the turn that would send one more is refused InvalidTurn, undone, naming the chain", async () => {
    const run = checked(await mirrorLoop.run());
    const stopped = run.checkpoints.stopped;
    const refused = refusedTurns(stopped, mirrorA);

    expect(refused).toHaveLength(1);
    expect(refused[0]?.summary).toContain(ROOT);
    expect(refused[0]?.summary).toContain(String(RuntimeDefaults.loopGuard));
    expect(refusedTurns(stopped, mirrorB)).toEqual([]);
    expect(stopped.read(mirrorA)?.memory.seen).toBe(HALF);
    expect(stopped.read(mirrorB)?.memory.seen).toBe(HALF);
  });

  it("Actors R13: a chain of exactly the loop guard's sends, each with a context update the status line hears, is never refused: context updates and their onContext events do not count", async () => {
    const run = checked(await mirrorChainWithStatus.run());
    const arrived = run.checkpoints.arrived;

    expect(refusedTurns(arrived, mirrorA)).toEqual([]);
    expect(refusedTurns(arrived, mirrorB)).toEqual([]);
    expect(arrived.read(mirrorA)?.memory.seen).toBe(HALF + 1);
    expect(arrived.read(mirrorB)?.memory.seen).toBe(HALF);
    expect(arrived.read(statusA)?.memory.seen).toBe(HALF + 1);
  });

  it("Actors R13, I20: sends made by onContext turns count: a replica pushing each commit its mirror takes, through a context update, to a mirror forwarding back is stopped at the loop guard, the replica's turn refused", async () => {
    const run = checked(await replicaLoop.run());
    const stopped = run.checkpoints.stopped;

    const refused = refusedTurns(stopped, replicaA);

    expect(refused).toHaveLength(1);
    expect(refused[0]?.summary).toContain(ROOT);
    expect(refusedTurns(stopped, mirrorB)).toEqual([]);
    expect(stopped.read(replicaA)?.memory.pushed).toBe(HALF);
    expect(stopped.read(mirrorB)?.memory.seen).toBe(HALF);
    expect(stopped.read(mirrorA)?.memory.seen).toBe(HALF + 1);
  });

  it("Actors R13, I20: one count per admitted event, shared by every consumer its context update reaches: a host push to a mirror that sends nothing, followed by two replicas feeding a mirror that forwards back, is refused once the run's sends reach the guard", async () => {
    const run = checked(await replicasLoop.run());
    const stopped = run.checkpoints.stopped;
    const refused = [replicaA, replicaB, mirrorB].flatMap((r) => refusedTurns(stopped, r));

    expect(refused.length).toBeGreaterThan(0);
    expect(refused.every((issue) => issue.summary.includes(ROOT))).toBe(true);
    expect(sentBy(stopped, [replicaA, replicaB], [mirrorB])).toBe(RuntimeDefaults.loopGuard);
  });

  it("Actors R13, I20: a deeper fan-out, two replicas each feeding its own pair of mirrors that forward to each other, is refused at the guard in total, never run on past it", async () => {
    const run = checked(await replicaPairs.run());
    const stopped = run.checkpoints.stopped;
    const pairs = ["b", "c", "d", "e"].map(mirrorOf);
    const refused = [replicaA, replicaB, ...pairs].flatMap((r) => refusedTurns(stopped, r));

    expect(refused.length).toBeGreaterThan(0);
    expect(refused.every((issue) => issue.summary.includes(ROOT))).toBe(true);
    expect(sentBy(stopped, [replicaA, replicaB], pairs)).toBe(RuntimeDefaults.loopGuard);
  });
});
