// The module seam (D25, D42, D51). A module owns one slice and sees it, its arguments and `Cx`. It holds no world and cannot
// reach a lane. A hook returns its new slice, and the core assigns it after the hook has returned.
//
// D46: a hook's own throw rolls back its effects and disables the module, failing closed for the machines that use it. A user
// closure goes through `cx.user`, which says what its throw means here: inside a turn it refuses the turn; outside one it is an
// issue with its origin and the given default. Never a disable, never a kill.
//
// D68: two doors, each with one meaning. `told` is what the core says, a closed union: lifecycle, members, a delivery's turn, a read's
// answer. `input` is only what this module's own driver half and own timers send, so nothing it does not own can arrive there.
// A module with `observes` gets { k: "actors", changed } after any step that changed an actor (level-triggered, D63).
import type { Compiled, Ev, Slot } from "../conformance/fixtures/compiled.ts";
import type { PlacedActivity } from "./inc.ts";
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
  readonly live: boolean; // false from Runtime disposal's start: a module starts no new work (Runtime O6)
  readonly queueMax: number;
  readonly repairMs: number;
  readonly pageMs: number;
  gen(): string;
  pos(): number; // D47
  arm(key: string, dueAt: number): void; // comes back through `input` as { k: "timer", key }
  disarm(key: string): void;
  command(cmd: unknown): void; // goes to this module's own `exec`
  note(kind: string, f?: Record<string, unknown>): void;
  issue(code: string, f?: Record<string, unknown>): void;
  visible(): void;
  machine(id: string): Compiled; // sealed: every closure in it is a Slot
  user<A extends unknown[], B>(slot: Slot<(...a: A) => B>, args: A, fallback: () => B): B;
  deliver(m: {
    actor: string;
    inc: string;
    activation: string;
    event: Ev;
    tag: string;
    ending: boolean;
  }): void;
  retract(tag: string): void; // mail and follow-ups alike
  partition(actor: string, inc: string, f: (old: unknown) => unknown): void; // D62
  // D69: what a module may read of the tree. Never an `Inc`.
  machineOf(actor: string): string | undefined;
  placed(actor: string): readonly PlacedActivity[];
  slice(actor: string, inc: string): SliceView | undefined;
  publish(fact: StoreFact): void; // D81: every module with `store: true` hears it now. No module names another
};
export type SliceView = {
  readonly memory: any;
  readonly partition: unknown; // this module's own
};
export type ActorChange = { readonly key: string; readonly machine: string };
// What a stream says to whichever store exists (D81): a change, in order; or a gap in coverage (T7).
export type StoreFact =
  | {
      readonly k: "pushed";
      readonly machine: string;
      readonly op: string;
      readonly value: unknown;
    }
  | { readonly k: "gap"; readonly machine: string; readonly op: string };
// What `told` receives from the core. Closed: an unlisted kind cannot arrive.
export type Told =
  | { readonly k: "actors"; readonly changed: readonly ActorChange[] }
  | ReadAnswer
  | StoreFact
  | { readonly k: "turned"; readonly tag: string; readonly outcome: "ran" | "invalid" | "fenced" }
  | {
      readonly k: "member";
      readonly actor: string;
      readonly inc: string;
      readonly op: string;
      readonly name: string;
      readonly value: unknown;
    };
export type DriverIo = {
  fork(key: string, effect: unknown, done: (exit: SendExit) => void): void;
  stop(key: string): void; // M7: a module's fiber has an owner
  input(payload: unknown): void;
  // D71: a wait a command can open. `credit(k)` is an Effect that finishes once `open(k)` has been called; counted, so order is free.
  credit(key: string): unknown;
  open(key: string): void;
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
  readonly observes?: true; // wants { k: "actors" }, level-triggered
  readonly store?: true; // D81: hears what a stream publishes
  init(): S;
  prepare?(s: S, w: Omit<WriteRef, "attempt" | "mint">, cx: Cx): unknown; // P5: dry
  start?(s: S, w: WriteRef, prepared: unknown, cx: Cx): { readonly s: S; readonly ok: boolean }; // P6
  ended?(s: S, e: Ended, cx: Cx): S; // N: rule 27. Before any routing
  sending?(s: S, attempt: string, cx: Cx): S; // D3 as directed: the Attempt heads its lane, so its send has begun (the write-ahead first). A commit in W has not
  blocks?(s: S, attempt: string): false | Claim; // D
  told?(s: S, fact: Told, cx: Cx): S; // D68: the core's facts
  input?(s: S, payload: unknown, cx: Cx): S; // D68: its own driver half and its own timers, nothing else
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
