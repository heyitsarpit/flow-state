---
page T141-bench-loads
---
# Bench loads again: what an app author notices (slice T141; 2026-11-22)

**Bottom line:** `storeContract` takes your test runner instead of importing one, so a store's contract test runs
the same under any runner, and nothing Flow ships for tests pulls in a runner when it is merely loaded.

## Changed

```ts
// existing: storeContract   NEW: third argument { describe, it }   user-defined: layerMyStore
import { describe, it } from "vitest"
import { storeContract } from "flow-state/testing"

storeContract("my store", layerMyStore, { describe, it })
```

- Before, `storeContract(name, layer)` imported the runner itself. Under `nub run`, the root `tsconfig.base.json`
  `paths` map `vite-plus/test` to a declarations-only file, so loading the testing entry outside a test broke. That
  broke every bench run from 2026-11-20.
- The contract now also proves it can fail: a store that changes one text (the line separator included) or drops a
  record fails it.

## For Flow's own runs

- A narrow bench run (`nub run bench --only <ids>`) loads and records again. Full and tier-wide runs stay off.
- The stress reload sweeps are split by step position, so no shard waits on one long Story. All twelve shards pass
  alone in 62 to 74 s.

## Known gaps

- The `paths` mapping that caused this stays as it is; a guard test now fails if anything the bench loads imports
  the runner again.
- `home`'s roughly 230 s per sweep mode is still T117's to cut.

## Review the diff

One Task, so the per-Task view is the whole slice.

- The whole slice:
  `hunk diff ed72619a 1f819c4c -- packages/flow-state-v3`
- Requirements (the load guard, red):
  `hunk show ebecdd17`
- Build:
  `hunk diff ebecdd17 138c80e4 -- packages/flow-state-v3`
- Fix round (the line separator, broken-store tests, the worker guard):
  `hunk show 1f819c4c`
