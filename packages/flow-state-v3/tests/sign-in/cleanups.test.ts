import { describe, expect, it } from "vite-plus/test";
import { mainSession } from "../../fixtures/sign-in/app.ts";
import { Profiles } from "../../fixtures/sign-in/server/profiles.ts";
import { readCleanupDies, saveCleanupDies } from "../../fixtures/sign-in/stories/structure.ts";
import { sessionStory, signedIn } from "../../fixtures/sign-in/stories/usual.ts";
import type { StoryRun } from "../../src/host/testing/index.ts";
import { checked } from "../rules/rules.ts";

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
  it("Actors R23: a held read whose cleanup dies when the tab closes is one Issue CleanupFailed, heard by its incarnation's Owner, whose closer is the Runtime's disposal", async () => {
    const run = checked(await readCleanupDies.run());

    expect(cleanupIssues(run)).toBe(1);
    expect(recordsOf(run, (name) => name.startsWith("work/incarnation "))).toEqual([
      "call started false",
      "call Interrupted true",
      "report closer 1",
    ]);
  });

  it("Actors R23: a held save whose cleanup dies once the disposal's bound passes is one Issue CleanupFailed, heard by the Runtime's work", async () => {
    const run = checked(await saveCleanupDies.run());
    const work = recordsOf(run, (name) => name === "work");

    expect(cleanupIssues(run)).toBe(1);
    expect(work.filter((r) => r.startsWith("call "))).toEqual([
      "call started false",
      "call Interrupted true",
    ]);
    expect(work.at(-1)).toBe("report closer 1");
  });

  it("Gotcha (Diagnostics R8): a cleanup's typed failure under a port's catchTag is lost before its Owner judges it, since Effect's catch on an interrupted fiber keeps only the interrupt; a defect is kept", async () => {
    const run = checked(
      await sessionStory("sign-in/read-cleanup-fails")
        .ensure(mainSession)
        .world(Profiles.me.hold(), Profiles.me.cleanup("fails"))
        .send(mainSession, signedIn)
        .disposeRuntime()
        .run(),
    );

    expect(cleanupIssues(run)).toBe(0);
    expect(recordsOf(run, (name) => name.startsWith("work/incarnation "))).toEqual([
      "call started false",
      "call Interrupted false",
      "report closer 0",
    ]);
  });
});
