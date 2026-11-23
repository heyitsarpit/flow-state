import type { Brand, Data } from "effect";
import type { Values } from "../../src/core/compiled.ts";
import type { ActorRecord, Incarnation, Read, Timer, Use } from "../../src/core/world.ts";
import type { ActorId, CallId, LaneId, OwedId, TimerId } from "./ids.ts";
import type { Lane } from "./lanes.ts";
import type { Ledger } from "./ledger.ts";
import type { Life } from "./life.ts";

export type Mail = Data.TaggedEnum<{
  Event: { actor: ActorId; tag: string; payload: Values };
  Ending: { actor: ActorId; id: OwedId };
  Firing: { actor: ActorId; incarnation: string; schedule: string; arming: number };
}>;

export type World = {
  readonly life: Life;
  readonly incarnations: ReadonlyMap<string, Incarnation>;
  readonly records: ReadonlyMap<string, ActorRecord>;
  readonly uses: ReadonlyMap<string, ReadonlyArray<Use>>;
  readonly lanes: ReadonlyMap<LaneId, Lane>;
  readonly owed: Ledger;
  readonly reads: ReadonlyMap<CallId, Read>;
  readonly mail: ReadonlyArray<Mail>;
  readonly timers: ReadonlyMap<TimerId, Timer>;
  readonly counter: number;
  readonly attempts: number;
  readonly persistence: boolean;
};

export type Tx = { readonly world: () => World } & Brand.Brand<"flow-state/Tx">;
