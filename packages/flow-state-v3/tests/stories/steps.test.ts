import { Option } from "effect";
import { describe, expect, it } from "vite-plus/test";
import { account } from "../../fixtures/transfers/machine.ts";
import { bankServer } from "../../fixtures/transfers/server.ts";
import { config, deadline, send, usual } from "../../fixtures/transfers/stories.ts";
import { Story } from "../../src/host/testing/index.ts";
import { at, endings, keysOf, memoryIn, turns } from "./read.ts";

const story = (...steps: Parameters<typeof Story.app>[2]) =>
  Story.app(config, [bankServer], steps).run();

describe("Story step words", () => {
  it("attach and send land two keyed transfers at once (WriteLanes R6)", async () => {
    const run = await usual.run();

    expect(endings(run)).toEqual(["transfer success success", "transfer success success"]);
    expect(memoryIn(at(run, "sent"), account)).toEqual(Option.some({ notice: "sent r2" }));
  });

  it("detach ends the use, so the nudge never fires (Turn I23, Actors R8)", async () => {
    const used = await story(
      Story.attach(account),
      send(account, "t1", 500),
      Story.advance("21 seconds"),
    );

    const detached = await story(
      Story.attach(account),
      send(account, "t1", 500),
      Story.detach(account),
      Story.advance("21 seconds"),
      Story.checkpoint("later"),
    );

    expect(turns(used)).toEqual(["Send", "Done", "Nudge"]);
    expect(turns(detached)).toEqual(["Send", "Done"]);
    expect(at(detached, "later").runtime.actors).toEqual([]);
    expect(keysOf(at(detached, "later"), "actor")).toHaveLength(1);
  });

  it("forget removes the identity's record (Actors R21)", async () => {
    const run = await story(
      Story.attach(account),
      send(account, "t1", 500),
      Story.checkpoint("kept"),
      Story.forget(account),
      Story.checkpoint("forgotten"),
    );

    expect(keysOf(at(run, "kept"), "actor")).toHaveLength(1);
    expect(keysOf(at(run, "forgotten"), "actor")).toEqual([]);
    expect(at(run, "forgotten").runtime.actors).toEqual([]);
  });

  it("disposeActor ends the actor and removes its record (Actors R20)", async () => {
    const run = await story(
      Story.attach(account),
      send(account, "t1", 500),
      Story.disposeActor(account),
      Story.checkpoint("disposed"),
    );

    expect(endings(run)).toEqual(["transfer success success"]);
    expect(at(run, "disposed").runtime.actors).toEqual([]);
    expect(keysOf(at(run, "disposed"), "actor")).toEqual([]);
  });

  it("disposeRuntime runs the Runtime's disposal to its end, keeping the last snapshot (Actors R22, R23)", async () => {
    const run = await story(
      Story.attach(account),
      send(account, "t1", 500),
      Story.disposeRuntime(),
      Story.checkpoint("disposed"),
    );

    expect(at(run, "disposed").runtime.disposal).toBe("Disposed");
    expect(run.evidence.filter((e) => e._tag === "RuntimeDisposed")).toHaveLength(1);
    expect(memoryIn(at(run, "disposed"), account)).toEqual(Option.some({ notice: "sent r1" }));
  });

  it("disposeRuntime with a call on the wire ends it unknown Disposed at the 5 s bound (Actors R22, I35)", async () => {
    const run = await story(
      Story.attach(account),
      bankServer.hold("transfer"),
      send(account, "t1", 500),
      Story.disposeRuntime(),
      Story.checkpoint("disposing"),
      Story.advance("5 seconds"),
      Story.checkpoint("disposed"),
    );

    expect(at(run, "disposing").runtime.disposal).toBe("Disposing");
    expect(at(run, "disposed").runtime.disposal).toBe("Disposed");
    expect(endings(run)).toEqual(["transfer unknown Disposed"]);
  });

  it("advance wakes the nudge at 20 s and the deadline at 30 s, not a millisecond before (Turn I22; WriteLanes R2)", async () => {
    const run = await deadline.run();
    const notice = (name: string) => memoryIn(at(run, name), account);

    expect(at(run, "before nudge").now).toBe(19_999);
    expect(notice("before nudge")).toEqual(Option.some({ notice: "" }));
    expect(notice("nudged")).toEqual(Option.some({ notice: ", nudged" }));
    expect(notice("before deadline")).toEqual(Option.some({ notice: ", nudged" }));
    expect(at(run, "late").now).toBe(30_000);
    expect(notice("late")).toEqual(Option.some({ notice: "check your statement" }));
    expect(turns(run)).toEqual(["Send", "Nudge", "Unsure"]);
    expect(endings(run)).toEqual(["transfer unknown TimedOut"]);
  });

  it("reload boots a new page and attaches again only the uses still held (Restore R3)", async () => {
    const run = await story(
      Story.attach(account),
      send(account, "t1", 500),
      Story.reload(),
      Story.checkpoint("kept"),
      Story.detach(account),
      Story.reload(),
      Story.checkpoint("released"),
    );

    expect(memoryIn(at(run, "kept"), account)).toEqual(Option.some({ notice: "sent r1" }));
    expect(at(run, "released").runtime.actors).toEqual([]);
    expect(keysOf(at(run, "released"), "actor")).toHaveLength(1);
  });
});
