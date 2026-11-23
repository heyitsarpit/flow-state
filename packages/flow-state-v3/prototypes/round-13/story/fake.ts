// Round 13, the story prototype: `Fake`, the world's servers (machine-design 2.10.4, rule 62), in the design's three parts. **The result**: a handler
// returns what changed (`truth`) and what is answered (`response`), and never decides the wire. **The wire**: `hold`, `release`, `drop` on an endpoint,
// as Story steps (data). **The binding**: how the app's own transport reaches the endpoint; here the suite's `Api` is that transport (the typed fixtures'
// client half, `shopFrom` and `write`), so an endpoint names the transport's route (`route`, API change in `api-changes.md`).
// A fake holds server truth and its request log only. It never writes client truth and never produces an ending: its answer goes back through the
// commit's own classification (rule 62).
import type { Schema } from "effect";

// What the transport carries back. `ok` resolves the app's call; `fail` fails it with that tagged error (the client half's error, for the commit to
// classify: `NoResponse` and `ServerError` are unknown by the typed fixtures' `unknownWhenLost`, a `CardDeclined` a failure).
export type Response = { readonly ok: unknown } | { readonly fail: { readonly _tag: string; readonly [k: string]: unknown } };
export type Result<T> = { readonly truth?: T; readonly response: Response };
export type Fields = Readonly<Record<string, Schema.Top>>;
export type Call<T> = {
  readonly kind: "call";
  readonly route?: string; // the transport's name for this endpoint; default: the endpoint's own name
  readonly request: Fields; // what is logged
  readonly handle: (truth: T, request: any, headers: { readonly idempotencyKey?: string }) => Result<T>; // headers: the route context's (2.10.4)
};
export type Control<T> = { readonly kind: "control"; readonly params: Fields; readonly apply: (truth: T, params: any) => { readonly truth: T } };

// ── Steps a fake gives a Story, as data (rule 63). A wire word names its server and endpoint; a control its server and name.
export type WireStep = {
  readonly wire: { readonly server: string; readonly endpoint: string; readonly word: "hold" | "release" | "drop"; readonly at?: "request" | "response"; readonly times?: number };
};
export type ControlStep = { readonly control: { readonly server: string; readonly name: string; readonly params: unknown } };
export type WorldStep = WireStep | ControlStep;

export type Endpoint = {
  readonly server: string;
  readonly name: string;
  readonly hold: () => WireStep;
  readonly release: () => WireStep;
  readonly drop: (o?: { readonly at?: "request" | "response"; readonly times?: number }) => WireStep;
};
export type ServerDef<T> = {
  readonly truth: Fields;
  readonly initial: T;
  readonly endpoints: Readonly<Record<string, Call<T>>>;
  readonly controls?: Readonly<Record<string, Control<T>>>;
};
export type Server<T, D extends ServerDef<T>> = {
  readonly kind: "server";
  readonly name: string;
  readonly def: D;
} & { readonly [K in keyof D["endpoints"]]: Endpoint } & { readonly [K in keyof NonNullable<D["controls"]>]: (params: Parameters<NonNullable<D["controls"]>[K]["apply"]>[1]) => ControlStep };
export type AnyServer = { readonly kind: "server"; readonly name: string; readonly def: ServerDef<any> };

const RESERVED = new Set(["hold", "release", "drop", "duplicate", "kind", "name", "def"]);
export const Fake = {
  // 2.10.4: a server is a module value with no parameters; seeds are `initial` or a `world` control. Reserved names, or one name used for an endpoint
  // and a control, are construction errors.
  server: <T, D extends ServerDef<T>>(name: string, def: D & ServerDef<T>): Server<T, D> => {
    const eps = Object.keys(def.endpoints);
    const cs = Object.keys(def.controls ?? {});
    for (const k of [...eps, ...cs]) if (RESERVED.has(k)) throw new Error(`StoryFakeError: ${name}.${k} is a reserved name`);
    for (const k of eps) if (cs.includes(k)) throw new Error(`StoryFakeError: ${name}.${k} is both an endpoint and a control`);
    const out: Record<string, unknown> = { kind: "server", name, def };
    for (const e of eps)
      out[e] = {
        server: name,
        name: e,
        hold: (): WireStep => ({ wire: { server: name, endpoint: e, word: "hold" } }),
        release: (): WireStep => ({ wire: { server: name, endpoint: e, word: "release" } }),
        drop: (o: { at?: "request" | "response"; times?: number } = {}): WireStep => ({ wire: { server: name, endpoint: e, word: "drop", at: o.at ?? "request", times: o.times ?? 1 } }),
      } satisfies Endpoint;
    for (const c of cs) out[c] = (params: unknown): ControlStep => ({ control: { server: name, name: c, params } });
    return out as Server<T, D>;
  },
  call: <T>(c: Omit<Call<T>, "kind">): Call<T> => ({ kind: "call", ...c }),
  control: <T, P>(params: Fields, apply: (truth: T, p: P) => { readonly truth: T }): Control<T> => ({ kind: "control", params, apply }),
};
export const isWorldStep = (x: unknown): x is WorldStep => typeof x === "object" && x !== null && ("wire" in x || "control" in x);
