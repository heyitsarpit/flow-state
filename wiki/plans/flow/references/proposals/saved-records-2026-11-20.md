# Saved records as one design (proposed, 2026-11-20)

**Bottom line (proposed):** a saved record is a projection of the compiled release, never a hand-written shape. Each
persisted machine gets one record Schema built from Compiled at compile time: literal unions of its own state,
slot, schedule and operation names, branded ids, its memory Schema, decoded with `onExcessProperty: "error"`, and
encoded through the same Schema. A record is *closed*: it lists every name its release declared in scope, so the
record is its own shape stamp; an absent name was added, an unknown name was removed or renamed, and a `previously`
entry beside the renamed thing maps it. Context bindings and identity are derived (from the key and the app), not
saved. The freedom it removes: **a saved fact whose meaning is checked by anything other than a Schema built from
the current Compiled** (hand checks after a shape-only decode, separate shape stamps, per-Task format steps).

Answers question 4 of `advisor-questions-2026-11-20.md`. Unblocks @task.V3.T92, then @task.V3.T56.

## The class and its freedom

Three symptoms, one cause. T20 hit its failure limit because `record.ts` decodes `machine`, `name`, `operation`
and `lane` as `Schema.String` and then checks meaning by hand (`identityIn`, `keyNamesItself`, `rowOf`); each review
found one more unchecked field (code:packages/flow-state-v3/src/core/record.ts#decodeRecords). Formats 4 and 5 each
added fields with their own chained step (code:packages/flow-state-v3/src/core/actor-record.ts#decodeActor). A slot
a release adds fires once on reload because `seen` lacks it, so `baselineOf` takes none and the restore owes a wave.
All three come from the record being a second definition beside Compiled, which each Task extends and nothing
compares to the release that reads it.

## Where the data comes from

IndexedDB (`layerIndexedDb()`, host) or `Fake.storage` gives `key -> text`. The host reads bytes only. In the core:
`decodeCanonical` (@spec.Codec.R3) gives JSON, then **one** decode by `RecordKey` picks the kind and identity, then
**one** decode by that machine's record Schema gives branded, trusted values. Nothing after that checks again
(code:wiki/conventions/boundaries.md, "Saved records at boot").

## The structure

1. **Record Schemas from Compiled.** `recordSchemas(compiled)` (NEW, core) builds per machine:
   `StateName` = `Literals(compiled state paths)` branded; `SlotName`, `ScheduleName`, `OperationName` likewise;
   `ActorName` = the machine's name Schema, branded, never `~`; `RecordKey` = `TemplateLiteral` of kind and
   `ActorName` decoded into `{ kind, identity }`; `LaneKey` = identity, `OperationName` (writes only) and the
   operation's key fields, written back exactly. One Schema per kind (actor, lane, owed) over these brands.
   `actor-record.ts` and `record.ts` keep no `Schema.String` for an identifier and no check after decode.
2. **Each fact once.** Identity lives only in the key (content drops `machine`, `name`). Lane operation and key text
   live only in `LaneKey`. Owed rows name lanes by `LaneKey`. A headless lane stores only `displaced`. Bindings and
   `graph` are dropped (sub-ask 1). `seen` stays (it is a fact: what the actor last heard), baselines only where they
   differ (as format 4 does).
3. **Closed records.** `seen` has a key per declared slot (`{}` = never selected, `{ value }` = selected); `schedules`
   one entry per schedule of the active states, idle included (format 5 already does this); memory every declared
   field. So absence means "this release did not declare it" and needs no stamp.
4. **One Flow format, no steps.** The format is unreleased (T92's Risk), so formats 1 to 4 and their steps
   (~250 lines) are deleted and the stamp restarts at the new shape. Later Flow-format changes are a
   `Schema.decodeTo` transformation from the old encoded form, part of the same Schema, never a separate path.
5. **Release mapping** (sub-ask 2, below) is applied inside the same decode: each name literal decodes from
   `current ∪ previously` and transforms to the current name.

Sketch, user code (the one new keyword):

```ts
const Pay = machine(PayDef, ({ S, O }) => ({
  RETRYING: { previously: "WAITING", /* existing body */ },   // NEW: previously   // user-defined: RETRYING
}));
// existing: operation contract; NEW: previously on the operation
export const charge = Flow.write({ previously: "pay", key: ["intentId"], input: PayInput });
```

## Sub-ask 1: can context bindings be derived and not saved?

**Yes, with one API move.** Today a binding is a function of the app entry's default and the ref's own override
(code:packages/flow-state-v3/src/host/wiring.ts#slotProvider). Every ensure already re-derives it and ignores the
saved one (code:packages/flow-state-v3/src/core/incarnations.ts, lines 136-141); the saved `context` is read only by
wakes with no ref: the boot's owing wake and an ending's wake (`ensure(actor, none, "wake", none)`). A boot has no
ref, so the override is what cannot be derived. All five overrides in the fixtures are functions of the consumer's
identity: `guestCart`/`cartOf(n)` bind shopper `owner`, `guestSession` binds `globex` for `"guest"`, `repoOf(n)` binds
`clientOf(n)`, `guestDot`/`guestTeam`/`guestBadge` by name. Move the override from the ref to the entry as a
function of the identity: `cart: { machine: Cart, context: ({ owner }) => ({ shopper: actorRef(Shopper, owner) }) }`
(**changed**: entry `context` takes a function too; ref-level `{ context }` **dropped**). Then binding =
f(Compiled app, identity), the same at create, wake and reload; `context` and `graph` leave the record, and T20's
forged-binding blocker cannot be written. A release that changes a default rebinds; the saved `seen` gives the one
wave of @spec.Actors.R9, as at a return.

## Sub-ask 2: the release model

Endings live in lane and owed records, never in actor records (@spec.Codec.R5). So the rule splits by what can be
lost.

- **Rename** (`previously`): state, slot, schedule and field map to the new name, `seen` and timers kept; an
  operation's lane is re-keyed and its owed rows renamed.
- **Add:** a state is never saved; a slot absent from `seen` takes a silent baseline; a schedule absent in an
  active state arms at the boot (Q4); a field takes its default (@spec.Compile.R8); an operation has nothing saved.
- **Remove:** a saved state the release lacks resets the actor record (@spec.Restore.R7); a slot's `seen` and a
  schedule's timer are dropped and reported; a field is dropped with FieldDropped; an operation's held lane is
  quarantined (@spec.Restore.R8) and its owed rows are kept.
- **Schema change:** a slot's `seen` is dropped (silent baseline); a schedule key that fails drops its timer; a
  memory field that fails resets the record; a lane input that fails quarantines the lane.

The invariant that answers "no lost, no invented ending" (**proposed** Restore I21): *for every Attempt acknowledged
before a boot, after it exactly one of: its ending is heard once, it stays held and reported at each boot, or
`forget` removed it with HoldForgotten; and no ending is heard for an Attempt not in a saved lane or owed record.*
An actor record reset never touches lanes or rows (already I13). A removed operation's owed rows are kept and
reported each boot (OperationRetired, **proposed name**) until `forget`, since no handler can hear them.

## How each part is shown, and cost

- **Run rule over every Story** (extends @spec.Codec.T6): every stored record decodes by the current app's Schemas
  with excess keys refused and re-encodes byte for byte. Catches a field written outside the Schema.
- **Generated corrupt-one-field test** (T92's): from each fixture's saved records, change one leaf; each result is
  quarantined, reset or provably the same restore. No field list to forget.
- **Generated release sweep** (NEW): per fixture, derive releases that rename, add or remove one name of each kind,
  boot each over the old store, and check I21 plus "added slot is silent". Planted faults: a rename read as remove;
  an owed row dropped with its operation; an added slot that fires.
- **Construction refusal:** a `previously` that collides with a current name, or two that claim one old name.
- **Lint:** no `Schema.String` and no `startsWith` on record keys in `src/core/record*.ts` (existing `no-id-text`).
- **Cost:** one Schema build per machine at compile; boot decode unmeasured (bench before T58). One new keyword. The
  ref-level `{ context }` override moves to the entry (5 fixture sites).

## Fixtures checked (by reading, not run)

- **shop `Checkout/Pay`:** `WAITING`→`RETRYING` maps; op `pay`→`charge` re-keys its held lane; removing schedule
  `slow` drops a timer; removing op `void` with a held lane quarantines it, rows kept; a slot added to CheckoutFlow
  is silent.
- **home `Home/Room`:** keyed schedule `poll` keeps its timers by key Schema; dropping memory `checks` reports
  FieldDropped; removing `HEATING` resets only records in it, the `setTarget` lane kept.
- **sign-in `Auth/TrustedDevice`:** nested `TRUSTED.FRESH`→`TRUSTED.NEW` maps by path; removing `reverify` drops
  its timer.
- **wizard `Wizard/Booking`:** adding `warn` in an active `HELD` arms it at the boot from `heldUntil`.
- **session (Badge→Team→Session→Org):** guest overrides derive from the name; a changed default gives one wave.
- **transfers `Bank/StandingOrder`:** read op `balance` saves no lane; a forged read-op lane record fails `LaneKey`
  (writes only).

## Prior art

- Effect Schema 4.1.4 (installed): verified by running (scratchpad `q4/probe.ts`): `Literals(...).pipe(brand)`
  refuses an unknown state; a `Struct` **ignores** excess keys by default and refuses them with
  `onExcessProperty: "error"`; `decodeTo` + `SchemaTransformation.transform` maps an old literal to its new name.
- Spike `q4/key.ts` (run, and `tsc --strict` clean): `TemplateLiteral` refuses a key of another machine, and
  `TemplateLiteralParser` splits `actor/Checkout/Pay|{"a":"b|c"}` with the JSON name intact.
- XState: persisted snapshots carry state values and children, restored as-is; no migration, so a renamed state
  throws or misbehaves. Its lesson: a snapshot not checked against the machine is the bug class here.
- TanStack Query persist: one app-wide `buster` drops everything (rejected in revisit.md). TanStack DB: collections
  decode rows through the collection's schema at load. Both decode by the current definition; neither maps renames.
  (From memory; `codebases/` has only `repos.json` locally.)

## Risk

The `previously` keyword reopens revisit.md's "manual record migration" (option B was `previous` with typed steps).
This is narrower: names only, no value steps, no versions. Still a user decision (Q2). Dropping ref-level context
overrides is an API change (Q1).

## Open questions

1. **Bindings.** A: derive; overrides move to the entry as a function of identity (recommended: removes the field and
   the forged-binding class). B: keep saving, decode as `ActorName` of the declared provider machine. C: derive
   defaults, save only overrides.
2. **Renames.** A: `previously` beside each state, slot, schedule, field and operation (recommended: locality, names
   only). B: no renames; rename = remove + add, endings kept by quarantine (today). C: revisit's option B with steps.
3. **Undecodable actor record.** A: one outcome, reset at boot, endings kept (recommended: stamp-free records cannot
   tell corrupt from changed). B: keep R5 quarantine-until-save beside R7 reset.
4. **Added entry schedule in an active state.** A: arms at boot (recommended: the release says the state has it).
   B: stays idle until the state is entered again.
5. **Owed rows of a removed operation.** A: kept and reported until `forget` (recommended). B: delivered as evidence
   only, then dropped.

## Uncovered

- Not run: any fixture, gate or bench; the release table is by reading.
- `Flow.private` fields (sign-in `refreshToken`): whether saved, and how a removed private field is reported.
- Fragment incarnations and `.history` in records (T56's routed item); fragment names under `previously`.
- Identity version and key fingerprint rules (@spec.Restore.R6) beyond noting they stay.
- Downgrade (a newer release's record read by an older one) beyond the format quarantine.

## Sidecar log

- Fixture survey (Haiku): accepted for machine, state, schedule and operation names after spot-reading
  `fixtures/shop/app.ts`, `fixtures/sync/app.ts`; changed: it missed `guestTeam`, `guestBadge`, `guestDot` overrides
  (found by grep); sync's `Repo` is `persist: false`, so its override is cited only as a binding case.
- Binding research (Haiku): accepted; verified `incarnations.ts` lines 133-151, 372-374, 466 and `wiring.ts`
  `slotProvider` myself.

## Review findings (Sonnet review, 2026-11-20)

Findings for the next lead to resolve; ✓ marks one the coordinator checked in the code. Nothing here is decided.

1. ✓ Wrong: excess keys refused (`onExcessProperty: "error"`) make a record holding a removed slot, schedule or field
   fail and reset, losing memory; Restore R7 keeps such records (FieldDropped). Decode `seen`, `schedules` and memory
   leniently per entry (drop and report); keep strictness for kind, identity, state and lane input.
2. Wrong: "memory lists every declared field" contradicts Compile R8 (a missing field takes its default); closed on
   encode only.
3. Wrong: Restore R8 already renames a lane's operation to the contract's write (OpRenamed); `previously` on
   operations duplicates it. Keep R8 or say this replaces it.
4. Lane identity: `LaneKey` includes the operation, Restore R8 says a lane names none. Pick one and edit R8.
5. ✓ Bindings are not all derivable: `fixtures/shop/stories/structure.ts:96` binds the `main` cart to
   `guestShopper` while `mainCart` uses the default; tests/actors/context.test.ts and two type tests use ref
   overrides on ad hoc identities; `guestPresence` is a sixth fixture override. Keep ref overrides for non-boot
   ensures (Q1 option C) or rewrite those Stories.
6. "Ignores the saved binding" holds only when the host passes wiring (incarnations.ts:133-151).
7. `previously` holds one name, so a store two releases old cannot map; allow a list.
8. One reset for undecodable and changed records drops R5's quarantine and makes a downgrade destroy data.
9. Today an undeclared `seen` slot is dropped silently and a bad value fails the whole record; list both as changes.
10. Siblings: decode through raw-throws' shared Exit-based helper; fragment-lifetimes' subject parts and parked
    endings need a place in `LaneKey` and owed records; machine-calls' offline wait must not add a stored `sent`.
