import { Effect } from "effect";
import assert from "node:assert/strict";
import { describe, expect, it } from "vite-plus/test";
import {
  accountOf,
  bankGrownSetup,
  cafeComposed,
  cafeDecomposed,
  mainCustomer,
  sendForm,
} from "../../fixtures/transfers/app.ts";
import { account } from "../../fixtures/transfers/machine.ts";
import { centsEdges, idAtBound, twoSpellings } from "../../fixtures/transfers/stories/edges.ts";
import { manyAccounts, owedAtBoot } from "../../fixtures/transfers/stories/load.ts";
import {
  chain,
  customerFirst,
  customerForgotten,
  formFirst,
} from "../../fixtures/transfers/stories/structure.ts";
import { checkAndSend } from "../../fixtures/transfers/stories/usual.ts";
import type { StoryRun } from "../../src/host/testing/index.ts";
import { FlowError } from "../../src/index.ts";
import { played } from "../rules/played.ts";

const loose = (value: unknown) =>
  // SAFETY: the refused payload is one the types reject; the send must refuse it at run time too.
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- the untyped caller a send guards against
  value as never;

const endings = (run: StoryRun) =>
  run.evidence.flatMap((e) => (e._tag === "Ended" ? [`${e.channel} ${e.reason}`] : []));

describe("the bank around the account: a customer and a transfer form", () => {
  it("Actors R18, R19; Reads R6: the form reads its customer's account, checks its balance, and is denied an amount over it", async () => {
    const run = await played(checkAndSend);
    const at = (name: keyof typeof run.checkpoints) => run.checkpoints[name].read(sendForm);

    expect(at("ready")).toEqual(
      expect.objectContaining({
        state: "READY",
        context: { customer: "acct-1" },
        memory: expect.objectContaining({ account: "acct-1", balance: 10_000, cents: 500 }),
      }),
    );
    expect(run.checkpoints.sent.read(account)?.memory["notice"]).toBe("sent r1");
    expect(at("over")).toEqual(
      expect.objectContaining({
        state: "EDITING",
        memory: expect.objectContaining({ notice: "more than your balance" }),
      }),
    );
  });

  it("S1 with S9: customer -> form, reloaded with only the form ensured, binds the customer's saved account", async () => {
    const run = await played(chain);

    expect(run.checkpoints.reloaded.read(sendForm)?.context).toEqual({ customer: "acct-2" });
    expect(run.checkpoints.reloaded.read(mainCustomer)?.memory["account"]).toBe("acct-2");
  });
});

describe("many accounts (fixtures.md L1, S3 under L4)", () => {
  it("Actors R21: 64 accounts each send; one is forgotten; after two reloads it has no record and the rest keep their receipts", async () => {
    const run = await played(manyAccounts);
    const end = run.checkpoints.end;

    expect(end.read(accountOf(5))).toBeUndefined();
    expect(end.read(accountOf(63))?.memory["notice"]).toBe("sent r64");
  });

  it("WriteAhead R14: 64 accounts with transfers on the wire at a reload each hear unknown Restored and are unsure", async () => {
    const run = await played(owedAtBoot);

    expect(run.checkpoints["first boot"].read(accountOf(0))?.memory["notice"]).toBe(
      "check your statement",
    );
    expect(run.checkpoints.end.read(accountOf(63))?.memory["notice"]).toBe("check your statement");
  });

  it.fails("WriteLanes R10, WriteAhead R14: a second reload delivers no second unknown Restored for a Held head that already heard one", async () => {
    const run = await played(owedAtBoot);

    expect(run.evidence.filter((e) => e._tag === "Delivered" && e.event === "Unsure")).toHaveLength(
      64,
    );
  });
});

describe("the form's and customer's ends (fixtures.md S6)", () => {
  it("S6 form first: disposing the form, then the customer, leaves nothing", async () => {
    const run = await played(formFirst);

    expect(run.checkpoints.disposed.inspection.actors).toEqual([]);
  });

  it("S6 customer forgotten: a form ensured after the customer is forgotten reads a fresh customer", async () => {
    const run = await played(customerForgotten);

    expect(run.checkpoints.fresh.read(mainCustomer)?.memory["account"]).toBe("");
  });

  it.fails("Actors R20, Stories R3: disposing the customer while the form is bound is refused BlockedByDependents", async () => {
    await expect(customerFirst().run()).rejects.toThrow(/BlockedByDependents/u);
  });
});

describe("transfer values at their edges (fixtures.md E2, E3, E6)", () => {
  it("E6: 0 and negative cents are sent; 2^53 cents is past the bank's limit and declined", async () => {
    const run = await played(centsEdges);

    expect(endings(run)).toEqual(["success success", "success success", "failure Declined"]);
  });

  it("E3, Operations O1: a transfer id whose key is exactly 8,192 bytes is sent", async () => {
    const run = await played(idAtBound);

    expect(endings(run)).toEqual(["success success"]);
  });

  it("Machines O2: account names in composed and decomposed spelling are two accounts", async () => {
    const run = await played(twoSpellings);

    expect(run.checkpoints.both.read(cafeComposed)).toBeDefined();
    expect(run.checkpoints.both.read(cafeDecomposed)).toBeDefined();
    expect(run.end.calls.filter((c) => c.endpoint === "transfer")).toHaveLength(2);
  });

  it("E2, Actors R14: a send with a null transfer id throws InvalidEvent and starts no turn", () => {
    const runtime = bankGrownSetup.construct();
    Effect.runSync(runtime.ready());
    const handle = runtime.ensureActor(account);

    try {
      handle.send(loose({ _tag: "Send", transferId: null, cents: 1 }));
      assert.fail("the send was not refused");
    } catch (error) {
      assert.ok(error instanceof FlowError);
      expect(error.code).toBe("InvalidEvent");
    }
  });
});
