---
page T92-records
description A reload trusts nothing in storage Flow's writer would not have written; a bad record is reported by key and skipped.
---
# Saved records decoded into meaning: what an app author notices (slice T92; 2026-11-23)

**Bottom line:** a reload now trusts nothing in storage that Flow's own writer would not have written. Each saved
record is checked against the one codec the writer uses. A bad record is reported under its own key and left
alone; the rest of the app boots. Nothing in a machine body changes.

## What you notice

```ts
// existing: Flow.input, slots   user-defined: Cart, owner, shopper
memory: { owner: Flow.input(Schema.String) },
//        ^^^^^ NEW: input fields are no longer saved; they come from the ref again at each start
slots: { shopper: Shopper },
//       ^^^^^^^ a saved binding naming an actor that no longer decodes is reported (FieldDropped, slot named)
//               and the slot is rebound, instead of a stray local actor starting
```

- A corrupt or edited saved record is reported once per boot, under its own key (`RecordUndecodable` or
  `FieldDropped`), and the boot goes on. Before, some corrupt records were read anyway.
- After a definition edit (a state, event, memory field, slot or operation reordered, added, removed or renamed),
  a saved record restores what still fits and reports what it dropped.
- A held call whose unknown ending you already heard is not told again at a later start or reload
  (`HeldAtStart` is gone).
- A send to an actor whose saved record the boot could not read declines with `StorageRefused`, so a new write
  never overwrites a record kept for inspection.

## Under the hood

- Format 6: one work record per identity, the identity only in its key, branded names decoded once at the boot.
- One strict codec per record kind is shared by the writer, the boot and the tests' corrupt-record oracle, so the
  reader cannot accept more than the writer writes. The test that corrupts one field at a time also swaps each fixed
  value for every other value the codecs name, on all nine fixtures that save records.

## Calls made for you (each tagged on @task.V3.T92, reversible)

- Bindings stay saved: an actor the boot wakes has no ref to rebuild them from.
- `graph` is no longer saved twice; the boot loads every record before it wakes anyone.
- One report per bad key per boot, where the Spec gave one per machine with a count (orchestrator).
- Forged but valid records are out of scope, by your 2026-11-22 ruling in @spec.Records R20.
- The position writer still caches its values as text and does not go through the codec; the boot checks positions
  against the definition instead. A probe found no wrong ending, but "one codec in both directions" holds for work
  records only. Your read.
- Owed to later Tasks: the `FORMAT` pin, the boot-time bench row and the slow 1,300-row stress test (@task.V3.T56);
  the live run and the reload disagreeing on a kept unknown ending (@task.V3.T121).

## Review the diff

- The whole slice:
  `hunk diff 3c20380b ecf7851c -- packages/flow-state-v3`
- Requirements (the reds, then the review's fix round):
  `hunk diff 3c20380b c74cdad2 -- packages/flow-state-v3`
- Build:
  `hunk diff c74cdad2 b301d7d6 -- packages/flow-state-v3`
- Fix round (one codec per record kind):
  `hunk diff b301d7d6 ecf7851c -- packages/flow-state-v3`
