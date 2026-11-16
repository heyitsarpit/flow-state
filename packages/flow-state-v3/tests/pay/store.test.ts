import { describe, expect, it } from "vite-plus/test";
import {
  cartOf,
  guestCart,
  mainBadge,
  mainCart,
  mainFlow,
  mainShopper,
  shopperOf,
} from "../../fixtures/pay/app.ts";
import {
  failingLineAlone,
  independentLines,
  quantityZero,
  refusedAddAlone,
  sameCartTwice,
  waitsWhileBusy,
} from "../../fixtures/pay/stories/findings.ts";
import { manyShoppers, quantityClicks } from "../../fixtures/pay/stories/load.ts";
import {
  cartFirst,
  chain,
  conflictingCart,
  flowFirst,
  reloadedMidAdd,
  shopperForgotten,
} from "../../fixtures/pay/stories/structure.ts";
import { browse, checkoutSteps, guestBrowse } from "../../fixtures/pay/stories/usual.ts";
import { busyEdges } from "../../fixtures/pay/stories/edges.ts";
import { checkout } from "../../fixtures/pay/machine.ts";
import { Step } from "../../src/host/testing/index.ts";
import { denials, laneFacts } from "../checkout.ts";
import { played } from "../rules/played.ts";
import { publishedOnce } from "../rules/rules.ts";

const line = (variantId: string, quantity: number) => ({ variantId, quantity });

describe("the shop around the checkout: shopper, cart, badge and checkout flow", () => {
  it("Actors R18, R19; Turn R22: the cart reads its shopper, the badge its cart, each change one wave; the empty cart has no line", async () => {
    const run = await played(browse);
    const at = (name: keyof typeof run.checkpoints) => run.checkpoints[name];

    expect(at("empty").read(mainCart)?.memory["lines"]).toEqual({});
    expect(at("empty").read(mainBadge)?.context).toEqual({ cart: 0 });
    expect(at("added").read(mainCart)?.context).toEqual({ shopper: "ada" });
    expect(at("added").read(mainCart)?.memory["lines"]).toEqual({ l1: line("v1", 1) });
    expect(at("added").read(mainBadge)).toEqual(
      expect.objectContaining({ context: { cart: 1 }, memory: { bumps: 1 } }),
    );
    expect(at("edited").read(mainCart)?.memory["lines"]).toEqual({
      l1: line("v1", 3),
      l2: line("v2", 1),
    });
    expect(at("edited").read(mainBadge)).toEqual(
      expect.objectContaining({ context: { cart: 4 }, memory: { bumps: 3 } }),
    );
    expect(at("signed out").read(mainCart)?.context).toEqual({ shopper: "" });
  });

  it("Actors R5: a guest's cart is named by the guest and reads the guest shopper", async () => {
    const run = await played(guestBrowse);

    expect(run.checkpoints.added.read(guestCart)).toEqual(
      expect.objectContaining({
        context: { shopper: "" },
        memory: expect.objectContaining({ owner: "guest", lines: { g1: line("v1", 1) } }),
      }),
    );
  });

  it("Turn R1, R4, R12, R22: checkout is denied on an empty cart, moves address -> shipping -> pay, Back from pay re-enters shipping's last step, and the Pay it reads reaching PAID ends it", async () => {
    const run = await played(checkoutSteps);

    const state = (name: keyof typeof run.checkpoints) =>
      run.checkpoints[name].read(mainFlow)?.state;

    expect(denials(run.evidence)).toEqual([["EmptyCart"]]);
    expect(state("empty cart")).toBe("BROWSING");
    expect(state("address")).toBe("ADDRESS");
    expect(state("method")).toBe("SHIPPING.METHOD");
    expect(state("pay")).toBe("PAY");
    expect(state("back to slot")).toBe("SHIPPING.SLOT");
    expect(state("back to method")).toBe("SHIPPING.METHOD");
    expect(run.checkpoints.reloaded.read(mainFlow)).toEqual(
      expect.objectContaining({
        state: "SHIPPING.METHOD",
        memory: expect.objectContaining({ method: "express", slot: "9-12", lineCount: 1 }),
      }),
    );
    expect(state("address again")).toBe("ADDRESS");
    expect(run.checkpoints.paid.read(checkout)?.state).toBe("PAID");
    expect(state("paid")).toBe("DONE");
  });

  it("Turn R12: checkout waits while a line is still being added, then begins", async () => {
    const run = await played(waitsWhileBusy);

    expect(denials(run.evidence)).toEqual([["CartBusy"]]);
    expect(run.checkpoints.busy.read(mainFlow)?.state).toBe("BROWSING");
    expect(run.checkpoints.settled.read(mainFlow)?.state).toBe("ADDRESS");
  });
});

describe("cart lines: latest per line, refusals per line (WriteLanes R4, R7)", () => {
  it("WriteLanes R7: three quick clicks with the first on the wire send the first and the last; the middle one is Superseded, and no line stays pending", async () => {
    const run = await played(quantityClicks);

    expect(laneFacts(run.evidence, "Superseded")).toBe(1);
    expect(run.checkpoints.clicked.read(mainCart)?.memory).toEqual(
      expect.objectContaining({ lines: { l1: line("v1", 1) }, wanted: { l1: 4 } }),
    );
    expect(run.checkpoints.settled.read(mainCart)?.memory).toEqual(
      expect.objectContaining({ lines: { l1: line("v1", 4) }, wanted: {} }),
    );
    expect(
      run.end.calls.filter((c) => c.endpoint === "setQuantity").map((c) => c.input["quantity"]),
    ).toEqual([2, 4]);
  });

  it("WriteLanes R6: an edit of one line never waits on or ends another line's", async () => {
    const run = await played(independentLines);

    expect(run.checkpoints["b done"].read(mainCart)?.memory).toEqual(
      expect.objectContaining({
        lines: { l1: line("v1", 1), l2: line("v2", 5) },
        wanted: { l1: 2 },
      }),
    );
    expect(laneFacts(run.evidence, "Superseded")).toBe(0);
    expect(run.checkpoints.settled.read(mainCart)?.memory).toEqual(
      expect.objectContaining({ lines: { l1: line("v1", 2), l2: line("v2", 5) }, wanted: {} }),
    );
  });

  it("WriteLanes R4: a refused edit restores its own line from the server's answer and leaves the other line's edit", async () => {
    const run = await played(failingLineAlone);

    expect(run.checkpoints.settled.read(mainCart)?.memory).toEqual(
      expect.objectContaining({
        lines: { l1: line("v1", 1), l2: line("v2", 4) },
        wanted: {},
        errors: { l1: "only 1 left" },
      }),
    );
  });

  it("WriteLanes R4: a refused add removes only its own line", async () => {
    const run = await played(refusedAddAlone);

    expect(run.checkpoints.settled.read(mainCart)?.memory).toEqual(
      expect.objectContaining({ lines: { l1: line("v1", 1) }, errors: { l2: "sold out" } }),
    );
  });

  it("quantity 0 removes the line, sending 0 to the server", async () => {
    const run = await played(quantityZero);

    expect(run.checkpoints.removed.read(mainCart)?.memory["lines"]).toEqual({});
    expect(
      run.end.calls.filter((c) => c.endpoint === "setQuantity").map((c) => c.input["quantity"]),
    ).toEqual([0]);
  });

  it("Actors R6: ensuring the same cart twice is one incarnation with its lines kept", async () => {
    const run = await played(sameCartTwice);

    expect(
      run.evidence.filter((e) => e._tag === "Incarnated" && e.actor.machine === "Shop/Cart"),
    ).toHaveLength(1);
    expect(run.checkpoints.again.read(mainCart)?.memory["lines"]).toEqual({ l1: line("v1", 1) });
  });
});

describe("the shop's structures (fixtures.md S1, S3, S6, S7, S9)", () => {
  it("S1 with S9: shopper -> cart -> badge, reloaded with only the badge ensured, binds the chain again from records", async () => {
    const run = await played(chain);

    expect(run.checkpoints.reloaded.read(mainBadge)?.context).toEqual({ cart: 2 });
    expect(run.checkpoints.reloaded.read(mainCart)?.context).toEqual({ shopper: "ada" });
  });

  it("S3 x 64 under L3: 64 shoppers, each with a cart, keep their own lines through lost answers", async () => {
    const run = await played(manyShoppers);
    const end = run.checkpoints.end;

    expect(end.read(cartOf(0))?.context).toEqual({ shopper: "s0" });
    expect(end.read(cartOf(63))?.memory["lines"]).toEqual({ l63: line("v1", 1) });
    expect(end.read(shopperOf(63))?.memory["name"]).toBe("s63");
  });

  it.fails("Actors R5, Stories R3: a Story's second ref to a live cart with another shopper is refused ConflictingActorRef", async () => {
    await expect(conflictingCart().run()).rejects.toThrow(/ConflictingActorRef/u);
  });

  it("S6 reloaded: an add on the wire at a reload ends unknown, and the cart retries it once (WriteAhead R14; WriteLanes R8)", async () => {
    const run = await played(reloadedMidAdd);

    expect(run.checkpoints.reloaded.read(mainCart)?.memory["lines"]).toEqual({ l1: line("v1", 1) });
    expect(run.end.calls.filter((c) => c.endpoint === "addLine")).toHaveLength(2);
  });

  it("S6 flow first, Actors R8: disposing the checkout flow, then the badge, the cart and the shopper leaves nothing once the Pay it read ends after its grace", async () => {
    const run = await played(flowFirst);

    expect(run.checkpoints.disposed.inspection.actors).toEqual([]);
  });

  it("S6 shopper forgotten: forgetting the shopper after its consumers end starts it fresh on the next ensure (Actors R21)", async () => {
    const run = await played(shopperForgotten);

    expect(run.checkpoints.fresh.read(mainShopper)?.memory["name"]).toBe("");
    expect(run.checkpoints.fresh.read(mainCart)?.context).toEqual({ shopper: "" });
  });

  it.fails("Actors R20, Stories R3: disposing the cart while the badge and the flow are bound is refused BlockedByDependents", async () => {
    await expect(cartFirst().run()).rejects.toThrow(/BlockedByDependents/u);
  });
});

describe("the checkout's retry delay at its edges (Turn R14)", () => {
  it("Turn R14: a retry after 0 ms fires on the next turn; 2^31 - 1 ms arms; 2^31 ms refuses the turn that would arm it", async () => {
    const run = await played(busyEdges);
    const at = (name: keyof typeof run.checkpoints) => run.checkpoints[name].read(checkout);

    expect(at("zero")?.state).toBe("PAID");
    expect(at("longest")?.state).toBe("WAITING");
    expect(at("longest")?.schedules.map((s) => s.dueAt - run.checkpoints.longest.now)).toEqual([
      2 ** 31 - 1,
    ]);
    expect(at("past")?.state).toBe("PAYING");
    expect(at("past")?.issues).toHaveLength(1);
  });
});

describe("a context consumer returning from its record (Turn I9)", () => {
  it.fails("Turn I9: a cart and badge restored by a reload that attaches nothing publish each snapshot once", async () => {
    const steps = browse.steps.toSpliced(
      3,
      0,
      Step.reload({ reattach: false, heldWrites: "abort" }),
    );

    const run = await browse.run({ steps });

    expect(publishedOnce.breaches(run)).toEqual([]);
  });
});
