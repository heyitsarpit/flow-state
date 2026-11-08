// `Feed.multiplex` (STREAMS-QUESTIONS Q1 B): library code beside `Feed.callback`, no runtime concept. One connection while any key has a
// session; the app's `connect` opens it and parses frames, and routes them with `emit.to`, `emit.all`, `emit.fail`; `add` and `remove` run on a
// key's first and last session. Each `stream(key)` is a `Feed.callback`, bounded as one, so Flow still sees one independent session per key.
// Proposed beyond Q1's AFTER: `emit.fail(e, key)` fails one key's sessions (a server refusing one subscription) and keeps the connection.
import { Cause, Effect, Exit, Scope, Stream } from "effect";
import { type Emit, feedCallback, type Signal } from "./compiled.ts";

export type HubEmit<K, A, E> = {
  readonly to: (key: K, x: A | Signal) => void;
  readonly all: (x: A | Signal) => void;
  readonly fail: (e: E, key?: K) => void; // no key: the connection is gone, every key's sessions fail; a key: only that key's
};
export type HubOps<K> = {
  readonly add: (key: K) => Effect.Effect<void>;
  readonly remove: (key: K) => Effect.Effect<void>;
};
export type Multiplex<K, A, E> = { readonly stream: (key: K) => Stream.Stream<A | Signal, E> };

type Member = { emit?: Emit; readonly early: unknown[]; failed?: { readonly e: unknown } };
// `added`: the server was told `add` for this route and not yet `remove`. A key the server refused is a route no longer mapped.
type Route<K> = { readonly key: K; readonly members: Set<Member>; added: boolean };
type Conn<K> = {
  readonly scope: Scope.Closeable;
  readonly routes: Map<string, Route<K>>;
  ops?: HubOps<K>;
  dead: boolean;
  size: number;
};

export const feedMultiplex = <K, A, E>(o: {
  readonly connect: (emit: HubEmit<K, A, E>) => Effect.Effect<HubOps<K>, E, Scope.Scope>;
  readonly bound?: number;
}): Effect.Effect<Multiplex<K, A, E>> =>
  Effect.sync(() => {
    const bound = o.bound ?? 1024;
    let current: Conn<K> | undefined;
    const name = (k: K) => JSON.stringify(k);
    const failOne = (m: Member, e: unknown) => {
      if (m.failed) return;
      m.failed = { e };
      m.emit?.fail(e);
    };
    const say = (m: Member, x: unknown) => {
      if (m.failed) return;
      if (m.emit) return void m.emit(x);
      if (m.early.length >= bound) return failOne(m, { _tag: "Overflow" });
      m.early.push(x);
    };
    const start = (c: Conn<K>) => {
      const every = (f: (m: Member) => void) => c.routes.forEach((r) => r.members.forEach(f));
      const emit: HubEmit<K, A, E> = {
        to: (k, x) => {
          if (!c.dead) c.routes.get(name(k))?.members.forEach((m) => say(m, x));
        },
        all: (x) => {
          if (!c.dead) every((m) => say(m, x));
        },
        fail: (e, key) => {
          if (c.dead) return;
          if (key !== undefined) {
            const r = c.routes.get(name(key));
            if (!r) return;
            c.routes.delete(name(key));
            r.added = false;
            r.members.forEach((m) => failOne(m, e));
            return;
          }
          c.dead = true;
          if (current === c) current = undefined;
          every((m) => failOne(m, e));
        },
      };
      return Effect.forkIn(
        Effect.gen(function* () {
          const ops = yield* Scope.provide(o.connect(emit), c.scope);
          if (c.dead) return;
          c.ops = ops;
          for (;;) {
            const r = [...c.routes.values()].find((x) => !x.added);
            if (!r || c.dead) return;
            r.added = true;
            yield* ops.add(r.key);
          }
        }).pipe(
          Effect.catchCause((cause) =>
            Effect.sync(() => {
              if (!c.dead) emit.fail((Cause.hasInterruptsOnly(cause) ? { _tag: "Interrupted" } : Cause.squash(cause)) as E);
            }),
          ),
        ),
        c.scope,
      );
    };
    const join = (key: K) =>
      Effect.gen(function* () {
        const fresh = current === undefined;
        const conn: Conn<K> = current ?? { scope: Scope.makeUnsafe(), routes: new Map(), dead: false, size: 0 };
        current = conn;
        const k = name(key);
        const route = conn.routes.get(k) ?? { key, members: new Set<Member>(), added: false };
        conn.routes.set(k, route);
        const member: Member = { early: [] };
        route.members.add(member);
        conn.size++;
        yield* Effect.addFinalizer(() =>
          Effect.gen(function* () {
            route.members.delete(member);
            conn.size--;
            if (route.members.size === 0 && conn.routes.get(k) === route) {
              conn.routes.delete(k);
              if (route.added && conn.ops && !conn.dead) {
                route.added = false;
                yield* Effect.exit(conn.ops.remove(key));
              }
            }
            if (conn.size > 0) return;
            conn.dead = true;
            if (current === conn) current = undefined;
            yield* Scope.close(conn.scope, Exit.void);
          }),
        );
        if (fresh) yield* start(conn);
        else if (conn.ops && !conn.dead && !route.added) {
          route.added = true;
          yield* conn.ops.add(key);
        }
        return feedCallback({
          bound,
          start: (emit) => {
            member.emit = emit;
            for (const x of member.early.splice(0)) emit(x);
            if (member.failed) emit.fail(member.failed.e);
          },
        }) as Stream.Stream<A | Signal, E>;
      });
    return { stream: (key) => Stream.unwrap(join(key)) };
  });
