import type { Compiled, Values } from "./compiled.ts";
import type { Evidence, Who } from "./evidence.ts";
import {
  type ActorId,
  actorKey,
  Command,
  type Ending,
  type Lane,
  Mail,
  type Out,
  Phase,
  type Timer,
  type World,
} from "./world.ts";

/**
 * The machines a Runtime runs, by machine id.
 */
export type Machines = ReadonlyMap<string, Compiled>;

/**
 * What a step reads from its host: the Runtime Clock's time and the boot's session seed.
 */
export type Env = { readonly now: number; readonly seed: number };

/**
 * How long a free shared actor lives before it ends (Actors R8).
 */
export const GRACE_MS = 100;

/**
 * How long an awaited store write may stay unanswered before StorageSilent (WriteAhead R12).
 */
export const SILENT_MS = 10_000;

/**
 * How long the Runtime's disposal waits for calls on the wire (Actors R22).
 */
export const DISPOSAL_BOUND_MS = 5000;

/**
 * The root's activation: it lives as long as the incarnation, so work it owns is never late.
 */
export const ROOT_ACTIVATION = 0;

/**
 * Flow's decline reasons: the failure NotSent { why } (WriteLanes R3).
 */
export const DECLINES: ReadonlySet<string> = new Set([
  "Cancelled",
  "Restored",
  "Rejected",
  "Overloaded",
  "StorageRefused",
  "Disposed",
  "NoPersistence",
  "OldVersion",
  "Unencodable",
]);

/**
 * An actor as evidence names it.
 */
export const who = (actor: ActorId) => ({ machine: actor.machine, name: actor.name }) satisfies Who;

/**
 * A map with one more entry.
 */
export const withEntry = <K, V>(map: ReadonlyMap<K, V>, key: K, value: V) =>
  new Map(map).set(key, value);

/**
 * A map with one entry fewer.
 */
export const without = <K, V>(map: ReadonlyMap<K, V>, key: K) => {
  const next = new Map(map);
  next.delete(key);

  return next;
};

/**
 * Whether a lane is InFlight: every phase but Held.
 */
export const isInFlight = (lane: Lane) => !Phase.$is("Held")(lane.head.phase);

/**
 * The fields of a record a list names.
 */
export const pick = (input: Values, fields: ReadonlyArray<string>) =>
  Object.fromEntries(fields.map((f) => [f, input[f]]));

/**
 * One step's working state (Turn's composition note): the world it replaces, the commands and
 * evidence it returns, and its environment. Every module of the step reads and writes through it.
 *
 * **Details**
 *
 * The world is replaced whole by `set`; nothing is mutated in place. Ids come from the world's
 * counter and the boot's seed, so a step replays exactly.
 */
export const makeTx = (machines: Machines, world0: World, env: Env) => {
  let world = world0;
  const commands: Array<Command> = [];
  const evidence: Array<Evidence> = [];

  const tx = {
    machines,
    env,
    world: () => world,
    set: (next: World) => {
      world = next;
    },
    emit: (e: Evidence) => void evidence.push(e),
    evidenceCount: () => evidence.length,
    insertEvidence: (at: number, e: Evidence) => void evidence.splice(at, 0, e),
    command: (c: Command) => void commands.push(c),
    mint: (prefix: string) => {
      world = { ...world, counter: world.counter + 1 };

      return `${prefix}-${env.seed}-${world.counter}`;
    },
    next: () => {
      world = { ...world, counter: world.counter + 1 };

      return world.counter;
    },
    out: () => ({ world, commands, evidence }) satisfies Out,
  };

  const persisted = (actor: ActorId) =>
    machines.get(actor.machine)?.persist === true && world.persistence;

  const armTimer = (timer: Timer, at: number) => {
    const id = tx.mint("timer");
    world = { ...world, timers: withEntry(world.timers, id, timer) };
    commands.push(Command.Arm({ timer: id, at }));

    return id;
  };

  const disarmWhere = (match: (timer: Timer) => boolean) => {
    for (const [id, timer] of world.timers)
      if (match(timer)) {
        world = { ...world, timers: without(world.timers, id) };
        commands.push(Command.Disarm({ timer: id }));
      }
  };

  const enqueue = (mail: Mail) => {
    world = { ...world, mail: [...world.mail, mail] };
  };

  return {
    ...tx,
    persisted,
    armTimer,
    disarmWhere,
    incarnationOf: (actor: ActorId) => world.incarnations.get(actorKey(actor)),
    used: (actor: ActorId) => (world.uses.get(actorKey(actor)) ?? []).length > 0,
    lanesOf: (actor: ActorId) =>
      [...world.lanes.values()].filter((l) => actorKey(l.actor) === actorKey(actor)),
    enqueue,
    endingMail: (actor: ActorId, ending: Ending) => enqueue(Mail.Ending({ actor, ending })),
  };
};

/**
 * One step's working state.
 */
export type Tx = ReturnType<typeof makeTx>;
