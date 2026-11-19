import { Brand } from "effect";
import type { ActivationId, ChainId, IncarnationId } from "../world.ts";

// Runtime ids for worlds a core test builds by hand, where no step's mint made them.

export const activation = Brand.nominal<ActivationId>();

export const incarnation = Brand.nominal<IncarnationId>();

export const chain = Brand.nominal<ChainId>();
