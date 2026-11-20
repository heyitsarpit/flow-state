---
page T58-store-in-real-browsers
---
# Store in real browsers: what an app author notices (T58, 2026-11-20)

**Bottom line:** storage is a `Store` service you can implement and check with one contract test, and Flow's own
IndexedDB store now passes that test in real Chrome and Safari. A tab that hides saves at once, and a closed store is
never used again.

```ts
import { Store, layerIndexedDb } from "flow-state/persistence"   // NEW: the Store service tag
import { storeContract } from "flow-state/testing"               // NEW

storeContract("my store", layerMyStore)   // user-defined Layer of Store; the same cases Flow's own stores pass
```

The `Store` sees plain records and keys only, never Flow's internal attempts or purposes, so a custom adapter has
nothing of Flow's wiring to get right.

## Behaviour to know

- **Boot order:** the whole services Layer (the Store in it) is acquired, then storage is read and validated before
  any actor starts.
- **Hide:** when the page hides, waiting writes go out at once instead of at the 5 s interval; on a hidden page a
  refusing store is no longer retried in a loop.
- **Close and forget:** a Runtime closes in order: its work, then a wanted forget, then the services. After the
  services release, every Store refuses (`closed`), so nothing late can touch it. A forget asked after the close has
  passed its forget stage fails `StorageFailure` and deletes nothing, which is what real IndexedDB does anyway.
- **A load that never answers** reports `StorageSilent` evidence; there is still no load timeout.
- **An unused actor** is saved right after its 100 ms grace, so the 5 s interval applies only while something uses it.

## Browser runs

`nub run test:browser` runs Chrome 146 headless and your installed Safari 26.6 through safaridriver, each alone, capped
at 10 minutes, with nothing downloaded. Safari's two hide cases skip when the display is locked, unless
`FLOW_BROWSER_ATTENDED=1` (your Q4 A).

## For your read

- The proposed name `StoreScope`: the app id and scope the Runtime hands each Store, so the IndexedDB database
  defaults to the app id.

## Status

Read by the user, 2026-11-20; `StoreScope` kept.
