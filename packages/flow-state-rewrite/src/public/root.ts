/* oxlint-disable -- This file is a temporary stub. Remove this file-level lint ignore when the file is implemented. */

import { scaffoldNotImplemented } from "../internal/scaffold.js";
import type {
  ActorRef,
  App,
  Definition,
  Machine,
  Module,
  Persistence,
  PersistenceStorage,
  Resource,
  RuntimeSetup,
  Transaction,
} from "./types.js";
import type { FlowPath, FlowUsageCode } from "./types.js";

export class FlowDisposeError extends Error {
  readonly _tag = "FlowDisposeError" as const;
}

export class FlowPersistenceError extends Error {
  readonly _tag = "FlowPersistenceError" as const;
}

export class FlowUsageError extends Error {
  readonly _tag = "FlowUsageError" as const;
  readonly code: FlowUsageCode;
  readonly path: FlowPath;
  readonly details: Readonly<Record<string, string | number | boolean | null>>;

  constructor(
    code: FlowUsageCode,
    path: FlowPath = [],
    details: Readonly<Record<string, string | number | boolean | null>> = {},
  ) {
    super(`Flow usage error: ${code}`);
    this.name = "FlowUsageError";
    this.code = code;
    this.path = path;
    this.details = details;
  }
}

export function actorRef(..._args: readonly unknown[]): ActorRef {
  return scaffoldNotImplemented("actorRef");
}

export function app(..._args: readonly unknown[]): App {
  return scaffoldNotImplemented("app");
}

export function can(..._args: readonly unknown[]): boolean {
  return scaffoldNotImplemented("can");
}

export function definition(..._args: readonly unknown[]): Definition {
  return scaffoldNotImplemented("definition");
}

export function indexedDbStorage(..._args: readonly unknown[]): PersistenceStorage {
  return scaffoldNotImplemented("indexedDbStorage");
}

export function machine(..._args: readonly unknown[]): Machine {
  return scaffoldNotImplemented("machine");
}

export function module(..._args: readonly unknown[]): Module {
  return scaffoldNotImplemented("module");
}

export function persistence(..._args: readonly unknown[]): Persistence {
  return scaffoldNotImplemented("persistence");
}

export function resource(..._args: readonly unknown[]): Resource {
  return scaffoldNotImplemented("resource");
}

export function runtimeSetup(..._args: readonly unknown[]): RuntimeSetup {
  return scaffoldNotImplemented("runtimeSetup");
}

export function stream(..._args: readonly unknown[]): Definition {
  return scaffoldNotImplemented("stream");
}

export function transaction(..._args: readonly unknown[]): Transaction {
  return scaffoldNotImplemented("transaction");
}

export function webStorage(..._args: readonly unknown[]): PersistenceStorage {
  return scaffoldNotImplemented("webStorage");
}

export type { CanonicalKeyInput, Implementation } from "./types.js";
