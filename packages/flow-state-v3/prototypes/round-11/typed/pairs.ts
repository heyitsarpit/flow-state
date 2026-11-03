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
import * as HL from "../../conformance/fixtures/lab.compiled.ts";
import * as TL from "../../conformance/typed/lab-machines.ts";
import * as HR from "../../conformance/fixtures/real.compiled.ts";
import * as TR from "../../conformance/typed/real.ts";
import * as HD from "../../conformance/fixtures/desk.compiled.ts";
import * as TD from "../../conformance/typed/desk.ts";
import * as H6 from "../../conformance/fixtures/round6.compiled.ts";
import * as T6 from "../../conformance/typed/round6.ts";
import * as HO from "../../conformance/fixtures/order.compiled.ts";
import * as HV from "../../conformance/fixtures/drv.compiled.ts";
import * as TO from "../../conformance/typed/order.ts";
import * as HPF from "../../conformance/fixtures/pay-full.compiled.ts";
import * as TPF from "../../conformance/typed/pay-full.ts";
import * as HI from "../../conformance/fixtures/issues.compiled.ts";
import * as TI from "../../conformance/typed/issues.ts";
import * as HC from "../../conformance/fixtures/chat.compiled.ts";
import * as TC from "../../conformance/typed/chat.ts";
import * as HF from "../../conformance/fixtures/feed.compiled.ts";
import * as TF from "../../conformance/typed/feed.ts";
import * as HRF from "../../conformance/fixtures/refunds.compiled.ts";
import * as HS1 from "../../conformance/fixtures/s1.compiled.ts";
import * as TS from "../../conformance/typed/stores.ts";
// Stated for Pay: nothing yet; filled from the first run's differences, each read.
const payIndex = /^$/;

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
  { name: "Form", hand: HL.formFixture, typed: TL.formFixture, stated: [rootDefault] },
  { name: "Notes", hand: HL.notesFixture, typed: TL.notesFixture, stated: [rootDefault] },
  { name: "Feed", hand: HL.feedFixture, typed: TL.feedFixture, stated: [rootDefault] },
  { name: "Odd", hand: HL.oddFixture, typed: TL.oddFixture, stated: [rootDefault] },
  { name: "Checkout/Addr", hand: HR.addressFixture, typed: TR.addressFixture },
  { name: "Desk/Ticket", hand: HR.ticketFixture, typed: TR.ticketFixture },
  { name: "Desk/Attach", hand: HR.attachFixture, typed: TR.attachFixture },
  { name: "Desk/Attach missing", hand: HR.attachMissingReason, typed: TR.attachMissingReason },
  { name: "Desk/Panels", hand: HR.panelsFixture, typed: TR.panelsFixture },
  ...["A", "FIELD", "HERE", "MID", "WAIT", "BADMS"].map((s) => ({ name: `Deep ${s}`, hand: HR.deepAt(s), typed: TR.deepAt(s) })),
  { name: "Lab/TraitWrite", hand: HD.traitWriteFixture, typed: TD.traitWriteFixture },
  { name: "Lab/EachWrite", hand: HD.eachWriteFixture, typed: TD.eachWriteFixture },
  { name: "Lab/LateFill", hand: HD.lateFillFixture, typed: TD.lateFillFixture },
  { name: "Lab/EachReset", hand: HD.eachResetFixture, typed: TD.eachResetFixture },
  // Stated: the hand restore was a closure (D82's stand-in); typed, it is the memory Schema's, which `memory.restore` is on every typed machine.
  ...[true, false].map((decode) => ({ name: `Lab/MemoryRelease decode ${decode}`, hand: H6.memoryReleaseFixture({ v: 1 }, decode), typed: T6.memoryReleaseFixture({ v: 1 }, decode) })),
  { name: "Lab/RowMove", hand: H6.rowMoveFixture, typed: T6.rowMoveFixture },
  { name: "Lab/Getter", hand: H6.getterFixture, typed: T6.getterFixture },
  { name: "Ring", hand: HO.ringFixture, typed: TO.ringFixture },
  { name: "Checkout/Pay full", hand: HPF.payFullFixture, typed: TPF.payFullFixture, stated: [payIndex] },
  { name: "Issues/List", hand: HI.issuesFixture, typed: TI.issuesFixture },
  { name: "Issues/List persisted", hand: HL.issuesPersisted, typed: TI.issuesPersisted },
  { name: "Issues/List local", hand: HL.issuesLocal, typed: TI.issuesLocal },
  { name: "Issues/List throwing", hand: HL.issuesThrowing, typed: TI.issuesThrowing },
  { name: "Issues/List double cancel", hand: HL.issuesDoubleCancel, typed: TI.issuesDoubleCancel },
  { name: "Issues/List deny settled", hand: HL.issuesDenySettled, typed: TI.issuesDenySettled },
  ...[{}, { catchUp: true, pages: true, bound: 2 }, { source: "pulled" as const, reconnect: false }].map((o) => ({ name: `Lab/Chat ${JSON.stringify(o)}`, hand: HC.chatFixture(o), typed: TC.chatFixture(o) })),
  { name: "Lab/Presence", hand: HC.presenceFixture, typed: TC.presenceFixture },
  { name: "DeskFeed", hand: HF.deskFeedFixture, typed: TF.deskFeedFixture },
  { name: "DeskFeed no reconnect", hand: HF.deskFeedNoReconnect, typed: TF.deskFeedNoReconnect },
  { name: "Desk/Rooms", hand: HF.roomsFixture, typed: TF.roomsFixture },
  { name: "Checkout/Refunds", hand: HRF.refundsFixture, typed: TS.refundsFixture },
  { name: "S1", hand: HS1.s1Fixture, typed: TS.s1Fixture },
  { name: "S1 persisted", hand: HL.s1Persisted, typed: TS.s1Persisted },
  { name: "Docs", hand: HL.docsFixture, typed: TS.docsFixture },
  ...(["deskFixture", "deskNoVersionFixture", "deskListenFixture", "deskListenNoVersionFixture", "deskListenLexicalFixture", "deskTwoFeedsFixture", "deskTwoFeedsNoVersionFixture"] as const).map((k) => ({ name: `Desk/Tickets ${k}`, hand: HD[k], typed: TD[k] })),
  { name: "Drv", hand: HV.drvFixture, typed: TO.drvFixture },
];
