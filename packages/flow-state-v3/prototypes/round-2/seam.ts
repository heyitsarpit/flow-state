// The module seam (D25, D42). A module owns one slice and sees it, its arguments and `Cx`. It holds no world and cannot
// reach a lane: everything a lane does is the core's. A hook returns its new slice, and the core assigns it after the hook
// has returned, so the round-1 bug (a spread evaluated before the hook) cannot be written.
//
// D27: each hook runs in its own attempt. A throw rolls back that hook's effects and disables the module with an issue;
// the core's work stands. `cx.user` runs a user closure: its throw refuses the turn instead (D11).
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
  | { readonly on: "repair"; readonly ref: string };
export type ModuleWait = { readonly attempt: string; readonly op: string; readonly ref: string };
export type Cx = {
  readonly now: number;
  readonly queueMax: number;
  readonly repairMs: number;
  gen(): string;
  arm(key: string, dueAt: number): void; // comes back through `timer`
  disarm(key: string): void;
  command(cmd: unknown): void; // goes to this module's own `exec`
  note(kind: string, f?: Record<string, unknown>): void;
  issue(code: string, f?: Record<string, unknown>): void;
  visible(): void;
  machine(id: string): Compiled;
  user<A, B>(slot: Slot<(a: A) => B>, a: A): B;
};
export type DriverIo = {
  fork(effect: unknown, done: (exit: SendExit) => void): void;
  input(payload: unknown): void;
  machine(id: string): Compiled;
};
export type Module<S> = {
  readonly id: string;
  readonly rank: number;
  init(): S;
  // P5: a dry read of what this write would do. A user closure's throw here is InvalidTurn.
  prepare?(s: S, w: Omit<WriteRef, "attempt" | "mint">, cx: Cx): unknown;
  // P6: a commit that would start. Declining is an ending; nothing is applied.
  start?(s: S, w: WriteRef, prepared: unknown, cx: Cx): { readonly s: S; readonly ok: boolean };
  // N: rule 27. The Attempt's ending, after rule 18, before any routing.
  settled?(s: S, w: { readonly attempt: string; readonly ending: Ending }, cx: Cx): S;
  withdraw?(s: S, w: { readonly attempt: string; readonly why: string }, cx: Cx): S; // never-sent, no ending
  released?(s: S, w: { readonly attempt: string }, cx: Cx): S;
  readAnswered?(
    s: S,
    w: { machine: string; op: string; input: unknown; value: unknown },
    cx: Cx,
  ): S;
  // D: may this Attempt go? Everything a module adds to eligibility is here.
  blocks?(s: S, attempt: string): false | Claim;
  // Write-ahead: what this module keeps with an Attempt's record, and what it does with it on restore.
  capture?(s: S, attempt: string): unknown;
  restored?(s: S, w: WriteRef & { readonly saved: unknown; readonly ending: Ending }, cx: Cx): S;
  input?(s: S, payload: unknown, cx: Cx): S;
  timer?(s: S, key: string, cx: Cx): S;
  commit?(s: S, cx: Cx): S; // after every step's own work
  describe?(s: S): readonly ModuleWait[];
  exec?(cmd: unknown, io: DriverIo): void; // the driver half
};
