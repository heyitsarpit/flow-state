import { Evidence } from "../../src/core/evidence.ts";
import type { Act, Report } from "./acts.ts";
import { evidenceOf } from "./acts.ts";
import type { ActorId, LaneId } from "./ids.ts";
import type { Ledger, Owed } from "./ledger.ts";
import { keptOn } from "./ledger.ts";
import type { Life } from "./life.ts";
import type { World } from "./world.ts";

export const readsStayOpen = (world: World, actor: ActorId, lane: LaneId): boolean =>
  keptOn(world.owed, actor, lane);

export const reportsComeFromActs = (act: Act): ReadonlyArray<Report> => evidenceOf(act);

export const droppingARowFails = (world: World): World => ({
  ...world,
  // @ts-expect-error a Ledger is built only in ledger.ts: a filtered copy is a plain Map
  owed: new Map([...world.owed].map(([actor, rows]) => [actor, rows.slice(1)])),
});

export const addingARowFails = (world: World, row: Owed): World => ({
  ...world,
  // @ts-expect-error a row is added only by `owe`
  owed: new Map<string, ReadonlyArray<Owed>>([["a", [row]]]),
});

// @ts-expect-error a Ledger is not a plain Map
export const emptyLedgerFails: Ledger = new Map<string, ReadonlyArray<Owed>>();

// @ts-expect-error a report is built only by `evidenceOf`
export const reportFails: Report = Evidence.RuntimeDisposed();

// @ts-expect-error a Life is built only in life.ts
export const lifeFails: Life = { _tag: "Open" };

export const lifeTagIsReadable = (life: Life): boolean => life._tag === "Open";
