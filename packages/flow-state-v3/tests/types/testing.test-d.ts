import { describe, expectTypeOf, it } from "vite-plus/test";
import { rent } from "../../fixtures/transfers/app.ts";
import { StandingOrder } from "../../fixtures/transfers/machines/standing-order.ts";
import { Transfers } from "../../fixtures/transfers/machines/transfers.ts";
import { evidenceOf, publishedOf, turnsOf } from "../../src/host/testing/index.ts";
import type { Cut, StoryRun } from "../../src/host/testing/index.ts";

declare const cut: Cut;
declare const run: StoryRun;

// A read is typed by the ref's definition (Stories, read(target)).
const order = cut.read(rent);

describe("Stories read(target), evidence by token", () => {
  it("each wrong line fails to compile beside its exact right one", () => {
    expectTypeOf(order?.memory.pausedUntil).toEqualTypeOf<Date | null | undefined>();
    expectTypeOf(order?.state).toEqualTypeOf<
      "DRAFT" | "CHECKING" | "SCHEDULED" | "PAUSED" | undefined
    >();
    expectTypeOf(publishedOf(run, rent)[0]?.memory.first).toEqualTypeOf<Date | null | undefined>();

    // @ts-expect-error a field the definition does not declare
    void order?.memory.pausedUntill;

    // @ts-expect-error a field the definition does not declare, by index
    void order?.memory["pausedUntill"];

    // @ts-expect-error a state the definition does not declare
    void (order?.state === "PAUSD");

    // Evidence is selected by token: a misspelt token, a name string, and with `actor` another
    // definition's token fail to compile.
    expectTypeOf(turnsOf(run, StandingOrder.E.Pause)[0]?.actor.machine).toEqualTypeOf<
      string | undefined
    >();
    expectTypeOf(
      turnsOf(run, StandingOrder.E.Pause, { actor: rent })[0]?.actor.machine,
    ).toEqualTypeOf<(typeof StandingOrder)["id"] | undefined>();
    expectTypeOf(
      evidenceOf(run, StandingOrder.E.Pause, { actor: rent })[0]?.actor.machine,
    ).toEqualTypeOf<(typeof StandingOrder)["id"] | undefined>();

    // @ts-expect-error a token the definition does not declare
    void turnsOf(run, StandingOrder.E.Pase);

    // @ts-expect-error an event name string is not a token
    void turnsOf(run, "Pause");

    // @ts-expect-error a token of another definition than the actor's
    void turnsOf(run, Transfers.E.Unsure, { actor: rent });

    // @ts-expect-error a token of another definition than the actor's
    void evidenceOf(run, Transfers.E.Unsure, { actor: rent });
  });
});
