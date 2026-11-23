import { Effect, Layer } from "effect";
import { describe, expect, it } from "vite-plus/test";
import { authGrownSetup, mainSession } from "../../fixtures/sign-in/app.ts";
import { ProfileApi, Unanswered } from "../../fixtures/sign-in/services.ts";
import { AuthFake } from "../../fixtures/sign-in/server/layer.ts";
import { Profiles } from "../../fixtures/sign-in/server/profiles.ts";
import { readCleanupDies, saveCleanupDies } from "../../fixtures/sign-in/stories/structure.ts";
import { sessionStory, signedIn } from "../../fixtures/sign-in/stories/usual.ts";
import { Story, type StoryRun } from "../../src/host/testing/index.ts";
import { checked } from "../rules/rules.ts";

// A profile port fake whose read handles its own error with catchTag, as an app's client that
// retries or relabels an unanswered read does.
const CatchingProfileFake = Layer.effect(
  ProfileApi,
  Effect.map(Profiles, (profiles) =>
    ProfileApi.of({
      setUsername: (input, { idempotencyKey }) =>
        profiles.setUsername({ ...input, key: idempotencyKey }),
      me: (input) =>
        profiles.me(input).pipe(Effect.catchTag("Unanswered", () => Effect.fail(new Unanswered()))),
    }),
  ),
);

// The run's CleanupFailed Issues.
const cleanupIssues = (run: StoryRun) =>
  run.evidence.filter((e) => e._tag === "Issue" && e.code === "CleanupFailed").length;

// One Owner's records in the trace: each task's phase and whether its cleanup failed, and each
// report's closer and causes.
const recordsOf = (run: StoryRun, owner: (name: string) => boolean) =>
  run.trace.events.flatMap(({ record }) => {
    if (record._tag === "Task" && owner(record.owner))
      return [`${record.key.split("/")[0]} ${record.phase} ${record.failed}`];

    if (record._tag === "Report" && owner(record.owner))
      return [`report ${record.heardBy} ${record.causes}`];

    return [];
  });

describe("a fake call whose cleanup fails as it is cancelled (Actors R23, Diagnostics R8)", () => {
  // Operations, Start and Releases: a read's request is its entry's and runs in the Runtime's work,
  // so the Runtime's Owner hears its failed cleanup, as it does a write's.
  it("Actors R23; Operations, Releases: a held read whose cleanup dies when the tab closes is one Issue CleanupFailed, heard by the Runtime's work", async () => {
    const run = checked(await readCleanupDies.run());
    const work = recordsOf(run, (name) => name === "work");

    expect(cleanupIssues(run)).toBe(1);
    expect(work.filter((r) => r.startsWith("call "))).toEqual([
      "call started false",
      "call Interrupted true",
    ]);
    expect(work.at(-1)).toBe("report closer 1");
  });

  it("Actors R23: a held save whose cleanup dies once the disposal's bound passes is one Issue CleanupFailed, heard by the Runtime's work, after the profile read it ran answered", async () => {
    const run = checked(await saveCleanupDies.run());
    const work = recordsOf(run, (name) => name === "work");

    expect(cleanupIssues(run)).toBe(1);
    expect(work.filter((r) => r.startsWith("call "))).toEqual([
      "call started false",
      "call Done false",
      "call started false",
      "call Interrupted true",
    ]);
    expect(work.at(-1)).toBe("report closer 1");
  });

  it("Actors R23, I48; Diagnostics R8: a held read whose cleanup fails with a typed error, through a port fake that passes the call through, is one Issue CleanupFailed, as a cleanup that dies is", async () => {
    const run = checked(
      await sessionStory("sign-in/read-cleanup-fails")
        .ensure(mainSession)
        .world(Profiles.me.hold(), Profiles.me.cleanup("fails"))
        .send(mainSession, signedIn)
        .disposeRuntime()
        .run(),
    );

    const work = recordsOf(run, (name) => name === "work");

    expect(cleanupIssues(run)).toBe(1);
    expect(work.filter((r) => r.startsWith("call "))).toEqual([
      "call started false",
      "call Interrupted true",
    ]);
    expect(work.at(-1)).toBe("report closer 1");
  });

  it("Gotcha (Actors R23, I48; Diagnostics R8): a cleanup's typed failure under a port's catchTag never reaches the effect Flow runs, since Effect's catch on an interrupted fiber keeps only the interrupt; a defect is kept", async () => {
    const run = checked(
      await Story.app(authGrownSetup, {
        id: "sign-in/read-cleanup-fails-caught",
        fixtures: [AuthFake, CatchingProfileFake],
      })
        .ensure(mainSession)
        .world(Profiles.me.hold(), Profiles.me.cleanup("fails"))
        .send(mainSession, signedIn)
        .disposeRuntime()
        .run(),
    );

    const work = recordsOf(run, (name) => name === "work");

    expect(cleanupIssues(run)).toBe(0);
    expect(work.filter((r) => r.startsWith("call "))).toEqual([
      "call started false",
      "call Interrupted false",
    ]);
    expect(work.at(-1)).toBe("report closer 0");
  });
});
