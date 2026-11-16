import { Effect, Option } from "effect";
import assert from "node:assert/strict";
import { describe, expect, it } from "vite-plus/test";
import {
  badge,
  BadgeMachine,
  coreTeam,
  guestBadge,
  guestSession,
  guestTeam,
  mainSession,
  OrgMachine,
  SessionMachine,
  TeamMachine,
  wallBadge,
} from "../../fixtures/session/machine.ts";
import { fanOut, longNames, parentUnderChildren, usual } from "../../fixtures/session/stories.ts";
import { generate, type StoryRun } from "../../src/host/testing/index.ts";
import { IdentityLive } from "../../fixtures/session/identity-http.ts";
import { app, FlowError, runtimeSetup } from "../../src/index.ts";
import { samples } from "../generated/fixtures.ts";
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

  // Open, on the tooling's side: a Story's dispose goes past the Runtime's disposeActor, which
  // Stories R3 says it is, so the refusal of a provider with bound consumers never runs and the
  // session is disposed under its team.
  it.fails("Stories R3; Actors R20: a session with a live team under it is not closed; once its descendants are closed it is, and the other tree restores", async () => {
    const run = checked(await parentUnderChildren.run());
    const { refused, closed, reloaded } = run.checkpoints;

    expect(refused.read(mainSession)?.lifecycle).toBe("active");
    expect(closed.read(mainSession)).toBeUndefined();
    expect(reloaded.read(guestBadge)?.context).toEqual({ team: "" });
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

describe("display names at a string's bound (Codec R1, R4; WriteAhead R4; Actors R8)", () => {
  it("WriteAhead R4: a name at 262,144 bytes is saved; one past it is reported UnencodableValue, the last good capture restores, and the next name that fits saves", async () => {
    const run = checked(await longNames.run());
    const at = run.checkpoints["at bound"];

    expect(at.read(mainSession)?.memory.displayName).toHaveLength(262_144);
    expect(at.records.stored.get("actor/Workspace/Session/main")).toContain(".".repeat(1000));
    expect(run.checkpoints["past bound"].read(guestSession)?.memory.displayName).toHaveLength(
      262_145,
    );
    expect(reports(run)).toContain("UnencodableValue actor/Workspace/Session/guest");
    expect(run.checkpoints.reloaded.read(guestSession)?.memory.displayName).toBe("");
    expect(run.checkpoints.reloaded.read(mainSession)?.memory.displayName).toHaveLength(262_144);
    expect(
      run.checkpoints["signed in"].records.stored.get("actor/Workspace/Session/guest"),
    ).toContain('"displayName":"bob"');
  });
});

describe("a badge that returns from its record (Turn I9)", () => {
  // Open, owned by actor identity: a returning actor publishes the same snapshot
  // twice with no turn between, its context wave counting a restored selection as changed.
  it.fails("Turn I9: an actor returning from its record publishes each snapshot once", () => {
    const run = generate(samples.session, { drawing: "mix", seed: 1 }).run;

    expect(publishedOnce.breaches(run)).toEqual([]);
  });
});
