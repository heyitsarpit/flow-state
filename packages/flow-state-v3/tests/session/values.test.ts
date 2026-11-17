import { describe, expect, it } from "vite-plus/test";
import {
  guestDot,
  guestPresence,
  mainAvatar,
  mainDigest,
  mainThread,
} from "../../fixtures/session/app.ts";
import {
  corruptSeen,
  digestHeard,
  digestQuiet,
  formatOneAvatar,
  guestDotReturns,
  nestedConflictingTeam,
  threadHeard,
} from "../../fixtures/session/stories/values.ts";
import { Step } from "../../src/host/testing/index.ts";
import { played } from "../rules/played.ts";
import { checked } from "../rules/rules.ts";

const reload = Step.reload({ reattach: true, heldWrites: "abort" });

describe("every value a selector returns, across reloads (Actors R9, R19)", () => {
  it("Actors R19: the digest hears each changed Date, undefined, NaN, -0, Map, Set, class instance, Option and nested mix once, and an equal one never", async () => {
    const run = await played(digestHeard);

    expect(run.checkpoints.heard.read(mainDigest)?.memory).toEqual(
      expect.objectContaining({ heard: 22, busy: 1 }),
    );
    expect(run.checkpoints.cleared.read(mainDigest)?.memory).toEqual(
      expect.objectContaining({ heard: 30, busy: 2 }),
    );
    expect(run.checkpoints.written.read(mainDigest)?.memory).toEqual(
      expect.objectContaining({ heard: 38, busy: 2 }),
    );
  });

  it("Actors R9, R19: a reload of the consistent saved world makes up no onContext event for any of those values, once or three times", async () => {
    const once = await played(digestHeard);

    const thrice = checked(
      await digestHeard.run({ steps: [...digestHeard.steps, reload, reload] }),
    );

    for (const run of [once, thrice]) {
      expect(run.checkpoints.reloaded.read(mainDigest)?.memory).toEqual(
        expect.objectContaining({ heard: 38, busy: 2 }),
      );
    }
  });

  it("Actors R18, R19: a selection holding cycles never crashes the run; the thread view hears each changed tree once, across reloads", async () => {
    const run = await played(threadHeard);

    expect(run.checkpoints.written.read(mainThread)?.memory["heard"]).toBe(5);
    expect(run.checkpoints.reloaded.read(mainThread)?.memory["heard"]).toBe(5);
  });
});

describe("a reaction's baseline across a reload (Turn R22; Restore R2)", () => {
  it("Turn R22: a reaction reading memory keeps the baseline it last saw: a reload after a memory-only change loses no event", async () => {
    const live = await played(digestQuiet);
    const at = digestQuiet.steps.findIndex((s) => s._tag === "checkpoint" && s.name === "raised");

    const reloaded = checked(
      await digestQuiet.run({ steps: digestQuiet.steps.toSpliced(at, 0, reload) }),
    );

    for (const run of [live, reloaded])
      expect(run.checkpoints.quiet.read(mainDigest)?.memory).toEqual(
        expect.objectContaining({ heard: 18, busy: 2 }),
      );
  });
});

describe("providers a consumer starts (Actors R5, R18)", () => {
  it("Actors R5: a nested ref naming a live provider with different context is refused ConflictingActorRef", async () => {
    await expect(nestedConflictingTeam().run()).rejects.toThrow(/ConflictingActorRef/u);
  });

  it("Actors R18: a provider never saved, started for a consumer, binds its own ref's overrides at a return and a reload", async () => {
    const run = await played(guestDotReturns);
    const { shown, returned, carol, reloaded, dan } = run.checkpoints;

    for (const cut of [shown, returned])
      expect(cut.read(guestPresence)?.context).toEqual({ user: "bob" });

    expect(carol.read(guestDot)?.context).toEqual({ online: "carol" });
    expect(reloaded.read(guestPresence)?.context).toEqual({ user: "carol" });
    expect(dan.read(guestDot)?.context).toEqual({ online: "dan" });
  });
});

describe("saved records of context consumers (Restore R5; Codec R3)", () => {
  it("Restore R5: a record naming a form no release writes is quarantined, never thrown, and the avatar starts fresh", async () => {
    const run = await played(corruptSeen);

    expect(run.checkpoints.boot.read(mainAvatar)?.lifecycle).toBe("quarantined");
    expect(run.checkpoints.fresh.read(mainAvatar)?.lifecycle).toBe("active");
  });

  it("Restore R5, T6: a format-1 record restores through the pure step with no made-up event, and records are written at the current format", async () => {
    const run = await played(formatOneAvatar);

    expect(run.checkpoints.restored.read(mainAvatar)).toEqual(
      expect.objectContaining({ memory: { seen: 1 }, context: { user: "ada" } }),
    );
    expect(run.checkpoints["signed out"].read(mainAvatar)?.memory).toEqual({ seen: 2 });
    expect(
      run.checkpoints["signed out"].records.stored.get("actor/Workspace/Avatar/avatar"),
    ).toContain('"format":2');
  });
});
