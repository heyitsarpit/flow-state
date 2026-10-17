# Design Invariants — illustrative Spec fragment

Define names and design basis; state whether each holds publicly, internally, or at a loop head.

```spec
invariants
    I1 0 <= size <= capacity; if capacity > 0, tail == (head + size) % capacity.
    I2 byId.keys == records.map(r => r.id).toSet(); for every r in records, byId[r.id] == r.
    I3 Every pool connection belongs to exactly one of idle, leased, or closing.
    I4 usedBytes == sum(entries.map(e => e.accountedBytes)) and usedBytes <= byteBudget.
    I5 For sorted a, at search loop heads: 0 <= lo <= hi <= a.length; matches(key) stay in [lo, hi).
```
