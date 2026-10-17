# Invariant and optional design-property examples
Contract predicates belong under invariants; private mechanisms remain optional design prose.
```spec
invariants
    I1 At operation boundaries, retainedItemCount <= configuredCapacity.
    I2 At dequeue, returned bytes equal admitted bytes despite caller mutation.
algorithm
    argument
        Optional ring-buffer property: capacity > 0 => tail == (head + size) % capacity.
        Optional search-loop property: for sorted a, matches(key) remain in [lo, hi).
```
