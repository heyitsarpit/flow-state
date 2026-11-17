import { Option, Predicate } from "effect";
import { describe, expect, it } from "vite-plus/test";
import { Envelope } from "../../fixtures/session/machines/inbox.ts";
import {
  agendaPeek,
  guestDot,
  guestPresence,
  mainAgenda,
  mainArchive,
  mainAvatar,
  mainDigest,
  mainThread,
  mainUnread,
} from "../../fixtures/session/app.ts";
import {
  agendaLong,
  archiveLarge,
  corruptSeen,
  digestHeard,
  digestQuiet,
  formatOneAvatar,
  guestDotReturns,
  nestedConflictingTeam,
  threadHeard,
  unreadRecovers,
} from "../../fixtures/session/stories/values.ts";
import { Step, type StoryRun } from "../../src/host/testing/index.ts";
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
      await digestHeard.run({
        steps: [...digestHeard.steps, reload, reload, Step.checkpoint({ name: "thrice" })],
      }),
    );

    expect(once.checkpoints.reloaded.read(mainDigest)?.memory).toEqual(
      expect.objectContaining({ heard: 38, busy: 2 }),
    );
    expect(thrice.checkpoints["thrice"]?.read(mainDigest)?.memory).toEqual(
      expect.objectContaining({ heard: 38, busy: 2 }),
    );
  });

  it("Actors R18: after a reload the digest reads each slot as its Schema reads it back: a Date, a Map, a Set, a class instance, an Option, NaN, and -0 held equal to 0", async () => {
    const run = await played(digestHeard);
    const context = run.checkpoints.reloaded.read(mainDigest)?.context ?? {};

    const latest = context["latest"];

    expect(Predicate.isDate(latest) ? latest.getTime() : latest).toBe(4_000);
    expect(context["unread"]).toBe(1);
    expect(Object.is(context["owed"], -1)).toBe(true);
    expect(context["bySender"]).toEqual(new Map([["bob", 1]]));
    expect(context["senders"]).toEqual(new Set(["bob"]));
    expect(context["envelope"]).toEqual(new Envelope({ from: "bob", at: 4_000 }));
    expect(context["first"]).toEqual(Option.some("bob"));
    // Live it is the -0 the selector gave; a record writes it 0, which Equal holds the same.
    expect(run.checkpoints.cleared.read(mainDigest)?.context["owed"] === 0).toBe(true);
    // The record saves that -0 as 0, never unknown.
    expect(
      JSON.parse(
        run.checkpoints.cleared.records.stored.get("actor/Workspace/Digest/digest") ?? "{}",
      ),
    ).toEqual(expect.objectContaining({ unknown: [], seen: expect.objectContaining({ owed: 0 }) }));
    expect(Number.isNaN(run.checkpoints.cleared.read(mainDigest)?.context["unread"])).toBe(true);
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
        expect.objectContaining({ heard: 19, busy: 2 }),
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
    ).toContain('"format":3');
  });
});

const reported = (run: StoryRun, code: string) =>
  run.evidence.flatMap((e) =>
    e._tag === "Reported" && e.code === code ? [Option.getOrElse(e.record, () => "-")] : [],
  );

describe("a selection past a record's bounds (Actors R18; Codec R4)", () => {
  it("Codec R4, Actors R18: 5,000 days, past 4,096 items, are read and heard by a saved and an unsaved consumer, never a selector's defect; the saved one reports UnencodableValue", async () => {
    const run = await played(agendaLong);
    const { short, long } = run.checkpoints;

    for (const actor of [mainAgenda, agendaPeek]) {
      expect(short.read(actor)?.memory["heard"]).toBe(1);
      expect(long.read(actor)?.memory["heard"]).toBe(2);
      expect(long.read(actor)?.issues).toEqual([]);
      expect(long.read(actor)?.context["days"]).toHaveLength(5_000);
    }

    expect(reported(run, "UnencodableValue")).toContain("actor/Workspace/Agenda/agenda");
  });

  it("Actors R9, R18: the saved agenda restores with its days saved unknown, so the reload may hear them once more but never misses one; its state and memory are saved", async () => {
    const run = await played(agendaLong);
    const { reloaded, back } = run.checkpoints;

    expect(reloaded.read(mainAgenda)?.context["days"]).toHaveLength(5_000);
    expect(reloaded.read(mainAgenda)?.memory["heard"]).toBe(3);
    expect(back.read(mainAgenda)?.memory["heard"]).toBe(4);
  });
});

describe("issues cleared by their own source (Turn R25; Actors R19)", () => {
  it("Turn R25: a slot its Schema refuses and a mapper that throws each raise an issue, cleared when its own source next succeeds", async () => {
    const run = await played(unreadRecovers);

    const sources = (cut: keyof typeof run.checkpoints) =>
      (run.checkpoints[cut].read(mainUnread)?.issues ?? []).map((i) => i.path[2]);

    expect(sources("empty")).toEqual(["context oldest"]);
    expect(sources("first")).toEqual([]);
    expect(sources("read")).toEqual(["context oldest"]);
    expect(sources("spam")).toEqual(["onContext 0"]);
    expect(sources("recovered")).toEqual([]);
    expect(run.checkpoints.recovered.read(mainUnread)?.memory["opened"]).toEqual(["m1", "m3"]);
  });
});

describe("a large memory read by several reactions (Turn R22; Actors R18; WriteAhead R4)", () => {
  it("Actors R18, Turn R22: three reactions reading a 3,001-row log never push the record past a bound, so a reload keeps every row and hears what it would live", async () => {
    const run = await played(archiveLarge);

    const rows = (cut: "logged" | "reloaded" | "again") =>
      ((log) => (Array.isArray(log) ? log.length : 0))(
        run.checkpoints[cut].read(mainArchive)?.memory.log,
      );

    expect(rows("logged")).toBe(3_003);
    expect(rows("reloaded")).toBe(3_003);
    expect(rows("again")).toBe(3_005);
    expect(reported(run, "UnencodableValue")).toEqual([]);
  });
});
