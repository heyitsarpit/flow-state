import { Option, Struct } from "effect";
import type { Compiled, Values } from "./compiled.ts";
import { defect } from "./defect.ts";
import type { OwedId } from "./ledger.ts";
import type { Evidence } from "./evidence.ts";
import { LOCAL_PREFIX } from "./identity.ts";
import { type Act, evidenceOf } from "./evidence-of.ts";
import {
  type ActorId,
  actorKey,
  type CallId,
  Command,
  type Incarnation,
  type Lane,
  Mail,
  type Out,
  Phase,
  startOrder,
  type TicketId,
  Timer,
  type TimerId,
  type Use,
  waitOf,
  type World,
} from "./world.ts";

/**
 * The machines a Runtime runs, by machine id.
 */
export type Machines = ReadonlyMap<string, Compiled>;

/**
 * A step's environment: the Runtime Clock's time, the boot's session seed, and how the Runtime
 * admits a value (deep-frozen in dev and test hosts, as it is; unchanged in production).
 */
export type Env = {
  readonly now: number;
  readonly seed: string;
  readonly admit: <A>(value: A) => A;
};

/**
 * How long a free shared actor lives before it ends.
 */
export const GRACE_MS = 100;

/**
 * How long an awaited store write may stay unanswered before StorageSilent.
 */
export const SILENT_MS = 10_000;

/**
 * How long the Runtime's disposal waits for calls on the wire.
 */
export const DISPOSAL_BOUND_MS = 5000;

/**
 * The root's activation: it lives as long as the incarnation, so work it owns is never late.
 */
export const ROOT_ACTIVATION = 0;

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

// Each kind of id the world's counter mints, by the prefix it is minted with.
type Ids = {
  readonly timer: TimerId;
  readonly call: CallId;
  readonly ticket: TicketId;
  readonly owed: OwedId;
  readonly inc: string;
};

type MapField = {
  readonly [K in keyof World]: World[K] extends ReadonlyMap<infer _K, infer _V> ? K : never;
}[keyof World];

// The maps a step writes through their own operations, which keep the indexes in step.
type Indexed =
  | "incarnations"
  | "lanes"
  | "mail"
  | "timers"
  | "uses"
  | "lanesOfActor"
  | "laneOfWait"
  | "consumersOf"
  | "silenceOf";

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
  const ownBoxes = new Set<string>();
  // The identities whose incarnation, uses, lanes, mail or grace changed in this step.
  const dirty = new Set<string>();
  const commands: Array<Command> = [];
  const evidence: Array<Evidence> = [];

  // A World map as the step's own copy: the field's map is replaced by one the step may write.
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

  // A whole map replaced, as a boot or a disposal does.
  const replace = <F extends Plain>(field: F, map: Map<KeyIn<F>, ValueIn<F>>) =>
    void own(field, map);

  const mint = <K extends keyof Ids>(kind: K) => {
    world.counter += 1;

    return branded<Ids[K]>(`${kind}-${env.seed}-${world.counter}`);
  };

  const mintAttempt = () => {
    world.attempts += 1;

    return `att-${env.seed}-${world.attempts}`;
  };

  const next = () => {
    world.counter += 1;

    return world.counter;
  };

  // A set index's entry with one member more or fewer; an empty entry is dropped.
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

  // ── incarnations, with each provider's consumers.
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

  // The live incarnations bound to a provider, in the order they started.
  const consumersOf = (provider: ActorId) =>
    [...(world.consumersOf.get(actorKey(provider)) ?? [])]
      .flatMap((key) => Option.toArray(Option.fromUndefinedOr(world.incarnations.get(key))))
      .toSorted((a, b) => startOrder(a) - startOrder(b));

  // ── lanes, with each identity's lanes and the lane each call or ticket is awaited by.
  const unwait = (id: string, lane: Lane) => {
    for (const wait of Option.toArray(waitOf(lane)))
      if (world.laneOfWait.get(wait) === id) draft("laneOfWait").delete(wait);
  };

  const putLane = (id: string, lane: Lane) => {
    const key = actorKey(lane.actor);
    const before = world.lanes.get(id);
    draft("lanes").set(id, lane);
    dirty.add(key);

    if (before === undefined) addTo("lanesOfActor", key, id);
    else unwait(id, before);

    for (const wait of Option.toArray(waitOf(lane))) draft("laneOfWait").set(wait, id);
  };

  const dropLane = (id: string) => {
    const before = world.lanes.get(id);

    if (before === undefined) return;

    const key = actorKey(before.actor);
    draft("lanes").delete(id);
    dirty.add(key);
    removeFrom("lanesOfActor", key, id);
    unwait(id, before);
  };

  // An identity's lanes, in the order the lanes table holds them.
  const lanesOf = (actor: ActorId) =>
    [...(world.lanesOfActor.get(actorKey(actor)) ?? [])].flatMap((id) =>
      Option.toArray(
        Option.map(Option.fromUndefinedOr(world.lanes.get(id)), (l) => [id, l] as const),
      ),
    );

  // The lane whose head waits on a call or ticket.
  const laneWaiting = (wait: string) =>
    Option.flatMap(Option.fromUndefinedOr(world.laneOfWait.get(wait)), (id) =>
      Option.map(Option.fromUndefinedOr(world.lanes.get(id)), (lane) => [id, lane] as const),
    );

  // ── uses.
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

  // ── timers, with each awaited ticket's silence.
  const armTimer = (timer: Timer, at: number) => {
    const id = mint("timer");
    draft("timers").set(id, timer);

    if (Timer.$is("Silent")(timer)) draft("silenceOf").set(timer.ticket, id);
    commands.push(Command.Arm({ timer: id, at }));

    return id;
  };

  const dropTimer = (id: TimerId, timer: Timer) => {
    draft("timers").delete(id);

    if (Timer.$is("Silent")(timer) && world.silenceOf.get(timer.ticket) === id)
      draft("silenceOf").delete(timer.ticket);

    if (Timer.$is("Grace")(timer)) dirty.add(actorKey(timer.actor));
  };

  const disarm = (id: TimerId) => {
    const timer = world.timers.get(id);

    if (timer === undefined) return;
    dropTimer(id, timer);
    commands.push(Command.Disarm({ timer: id }));
  };

  // Every timer a match names: for the Runtime's life, never on an actor's step path.
  const disarmWhere = (match: (timer: Timer) => boolean) => {
    for (const [id, timer] of world.timers) if (match(timer)) disarm(id);
  };

  const disarmSilence = (ticket: string) =>
    Option.match(Option.fromUndefinedOr(world.silenceOf.get(ticket)), {
      onNone: () => undefined,
      onSome: disarm,
    });

  // A timer that fired leaves the world; a stale firing finds none.
  const fire = (id: TimerId) => {
    const timer = Option.fromUndefinedOr(world.timers.get(id));

    for (const t of Option.toArray(timer)) dropTimer(id, t);

    return timer;
  };

  // ── mail: each actor has one FIFO mailbox; an actor whose mailbox was empty joins the
  // rotation last. `fresh` is the mail enqueued since the drain last asked: a served event's
  // follow-ups.
  let fresh: Array<Mail> = [];

  const box = (key: string) => {
    const mail = draft("mail");
    const own = mail.get(key);

    if (own !== undefined && ownBoxes.has(key))
      // SAFETY: a mailbox this step copied is its own array; the World only reads it.
      // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- the step owns the copy it made
      return own as Array<Mail>;

    const copy = [...(own ?? [])];
    mail.set(key, copy);
    ownBoxes.add(key);
    dirty.add(key);

    return copy;
  };

  const enqueue = (mail: Mail) => {
    const key = actorKey(mail.actor);
    fresh.push(mail);
    box(key).push(mail);
    dirty.add(key);
  };

  // Mail that takes the place of the item just served: it goes to the front of its mailbox.
  const enqueueFirst = (mails: ReadonlyArray<Mail>) => {
    const [first] = mails;

    if (first === undefined) return;

    const key = actorKey(first.actor);
    fresh.push(...mails);
    box(key).unshift(...mails);
    dirty.add(key);
  };

  const emptied = (key: string) => {
    draft("mail").delete(key);
    ownBoxes.delete(key);
    dirty.add(key);
  };

  // An actor's oldest mail, taken from its mailbox; a rotated actor goes to the back while it
  // still has mail, a follow-up's actor keeps its place.
  const takeOldest = (key: string, rotated: boolean) => {
    if (!world.mail.has(key)) return undefined;

    const mailbox = box(key);
    const first = mailbox.shift();

    if (mailbox.length === 0) emptied(key);
    else if (rotated) {
      draft("mail").delete(key);
      draft("mail").set(key, mailbox);
    }

    return first;
  };

  // A row that leaves the mailbox takes its references with it.
  const unreference = (actor: ActorId, id: string) => {
    const key = actorKey(actor);
    const held = world.mail.get(key);

    if (held === undefined || !held.some((m) => Mail.$is("Ending")(m) && m.id === id)) return;

    const left = box(key).filter((m) => !(Mail.$is("Ending")(m) && m.id === id));

    if (left.length === 0) emptied(key);
    else {
      draft("mail").set(key, left);
      dirty.add(key);
    }
  };

  const clearMail = () => {
    for (const key of world.mail.keys()) dirty.add(key);
    own("mail", new Map());
    ownBoxes.clear();
  };

  const takeFresh = () => {
    const taken = fresh;
    fresh = [];

    return taken;
  };

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
    evidenceCount: () => evidence.length,
    insertAct: (at: number, a: Act) => void evidence.splice(at, 0, ...evidenceOf(a)),
    command: (c: Command) => void commands.push(c),
    commandsSince: (at: number) => commands.slice(at),
    commandCount: () => commands.length,
    mint,
    mintAttempt,
    next,
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
    armTimer,
    disarm,
    disarmWhere,
    disarmSilence,
    fire,
    enqueue,
    enqueueFirst,
    takeOldest,
    unreference,
    clearMail,
    takeFresh,
    dirtyActors: () => dirty,
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
