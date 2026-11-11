import { Option, Result, Schema } from "effect";
import type { Values } from "../core/compiled.ts";
import { Input } from "../core/step.ts";
import type { ActorId, Use } from "../core/world.ts";
import type { Machine, Operations } from "../definition.ts";
import type { Platform } from "./host.ts";
import { buildRuntime, type RuntimeConfig, snapshotOf } from "./runtime.ts";

/**
 * A Runtime built for Flow's own suite, with its driver beside it.
 */
export type TestRuntime = ReturnType<typeof buildRuntime>;

/**
 * Flow's own suite's seam (`flow-state/internal/testing`, not a supported route): builds a Runtime
 * over a given platform and drives what the public API does not reach yet (uses, `forget`, the
 * Runtime's bounded disposal).
 */
export const testing = {
  build: (config: RuntimeConfig, platform: Platform) => buildRuntime(config, platform),
  attach: ({ driver }: TestRuntime, actor: ActorId, use: Use, existing: boolean) =>
    driver.input(Input.Ensure({ actor, use: Option.some(use), existing })),
  detach: ({ driver }: TestRuntime, actor: ActorId, use: Use) =>
    driver.input(Input.Release({ actor, use })),
  forget: ({ driver }: TestRuntime, actor: ActorId) => driver.input(Input.Forget({ actor })),
  disposeRuntime: ({ driver }: TestRuntime) => driver.input(Input.DisposeRuntime()),
  pending: ({ driver }: TestRuntime) => driver.pending(),
  send: ({ driver }: TestRuntime, actor: ActorId, tag: string, payload: Values) =>
    driver.send(actor, tag, payload),
  snapshot: ({ driver }: TestRuntime, actor: ActorId) => snapshotOf(driver, actor),
  row: (machine: Machine, operations: Operations, operation: string, key: Values) =>
    Option.flatMap(Option.fromUndefinedOr(machine.compiled.operations.get(operation)), (op) =>
      Option.flatMap(Result.getSuccess(Schema.encodeUnknownResult(op.key)(key)), (text) =>
        Option.fromUndefinedOr(operations.get(operation)?.get(text)),
      ),
    ),
};

export { Host, StoreRefused } from "./host.ts";

export type { Bytes, Platform, Purpose, Store } from "./host.ts";
