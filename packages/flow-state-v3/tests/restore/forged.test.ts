import { Option } from "effect";
import { describe, expect, it } from "vite-plus/test";
import { headlessLaneQueued, headlessQueued } from "../../fixtures/lanes/stories/findings.ts";
import { mainCart } from "../../fixtures/shop/app.ts";
import {
  boundGraphToLocal,
  boundToGone,
  boundToLocal,
  boundToOtherMachine,
  forgedBindings,
  owedOtherLane,
  owedOtherLaneText,
} from "../../fixtures/shop/stories/findings.ts";
import { readLane, readOperationLane } from "../../fixtures/sign-in/stories/findings.ts";
import { account } from "../../fixtures/transfers/app.ts";
import {
  attemptForged,
  forgedAccount,
  scheduleUndeclared,
  attemptReloaded,
  stateUndeclared,
} from "../../fixtures/transfers/stories/findings.ts";
import type { StoryRun } from "../../src/host/testing/index.ts";
import { TraceRecord } from "../../src/host/trace.ts";
import { checked } from "../rules/rules.ts";

// The evidence of one open of the tab, in order.
const inOpen = (run: StoryRun, open: number) =>
  run.trace.events.flatMap((e) =>
    e.tab.open === open && TraceRecord.$is("Runtime")(e.record) ? [e.record.evidence] : [],
  );

const undecodable = (run: StoryRun, open: number) =>
  inOpen(run, open).flatMap((e) =>
    e._tag === "Reported" && e.code === "RecordUndecodable" ? Option.toArray(e.record) : [],
  );

const delivered = (run: StoryRun, open: number) =>
  inOpen(run, open).flatMap((e) => (e._tag === "Delivered" ? [`${e.operation} ${e.event}`] : []));

describe("an actor record's context bindings (Restore R1, R5; WriteAhead I3; Actors R18)", () => {
  // Open: a record's bindings are read as text, so an owing identity woken at the boot binds
  // whatever its record names.
  for (const [rule, story] of [
    ["a local shopper", boundToLocal],
    ["a cart under a name no cart has, in a slot a shopper provides", boundToOtherMachine],
    ["a machine no entry declares", boundToGone],
    ["a graph binding its provider's slot to a local actor", () => boundGraphToLocal],
  ] as const)
    it.fails(`Restore R5: an owing cart whose record binds ${rule} is quarantined and reported; it starts fresh at its ensure and the boot goes on`, async () => {
      const run = await story().run();
      const { booted, restored } = run.checkpoints;

      expect(booted.inspection.lifecycle).toBe("Open");
      expect(undecodable(run, 2)).toContain(forgedBindings.cart);
      expect(
        restored.inspection.actors.map((a) => a.actor).filter((a) => a.includes("/~")),
      ).toEqual([]);
      expect(restored.read(mainCart)?.memory["lines"]).toEqual({});
      expect(restored.inspection.owed).toEqual([]);
      checked(run);
    });
});

describe("a lane record of a read operation (Restore R5; WriteLanes R6; Reads R6)", () => {
  // Open: a lane record's operation is checked as declared, not as a write, so a read's lane
  // restores Held and is never ended or reported.
  it.fails("Restore R5: a lane record naming a read operation is quarantined and reported, and no lane of the read is held", async () => {
    const run = await readOperationLane.run();
    const { restored } = run.checkpoints;

    expect(undecodable(run, 2)).toContain(readLane.key);
    expect(restored.inspection.lanes.filter((l) => l.operation === "me")).toEqual([]);
    checked(run);
  });
});

describe("a lane record with no head (Restore R1, R5; WriteAhead R5)", () => {
  // Open: a headless lane record's queue and inFlight are read, so a queue no release wrote ends a
  // commit never made and wakes its identity.
  it.fails("Restore R1: a lane record with no head is never read for a queue or for being in flight: no commit ends and the boot wakes no one for it", async () => {
    const run = await headlessLaneQueued().run();
    const { booted } = run.checkpoints;

    expect(delivered(run, 2)).toEqual([]);
    expect(booted.inspection.actors).toEqual([]);
    expect(run.end.records.stored.get(headlessQueued.key)).toBeDefined();
    checked(run);
  });
});

describe("records naming a state, a schedule or an Attempt (Restore R5; Codec R5)", () => {
  // Open: a record's state, schedule names and Attempts are decoded as text and trusted.
  it.fails("Restore R5: an actor record in a state its machine lacks is quarantined and reported, and the actor starts fresh", async () => {
    const run = await stateUndeclared.run();

    expect(undecodable(run, 2)).toContain(forgedAccount.state.key);
    expect(run.checkpoints.restored.read(account)?.state).toBe("READY");
    checked(run);
  });

  it.fails("Restore R5: a quarantined lane record is reported at each boot while it stays, and reloads never fail", async () => {
    const run = await attemptReloaded.run();

    for (const open of [2, 3, 4])
      expect(undecodable(run, open)).toContain(forgedAccount.attempt.key);
    expect(run.end.inspection.lifecycle).toBe("Open");
    checked(run);
  });

  it.fails("Restore R5: an actor record arming a schedule its machine never declared is quarantined and reported, and no such timer arms", async () => {
    const run = await scheduleUndeclared.run();

    expect(undecodable(run, 2)).toContain(forgedAccount.schedule.key);
    expect(
      run.checkpoints.restored.read(account)?.schedules.filter((s) => s.key === "gone"),
    ).toEqual([]);
    checked(run);
  });

  it.fails("Restore R5: a lane record whose Attempt is not one the Runtime mints is quarantined and reported, and no ending is heard for it", async () => {
    const run = await attemptForged.run();

    expect(undecodable(run, 2)).toContain(forgedAccount.attempt.key);
    expect(run.checkpoints.restored.inspection.lanes.filter((l) => l.attempt === "x")).toEqual([]);
    expect(delivered(run, 2)).toEqual([]);
    checked(run);
  });

  it.fails("Restore R5: an owed row naming a lane by key text its operation's key never gives is quarantined and reported, and nothing is heard from it", async () => {
    const run = await owedOtherLane.run();

    expect(undecodable(run, 2)).toContain(owedOtherLaneText.key);
    expect(delivered(run, 2)).toEqual([]);
    checked(run);
  });
});
