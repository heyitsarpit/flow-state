import { HashSet, MutableRef } from "effect";
import type { Part, ServerAnswer, UserAction } from "../../fixtures/part.ts";
import { random } from "../dsl/generate.ts";
import { oneMachineEach } from "../fixtures/fixture.ts";
import { answerOf, type Script, type ScriptAnswer, type Step } from "../dsl/script.ts";
import type { Code } from "./codes.ts";
import {
  advanced,
  answered,
  answerFor,
  armed,
  type Believed,
  heard,
  type Keys,
  refused,
  reloaded,
  reset,
  type World,
} from "./belief.ts";
import { partFixture } from "./reference.ts";

/**
 * A suite-wide profile: the usual healthy run, or the stress run with faults (lost answers,
 * unacknowledged and refused writes, reloads).
 */
export type Profile = "usual" | "stress";

/**
 * The seeds builders run; the held-out seeds are run only by the guard (advisor Q8).
 */
export const BUILD_SEEDS: ReadonlyArray<number> = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];

/**
 * Seeds no builder tunes against.
 */
export const HELD_OUT_SEEDS: ReadonlyArray<number> = [
  101, 102, 103, 104, 105, 106, 107, 108, 109, 110, 111, 112,
];

const MOVES: Readonly<Record<Profile, number>> = { usual: 40, stress: 100 };

const hashOf = (text: string) =>
  Array.from({ length: text.length }, (_, i) => text.charCodeAt(i)).reduce(
    (h, code) => Math.imul(h ^ code, 16_777_619) >>> 0,
    2_166_136_261,
  );

const declaredBy = (declared: ReadonlyArray<Code>) => {
  const set: ReadonlySet<string> = new Set(declared);

  return (codes: ReadonlyArray<string>) => codes.every((c) => set.has(c));
};

type Move = {
  readonly steps: ReadonlyArray<Step>;
  readonly weight: number;
  readonly apply: () => void;
};

const by = (a: Believed, solo: boolean) => (solo ? {} : { by: a.by });

// RETURN_TYPE: the draw takes one Move list from every source; inference would keep each literal.
const userMoves = (
  world: World,
  a: Believed,
  action: UserAction,
  solo: boolean,
  profile: Profile,
): ReadonlyArray<Move> => {
  const think: ReadonlyArray<Step> =
    action.thinkMs > 0 ? [{ _tag: "advance", ms: action.thinkMs }] : [];

  if (action.kind !== "send") {
    const step: Step = { _tag: action.kind, ...by(a, solo) };

    return [
      {
        steps: [...think, step],
        weight: action.weight,
        apply: () => {
          advanced(world, action.thinkMs);
          MutableRef.set(a.attached, false);

          if (action.kind !== "release") reset(a);
        },
      },
    ];
  }

  const persisted = a.part.machine.compiled.persist;
  const landing: ReadonlyArray<Step> = persisted ? [{ _tag: "ack" }] : [];

  return action.payloads.flatMap((payload) => {
    const sends: ReadonlyArray<Step> = Array.from({ length: action.burst }, () => ({
      _tag: "send" as const,
      event: action.event,
      payload,
      ...by(a, solo),
    }));

    const labels = a.fixture.handlers.folds.driven[action.event]?.(payload) ?? {};
    const weight = action.weight / action.payloads.length;

    const sent = (acked: boolean) => () => {
      advanced(world, action.thinkMs);

      for (let i = 0; i < action.burst; i += 1) heard(world, a, action.event, labels, acked);
    };

    const acked: Move = {
      steps: [...think, ...sends, ...landing],
      weight: profile === "stress" && persisted ? weight * 0.6 : weight,
      apply: sent(true),
    };

    if (profile === "usual" || !persisted) return [acked];

    return [acked, { steps: [...think, ...sends], weight: weight * 0.4, apply: sent(false) }];
  });
};

type Fault = { readonly answer: ScriptAnswer; readonly weight: number };

/**
 * The stress profile's faulty answers to one operation (catalogue section 5): lost, applied with
 * the response lost (from the server's first success and first failure), and never answered.
 */
const faultsOf = (answers: ReadonlyArray<{ readonly answer: ServerAnswer }>) => {
  const ok = answers.find((a) => a.answer._tag === "ok")?.answer;
  const fail = answers.find((a) => a.answer._tag === "fail")?.answer;

  const landed: ReadonlyArray<Fault> =
    ok?._tag === "ok" ? [{ answer: { _tag: "lostButLanded", value: ok.value }, weight: 0.75 }] : [];

  const failed: ReadonlyArray<Fault> =
    fail?._tag === "fail"
      ? [{ answer: { _tag: "failButLanded", tag: fail.tag, fields: fail.fields }, weight: 0.5 }]
      : [];

  return [
    { answer: { _tag: "lost" }, weight: 1.5 },
    ...landed,
    ...failed,
    { answer: { _tag: "never" }, weight: 0.25 },
  ] satisfies ReadonlyArray<Fault>;
};

// RETURN_TYPE: a Move, so its steps keep the Step union rather than each literal.
const faultMove = (world: World, operation: string, { answer, weight }: Fault): Move => ({
  steps: [{ _tag: "answer", operation, answer }],
  weight,
  apply: () => answered(world, operation, answerOf(answer)),
});

// RETURN_TYPE: the draw takes one Move list from every source; inference would keep each literal.
const answerMoves = (
  world: World,
  profile: Profile,
  allowed: (codes: ReadonlyArray<string>) => boolean,
): ReadonlyArray<Move> =>
  [...world.open].flatMap(([operation, requests]) => {
    const head = requests[0];
    const a = head === undefined ? undefined : world.actors[head.actor];

    if (a === undefined) return [];

    const model = a.part.server[operation];

    const healthy = (model?.answers ?? []).map(({ weight, answer }) => ({
      steps: [{ _tag: "answer" as const, operation, answer }],
      weight: weight / 2,
      apply: () => answered(world, operation, answerFor(answer)),
    }));

    if (profile === "usual" || !allowed(["un"])) return healthy;

    return [
      ...healthy,
      ...faultsOf(model?.answers ?? []).map((fault) => faultMove(world, operation, fault)),
    ];
  });

// RETURN_TYPE: the draw takes one Move list from every source; inference would keep each literal.
const worldMoves = (
  world: World,
  profile: Profile,
  allowed: (codes: ReadonlyArray<string>) => boolean,
): ReadonlyArray<Move> => {
  const next = world.actors
    .flatMap((a) => (a.attached.current ? a.timers.current.map((t) => t.due) : []))
    .toSorted((x, y) => x - y)[0];

  const timer =
    next === undefined
      ? []
      : [
          {
            steps: [{ _tag: "advance" as const, ms: next - world.now.current }],
            weight: 2,
            apply: () => advanced(world, next - world.now.current),
          },
        ];

  if (profile === "usual") return timer;

  const ack =
    world.unacked.length > 0
      ? [
          {
            steps: [{ _tag: "ack" as const }],
            weight: 2,
            apply: () => {
              for (const { operation, request } of world.unacked.splice(0))
                world.open.set(operation, [...(world.open.get(operation) ?? []), request]);
            },
          },
        ]
      : [];

  const refuse =
    world.unacked.length > 0 && allowed(["sr"])
      ? [{ steps: [{ _tag: "refuse" as const }], weight: 1, apply: () => refused(world) }]
      : [];

  const reload = allowed(["rl"])
    ? [{ steps: [{ _tag: "reload" as const }], weight: 1, apply: () => reloaded(world) }]
    : [];

  return [...timer, ...ack, ...refuse, ...reload];
};

const pick = (moves: ReadonlyArray<Move>, at: number) => {
  const total = moves.reduce((sum, m) => sum + m.weight, 0);
  let left = at * total;

  return (
    moves.find((m) => {
      left -= m.weight;

      return left < 0;
    }) ?? moves.at(-1)
  );
};

const generated = (
  cast: ReadonlyArray<{ readonly part: Part; readonly actor: string }>,
  profile: Profile,
  seed: number,
  declared: ReadonlyArray<Code>,
  id: string,
) => {
  const allowed = declaredBy(declared);
  const draw = random(hashOf(`${id}/${seed}`));
  const fixtures = new Map(cast.map(({ part }) => [part.name, partFixture(part)]));
  const solo = cast.length === 1;

  const actors = cast.map(({ part }, i) => {
    const fixture = fixtures.get(part.name) ?? partFixture(part);

    return {
      part,
      fixture,
      by: i,
      attached: MutableRef.make(false),
      leaf: MutableRef.make(part.machine.compiled.initial),
      fields: MutableRef.make(fixture.handlers.folds.initial),
      timers: MutableRef.make<ReadonlyArray<{ readonly send: string; readonly due: number }>>([]),
      busy: MutableRef.make<Keys>(HashSet.empty()),
      unsure: MutableRef.make<Keys>(HashSet.empty()),
    };
  });

  const world: World = { actors, open: new Map(), unacked: [], now: MutableRef.make(0) };
  const steps: Array<Step> = [];

  for (const a of actors) {
    steps.push({ _tag: "ensure", ...by(a, solo) });
    MutableRef.set(a.attached, true);
    MutableRef.set(a.timers, armed(a, 0));
  }

  for (let move = 0; move < MOVES[profile]; move += 1) {
    const moves = [
      ...actors.flatMap((a) => {
        if (!a.attached.current)
          return [
            {
              steps: [{ _tag: "ensure" as const, ...by(a, solo) }],
              weight: 2,
              apply: () => {
                MutableRef.set(a.attached, true);
                MutableRef.set(a.timers, armed(a, world.now.current));
              },
            },
          ];

        return (a.part.user[a.leaf.current] ?? [])
          .filter((action) => allowed(action.codes))
          .flatMap((action) => userMoves(world, a, action, solo, profile));
      }),
      ...answerMoves(world, profile, allowed),
      ...worldMoves(world, profile, allowed),
    ];

    const chosen = pick(moves, draw());

    if (chosen === undefined) break;
    steps.push(...chosen.steps);
    chosen.apply();
  }

  return steps;
};

/**
 * The script of one part under a profile and a seed, drawn only from actions whose codes the
 * runtime declares, filtered before the draw (Conformance R15, R16, I52).
 *
 * **Details**
 *
 * - Each of the part's actors is ensured first; each move then draws, by weight, a user action at
 *   the leaf the generator believes the actor is in, an answer to a request it believes open, or
 *   (under stress) a lost answer, an unacknowledged write, an acknowledgement, a refusal or a
 *   reload.
 * - The belief comes from the part's own `Compiled` and folds; it only steers the draw, so a wrong
 *   belief makes a less useful script, never a wrong verdict.
 */
// RETURN_TYPE: a Script, so its steps keep the Step union rather than each literal.
export const scriptOf = (
  part: Part,
  profile: Profile,
  seed: number,
  declared: ReadonlyArray<Code>,
): Script => {
  const id = `PART-${part.name}-${profile}-${seed}`;
  const [first = "a", ...others] = part.actors;
  const cast = part.actors.map((actor) => ({ part, actor }));
  const steps = generated(cast, profile, seed, declared, id);

  if (others.length === 0) return { id, fixture: part.name, actor: first, steps };

  return {
    id,
    fixture: part.name,
    actor: first,
    actors: cast.map(({ actor }) => ({ fixture: part.name, actor })),
    steps,
  };
};

/**
 * The app mix: several parts' actors in one runtime and one world, under one seed (Conformance
 * R15, catalogue 5B).
 */
// RETURN_TYPE: a Script, so its steps keep the Step union rather than each literal.
export const mixOf = (
  parts: ReadonlyArray<Part>,
  profile: Profile,
  seed: number,
  declared: ReadonlyArray<Code>,
): Script => {
  oneMachineEach(parts.map((p) => p.machine.compiled.id));

  const cast = parts.flatMap((part) => part.actors.map((actor) => ({ part, actor })));
  const id = `MIX-${parts.map((p) => p.name).join("+")}-${profile}-${seed}`;
  const steps = generated(cast, profile, seed, declared, id);

  return {
    id,
    fixture: cast[0]?.part.name ?? "",
    actor: cast[0]?.actor ?? "",
    actors: cast.map(({ part, actor }) => ({ fixture: part.name, actor })),
    steps,
  };
};
