import type { RuntimeFactory } from "flow-state";
import type { EverclearExampleApp } from "./app";

// The production host supplies this factory; the reference keeps only its compile-time boundary.
export declare const createEverclearRuntime: RuntimeFactory<typeof EverclearExampleApp>;
