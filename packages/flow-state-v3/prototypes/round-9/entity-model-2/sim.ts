// M2: does `unconfirmed` refresh feed itself? Two live answers with disjoint picks, one record, one external kick. One RTT per tick.
import { Store } from "./store.ts";
const sim = (name: string, writesEvery: number, ticks: number, collection: boolean, flags: Record<string, boolean>) => {
  const s = new Store(flags);
  s.perCollection = collection && !flags.perCollectionBehind;
  let version = 1, requests = 0;
  const server: Record<string, number> = { p: 0, q: 0 };
  const seen = { p: 0, q: 0 };
  const answer = (pick: "p" | "q", origin?: "refresh") => { requests++; s.judge({ carries: { [pick]: server[pick], rev: version }, at: version, from: s.tick(), ...(origin ? { origin } : {}) }); };
  answer("p"); answer("q");
  version++; answer("p"); // one list refetch, once
  const quietFrom = requests;
  for (let t = 0; t < ticks; t++) {
    if (t % writesEvery === 0) { version++; if (!collection) server.p!++; }
    for (const f of ["p", "q"] as const) {
      if (s.gen > seen[f] && s.clearable(f)) { seen[f] = s.gen; answer(f, "refresh"); break; }
    }
  }
  console.log(name.padEnd(58), `requests after the kick ${requests - quietFrom} in ${ticks} RTTs; marks left: p ${s.status("p").marked} q ${s.status("q").marked}`);
};
for (const [label, fl] of [["refresh does not feed", {}], ["MUTANT refresh feeds", { refreshFeeds: true }]] as const) {
  sim(`${label}; per-record version, write every RTT`, 1, 1000, false, fl);
  sim(`${label}; per-record version, write every 10 RTTs`, 10, 1000, false, fl);
}
sim("per-collection, behind off, this record never written", 1, 1000, true, {});
sim("MUTANT per-collection with behind on, refresh feeds", 1, 1000, true, { perCollectionBehind: true, refreshFeeds: true });
