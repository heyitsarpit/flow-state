// The module seam (D25, D42, D51). A module owns one slice and sees it, its arguments and `Cx`. It holds no world and cannot
// reach a lane. A hook returns its new slice, and the core assigns it after the hook has returned.
//
// D46: a hook's own throw rolls back its effects and disables the module, failing closed for the machines that use it. A user
// closure goes through `cx.user`, which says what its throw means here: inside a turn it refuses the turn; outside one it is an
// issue with its origin and the given default. Never a disable, never a kill.
//
// On paper for round 4, in convergence-3, not built: reconcile, turned, cx.deliver, cx.retract, cx.tell, cx.actor.
import type { Compiled, Slot } from "../conformance/fixtures/compiled.ts";
import type { Ending, SendExit } from "./world.ts";

export type WriteRef = {
  readonly attempt: string;
  readonly mint: number;
  readonly machine: string;
  readonly op: string;
  readonly input: unknown;
};
export type Claim =
  | { readonly on: "queue"; readonly behind: readonly string[] }
  | { readonly on: "repair"; readonly ref: string }
  | { readonly on: "disabled"; readonly module: string };
export type ModuleWait = { readonly attempt: string; readonly op: string; readonly ref: string };
export type Cx = {
  readonly now: number;
  readonly queueMax: number;
  readonly repairMs: number;
  gen(): string;
  pos(): number; // D47
  arm(key: string, dueAt: number): void; // comes back through `input` as { timer: key }
  disarm(key: string): void;
  command(cmd: unknown): void; // goes to this module's own `exec`
  note(kind: string, f?: Record<string, unknown>): void;
  issue(code: string, f?: Record<string, unknown>): void;
  visible(): void;
  machine(id: string): Compiled;
  user<A extends unknown[], B>(slot: Slot<(...a: A) => B>, args: A, fallback: () => B): B;
};
export type DriverIo = {
  fork(key: string, effect: unknown, done: (exit: SendExit) => void): void;
  stop(key: string): void; // M7: a module's fiber has an owner
  input(payload: unknown): void;
  machine(id: string): Compiled;
};
// `how` is rule 30's ending, or what is not an ending: replaced, or given up.
export type Ended = {
  readonly attempt: string;
  readonly how: Ending | "superseded" | "released";
  readonly sentAt: number;
};
export type Module<S> = {
  readonly id: string;
  readonly rank: number;
  init(): S;
  prepare?(s: S, w: Omit<WriteRef, "attempt" | "mint">, cx: Cx): unknown; // P5: dry
  start?(s: S, w: WriteRef, prepared: unknown, cx: Cx): { readonly s: S; readonly ok: boolean }; // P6
  ended?(s: S, e: Ended, cx: Cx): S; // N: rule 27. Before any routing
  blocks?(s: S, attempt: string): false | Claim; // D
  input?(s: S, payload: unknown, cx: Cx): S; // its driver half, its timers, a read's answer
  save?(s: S, attempt: string): unknown;
  restored?(s: S, w: WriteRef & { readonly saved: unknown; readonly ending: Ending }, cx: Cx): S;
  read?(s: S, ref: string): unknown;
  waits?(s: S): readonly ModuleWait[];
  dispose?(s: S, cx: Cx): S;
  exec?(cmd: unknown, io: DriverIo): void;
};
// What a read's answer looks like, arriving at `input`.
export type ReadAnswer = {
  readonly k: "answered";
  readonly machine: string;
  readonly op: string;
  readonly input: unknown;
  readonly value: unknown;
  readonly pos: number;
};
