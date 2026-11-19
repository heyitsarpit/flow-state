import { Brand } from "effect";
import type { ActivationId, AttemptId, ChainId, IncarnationId, LaneId } from "../world.ts";

// Runtime ids for worlds a core test builds by hand, where no step's mint made them.

export const activation = Brand.nominal<ActivationId>();

export const incarnation = Brand.nominal<IncarnationId>();

export const chain = Brand.nominal<ChainId>();

export const attempt = Brand.nominal<AttemptId>();

export const lane = Brand.nominal<LaneId>();
