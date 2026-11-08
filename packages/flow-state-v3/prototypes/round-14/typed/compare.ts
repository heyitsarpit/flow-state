// The typed Pay and fragments against the hand-flattened fixtures, as data: every target, token, member, schedule and path. A closure is compared by where it sits, not what
// it does; what it does is the scenarios' job (main.ts --swap). bun round-9/typed/compare.ts
import type { Api } from "../../conformance/fake-world.ts";
import { checkItems, stated } from "../../conformance/verdicts/state.ts";

await stated("typed/compare.ts", async () => {
const { payFixture } = await import("../../conformance/fixtures/pay.compiled.ts");
const { payFullFixture } = await import("../../conformance/fixtures/pay-full.compiled.ts");
const { Countdown, ThreeDS } = await import("../../conformance/typed/threeds.ts");
const { typedPayFixture } = await import("../../conformance/typed/pay.ts");
const api = new Proxy({}, { get: () => () => undefined }) as Api;
const shape = (v: unknown, skip: ReadonlySet<string>): unknown => {
  if (typeof v === "function") return "(closure)";
  if (Array.isArray(v)) return v.map((x) => shape(x, skip));
  if (v === null || typeof v !== "object") return v;
  const o = v as Record<string, unknown>;
  if (typeof o["run"] === "function") return { slot: (o["at"] as { path: string }).path };
  return Object.fromEntries(
    Object.keys(o)
      .filter((k) => !skip.has(k))
      .sort()
      .map((k) => [k, shape(o[k], skip)]),
  );
};
const diff = (a: unknown, b: unknown, path: string, out: string[]) => {
  if (JSON.stringify(a) === JSON.stringify(b)) return;
  if (typeof a === "object" && a && typeof b === "object" && b && Array.isArray(a) === Array.isArray(b)) {
    for (const k of new Set([...Object.keys(a), ...Object.keys(b)]))
      diff((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k], `${path}.${k}`, out);
    return;
  }
  out.push(`${path}: hand ${JSON.stringify(a)} typed ${JSON.stringify(b)}`);
};
// New on the typed side, stated: `keyFields`, `events`, `memory.restore`, and a Slot for `commit`.
// Round 12 (D213-D215): `inputFields`, `services` and memory `fields` too, and `key`, which the typed side no longer writes (the seal makes it).
// Round 13 (round 12 review M3): a fragment's `kind` and `ports`, and its `events` (already skipped), typed only. Round 15 (U17): `keyVersion`, typed only.
// Phase 1 (R7): `keyVersionByFormat`, typed only.
const skip = new Set(["keyFields", "keyVersion", "keyVersionByFormat", "events", "restore", "commit", "key", "inputFields", "services", "fields", "kind", "ports"]);
const out: string[] = [];
diff(shape(payFixture.make(api), skip), shape(typedPayFixture.make(api), skip), "Pay", out);
const full = payFullFixture.make(api);
diff(shape(full.fragments!["ThreeDS"], skip), shape(ThreeDS.compiled, skip), "ThreeDS", out);
diff(shape(full.fragments!["Countdown"], skip), shape(Countdown.compiled, skip), "Countdown", out);
// D132, bugs H3: this could not fail. The 52 were read: all are one of two kinds, stated here, and anything else is a failure.
// (1) A Slot's `path`: the hand-written fixtures' `seal` said `on.on.X`, the typed front end `on.X`. Where a closure sits, the same place.
// (2) `memory.encode`: typed only. The Schema's encoder, by design (D89).
// (3) Three named: an exit's slot, `on.X.exit` by hand for the one alternative, and `operations.order.value` for what typed calls `.success`. Same place, other words.
const legitimate = (l: string) => {
  const m = /^(\S+): hand ("[^"]*"|undefined) typed (.*)$/.exec(l);
  if (!m) return false;
  if (/\.memory\.encode$/.test(m[1]!)) return m[2] === "undefined";
  if (l.startsWith("Pay.ops.order.outcomes.success.from.slot:")) return m[2] === '"operations.order.value"' && m[3] === '"operations.order.success"';
  if (/^ThreeDS\.nodes\.root\.on\.(Answered|Failed)\.0\.exit\.from\.slot:/.test(l)) return m[2]!.replace(".exit", "[0].exit") === m[3];
  // (4) Round 11 (review M1): a guard closure is named by its place in the guard array, as a token's key is. Pay's two `[S.X, capturable]` guards: hand
  // `guard[0]` among closures, typed `guard[1]` by place. The same closure.
  if (/^Pay\.nodes\.root\.on\.Confirmed\.[01]\.guards\.0\.slot:/.test(l)) return m[2]!.replace("on.on.", "on.").replace("guard[0]", "guard[1]") === m[3];
  return m[2]!.replace("on.on.", "on.") === m[3];
};
const unexplained = out.filter((l) => !legitimate(l));
console.log(unexplained.join("\n"));
console.log(`differences: ${out.length}; stated as legitimate: ${out.length - unexplained.length}; unexplained: ${unexplained.length}`);
return checkItems("compare", unexplained);
});
