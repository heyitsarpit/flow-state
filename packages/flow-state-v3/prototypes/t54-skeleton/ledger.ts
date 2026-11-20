import type { Brand, Data, Option } from "effect";
import type { Channel } from "../../src/core/vocabulary.ts";
import type { ActorId, AttemptId, LaneId, OwedId } from "./ids.ts";
import type { Tx } from "./world.ts";

export type Audience = Data.TaggedEnum<{
  Identity: {};
  Life: { incarnation: string };
}>;

export type Delivery = Data.TaggedEnum<{
  Queued: {};
  Retrying: {};
  Waiting: {};
  Kept: {};
}>;

export type Owed = {
  readonly id: OwedId;
  readonly actor: ActorId;
  readonly to: Audience;
  readonly operation: string;
  readonly attempt: Option.Option<AttemptId>;
  readonly lane: Option.Option<LaneId>;
  readonly channel: Channel;
  readonly reason: string;
  readonly value: unknown;
  readonly owner: number;
  readonly current: boolean;
  readonly delivery: Delivery;
};

export type Closed = Data.TaggedEnum<{
  Delivered: { event: string };
  Recorded: { why: "evidence" | "letGo" };
}>;

export type Ledger = ReadonlyMap<string, ReadonlyArray<Owed>> & Brand.Brand<"flow-state/Ledger">;

export declare const empty: Ledger;

export declare const owe: (tx: Tx, ending: Omit<Owed, "id" | "delivery">) => OwedId;
export declare const tryOne: (tx: Tx, id: OwedId) => void;
export declare const suspend: (tx: Tx, actor: ActorId) => void;
export declare const start: (tx: Tx, actor: ActorId) => void;
export declare const close: (tx: Tx, id: OwedId, how: Closed) => void;
export declare const keptOn: (ledger: Ledger, actor: ActorId, lane: LaneId) => boolean;
