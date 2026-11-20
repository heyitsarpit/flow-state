# Cohesion of the five concept designs (2026-11-20)

**Bottom line:** the five designs (typed machine, fragments, saved records, reads and operations, data layer) and the
adopted schedule-issues design agree on most seams; 17 mismatches, a few unowned seams and one combined build order
follow. Everything here is proposed. Source: a read-only cohesion pass over the six documents; the orchestrator's
proposed resolutions are marked; the user's decisions are listed last.

## The documents

- code:wiki/plans/flow/references/proposals/spec-typed-machine-2026-11-20.md (TM)
- code:wiki/plans/flow/references/proposals/spec-fragments-2026-11-20.md (FR)
- code:wiki/plans/flow/references/proposals/spec-saved-records-2026-11-20.md (SR)
- code:wiki/plans/flow/references/proposals/spec-reads-operations-2026-11-20.md (RO)
- code:wiki/plans/flow/references/proposals/spec-data-layer-2026-11-20.md (DL)
- code:wiki/plans/flow/references/proposals/schedule-issues-2026-11-20.md (SI, adopted)

## Mismatches and proposed resolutions

1. Mapper shape: TM keeps a bare value (`(p) => …`), RO wants `{ value, input, key, attempt }`; each says the other
   owns it. Resolution: the user decides; the pair form `(value, { input, key })` keeps TM's sweep valid; RO owns
   `MapperInput`; TM's sweep waits on the answer.
2. `otherwise`, `Flow.ignore`, `Mapping.Ignore`: RO relies on them, TM never mentions them. Resolution: RO Task 1 owns
   them.
3. Fragment `instances` are not in SR's record body. Resolution: one `instances` partition in SR's `bodyOf`;
   `unsettled` is not saved (restore settles).
4. Parked endings have two homes (FR's `Frozen { parked }` against RO's one owed row per ending). Resolution: a parked
   ending is an owed row with delivery `Waiting`, owned by the instance; the instance stores nothing.
5. Dormant and orphan records: DL discards an undeclared machine's record and keeps lazy text as `Dormant`; SR keeps
   it `Aside Retired` and gives a declared-not-loaded one `Unverifiable`. Resolution: SR owns classification; T48
   consumes `Unverifiable`.
6. SR's record kinds are closed; DL and RO need `entity/` and `entry/`. Resolution: T92 makes `Kind` a registry.
7. Format numbers: code is 5; SI wants 6; SR bumps to 7 without FR's, RO's or DL's new content. Resolution: T118 lands
   6; the user decides one bump or a step per feature; every step says how old rows get the new field.
8. Claim keys: DL puts them in an entity row; SR and RO leave them out. Resolution: SR's obligation flag covers the
   new row; the user decides DL PD7 with P5.
9. Lanes owned by a fragment instance have no instance segment in SR's key, and instance ids drop on restore.
   Resolution: key by FR's address or subject path; T92 and T109 settle it together.
10. A held lane whose input does not decode: `Restored` gets `input` only when it decodes, otherwise Defect.
11. Positions on restored data: `asked` and `landed` are `Option` per datum; a restored entry has none.
12. Read slots and sessions are keyed three ways. Resolution: FR's `addressKey` plus the operation.
13. "Placement" and "Entry" each mean several things. Resolution: DL's answer becomes `Answer`, DL's lazy entry
    `Feature`, `Placement` stays RO's `subscribe`, FR's trait slots become `Slot`.
14. Release state in two places (DL sessions, RO releasing). Resolution: sessions use RO's table.
15. Old schedule names (`Tracked`, `pausedBy`) in FR, SR, TM. Resolution: SI's `Scheduled`/`Timer`; TM derives
    `pausedBy` from `reasons`; schedule names are per scope for fragments.
16. One-sided seams: one `issues-of.ts` and one `StoredIssue` (RO's); SR's runtime brands and TM's types named on both
    sides.
17. The mint restarts at 0 each boot: check that `InstanceId` cannot be reused across a restore, else add a nonce.

## Unowned seams, proposed owners

- The turn's parts walk (`raise`, `notify`, exits): a new turn Task ahead of T109 (FR PD5).
- The resource entry store: RO Task 2.
- The `resource({ persist: true })` record kind: SR T92 owns the registry and the step, RO Task 4 the body.
- `Compiled.slots` and `fragments`, and the `trait`/`.each` builder types: T109, under TM's rule.
- One definition-shape fingerprint for DL's hydrate digest and SR's stamp: T56 (SR spike 1).
- Disposal order (instances, then entries, then sessions): T109.
- The bookmark partition: T92 `bodyOf`. Old owed rows lacking `input`: T92's step table.

## Combined build order

1. T118 (format 6). 2. TM spike, then `derive.ts`. 3. The user's mapper-shape answer. 4. RO Task 1, then TM's sweep.
5. T92 codec and registry (format 7). 6. T56 fate, then DL's admission spike, then T48. 7. Turn-parts Task, then T109,
then T110. 8. RO Task 2 with its spike. 9. RO Tasks 3 and 4. 10. T24a, T25, T115, T24b. 11. TM declared schedules.
One soft cycle (RO Task 1's reload check and T92's owed-row step): land the reload check after T92.

## Decisions

The user's (public API, new concepts, scope) are asked in the orchestrator's round. The rest (SR D1 to D5, O1 to O4;
FR PD1 to PD4; RO 8.3, 8.4, 8.6, 8.7; the resolutions above) are implementation calls the orchestrator decides by
correctness and records when the designs become Specs. DL PD1 to PD7 wait for P5.
