import { Effect } from "effect";
import assert from "node:assert/strict";
import { describe, expect, it } from "vite-plus/test";
import { authTrustedSetup, deviceOf, laptop, mainSession } from "../../fixtures/sign-in/app.ts";
import { deviceDateEdges, EARLIEST, EPOCH, LATEST } from "../../fixtures/sign-in/stories/edges.ts";
import { manyDevices, untilOf } from "../../fixtures/sign-in/stories/load.ts";
import {
  deviceChain,
  deviceFirst,
  deviceRemindingByDay,
  deviceSessionForgotten,
  deviceWithBareContract,
  deviceWithDefinitionAsContext,
  deviceWithNullHandler,
  deviceWithTextField,
  sessionFirstUnderDevice,
} from "../../fixtures/sign-in/stories/structure.ts";
import { LAPTOP_SEEN, LAPTOP_UNTIL, trustDevice } from "../../fixtures/sign-in/stories/usual.ts";
import { FlowError } from "../../src/index.ts";
import { played } from "../rules/played.ts";

const refusal = (construct: () => unknown) => {
  try {
    construct();
  } catch (error) {
    if (error instanceof FlowError)
      return error.diagnostics.map(
        (d) => [d.code, d.details["reason"] ?? null, d.path.join(".")] as const,
      );

    throw error;
  }

  return [] as const;
};

const loose = (value: unknown) =>
  // SAFETY: each refused payload is one the types reject; the send must refuse it at run time too.
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- the untyped caller a send guards against
  value as never;

const invalidEvent = (error: unknown) =>
  error instanceof FlowError && error.code === "InvalidEvent";

describe("a device trusted until a date (Compile R14, Actors R14)", () => {
  it("Turn R12: signed out, a device is denied trust; signed in, the Trust whose date the DateFromString field holds as a Date is sent and kept", async () => {
    const run = await played(trustDevice);

    expect(run.checkpoints["signed out"].read(laptop)?.state).toBe("UNTRUSTED");
    expect(run.checkpoints.trusted.read(laptop)).toEqual(
      expect.objectContaining({
        state: "TRUSTED.FRESH",
        memory: expect.objectContaining({
          until: LAPTOP_UNTIL,
          label: "Elif's laptop",
          lastSeen: LAPTOP_SEEN,
          signedIn: true,
        }),
      }),
    );
  });

  it("Turn R14: a millisecond short of a week the device is fresh; at a week it is due to be confirmed again", async () => {
    const run = await played(trustDevice);

    expect(run.checkpoints["just short of a week"].read(laptop)?.state).toBe("TRUSTED.FRESH");
    expect(run.checkpoints["a week on"].read(laptop)?.state).toBe("TRUSTED.DUE");
  });

  it("Codec I1, Restore R1: the device's dates read back equal after a reload, and revoking clears its end", async () => {
    const run = await played(trustDevice);

    expect(run.checkpoints.reloaded.read(laptop)).toEqual(
      run.checkpoints["a week on"].read(laptop),
    );
    expect(run.checkpoints.revoked.read(laptop)).toEqual(
      expect.objectContaining({
        state: "UNTRUSTED",
        memory: expect.objectContaining({ until: null }),
      }),
    );
  });
});

describe("device dates at their edges (fixtures.md E1, E2)", () => {
  it("Compile R5, R14: trust until the epoch, the earliest and the latest date a Date holds; a label absent or undefined is none (E2); a device seen at no time holds null", async () => {
    const run = await played(deviceDateEdges);
    const trusted = run.checkpoints.trusted;

    expect(trusted.read(deviceOf(0))?.memory).toEqual(
      expect.objectContaining({ until: EPOCH, lastSeen: null }),
    );
    expect(trusted.read(deviceOf(0))?.memory["label"]).toBeUndefined();
    expect(trusted.read(deviceOf(1))?.memory).toEqual(
      expect.objectContaining({ until: LATEST, lastSeen: LATEST }),
    );
    expect(trusted.read(deviceOf(1))?.memory["label"]).toBeUndefined();
    expect(trusted.read(deviceOf(2))?.memory).toEqual(
      expect.objectContaining({ until: EARLIEST, label: "" }),
    );
  });

  it("Codec I1, Restore R1: every edge date, null and absent label reads back equal after a reload", async () => {
    const run = await played(deviceDateEdges);

    for (const n of [0, 1, 2])
      expect(run.checkpoints.reloaded.read(deviceOf(n))).toEqual(
        run.checkpoints.trusted.read(deviceOf(n)),
      );
  });
});

describe("device payloads a send refuses (fixtures.md E2, E7)", () => {
  it("E2, E7, Actors R14, Compile R14: a trust date that is null, undefined, or the ISO text the field encodes to is refused InvalidEvent; a seen time of undefined is refused where null is allowed", () => {
    const runtime = authTrustedSetup.construct();
    Effect.runSync(runtime.ready());
    const handle = runtime.ensureActor(laptop);

    const refused = [
      ...[null, undefined, "2027-01-15T09:30:00.000Z"].map((until) => ({ _tag: "Trust", until })),
      { _tag: "Seen", at: undefined },
      { _tag: "Seen" },
    ];

    for (const event of refused) assert.throws(() => handle.send(loose(event)), invalidEvent);
  });
});

describe("many devices one session trusts (fixtures.md S2 × 16 under L4)", () => {
  it("Codec I1, Restore R1: 16 devices, each trusted until its own date, keep their dates across two reloads", async () => {
    const run = await played(manyDevices);

    for (const n of [0, 1, 8, 15])
      expect(run.checkpoints.end.read(deviceOf(n))).toEqual(
        expect.objectContaining({
          state: "TRUSTED.FRESH",
          memory: expect.objectContaining({ until: untilOf(n), label: `device ${String(n)}` }),
        }),
      );
  });
});

describe("a trusted device under its session (fixtures.md S1 with S9, S6)", () => {
  it("Actors R21, Restore R2, Turn R12: the session forgotten, the laptop ensured again keeps its trust but reads a signed-out session, so a new trust until a later date is denied", async () => {
    const run = await played(deviceSessionForgotten);
    const fresh = run.checkpoints.fresh;

    expect(fresh.read(mainSession)?.state).toBe("SIGNED_OUT");
    expect(fresh.read(laptop)).toEqual(
      expect.objectContaining({
        state: "TRUSTED.FRESH",
        context: { session: false },
        memory: expect.objectContaining({ until: LAPTOP_UNTIL, signedIn: false }),
      }),
    );
    expect(fresh.read(laptop)?.memory["label"]).toBeUndefined();
  });

  it("Actors R20: the laptop disposed first, then its session, leaves no actor", async () => {
    const run = await played(deviceFirst);

    expect(run.checkpoints.disposed.inspection.actors).toEqual([]);
  });

  it("Actors R20, Stories R3: disposing the session while the laptop is bound is refused BlockedByDependents, naming the laptop", async () => {
    await expect(sessionFirstUnderDevice().run()).rejects.toThrow(
      /BlockedByDependents: .*Auth\/TrustedDevice/u,
    );
  });

  it("Restore R1, R2: reloaded with only the laptop ensured, its trust restores and it binds the signed-in session", async () => {
    const run = await played(deviceChain);

    expect(run.checkpoints.reloaded.read(laptop)).toEqual(
      expect.objectContaining({
        state: "TRUSTED.FRESH",
        context: { session: true },
        memory: expect.objectContaining({ until: LAPTOP_UNTIL, signedIn: true }),
      }),
    );
  });
});

describe("a trusted device written wrong is refused at construction (Compile R2, R4)", () => {
  it("Compile R4: an event field written as text, not a Schema, is refused WrongKind", () => {
    expect(refusal(deviceWithTextField)).toEqual([
      ["InvalidConfiguration", "WrongKind", "events.Trust.until"],
    ]);
  });

  it("Compile R4: a handler left null is refused WrongKind", () => {
    expect(refusal(deviceWithNullHandler)).toEqual([
      ["InvalidConfiguration", "WrongKind", "on.Revoke"],
    ]);
  });

  it.fails("Compile R2, R4: a session slot that is the session's definition is one WrongKind at the slot, not a finding per key of the definition", () => {
    expect(refusal(deviceWithDefinitionAsContext)).toEqual([
      ["InvalidConfiguration", "WrongKind", "context.session"],
    ]);
  });

  it.fails("Compile R2, R4: an operations record holding the bare contract, not its outcomes, is refused WrongKind at it", () => {
    expect(refusal(deviceWithBareContract)).toEqual([
      ["InvalidConfiguration", "WrongKind", "operations.me"],
    ]);
  });

  it.fails("Compile R4: a reminder written { day: 7 } is not a Duration input: its unknown field is refused UnknownField", () => {
    expect(refusal(deviceRemindingByDay)).toEqual([
      [
        "InvalidConfiguration",
        "UnknownField",
        "states.TRUSTED.states.FRESH.schedules.reverify.schedule.day",
      ],
    ]);
  });
});
