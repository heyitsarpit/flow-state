// D142: the real runtime with another disk format, and the same meaning. A correct runtime, so the suite should pass it, except a case that names a stored key and so pins the format on purpose.
// FLOW_VARIANT: diskKeys (actor/ and lane/ renamed), envelope (each value wrapped). FLOW_VARIANT_BASE: which runtime. bun main.ts --runtime ./variant-adapter.ts
import type { Port, RuntimeModule } from "./harness.ts";

const kind = process.env["FLOW_VARIANT"] ?? "diskKeys";
const base = (await import(process.env["FLOW_VARIANT_BASE"] ?? "../round-12/adapter.ts")) as RuntimeModule;
const out = (k: string) => (kind !== "diskKeys" ? k : k.startsWith("actor/") ? `A::${k.slice(6)}` : k.startsWith("lane/") ? `L::${k.slice(5)}` : k);
const back = (k: string) => (kind !== "diskKeys" ? k : k.startsWith("A::") ? `actor/${k.slice(3)}` : k.startsWith("L::") ? `lane/${k.slice(3)}` : k);
const wrap = (v: string) => (kind === "envelope" ? JSON.stringify({ v: 2, body: v }) : v);
const unwrap = (v: string) => {
  if (kind !== "envelope") return v;
  try {
    const o = JSON.parse(v);
    return typeof o?.body === "string" ? o.body : v;
  } catch {
    return v;
  }
};
const inner = (kv: ReadonlyMap<string, string>) => new Map([...kv].map(([k, v]) => [back(k), unwrap(v)]));
export const port: Port = {
  disk: {
    kind: (k) => base.port.disk.kind(back(k)),
    scope: (k) => base.port.disk.scope(back(k)),
    heads: (kv) => base.port.disk.heads(inner(kv)),
    parked: (kv) => base.port.disk.parked(inner(kv)),
    decode: (k, v) => base.port.disk.decode(back(k), unwrap(v)),
    leaves: (kv, actor) => base.port.disk.leaves(inner(kv), actor),
  },
  boot(a) {
    const storage = a.host.storage;
    const host = {
      ...a.host,
      storage: {
        load: () => {
          const r = storage.load();
          if (r instanceof Map) return inner(r);
          return { then: (ok: any, no: any) => (r as PromiseLike<ReadonlyMap<string, string>>).then((m) => ok(inner(m)), no) } as PromiseLike<ReadonlyMap<string, string>>;
        },
        write: (w: any, p: any, answer: any) =>
          storage.write(
            w.map((x: any) => ({ ...x, key: out(x.key), ...(x.value === undefined ? {} : { value: wrap(x.value) }) })),
            p,
            answer,
          ),
      },
    };
    return base.port.boot({ ...a, host } as never);
  },
};
