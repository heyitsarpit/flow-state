// Round 11: each typed fixture beside the hand fixture it replaces, for `compare-all.ts`. `stated`: a difference with its reason, by pattern.
import type { Fixture } from "../../conformance/harness.ts";
import * as H7 from "../../conformance/fixtures/round7.compiled.ts";
import * as T7 from "../../conformance/typed/round7.ts";
import * as H9b from "../../conformance/fixtures/round9b.compiled.ts";
import * as T9b from "../../conformance/typed/round9b.ts";
import * as H9 from "../../conformance/fixtures/round9.compiled.ts";
import * as T9 from "../../conformance/typed/round9.ts";
import * as H8 from "../../conformance/fixtures/round8.compiled.ts";
import * as T8 from "../../conformance/typed/round8.ts";

export type Pair = { readonly name: string; readonly hand: Fixture; readonly typed: Fixture; readonly stated?: readonly RegExp[] };
// Stated across pairs: a hand root's `default`, redundant with `Compiled.default`, which is what the runtime starts from (inc.ts `down`); the pinned Pay has none.
const rootDefault = /\.nodes\.root\.default: hand "[^"]+" typed undefined$/;
// Placeholder, filled as differences are read: none stated yet.
const opsPlace = /^$/;
export const pairs: readonly Pair[] = [
  { name: "Lab/Bare", hand: H7.bareFixture(), typed: T7.bareFixture(), stated: [rootDefault] },
  { name: "Lab/Bare unpersisted", hand: H7.bareFixture({ persisted: false }), typed: T7.bareFixture({ persisted: false }), stated: [rootDefault] },
  { name: "Lab/FragPair", hand: H7.fragPairFixture, typed: T7.fragPairFixture },
  ...[{}, { persisted: true }, { local: true }].map((o) => ({ name: `Lab/Chain ${JSON.stringify(o)}`, hand: H9b.chainFixture(o), typed: T9b.chainFixture(o) })),
  ...[{}, { persisted: false }, { local: true }].map((o) => ({ name: `Lab/Edge ${JSON.stringify(o)}`, hand: H9b.edgeFixture(o), typed: T9b.edgeFixture(o), stated: [rootDefault, opsPlace] })),
  { name: "Lab/Bulk", hand: H9.bulkFixture, typed: T9.bulkFixture, stated: [rootDefault] },
  ...[{}, { persisted: false }].map((o) => ({ name: `Lab/Kept ${JSON.stringify(o)}`, hand: H9.keptFixture(o), typed: T9.keptFixture(o), stated: [rootDefault] })),
  { name: "Lab/Bare serial", hand: H8.serialBareFixture(), typed: T8.serialBareFixture(), stated: [rootDefault] },
  { name: "Lab/Bare business", hand: H8.businessKeyFixture(), typed: T8.businessKeyFixture(), stated: [rootDefault] },
  { name: "Lab/Doors", hand: H8.doorsFixture, typed: T8.doorsFixture, stated: [rootDefault] },
  { name: "Lab/Copies", hand: H8.copiesFixture, typed: T8.copiesFixture },
  { name: "Lab/Loop", hand: H8.loopFixture, typed: T8.loopFixture, stated: [rootDefault] },
];
