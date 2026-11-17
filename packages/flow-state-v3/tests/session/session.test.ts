import { Effect, Option } from "effect";
import assert from "node:assert/strict";
import { describe, expect, it } from "vite-plus/test";
import {
  badge,
  coreTeam,
  guestBadge,
  guestSession,
  guestTeam,
  mainSession,
  wallBadge,
} from "../../fixtures/session/app.ts";
import { BadgeMachine } from "../../fixtures/session/machines/badge.ts";
import { OrgMachine } from "../../fixtures/session/machines/org.ts";
import { SessionMachine } from "../../fixtures/session/machines/session.ts";
import { TeamMachine } from "../../fixtures/session/machines/team.ts";
import {
  fanOut,
  longNames,
  parentUnderChildren,
  samples,
  usual,
} from "../../fixtures/session/stories/usual.ts";
import { generate, type StoryRun } from "../../src/host/testing/index.ts";
import { IdentityLive } from "../../fixtures/session/adapters/identity.ts";
import { app, FlowError, runtimeSetup } from "../../src/index.ts";
import { checked, publishedOnce } from "../rules/rules.ts";

const reports = (run: StoryRun) =>
  run.evidence.flatMap((e) =>
    e._tag === "Reported" ? [`${e.code} ${Option.getOrElse(e.record, () => "-")}`] : [],
  );

describe("context trees across a reload (Actors R18; WriteAhead R4; Restore R2)", () => {
  it("Actors R18: every consumer restored from its record is bound to the provider its ref gave, at every depth of both trees", async () => {
    const run = checked(await usual.run());
    const { bound, restored, renamed } = run.checkpoints;

    for (const cut of [bound, restored]) {
      expect(cut.read(mainSession)?.context).toEqual({ org: "Acme" });
      expect(cut.read(guestSession)?.context).toEqual({ org: "Globex" });
      expect(cut.read(coreTeam)?.context).toEqual({ user: "ada" });
      expect(cut.read(guestTeam)?.context).toEqual({ user: "bob" });
      expect(cut.read(badge)?.context).toEqual({ team: "Core" });
      expect(cut.read(guestBadge)?.context).toEqual({ team: "Guests" });
    }

    expect(renamed.read(guestBadge)?.context).toEqual({ team: "Visitors" });
    expect(renamed.read(badge)?.context).toEqual({ team: "Core" });
  });

  it("Actors R18, R19: a wall of 24 badges on one team all show its new name, before and after a reload", async () => {
    const run = checked(await fanOut.run());

    for (const n of [0, 11, 23])
      expect(run.checkpoints.renamed.read(wallBadge(n))?.context).toEqual({ team: "Platform" });

    // Only the badges pinged after the reload are restored live.
    for (const n of [0, 23])
      expect(run.checkpoints.restored.read(wallBadge(n))?.context).toEqual({ team: "Platform" });
  });

  it("S6 parent first, Stories R3, Actors R20: closing a session with a live team under it is refused BlockedByDependents, naming the team", async () => {
    await expect(parentUnderChildren().run()).rejects.toThrow(
      /BlockedByDependents: .*Workspace\/Team\/core/u,
    );
  });
});

describe("refused context shapes (Actors R18)", () => {
  // The workspace's machines with no default organisation for a session.
  const unwired = runtimeSetup({
    app: app({
      id: "unwired-workspace",
      machines: {
        org: OrgMachine,
        session: SessionMachine,
        team: TeamMachine,
        badge: BadgeMachine,
      },
    }),
    services: IdentityLive("https://id.example"),
    scope: "unwired-workspace",
  });

  it("Actors R18: a session with no organisation to read from is refused MissingContextProvider", () => {
    const runtime = unwired.construct();
    Effect.runSync(runtime.ready());

    const refused = (() => {
      try {
        runtime.ensureActor(mainSession);

        return "admitted";
      } catch (error) {
        assert.ok(error instanceof FlowError);

        return error.code;
      }
    })();

    expect(refused).toBe("MissingContextProvider");
  });
});

describe("long display names (Codec R1; WriteAhead R4)", () => {
  it("Codec R1: names of 262,144 and 262,145 bytes are both saved and restored, nothing is reported, and the next name saves", async () => {
    const run = checked(await longNames.run());
    const at = run.checkpoints["at bound"];

    expect(at.read(mainSession)?.memory.displayName).toHaveLength(262_144);
    expect(at.records.stored.get("actor/Workspace/Session/main")).toContain(".".repeat(1000));
    expect(run.checkpoints["past bound"].read(guestSession)?.memory.displayName).toHaveLength(
      262_145,
    );
    expect(reports(run).filter((r) => r.startsWith("UnencodableValue"))).toEqual([]);
    expect(run.checkpoints.reloaded.read(guestSession)?.memory.displayName).toHaveLength(262_145);
    expect(run.checkpoints.reloaded.read(mainSession)?.memory.displayName).toHaveLength(262_144);
    expect(
      run.checkpoints["signed in"].records.stored.get("actor/Workspace/Session/guest"),
    ).toContain('"displayName":"bob"');
  });
});

describe("consumers that start from their records (Turn I9)", () => {
  it("Turn I9, Actors R9: a team returning after its user signed out publishes its start once, with the current user", () => {
    const run = generate(samples, { drawing: "mix", seed: 1 }).run;

    expect(publishedOnce.breaches(run)).toEqual([]);
  });
});
