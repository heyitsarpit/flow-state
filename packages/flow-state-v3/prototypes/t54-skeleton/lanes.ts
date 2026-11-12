import type { Data } from "effect";
import type { Values } from "../../src/core/compiled.ts";
import type { Channel } from "../../src/core/vocabulary.ts";
import type { ActorId, Phase } from "../../src/core/world.ts";
import type { AttemptId } from "./ids.ts";

export type Head = {
  readonly id: AttemptId;
  readonly input: Values;
  readonly retryCount: number;
  readonly owner: number;
  readonly phase: Phase;
};

export type Lane = {
  readonly actor: ActorId;
  readonly operation: string;
  readonly head: Head;
};

export declare const sentBefore: (head: Head) => boolean;

export type LaneState = Data.TaggedEnum<{ Idle: {}; Head: { head: Head } }>;

export type Cue = Data.TaggedEnum<{
  CommitReject: { input: Values; owner: number };
  CommitCancel: { input: Values; owner: number };
  Retry: { owner: number };
  Cancel: {};
  TurnEnded: {};
  Stored: {};
  Refused: {};
  Answered: { channel: Channel; reason: string; value: unknown };
  DisposalStarts: {};
  BoundPassed: {};
}>;
