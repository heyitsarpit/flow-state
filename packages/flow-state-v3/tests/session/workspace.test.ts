import { Effect, Option } from "effect";
import assert from "node:assert/strict";
import { describe, expect, it } from "vite-plus/test";
import {
  mainAvatar,
  mainByline,
  teamStatus,
  wallAvatar,
  workspaceGrownSetup,
} from "../../fixtures/session/app.ts";
import {
  badge,
  coreTeam,
  guestTeam,
  mainSession,
  wallBadge,
  workspaceSetup,
} from "../../fixtures/session/app.ts";
import { BadgeMachine } from "../../fixtures/session/machines/badge.ts";
import { corruptRecord, oversizedRecord } from "../../fixtures/session/stories/edges.ts";
import { avatarWall65, wall64 } from "../../fixtures/session/stories/load.ts";
import {
  bylineReturns,
  childFirst,
  conflictingBadge,
  guestBadgeFirst,
  missingTeam,
  newAccountRuntime,
  refusedLoadKeepsData,
  refusedWriteRetries,
  shellBeforeSession,
  signedOutReloaded,
  signedOutUndefined,
  teamForgotten,
} from "../../fixtures/session/stories/structure.ts";
import { attachInspector } from "../../src/host/inspect.ts";
import { FlowError } from "../../src/index.ts";
import { played } from "../rules/played.ts";

describe("the workspace shell", () => {
  it("Actors R18: the shell's team and badge are live while the session's sign-in is still on the wire", async () => {
    const run = await played(shellBeforeSession);
    const at = run.checkpoints.pending;

    expect(at.read(mainSession)?.state).toBe("SIGNING_IN");
    expect(at.read(badge)).toEqual(
      expect.objectContaining({ state: "SHOWN", context: { team: "" } }),
    );
  });

  it("Restore R10: a sign-out that disposes the Runtime with forget leaves the next account nothing of the last", async () => {
    const run = await played(newAccountRuntime);

    expect(run.checkpoints.next.read(mainSession)).toEqual(
      expect.objectContaining({
        state: "SIGNED_OUT",
        memory: expect.objectContaining({ user: "" }),
      }),
    );
    expect(run.checkpoints.next.read(coreTeam)?.memory["name"]).toBe("");
    expect(run.checkpoints.bob.read(coreTeam)).toEqual(
      expect.objectContaining({ context: { user: "bob" }, memory: { name: "" } }),
    );
  });
});

describe("storage failures (Restore R5, R9)", () => {
  it("E7, Restore R5: a corrupt badge record is quarantined, and an ensure starts the badge fresh", async () => {
    const run = await played(corruptRecord);

    expect(run.checkpoints.boot.read(badge)?.lifecycle).toBe("quarantined");
    expect(run.checkpoints.fresh.read(badge)).toEqual(
      expect.objectContaining({ lifecycle: "active", memory: { pings: 0 } }),
    );
  });

  it("E3, Restore R5: a 2 MB saved text that is no record is quarantined", async () => {
    const run = await played(oversizedRecord);

    expect(run.checkpoints.boot.read(badge)?.lifecycle).toBe("quarantined");
  });

  it("Restore R9: a refused write keeps the live name, and the next publication saves the newest, which a reload restores", async () => {
    const run = await played(refusedWriteRetries);

    expect(run.checkpoints.refused.read(coreTeam)?.memory["name"]).toBe("Core");
    expect(run.checkpoints.reloaded.read(coreTeam)?.memory["name"]).toBe("Platform");
  });

  it("Restore R9: a refused load starts with no persistence, so its writes never overwrite the saved team, which the next boot restores", async () => {
    const run = await played(refusedLoadKeepsData);

    expect(run.checkpoints.unloaded.read(coreTeam)?.memory["name"]).toBe("");
    expect(run.checkpoints.healed.read(coreTeam)?.memory["name"]).toBe("Core");
  });
});

describe("the workspace's structures (fixtures.md S2, S6, S7; E1, E2)", () => {
  it("S2 x 64 under L5: a team renamed under 64 badges reaches each one once", async () => {
    const run = await played(wall64);

    for (const n of [0, 31, 63])
      expect(run.checkpoints.renamed.read(wallBadge(n))?.context).toEqual({ team: "Platform" });
  });

  it("S6 child first: badges, then the team, the session and the organisation close, leaving nothing", async () => {
    const run = await played(childFirst);

    expect(run.checkpoints.closed.inspection.actors).toEqual([]);
  });

  it("S6 forgotten: a team forgotten after its badges end starts fresh under the next badge", async () => {
    const run = await played(teamForgotten);

    expect(run.checkpoints.fresh.read(coreTeam)?.memory["name"]).toBe("");
  });

  it("E1, Actors R19: a sign-out empties the user every team below the session reads", async () => {
    const run = await played(signedOutUndefined);

    expect(run.checkpoints["signed out"].read(coreTeam)?.context).toEqual({ user: "" });
  });

  it("E2, Actors R9, R18, R19: an avatar whose user selection is undefined is saved with that value; a reload of that saved world owes no wave, so its count stays", async () => {
    const run = await played(signedOutReloaded);
    const saved = run.checkpoints["signed out"].records.stored.get("actor/Workspace/Avatar/avatar");
    const record = JSON.parse(saved ?? "{}");

    expect(record.memory).toEqual({ seen: 2 });
    // The slot's Schema, UndefinedOr(String), writes undefined as null.
    expect(record.seen).toEqual({ user: null });
    expect(run.checkpoints.reloaded.read(mainAvatar)?.memory["seen"]).toBe(2);
    expect(Object.entries(run.checkpoints.reloaded.read(mainAvatar)?.context ?? {})).toEqual([
      ["user", undefined],
    ]);
  });

  it("S6 returned, Actors R9, R18; Turn I9: a byline that comes back after its user and team changed shows both at once and hears each change once; a reload after it hears nothing", async () => {
    const run = await played(bylineReturns);
    const at = (name: keyof typeof run.checkpoints) => run.checkpoints[name].read(mainByline);

    expect(at("shown")?.memory).toEqual({ users: 1, teams: 1 });
    expect(Object.entries(at("returned")?.context ?? {})).toEqual([
      ["user", undefined],
      ["team", "Platform"],
    ]);
    expect(at("returned")?.memory).toEqual({ users: 2, teams: 2 });
    expect(Object.entries(at("reloaded")?.context ?? {})).toEqual([
      ["user", undefined],
      ["team", "Platform"],
    ]);
    expect(at("reloaded")?.memory).toEqual({ users: 2, teams: 2 });
  });

  it("S5, Actors R5, R18: a team started as the guests' badge's provider binds the session its own ref names, so opening the team by that ref later is the same identity", async () => {
    const run = await played(guestBadgeFirst);

    expect(run.checkpoints.badge.read(guestTeam)?.context).toEqual({ user: "bob" });
    expect(run.checkpoints.team.read(guestTeam)?.context).toEqual({ user: "bob" });
  });

  it("E4, Actors R13: 65 avatars on one session each hear a sign-in, since context updates and onContext events never count toward the 64 follow-ups", async () => {
    const run = await played(avatarWall65);

    for (const n of [0, 63, 64]) {
      expect(run.checkpoints["signed in"].read(wallAvatar(n))?.context).toEqual({ user: "ada" });
      expect(run.checkpoints["signed in"].read(wallAvatar(n))?.memory["seen"]).toBe(1);
    }
  });

  it("S7, Actors R5, Stories R3: a Story's second ref to the live badge naming another team is refused ConflictingActorRef", async () => {
    await expect(conflictingBadge().run()).rejects.toThrow(/ConflictingActorRef/u);
  });

  it("S7, Actors R18, Stories R3: a Story's ensure of a status with no team to read is refused MissingContextProvider", async () => {
    await expect(missingTeam().run()).rejects.toThrow(/MissingContextProvider/u);
  });

  it("S7, Actors R18: ensureActor of a status with no team to read is refused MissingContextProvider", () => {
    const runtime = workspaceGrownSetup.construct();
    Effect.runSync(runtime.ready());

    try {
      runtime.ensureActor(teamStatus);
      assert.fail("the status was admitted");
    } catch (error) {
      assert.ok(error instanceof FlowError);
      expect(error.code).toBe("MissingContextProvider");
    }
  });
});

// A burst past the admission bound: 1,100 pings queued behind one running turn.
const ADMISSION_BOUND = 1024;
const BURST = 1100;

describe("one badge's mailbox (fixtures.md L2; Actors R14)", () => {
  it("Actors R14: past 1,024 pending pings a send to one badge throws AdmissionOverloaded and changes nothing", () => {
    const runtime = workspaceSetup.construct();
    Effect.runSync(runtime.ready());
    const handle = runtime.ensureActor(badge);
    const refused: Array<string> = [];
    let burst = true;

    attachInspector(runtime, (e) => {
      if (!burst || e._tag !== "Turn") return;
      burst = false;

      for (let n = 0; n < BURST; n += 1)
        try {
          handle.send({ _tag: "Ping" });
        } catch (error) {
          assert.ok(error instanceof FlowError);
          refused.push(error.code);
        }
    });

    handle.send({ _tag: "Ping" });

    expect(refused).toHaveLength(BURST - ADMISSION_BOUND);
    expect(new Set(refused)).toEqual(new Set(["AdmissionOverloaded"]));
    expect(Option.map(handle.getSnapshot(), (s) => s.memory["pings"])).toEqual(
      Option.some(1 + ADMISSION_BOUND),
    );
    expect(BadgeMachine.compiled.id).toBe("Workspace/Badge");
  });
});
