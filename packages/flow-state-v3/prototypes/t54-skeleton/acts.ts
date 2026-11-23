import type { Brand, Data, Option } from "effect";
import type { Values } from "../../src/core/compiled.ts";
import type { Evidence, Member } from "../../src/core/evidence.ts";
import type { RefusedCode } from "../../src/core/vocabulary.ts";
import type { Command, Incarnation } from "../../src/core/world.ts";
import type { ActorId, AttemptId } from "./ids.ts";
import type { Cue, LaneState } from "./lanes.ts";
import type { Closed, Owed } from "./ledger.ts";
import type { Life } from "./life.ts";
import type { World } from "./world.ts";

export type TurnVerdict = Data.TaggedEnum<{
  Accepted: { from: string; to: string; parts: ReadonlyArray<string>; members: ReadonlyArray<Member> };
  Unhandled: {};
  Denied: { reasons: ReadonlyArray<string> };
  Refused: { code: RefusedCode };
}>;

export type Act = Data.TaggedEnum<{
  Lane: {
    actor: ActorId;
    operation: string;
    key: Values;
    before: LaneState;
    cue: Cue;
    after: LaneState;
    commands: ReadonlyArray<Command>;
  };
  ReadReplaced: { operation: string };
  Silent: { operation: string; attempt: AttemptId };
  Row: { before: Option.Option<Owed>; after: Option.Option<Owed>; how: Option.Option<Closed> };
  Turn: { actor: ActorId; event: string; ending: Option.Option<Owed>; verdict: TurnVerdict };
  Call: { operation: string; defect: boolean };
  Incarnation: { actor: ActorId; before: Option.Option<Incarnation>; after: Option.Option<Incarnation> };
  Life: { before: Life; after: Life; finalPending: boolean };
}>;

export type Out = {
  readonly world: World;
  readonly life: Life["_tag"];
  readonly commands: ReadonlyArray<Command>;
  readonly acts: ReadonlyArray<Act>;
};

export type Report = Evidence & Brand.Brand<"flow-state/Report">;

export declare const evidenceOf: (act: Act) => ReadonlyArray<Report>;
