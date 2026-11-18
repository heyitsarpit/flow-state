import { Option } from "effect";
import { describe, expect, it } from "vite-plus/test";
import { headlessLaneQueued, headlessQueued } from "../../fixtures/lanes/stories/findings.ts";
import { mainCart } from "../../fixtures/shop/app.ts";
import {
  borrowedRecordsReload,
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
import { badge } from "../../fixtures/session/app.ts";
import { chainBoundToLocal, forgedChain } from "../../fixtures/session/stories/findings.ts";
import {
  attemptForged,
  forgedAccount,
  heldAttemptNulled,
  heldNulled,
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

const reported = (run: StoryRun, open: number) =>
  inOpen(run, open).flatMap((e) => (e._tag === "Reported" ? Option.toArray(e.record) : []));

// The records of a machine no entry declares that the shop's borrowed records hold.
const gone = { actor: "actor/Gone/x", lane: "lane/Gone/x|add|{}" } as const;

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
      expect(delivered(run, 2).filter((d) => d.startsWith("add "))).toHaveLength(1);
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

describe("a lane record with no head (Restore R5; WriteAhead R5; WriteLanes I8)", () => {
  // Open: a headless lane record's queue and inFlight are read, so a queue no release wrote ends a
  // commit never made and wakes its identity.
  it.fails("Restore R5: a lane record with no head is never read for a queue or for being in flight: no commit ends and the boot wakes no one for it", async () => {
    const run = await headlessLaneQueued().run();
    const { booted } = run.checkpoints;

    expect(delivered(run, 2)).toEqual([]);
    expect(booted.inspection.actors).toEqual([]);
    expect(run.end.records.stored.get(headlessQueued.key)).toBeDefined();
    checked(run);
  });
});

describe("a forged binding in a provider chain, reloaded at the deepest node (Restore R5; WriteAhead I3)", () => {
  // Open: the session woken at the boot binds the local org its record names.
  it.fails("Restore R5: a session in the middle of a chain whose record binds a local org is quarantined and reported; it hears its owed ending and the chain runs from the deepest node", async () => {
    const run = await chainBoundToLocal().run();
    const { booted, restored } = run.checkpoints;

    expect(booted.inspection.lifecycle).toBe("Open");
    expect(undecodable(run, 2)).toContain(forgedChain.session);
    expect(restored.inspection.actors.map((a) => a.actor).filter((a) => a.includes("/~"))).toEqual(
      [],
    );
    expect(delivered(run, 2).filter((d) => d.startsWith("signIn "))).toHaveLength(1);
    expect(restored.read(badge)).toBeDefined();
    checked(run);
  });
});

describe("a Held lane record whose Attempt was nulled (Restore R5; WriteAhead R5)", () => {
  // Open: a lane record with no Attempt is read as a lane with no head, so the Held head and its
  // ending are lost with no report.
  it.fails("Restore R5: a lane record with no Attempt that still holds an input is quarantined and reported, and its lane still holds", async () => {
    const run = await heldAttemptNulled.run();

    expect(undecodable(run, 2)).toContain(heldNulled.key);
    expect(run.end.records.stored.get(heldNulled.key)).toBe(heldNulled.text);
    checked(run);
  });
});

describe("an actor record of a machine no entry declares (Restore R8)", () => {
  // Open: such a record is quarantined silently and kept, not discarded with a diagnostic.
  it.fails("Restore R8: an actor record of a machine no entry declares is discarded with a diagnostic, and its lanes are quarantined and reported", async () => {
    const run = await borrowedRecordsReload.run();

    expect(reported(run, 2)).toContain(gone.actor);
    expect(undecodable(run, 2)).toContain(gone.lane);
    expect(run.end.records.stored.has(gone.actor)).toBe(false);
  });
});

describe("records naming a state, a schedule or an Attempt (Restore R5, R7; Codec R5)", () => {
  // Open: a record's state, schedule names and Attempts are decoded as text and trusted.
  it.fails("Restore R5, R7: an actor record with no shape stamp in a state its machine lacks is quarantined and reported, never reset, and the actor starts fresh", async () => {
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
