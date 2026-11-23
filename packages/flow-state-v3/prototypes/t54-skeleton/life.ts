import type { Brand, Data, Option } from "effect";
import type { Input } from "../../src/core/input.ts";
import type { TicketId } from "./ids.ts";

export type LifeState = Data.TaggedEnum<{
  Inert: {};
  Booting: {};
  Open: {};
  Failed: {};
  Disposing: { final: Option.Option<TicketId> };
  Disposed: {};
}>;

export type Life = LifeState & Brand.Brand<"flow-state/Life">;

export type Verdict = Data.TaggedEnum<{
  Run: {};
  Drop: {};
  Reject: { code: "RuntimeDisposed" | "RuntimeNotReady" };
}>;

export declare const inert: Life;

export declare const admit: (life: Life, input: Input) => Verdict;
