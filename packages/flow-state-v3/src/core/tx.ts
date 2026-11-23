import { Brand, Equal, Option, Result, Struct } from "effect";
import { RuntimeDefaults } from "./defaults.ts";
import { Alarm, alarmKey, earliest } from "./alarms.ts";
import type { Compiled, StepSchedule, Values } from "./compiled.ts";
import { defect } from "./defect.ts";
import { makeFollowing } from "./following.ts";
import { makeMailbox } from "./mailbox.ts";
import type { OwedId } from "./ledger.ts";
import type { Evidence } from "./evidence.ts";
import { LOCAL_PREFIX } from "./identity.ts";
import { Act, evidenceOf } from "./evidence-of.ts";
import {
  type ActivationId,
  type ActorId,
  actorKey,
  type ArmingId,
  type AttemptId,
  type LaneId,
  byStart,
  type CallId,
  type ChainId,
  Command,
  type Incarnation,
  type IncarnationId,
  type Issue,
  type Lane,
  type Out,
  Phase,
  rootOf,
  type TicketId,
  type Use,
  waitOf,
  type World,
} from "./world.ts";

/**
 * The machines a Runtime runs, by machine id.
 */
export type Machines = ReadonlyMap<string, Compiled>;

/**
 * A step's environment: the Runtime Clock's time, the boot's session seed, how the Runtime admits a
 * value (deep-frozen in dev and test hosts, as it is; unchanged in production), and how the host
 * steps an Effect Schedule.
 */
export type Env = {
  readonly now: number;
  readonly seed: string;
  readonly admit: <A>(value: A) => A;
  readonly step: StepSchedule;
};

/**
 * Whether a lane is InFlight: every phase but Held.
 */
export const isInFlight = (lane: Lane) => !Phase.$is("Held")(lane.head.phase);

/**
 * The fields of a record a list names.
 */
export const pick = (input: Values, fields: ReadonlyArray<string>) => Struct.pick(input, fields);

/**
 * A minted id as its kind: the mint is the one place ids of each kind are made.
 */
const branded = <Id extends string>(id: string) =>
  // SAFETY: the world's mint makes each id once, under the kind its prefix names (Ids).
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- a brand is type-only; the mint is where it is given
  id as Id;

// The brands the mint gives its counted kinds: activations, armings and chains.
const activationOf = Brand.nominal<ActivationId>();

const armingOf = Brand.nominal<ArmingId>();

const chainOf = Brand.nominal<ChainId>();

type Ids = {
  readonly call: CallId;
  readonly ticket: TicketId;
  readonly owed: OwedId;
  readonly inc: IncarnationId;
};

type MapField = {
  readonly [K in keyof World]: World[K] extends ReadonlyMap<infer _K, infer _V> ? K : never;
}[keyof World];

type Indexed =
  | "incarnations"
  | "lanes"
  | "mail"
  | "alarms"
  | "uses"
  | "lanesOfActor"
  | "laneOfWait"
  | "consumersOf";

/**
 * A World map a step writes entry by entry with `put` and `drop`.
 */
export type Plain = Exclude<MapField, Indexed>;

type KeyIn<F extends MapField> = World[F] extends ReadonlyMap<infer K, infer _V> ? K : never;

type ValueIn<F extends MapField> = World[F] extends ReadonlyMap<infer _K, infer V> ? V : never;

type Draft = { -readonly [K in keyof World]: World[K] };

// The worlds a step returned that no step has taken and no reader has kept, each with the maps it
// alone holds: the next step owns those. A world a step took is spent.
const handed = new WeakMap<World, ReadonlySet<MapField>>();
const spent = new WeakSet<World>();

/**
 * Keeps a world past the next step: that step copies the maps it writes instead of taking them.
 *
 * **When to use**
 *
 * By a reader that holds a world while later steps run, such as a Story's cut read after its run.
 * A reader that reads a world at once and lets it go needs nothing.
 */
export const retain = (world: World) => void handed.delete(world);

/**
 * One step's working state: the world it replaces, the commands and evidence it returns, and its
 * environment. Every module of the step reads and writes through it.
 *
 * **Details**
 *
 * A world a step returns is handed to the next step, which writes in place the maps that world
 * alone holds, so a step costs what it changes, never the world's size; the world it was handed is
 * spent. Any other map, and every map of a world a reader retained, is never written: it is copied
 * once, on its first write in the step. Ids come from the world's counter and the boot's seed, so a step replays
 * exactly.
 */
export const makeTx = (machines: Machines, world0: World, env: Env) => {
  if (spent.has(world0)) defect("a world was stepped after a step took it");

  const owned = handed.get(world0);

  if (owned !== undefined) {
    handed.delete(world0);
    spent.add(world0);
  }

  const world: Draft = { ...world0 };
  const copied = new Set<MapField>(owned);
  const dirty = new Set<string>();
  // The identities whose lanes changed since their keys and pauses were last re-checked.
  let moved = new Set<string>();
  const commands: Array<Command> = [];
  const evidence: Array<Evidence> = [];

  const own = <F extends MapField>(field: F, map: Map<KeyIn<F>, ValueIn<F>>) => {
    Object.assign(world, { [field]: map });
    copied.add(field);

    return map;
  };

  const draft = <F extends MapField>(field: F) => {
    // SAFETY: a World map field holds exactly the keys and values its type names, and a copied
    // field holds the Map the step made.
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- the indexed access type is the map's own type, which TypeScript cannot narrow from a generic field
    const map = world[field] as Map<KeyIn<F>, ValueIn<F>>;

    return copied.has(field) ? map : own(field, new Map(map));
  };

  const put = <F extends Plain>(field: F, key: KeyIn<F>, value: ValueIn<F>) =>
    void draft(field).set(key, value);

  const drop = <F extends Plain>(field: F, key: KeyIn<F>) => void draft(field).delete(key);

  const replace = <F extends Plain>(field: F, map: Map<KeyIn<F>, ValueIn<F>>) =>
    void own(field, map);

  const mint = <K extends keyof Ids>(kind: K) => {
    world.counter += 1;

    return branded<Ids[K]>(`${kind}-${env.seed}-${world.counter}`);
  };

  const mintAttempt = () => {
    world.attempts += 1;

    return branded<AttemptId>(`att-${env.seed}-${world.attempts}`);
  };

  // An incarnation's id, with the count it was minted at: the order incarnations started in.
  const mintIncarnation = () => {
    const id = mint("inc");

    return { id, started: world.counter };
  };

  const mintActivation = () => activationOf((world.counter += 1));

  // A position in the Runtime's one order: larger than every earlier one, never saved.
  const mintPosition = () => (world.counter += 1);

  const mintArming = () => armingOf((world.counter += 1));

  // Chains have their own count, never reset, so a chain cleared early never gives its id again;
  // apart from the shared counter, so starting one shifts no other minted id.
  const mintChain = () => {
    world.chainCount += 1;

    return chainOf(world.chainCount);
  };

  const addTo = (field: "lanesOfActor" | "consumersOf", key: string, member: string) => {
    const index = draft(field);
    index.set(key, new Set(index.get(key)).add(member));
  };

  const removeFrom = (field: "lanesOfActor" | "consumersOf", key: string, member: string) => {
    const index = draft(field);
    const members = new Set(index.get(key));
    members.delete(member);

    if (members.size === 0) index.delete(key);
    else index.set(key, members);
  };

  const putIncarnation = (incarnation: Incarnation) => {
    const key = actorKey(incarnation.actor);
    const before = world.incarnations.get(key);
    draft("incarnations").set(key, incarnation);
    dirty.add(key);

    if (before?.bound === incarnation.bound) return;

    for (const provider of before?.bound.values() ?? [])
      removeFrom("consumersOf", actorKey(provider), key);

    for (const provider of incarnation.bound.values())
      addTo("consumersOf", actorKey(provider), key);
  };

  const dropIncarnation = (actor: ActorId) => {
    const key = actorKey(actor);
    const before = world.incarnations.get(key);

    if (before === undefined) return;
    draft("incarnations").delete(key);
    dirty.add(key);

    for (const provider of before.bound.values())
      removeFrom("consumersOf", actorKey(provider), key);
  };

  const consumersOf = (provider: ActorId) =>
    [...(world.consumersOf.get(actorKey(provider)) ?? [])]
      .flatMap((key) => Option.toArray(Option.fromUndefinedOr(world.incarnations.get(key))))
      .toSorted(byStart);

  const unwait = (id: LaneId, lane: Lane) => {
    for (const wait of Option.toArray(waitOf(lane)))
      if (world.laneOfWait.get(wait) === id) draft("laneOfWait").delete(wait);
  };

  const putLane = (id: LaneId, lane: Lane) => {
    const key = actorKey(lane.actor);
    const before = world.lanes.get(id);
    draft("lanes").set(id, lane);
    dirty.add(key);
    moved.add(key);

    if (before === undefined) addTo("lanesOfActor", key, id);
    else unwait(id, before);

    for (const wait of Option.toArray(waitOf(lane))) draft("laneOfWait").set(wait, id);
  };

  const dropLane = (id: LaneId) => {
    const before = world.lanes.get(id);

    if (before === undefined) return;

    const key = actorKey(before.actor);
    draft("lanes").delete(id);
    dirty.add(key);
    moved.add(key);
    removeFrom("lanesOfActor", key, id);
    unwait(id, before);
  };

  const lanesOf = (actor: ActorId) =>
    [...(world.lanesOfActor.get(actorKey(actor)) ?? [])].flatMap((id) =>
      Option.toArray(
        Option.map(Option.fromUndefinedOr(world.lanes.get(id)), (l) => [id, l] as const),
      ),
    );

  const laneWaiting = (wait: string) =>
    Option.flatMap(Option.fromUndefinedOr(world.laneOfWait.get(wait)), (id) =>
      Option.map(Option.fromUndefinedOr(world.lanes.get(id)), (lane) => [id, lane] as const),
    );

  const putUses = (actor: ActorId, uses: ReadonlyArray<Use>) => {
    const key = actorKey(actor);
    draft("uses").set(key, uses);
    dirty.add(key);
  };

  const dropUses = (actor: ActorId) => {
    const key = actorKey(actor);
    draft("uses").delete(key);
    dirty.add(key);
  };

  // ── alarms: one per owner fact, by its key. The host holds one wake exactly while an alarm is
  // due, at the earliest deadline (`World.wake`); a step that changed the alarms, or spent the
  // wake on its Tick, sets it again at its end.
  let alarmsMoved = false;

  const setAlarm = (alarm: Alarm, at: number) => {
    const key = alarmKey(alarm);

    if (world.alarms.get(key)?.at === at) return;
    alarmsMoved = true;
    draft("alarms").set(key, { alarm, at });
  };

  const clearAlarm = (alarm: Alarm) => {
    const key = alarmKey(alarm);

    if (!world.alarms.has(key)) return;
    alarmsMoved = true;
    draft("alarms").delete(key);

    if (Alarm.$is("Grace")(alarm)) dirty.add(actorKey(alarm.actor));
  };

  // Every alarm a match names: for the Runtime's life, never on an actor's step path.
  const clearAlarmsWhere = (match: (alarm: Alarm) => boolean) => {
    for (const { alarm } of world.alarms.values()) if (match(alarm)) clearAlarm(alarm);
  };

  // The alarms due by now, taken on the host's wake, which that wake spent: a later alarm, and
  // one set while they run, waits for the next wake.
  const takeDue = () => {
    world.wake = Option.none();
    alarmsMoved = true;

    const due = [...world.alarms.values()].filter((a) => a.at <= env.now);

    for (const { alarm } of due) clearAlarm(alarm);

    return due;
  };

  // The host's one wake, at the earliest deadline, or none while no alarm is due: sent when it
  // differs from the wake the host holds.
  const wake = () => {
    if (!alarmsMoved) return;

    const next = earliest(world.alarms);

    if (Equal.equals(next, world.wake)) return;
    world.wake = next;
    commands.push(
      Option.match(next, { onNone: () => Command.Sleep(), onSome: (at) => Command.Wake({ at }) }),
    );
  };

  // Counts a turn's sends toward the loop guard of the admitted event it follows; fails with the
  // refusal's slot, naming that event, when they would pass the guard.
  const countSends = (count: number) => {
    const id = Option.getOrElse(chainNow(), () => defect("a turn sent outside a served item"));
    const chain = world.chains.get(id) ?? defect("a chain followed after it was cleared");

    if (chain.sent + count > RuntimeDefaults.loopGuard)
      return Result.fail(
        `loop guard: ${String(RuntimeDefaults.loopGuard)} events sent from ${chain.root}`,
      );

    put("chains", id, { ...chain, sent: chain.sent + count });

    return Result.succeed(id);
  };

  // ── mail: the mailboxes (`mailbox.ts`), each written through this step's draft.
  // The item being served and the loop guard's chain it follows: the mail its turns enqueue follows
  // the chain. An item that follows none is admitted, and starts one at the first mail it enqueues.
  const { chainNow, serving } = makeFollowing((item) => {
    const chain = mintChain();
    put("chains", chain, { root: rootOf(item), sent: 0 });

    return chain;
  });

  const mailbox = makeMailbox({
    world: () => world,
    draft: () => draft("mail"),
    replace: (mail) => void own("mail", mail),
    dirty,
    chainNow,
  });

  // A local actor never persists, whatever its machine declares.
  const persisted = (actor: ActorId) =>
    machines.get(actor.machine)?.persist === true &&
    world.persistence &&
    !actor.name.startsWith(LOCAL_PREFIX);

  return {
    machines,
    env,
    // RETURN_TYPE: the step's draft, read as the World it becomes.
    world: (): World => world,
    put,
    drop,
    replace,
    setLife: (life: World["life"]) => {
      world.life = life;
    },
    noPersistence: () => {
      world.persistence = false;
    },
    act: (a: Act) => void evidence.push(...evidenceOf(a)),
    refuse: <I extends Pick<Issue, "code" | "slot">>(
      actor: ActorId,
      issue: I,
      ending: Parameters<typeof Act.Refused>[0]["ending"] = Option.none(),
    ) => {
      evidence.push(
        ...evidenceOf(Act.Refused({ code: issue.code, actor, ending, slot: issue.slot })),
      );

      return issue;
    },
    evidenceCount: () => evidence.length,
    insertAct: (at: number, a: Act) => void evidence.splice(at, 0, ...evidenceOf(a)),
    command: (c: Command) => void commands.push(c),
    commandsSince: (at: number) => commands.slice(at),
    commandCount: () => commands.length,
    mint,
    mintAttempt,
    mintIncarnation,
    mintActivation,
    mintPosition,
    mintArming,
    persisted,
    putIncarnation,
    dropIncarnation,
    consumersOf,
    putLane,
    dropLane,
    lanesOf,
    laneWaiting,
    putUses,
    dropUses,
    setAlarm,
    clearAlarm,
    clearAlarmsWhere,
    takeDue,
    wake,
    alarmed: (alarm: Alarm) => Option.fromUndefinedOr(world.alarms.get(alarmKey(alarm))),
    ...mailbox,
    chainNow,
    serving,
    countSends,
    dirtyActors: () => dirty,
    // The identities whose lanes changed since the last ask.
    takeMoved: () => {
      const taken = moved;
      moved = new Set();

      return taken;
    },
    incarnationOf: (actor: ActorId) => world.incarnations.get(actorKey(actor)),
    used: (actor: ActorId) => (world.uses.get(actorKey(actor)) ?? []).length > 0,
    out: () => {
      handed.set(world, new Set(copied));

      return { world, commands, evidence } satisfies Out;
    },
  };
};

/**
 * One step's working state.
 */
export type Tx = ReturnType<typeof makeTx>;
