import { rent } from "../../fixtures/transfers/app.ts";
import { StandingOrder } from "../../fixtures/transfers/machines/standing-order.ts";
import { Transfers } from "../../fixtures/transfers/machines/transfers.ts";
import { evidenceOf, publishedOf, turnsOf } from "../../src/host/testing/index.ts";
import type { Cut, StoryRun } from "../../src/host/testing/index.ts";

type Equal<A, B> =
  (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;

declare const cut: Cut;
declare const run: StoryRun;

// A read is typed by the ref's definition (Stories, read(target)).
const order = cut.read(rent);

/**
 * Each read's type, checked exactly: a field typed wider (unknown) or narrower fails to compile.
 */
export type Checks = [
  Equal<typeof order, undefined> extends false ? true : never,
  Equal<NonNullable<typeof order>["memory"]["pausedUntil"], Date | null> extends true
    ? true
    : never,
  Equal<
    NonNullable<typeof order>["state"],
    "DRAFT" | "CHECKING" | "SCHEDULED" | "PAUSED"
  > extends true
    ? true
    : never,
  Equal<
    ReturnType<typeof publishedOf<typeof StandingOrder>>[number]["memory"]["first"],
    Date | null
  > extends true
    ? true
    : never,
];

export const checks: Checks = [true, true, true, true];

// @ts-expect-error a field the definition does not declare
void order?.memory.pausedUntill;

// @ts-expect-error a field the definition does not declare, by index
void order?.memory["pausedUntill"];

// @ts-expect-error a state the definition does not declare
void (order?.state === "PAUSD");

// Evidence is selected by token: a misspelt token, a name string, and with `actor` another
// definition's token fail to compile.
void turnsOf(run, StandingOrder.E.Pause);

void evidenceOf(run, StandingOrder.E.Pause, { actor: rent });

// @ts-expect-error a token the definition does not declare
void turnsOf(run, StandingOrder.E.Pase);

// @ts-expect-error an event name string is not a token
void turnsOf(run, "Pause");

// @ts-expect-error a token of another definition than the actor's
void turnsOf(run, Transfers.E.Unsure, { actor: rent });

// @ts-expect-error a token of another definition than the actor's
void evidenceOf(run, Transfers.E.Unsure, { actor: rent });
