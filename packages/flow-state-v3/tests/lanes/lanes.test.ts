import { Effect, Option } from "effect";
import assert from "node:assert/strict";
import { describe, expect, it } from "vite-plus/test";
import { lanesSetup, SerializeMachine, serializeClient } from "../../fixtures/lanes/machine.ts";
import { negativeZero, twoSpellings } from "../../fixtures/lanes/stories/edges.ts";
import { serializeAtCap } from "../../fixtures/lanes/stories/load.ts";
import {
  disposedWithWork,
  oneKeyTwoActors,
  reloadedWithWork,
} from "../../fixtures/lanes/stories/structure.ts";
import { attachInspector } from "../../src/host/inspect.ts";
import type { Cut, StoryRun } from "../../src/host/testing/index.ts";
import { FlowError } from "../../src/index.ts";
import { played } from "../rules/played.ts";

const endings = (run: StoryRun) =>
  run.evidence.flatMap((e) => (e._tag === "Ended" ? [`${e.channel} ${e.reason}`] : []));

// A burst past the admission bound: 1,100 sends queued behind one running turn.
const ADMISSION_BOUND = 1024;
const BURST = 1100;

// A head on the wire and the 64 commits `serialize` queues behind it.
const AT_CAP = 1 + 64;

const syncs = (cut: Cut) => cut.calls.filter((c) => c.endpoint === "sync").length;

describe("the lane policies at their bounds (fixtures.md L2)", () => {
  it("WriteLanes R7: under serialize a head and 64 queued commits are kept, the 66th commit ends NotSent Overloaded, and the queue drains in order", async () => {
    const run = await played(serializeAtCap);

    expect(endings(run).filter((e) => e.startsWith("notSent"))).toEqual(["notSent Overloaded"]);
    expect(syncs(run.checkpoints.full)).toBe(1);
    expect(syncs(run.checkpoints.drained)).toBe(AT_CAP);
  });

  it("Actors R14: past 1,024 pending events a send to one lanes client throws AdmissionOverloaded and changes nothing", () => {
    const runtime = lanesSetup.construct();
    Effect.runSync(runtime.ready());
    const client = runtime.ensureActor(serializeClient);
    const refused: Array<string> = [];
    let burst = true;

    attachInspector(runtime, (e) => {
      if (!burst || e._tag !== "Turn") return;
      burst = false;

      for (let n = 0; n < BURST; n += 1)
        try {
          client.send({ _tag: "Cancel", repo: "flow" });
        } catch (error) {
          assert.ok(error instanceof FlowError);
          refused.push(error.code);
        }
    });

    client.send({ _tag: "Cancel", repo: "flow" });

    expect(refused).toHaveLength(BURST - ADMISSION_BOUND);
    expect(new Set(refused)).toEqual(new Set(["AdmissionOverloaded"]));
    expect(Option.isSome(client.getSnapshot())).toBe(true);
    expect(SerializeMachine.compiled.id).toBe("Lanes/serialize");
  });
});

describe("lanes follow identities and keys (fixtures.md S3, S6; Operations O1)", () => {
  it("Actors R10: one repository under two clients is two lanes; the first's lost answer holds only its own", async () => {
    const run = await played(oneKeyTwoActors);

    expect(syncs(run.checkpoints.settled)).toBe(2);
    expect(
      run.evidence.flatMap((e) => (e._tag === "Delivered" ? [`${e.actor.name} ${e.event}`] : [])),
    ).toEqual(["serialize-1 Unsure", `serialize-2 Synced`]);
  });

  it("Actors R22: a disposal ends the queued commit NotSent Disposed and each head still on the wire unknown Disposed", async () => {
    const run = await played(disposedWithWork);

    expect(endings(run)).toEqual(
      expect.arrayContaining(["notSent Disposed", "unknown Disposed", "unknown Disposed"]),
    );
  });

  it("WriteAhead R14: a reload sends nothing again by itself: the four calls before it are all", async () => {
    const run = await played(reloadedWithWork);

    expect(syncs(run.checkpoints.reloaded)).toBe(4);
    expect(endings(run)).toEqual(expect.arrayContaining(["unknown Restored"]));
  });

  it("Operations O1: a name in composed and decomposed spelling names two lanes", async () => {
    const run = await played(twoSpellings);

    expect(syncs(run.checkpoints.both)).toBe(2);
  });

  it.fails("Operations O1: page -0 names the same lane as page 0, so it queues behind it and is sent, never declined Unencodable", async () => {
    const run = await played(negativeZero);

    expect(endings(run)).toEqual(["success success", "success success"]);
    expect(syncs(run.checkpoints.both)).toBe(1);
    expect(syncs(run.checkpoints.drained)).toBe(2);
  });
});
