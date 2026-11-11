import { Option, Result, Schema } from "effect";
import { Input } from "../core/step.ts";
import type { ActorId, Use } from "../core/world.ts";
import type { Platform } from "./host.ts";
import type { Values } from "../core/compiled.ts";
import type { Machine, Operations } from "../definition.ts";
import {
  attachUse,
  constructOn,
  detachUse,
  internalsOf,
  type Runtime,
  runtimeSetup,
  snapshotOf,
} from "./runtime.ts";

/**
 * Flow's own suite's seam (`flow-state/internal/testing`, not a supported route): builds a Runtime
 * over a given host, and attaches and ends uses directly.
 */
export const testing = {
  constructOn: (setup: Parameters<typeof runtimeSetup>[0], platform: Platform) =>
    constructOn(setup, platform),
  attach: (runtime: Runtime, actor: ActorId, use: Use, existing: boolean) =>
    attachUse(runtime, actor, use, existing),
  detach: (runtime: Runtime, actor: ActorId, use: Use) => detachUse(runtime, actor, use),
  forget: (runtime: Runtime, actor: ActorId) =>
    internalsOf(runtime).driver.input(Input.Forget({ actor })),
  disposeRuntime: (runtime: Runtime) => internalsOf(runtime).driver.input(Input.DisposeRuntime()),
  pending: (runtime: Runtime) => internalsOf(runtime).driver.pending(),
  send: (runtime: Runtime, actor: ActorId, tag: string, payload: Values) =>
    internalsOf(runtime).driver.send(actor, tag, payload),
  snapshot: (runtime: Runtime, actor: ActorId) => snapshotOf(internalsOf(runtime).driver, actor),
  row: (machine: Machine, operations: Operations, operation: string, key: Values) =>
    Option.flatMap(Option.fromUndefinedOr(machine.compiled.operations.get(operation)), (op) =>
      Option.flatMap(Result.getSuccess(Schema.encodeUnknownResult(op.key)(key)), (text) =>
        Option.fromUndefinedOr(operations.get(operation)?.get(text)),
      ),
    ),
  ensureExisting: (runtime: Runtime, actor: ActorId) =>
    internalsOf(runtime).driver.input(Input.Ensure({ actor, use: Option.none(), existing: true })),
};

export { Host, StoreRefused } from "./host.ts";

export type { Bytes, Platform, Purpose, Store } from "./host.ts";
