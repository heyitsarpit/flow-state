# Choose a representation

Use the representation that states the domain meaning and simplifies its
consumers. Schema admission and trusted internal data are different boundaries.

- **Unknown input or authored configuration:** use `Schema.TaggedUnion` or
  `Schema.toTaggedUnion`. Decode once and keep the decoded value as the admission
  result.
- **Two-case success or failure:** use `Result`.
- **Two-case presence or absence:** use `Option`.
- **Three or more trusted domain variants:** prefer `Data.TaggedEnum`. Use
  `Data.taggedEnum` when constructors, tag checks, or exhaustive `$match` improve
  the code.
- **One domain crossing both boundaries:** keep one admission owner. Decode with
  Schema first, then construct or match trusted Data values. Do not decode twice.
- **Atomic state or lifetime:** keep the owner in `Ref`, `MutableRef`, `Scope`, or
  an owning service. `Data` defines values; it does not define transitions or
  lifetimes.

## Authored configuration patterns

Use these only when they express a real invariant or simplify downstream code.

**Complete tables:** when every declared key needs a value, a finite-key Record can
establish coverage upfront. Use excess-property rejection if extra keys are also
invalid.

```ts
const StateName = Schema.Literals(["idle", "active"]);
const StateTable = Schema.Record(StateName, Schema.Boolean);
```

**Nonempty collections:** when at least one item is required, `NonEmptyArray` carries
that guarantee into indexing. Keep an ordinary `Array` when empty is a meaningful
state.

```ts
const Targets = Schema.NonEmptyArray(StateName);
const firstTarget = (targets: typeof Targets.Type) => targets[0];
```

**Branch-specific configuration:** when variants require different fields, a tagged
union makes valid combinations explicit. Keep a simple struct when there are no
such variants.

- Use `Schema.TaggedUnion` when variants are admitted from unknown configuration.
- Use `Data.TaggedEnum` when trusted internal code creates and consumes three or more
  variants.
- Use `Result` or `Option` for their canonical two-case meanings.
- Do not maintain two independent definitions without an explicit conversion owner.

```ts
const NodeConfig = Schema.TaggedUnion({
  leaf: {},
  compound: { initial: StateName, children: Targets },
});
```

If `initial` must name a child, express that relationship separately and attach its
failure to the responsible field.

```ts
const ValidNode = NodeConfig.check(Schema.makeFilter(node =>
  node._tag === "leaf" || node.children.includes(node.initial) ||
  { path: ["initial"], issue: "Initial must be a child" }));
```
